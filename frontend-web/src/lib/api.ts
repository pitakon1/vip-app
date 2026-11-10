import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { REFRESH_TOKEN_KEY, useAuthStore } from '@/stores/auth'
import { cachedGetAdapter } from '@/lib/httpCache'
import { clearCache, queryClient } from '@/lib/queryCache'
import { isPublicPath } from '@/lib/publicRoutes'

/**
 * axios catch 里访问后端错误体的安全入口。
 * FastAPI 422 会塞 `error_fields`（字段级校验）或 `detail`（单条错误）。
 * 用法：`catch (err) { const body = apiErrorBody(err); if (body?.error_fields) ... }`
 */
export interface ApiErrorBody {
  /** FastAPI 422 字段级校验（snake_case）。 */
  error_fields?: string[]
  /** 前端 Ant Design ProTable / Form 约定（camelCase）。 */
  errorFields?: { name: string; errors?: string[] }[]
  /** 单条错误。 */
  detail?: string | unknown[]
  message?: string
  [key: string]: unknown
}
export function apiErrorBody(err: unknown): ApiErrorBody | undefined {
  if (!axios.isAxiosError(err)) return undefined
  const data = (err.response as AxiosResponse<ApiErrorBody> | undefined)?.data
  return data && typeof data === 'object' ? data : undefined
}
/** axios 错误的原始 response（用于访问 status、headers 等）。 */
export function apiErrorResponse(err: unknown): AxiosResponse | undefined {
  return axios.isAxiosError(err) ? (err.response as AxiosResponse | undefined) : undefined
}

/**
 * 单次请求能取回的最大条数，与后端 `app/core/pagination.py` 的 `MAX_PAGE_SIZE` 保持一致。
 *
 * 后端对 `page_size` 是**硬截断**（不是报错）。传超过这个值的请求不会失败，
 * 只会安静地少拿数据，表现为「下拉少选项 / 总数偏小 / 筛选不全」——
 * 这类静默错误排查成本极高，所以前端侧一律用这个常量，不要再手写大数字。
 *
 * 前端消费分页接口时一律只认服务端 `total`：`pages/Properties` 已改为
 * 服务端分页（筛选条件下推 + `page/pageSize` + 服务端 total）；
 * `pages/Tenant/Dashboard` 是聚合接口（`/owners/me/properties` 返回完整数组），
 * 不存在列表假分页。历史「拉全量 → 前端切片」只剩少量小数据量页面
 * （如 `pages/Owner/ownerProperties`），其数组长度即真实全量。
 */
export const MAX_PAGE_SIZE = 100

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
  // GET 走请求级 SWR 缓存：切回已访问页面先出旧数据再后台刷新，并合并并发重复请求
  adapter: cachedGetAdapter,
  // axios 默认把数组序列化成 `keywords[]=a&keywords[]=b`，FastAPI 的 `List[str]` 只认
  // 重复键 `keywords=a&keywords=b`，不改的话区域/地铁的关键词筛选会被后端静默忽略。
  paramsSerializer: { indexes: null },
})

/**
 * 查询参数键统一转成 snake_case。
 *
 * 后端是 FastAPI，查询参数一律 snake_case（`page_size`），而前端习惯写 `pageSize`。
 * axios 不做键名转换，多余的键会被后端**静默忽略**：`pageSize=100` 实际只拿回默认
 * 20 条，表现为「分页每页条数不对 / 下拉选项少 / 总数偏小」这类无报错的错数据。
 * 在请求层收敛比在几十个页面里逐处改名可靠。
 */
const toSnakeKey = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

const normalizeParams = (params: unknown) => {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    out[toSnakeKey(k)] = v
  }
  return out
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    config.params = normalizeParams(config.params)
    return config
  },
  (error) => Promise.reject(error),
)

// 并发请求同时 401 时共用一个刷新 Promise，避免打出刷新风暴
let refreshing: Promise<string> | null = null

/**
 * 用刷新令牌换新的访问令牌。
 *
 * 后端每次刷新都会同时下发新的 refresh_token（轮换），两个都要写回。
 * 这里用裸 axios 而非 `api` 实例发起，否则刷新请求自身 401 时又会回到拦截器里递归。
 */
