import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth';
import { refreshTokenStorage, tokenStorage } from './storage';

// baseURL 从环境变量读取（默认 http://localhost:8000/api/v1）。
// Expo 在构建时注入 EXPO_PUBLIC_* 变量，通过 globalThis 访问以兼容不同类型环境。
export const API_BASE_URL: string =
  ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.EXPO_PUBLIC_API_BASE_URL as string | undefined) ||
  'http://localhost:8000/api/v1';

export const TOKEN_STORAGE_KEY = 'auth_token';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：读取 token 并添加到 Authorization header（Web 端走 localStorage）
apiClient.interceptors.request.use(
  async (config) => {
    const token = await tokenStorage.get();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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

// 响应拦截器：401 先尝试静默续期并重放，续期无望才登出
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    // 访问令牌过期先静默续期再重放原请求，否则用户每次到期都会被弹回登录页、
    // 丢掉当前操作。此前没有任何续期逻辑，登录时拿到的 refresh_token 也从未落盘。
    if (error.response?.status === 401 && original && !original._retried) {
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

    if (error.response?.status === 401) {
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