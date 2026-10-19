import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth';
import { refreshTokenStorage, tokenStorage } from './storage';

// baseURL 从环境变量读取（默认 http://localhost:8000/api/v1）。
// Expo 在构建时注入 EXPO_PUBLIC_* 变量，通过 globalThis 访问以兼容不同类型环境。
export const API_BASE_URL: string =
  ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.EXPO_PUBLIC_API_BASE_URL as string | undefined) ||
  'http://localhost:8000/api/v1';

/* 公开免登录签署页（`/sign/:token`）托管在 Web 站点，不在 App 内。
   后端 `_sign_url` 在未配置 PUBLIC_WEB_BASE_URL 时只返回相对路径（形如 `/sign/xxx`），
   App 直接复制给客户是打不开的（同理 Web 端有 absSignUrl、小程序有 toPublicSignUrl）。
   凡是把签署链接展示/复制出去的地方，都必须先经这里补上站点 origin。 */
export const PUBLIC_WEB_BASE_URL: string = (
  ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.EXPO_PUBLIC_PUBLIC_WEB_BASE_URL as string | undefined) || 'http://localhost:3000'
).replace(/\/+$/, '');

/** 把后端返回的签署链接补成可对外分享的绝对地址。 */
export const toPublicSignUrl = (url?: string | null): string => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${PUBLIC_WEB_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const TOKEN_STORAGE_KEY = 'auth_token';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  // 数组型查询参数必须序列化成「重复键」：keywords=a&keywords=b。
  // axios 默认输出 keywords[]=a&keywords[]=b，而后端 FastAPI 的
  // `List[str] = Query(...)` 只认重复键，带方括号的键会被静默忽略——
  // 表现为「区域/配套设施筛选勾选了、列表却完全没变」，且无任何报错。
  paramsSerializer: { indexes: null },
});

/**
 * 查询参数键统一转成 snake_case。
 *
 * 后端是 FastAPI，查询参数一律 snake_case（`page_size`），前端习惯写 `pageSize`；
 * axios 不转换键名，多余的键会被后端静默忽略——`viewingsApi.list({ pageSize: 100 })`
 * 实际只拿回默认 20 条，页面表现为「列表条数不对」且无任何报错。
 */
const toSnakeKey = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const normalizeParams = (params: unknown) => {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    out[toSnakeKey(k)] = v;
  }
  return out;
};

// 请求拦截器：读取 token 并添加到 Authorization header（Web 端走 localStorage）
apiClient.interceptors.request.use(
  async (config) => {
    const token = await tokenStorage.get();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.params = normalizeParams(config.params);
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * 用刷新令牌换新的访问令牌。
 *
 * 后端每次刷新都会同时下发新的 refresh_token（轮换），两个都要写回。
 * 这里用裸 axios 而非 apiClient，否则刷新请求自身 401 时又会回到拦截器里递归。
 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = await refreshTokenStorage.get();
  if (!refreshToken) throw new Error('no refresh token');
  const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
    refresh_token: refreshToken,
  });
  const payload = data?.data ?? data;
  const token: string | undefined = payload?.access_token;
  if (!token) throw new Error('refresh response has no access_token');
  await tokenStorage.set(token);
  if (payload?.refresh_token) {
    await refreshTokenStorage.set(payload.refresh_token);
  }
  return token;
}

/** 并发 401 时共用一个刷新 Promise，避免打出刷新风暴。 */
let refreshing: Promise<string> | null = null;

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/**
 * 统一返回信封解包。
 *
 * 后端 EnvelopeMiddleware 把成功的 JSON 响应包裹成 `{code, msg, data}` 并写入
 * `X-Api-Envelope: 1`。这里在**单一出口**把它拆掉，下游页面仍按原来的
 * `response.data`（即原响应体）读取，全端无需逐页改动。
 *
 * 只认响应头标记（而不是「有没有 data 字段」）：存量响应体里存在结构本身带
 * `data` 键的，靠字段猜会误判。错误响应（>=400）不带该头，原样透传。
 *
 * 注意：不能用 `body.data ?? body`——`data` 为 `null`（如删除类接口）时
 * `??` 会把整个信封回退给调用方，必须显式判 `'data' in body`。
 */