const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) throw new Error('no refresh token')
  const res = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
  const payload = res.data?.data ?? res.data
  const token: string | undefined = payload?.access_token
  if (!token) throw new Error('refresh response has no access_token')
  localStorage.setItem('token', token)
  if (payload?.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, payload.refresh_token)
  }
  useAuthStore.getState().setToken(token)
  return token
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

/**
 * 统一返回信封解包。
 *
 * 后端 EnvelopeMiddleware 把成功的 JSON 响应包裹成 `{code, msg, data}` 并写入
 * `X-Api-Envelope: 1`。这里在**单一出口**把它拆掉，下游页面代码仍按原来的
 * `response.data`（即原响应体）读取，全站无需逐页改动。
 *
 * 只认响应头标记（而不是「有没有 data 字段」）：存量响应体里存在结构本身带
 * `data` 键的，靠字段猜会把它们误判。错误响应（>=400）不带该头，原样透传。
 *
 * 注意：不能用 `body.data ?? body`——`data` 为 `null`（如删除类接口）时
 * `??` 会把整个信封回退给调用方，必须显式判 `'data' in body`。
 */
const ENVELOPE_HEADER = 'x-api-envelope'

const unwrapEnvelope = (response: AxiosResponse) => {
  const headers = response.headers as Record<string, unknown> | undefined
  const marked =
    headers?.[ENVELOPE_HEADER] === '1' || headers?.['X-Api-Envelope'] === '1'
  const body = response.data as unknown
  if (
    marked &&
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'data' in (body as Record<string, unknown>)
  ) {
    response.data = (body as Record<string, unknown>).data
  }
  return response
}

/**
 * 把后端错误体压成一句可直接展示的文案。
 *
 * FastAPI 业务错误是 `{"detail": "..."}`，422 参数校验是
 * `{"detail": [{loc,msg,type}, ...]}`。页面里普遍写 `err.response.data.detail`
 * 直接丢给 antd message，数组会被渲染成 "[object Object]"。
 * 这里在中心层把 detail 归一化成字符串，页面既有的取值方式一并受益。
 */
const flattenDetail = (detail: unknown): string => {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : (d as { msg?: string })?.msg))
      .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      .join('；')
  }
  return ''
}

const normalizeErrorBody = (error: AxiosError) => {
  const body = error.response?.data as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object' || Array.isArray(body)) return
  const raw = body.detail ?? body.msg ?? body.message
  const text = flattenDetail(raw)
  if (!text) return
  body.detail = text
  error.message = text
}

api.interceptors.response.use(
  (response) => {
    // 写操作成功后统一失效列表缓存：内存查询 + localStorage 磁盘缓存。
    // 之前只有收藏/凭证上传等少数页面手动失效，其余 mutation 返回列表仍是旧值。
    const method = (response.config.method || 'get').toLowerCase()
    if (method !== 'get') {
      clearCache()
      void queryClient.invalidateQueries()
    }
    return unwrapEnvelope(response)
  },
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    // 凭据类接口（登录/注册/刷新）自身 401 表示「凭据错误」：既不该静默续期，
    // 也不该触发全局登出——否则用户输错一次密码，已登录会话会被一并清掉。
    const isCredentialCall = /\/auth\/(login|register|refresh)/.test(original?.url ?? '')
    // 访问令牌过期（默认 30 分钟）先尝试静默续期再重放原请求，
    // 否则用户每次 token 过期都会被弹回登录页丢掉当前操作。
    if (
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !isCredentialCall
    ) {
      original._retried = true
      try {
        refreshing = refreshing ?? refreshAccessToken().finally(() => { refreshing = null })
        const token = await refreshing
        original.headers.Authorization = `Bearer ${token}`
        return await api(original)
      } catch {
        // 刷新令牌也失效（过期 / 已登出）：继续走下面的清态跳登录
      }
    }

    if (error.response?.status === 401 && !isCredentialCall) {
      const pathname = window.location.pathname
      // 公开路由清单集中在 lib/publicRoutes.ts，新增公开页只改那一处。
      if (!isPublicPath(pathname)) {
        useAuthStore.getState().logout()
        // 避免已在 /login 时重复跳转
        if (pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    // 中心层统一把错误体归一化成可读文案，页面无需各自处理 detail 数组
    normalizeErrorBody(error)
    return Promise.reject(error)
  },
)

export default api