const ENVELOPE_HEADER = 'x-api-envelope';

const unwrapEnvelope = (response: AxiosResponse) => {
  const headers = response.headers as Record<string, unknown> | undefined;
  const marked =
    headers?.[ENVELOPE_HEADER] === '1' || headers?.['X-Api-Envelope'] === '1';
  const body = response.data as unknown;
  if (
    marked &&
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'data' in (body as Record<string, unknown>)
  ) {
    response.data = (body as Record<string, unknown>).data;
  }
  return response;
};

// 响应拦截器：先解包信封，401 再尝试静默续期并重放，续期无望才登出
apiClient.interceptors.response.use(
  unwrapEnvelope,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    // 凭据类接口（登录/注册/刷新）自身返回 401 表示「凭据错误」，
    // 既不该静默续期，也不该触发全局登出——否则用户输错一次密码，
    // 已登录的会话会被一并清掉，且失败原因更容易被误导。
    const isCredentialCall = /\/auth\/(login|register|refresh)/.test(original?.url ?? '');
    // 访问令牌过期先静默续期再重放原请求，否则用户每次到期都会被弹回登录页、
    // 丢掉当前操作。此前没有任何续期逻辑，登录时拿到的 refresh_token 也从未落盘。
    if (error.response?.status === 401 && original && !original._retried && !isCredentialCall) {
      original._retried = true;
      try {
        refreshing = refreshing ?? refreshAccessToken().finally(() => { refreshing = null; });
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return await apiClient(original);
      } catch {
        // 刷新令牌也失效（过期 / 已登出）：继续走下面的登出
      }
    }

    if (error.response?.status === 401 && !isCredentialCall) {
      // 通过 zustand store 重置认证状态，RootNavigator 会自动切换到登录页。
      // 登出内部会一并清掉 token 与用户态缓存，这里不必再单独 remove。
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

export default apiClient;

/**
 * 文档取件地址（带令牌查询串）。
 *
 * `uploads/documents` 已不再由静态服务托管，证件、合同等敏感文件只能经
 * `/documents/{id}/file`（内联）或 `/download`（附件）取件。而 RN 的
 * `Linking.openURL` / `Image` 无法附加请求头，因此这里只能把令牌拼进查询串
 * —— 这是后端为文件类接口专门开放 `?token=` 的原因。
 * 出于同样的原因，调用方不要把这个地址写入日志或持久化。
 */
export async function documentFileUrl(
  id: string,
  mode: 'file' | 'download' = 'file',
): Promise<string | null> {
  const token = await tokenStorage.get();
  if (!token) return null;
  return `${API_BASE_URL}/documents/${id}/${mode}?token=${encodeURIComponent(token)}`;
}

/**
 * 站内合同的 PDF 页图地址（鉴权链路）。
 *
 * RN 的 `<Image>` 无法附加 `Authorization` 请求头，因此复用后端为文件类接口开放的
 * `?token=` 查询串；页图以名称命名的页面即其本身坐标空间，落库仍按 %（0-100）。
 * 调用方不要把这个地址写入日志或持久化。
 */
export async function contractPdfPageUrl(
  contractId: string,
  page: number,
): Promise<string | null> {
  const token = await tokenStorage.get();
  if (!token) return null;
  return `${API_BASE_URL}/contracts/${contractId}/pdf-pages/${page}?token=${encodeURIComponent(token)}`;
}

/**
 * 免登录签署合同的 PDF 页图地址（公开链路，无鉴权，凭签署 token）。
 */
export function publicContractSignPdfPageUrl(signToken: string, page: number): string {
  return `${API_BASE_URL}/public/contract-sign/${encodeURIComponent(signToken)}/pdf-pages/${page}`;
}