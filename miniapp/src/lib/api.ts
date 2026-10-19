import Taro from '@tarojs/taro'

declare const API_BASE: string

/**
 * 单次请求能取回的最大条数，与后端 `app/core/pagination.py` 的 `MAX_PAGE_SIZE` 一致。
 *
 * 后端对 `page_size` 是**硬截断**而非报错：传 200 只会安静地拿回 100 条。
 * 小程序端有几处下拉/选择器把这个上限当「取全量」用，数据过百后选项会静默缺失。
 * 一律用此常量，不要再手写大数字。
 */
export const MAX_PAGE_SIZE = 100

/** 刷新令牌存储键。登录成功时必须写入，否则 401 只能强登出。 */
export const REFRESH_TOKEN_KEY = 'refresh_token'

/* 公开免登录签署页（`/sign/:token`）托管在 Web 站点，不在小程序内。
   后端 `_sign_url` 在未配置 PUBLIC_WEB_BASE_URL 时只返回相对路径（形如 `/sign/xxx`），
   小程序直接 setClipboardData 复制出去客户根本打不开（同理 Web 端有 absSignUrl）。
   凡是把签署链接交给客户的地方，都必须先经这里补全站点前缀。 */
declare const PUBLIC_WEB_BASE: string | undefined
export const PUBLIC_WEB_BASE_URL: string = (
  (typeof PUBLIC_WEB_BASE !== 'undefined' && PUBLIC_WEB_BASE) || 'http://localhost:3000'
).replace(/\/+$/, '')

export const toPublicSignUrl = (url?: string | null): string => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${PUBLIC_WEB_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

export interface RequestOptions<T = unknown> {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: Record<string, unknown> | unknown
  header?: Record<string, string>
  mockData?: T
}

/** 并发 401 时共用一个刷新 Promise，避免打出刷新风暴。 */
let refreshing: Promise<string> | null = null;
/** 避免并发 401 触发多次 redirectTo（多次跳转会打乱页面栈）。 */
let redirecting = false;

/**
 * 查询参数键统一转成 snake_case。
 *
 * 后端是 FastAPI，查询参数一律 snake_case（`page_size`）；小程序侧习惯写 `pageSize`，
 * 键名不匹配时后端**静默忽略**该参数（不报错），只按默认 20 条返回，
 * 表现为「分页条数不对 / 选择器选项缺失」。GET 请求的 data 会被 Taro 拼进查询串，
 * 所以在这里统一收敛。
 */
const toSnakeKey = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

const normalizeQuery = (data: unknown) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    out[toSnakeKey(k)] = v
  }
  return out
}

/** 用刷新令牌换新的访问令牌；后端每次刷新会轮换 refresh_token，两个都要写回。 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = Taro.getStorageSync(REFRESH_TOKEN_KEY) as string
  if (!refreshToken) throw new Error('no refresh token')
  const baseURL = typeof API_BASE !== 'undefined' ? API_BASE : ''
  const res = await Taro.request({
    url: `${baseURL}/auth/refresh`,
    method: 'POST',
    data: { refresh_token: refreshToken },
    header: { 'Content-Type': 'application/json' }
  })
  const body = res.data as any
  const payload = body?.data ?? body
  const token: string | undefined = payload?.access_token
  if (!token) throw new Error('refresh response has no access_token')
  Taro.setStorageSync('token', token)
  if (payload?.refresh_token) {
    Taro.setStorageSync(REFRESH_TOKEN_KEY, payload.refresh_token)
  }
  return token
}

function goLoginOnce(): void {
  if (redirecting) return
  redirecting = true
  Taro.redirectTo({ url: '/pages/login/index' }).finally(() => {
    redirecting = false
  })
}

/**
 * 统一返回信封解包。
 *
 * 后端 EnvelopeMiddleware 把成功的 JSON 响应包裹成 `{code, msg, data}` 并写入
 * `X-Api-Envelope: 1`。这里在**单一出口**拆掉它，下游页面仍按原来的响应体读取。
 * 只认响应头标记（而不是「有没有 data 字段」）：靠字段猜会误判存量里本身带
 * `data` 键的响应。错误响应（>=400）不带该头，原样透传。
 *
 * 注意：不能用 `body.data ?? body`——`data` 为 `null` 时 `??` 会把整个信封
 * 回退给调用方，必须显式判 `'data' in body`。
 */
function unwrapEnvelope(body: any, headers: Record<string, string> | undefined): any {
  const h = headers ?? {}
  const marked = h['x-api-envelope'] === '1' || h['X-Api-Envelope'] === '1'
  if (
    marked &&
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'data' in body
  ) {
    return body.data
  }
  return body
}

/**
 * `Taro.uploadFile` 返回体的信封解包。
 *
 * 文件上传端点（头像 / 房源照片 / 证件 / 合同）返回 JSON 且带统一信封，但走的是
 * `Taro.uploadFile`（不经中心 `request`），故调用方 await 出结果后需用本函数解包
 * 再取字段。返回体的 `data` 可能是字符串（需先 parse）也可能是对象。
 */
export function unwrapUploadResult<T = any>(res: any): T {
  const header = res?.header as Record<string, string> | undefined
  const marked = header?.['x-api-envelope'] === '1' || header?.['X-Api-Envelope'] === '1'
  let body = res?.data
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return body as T
    }
  }
  if (marked && body && typeof body === 'object' && 'data' in body) {
    body = body.data
  }
  return body as T
}

/**
 * 统一请求封装
 * - 请求拦截：从本地存储读取 token，注入 Authorization 头
 * - 响应拦截：401 先尝试静默续期并重放；续期也失败才清态跳登录
 *
 * 此前 401 会直接清态跳登录，导致「token 一到期就把用户踢出去」——
 * 哪怕用户只是在看不需要登录的公开页面。
 */
export async function request<T = unknown>(options: RequestOptions<T>): Promise<T> {
  const { url, method = 'GET', data, header = {} } = options
  const baseURL = typeof API_BASE !== 'undefined' ? API_BASE : ''
  const fullUrl = url.startsWith('http') ? url : `${baseURL}${url}`
  // GET 的 data 会被拼进查询串（后端查询参数是 snake_case）→ 统一键名；写请求的 body 原样透传
  const payload = method === 'GET' ? normalizeQuery(data) : data

  // 请求拦截：注入 token
  const token = Taro.getStorageSync('token')
  const finalHeader: Record<string, string> = {
    'Content-Type': 'application/json',
    ...header
  }
  if (token) {
    finalHeader.Authorization = `Bearer ${token}`
  }

  try {
    let res = await Taro.request({
      url: fullUrl,
      method,
      data: payload as Record<string, unknown>,
      header: finalHeader
    })

    // 401：先静默续期再重放原请求
    if (res.statusCode === 401) {
      try {
        refreshing = refreshing ?? refreshAccessToken().finally(() => { refreshing = null })
        const freshToken = await refreshing
        res = await Taro.request({
          url: fullUrl,
          method,
          data: payload as Record<string, unknown>,
          header: { ...finalHeader, Authorization: `Bearer ${freshToken}` }
        })
      } catch {
        // 刷新令牌也失效（真过期 / 已登出）：继续走下面的清态跳登录
      }
    }

    // 响应拦截：仍为 401 说明续期无望，清登录态
    if (res.statusCode === 401) {
      Taro.removeStorageSync('token')
      Taro.removeStorageSync('user')
      Taro.removeStorageSync(REFRESH_TOKEN_KEY)
      goLoginOnce()
      return Promise.reject(new Error('未授权，请重新登录'))
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return unwrapEnvelope(res.data, res.header as Record<string, string> | undefined) as T
    }

    // 尽量透出后端 detail（FastAPI 错误体），便于 toast 展示真实原因
    const body = (res?.data as any)
    const detail = body && typeof body === 'object' ? body.detail : undefined
    console.error('[API] 请求失败', { url: fullUrl, statusCode: res.statusCode, detail })
    return Promise.reject(
      new Error(detail ? String(detail) : `请求失败，状态码：${res.statusCode}`)
    )
  } catch (error) {
    console.error('[API] 网络异常', { url: fullUrl, error })
    return Promise.reject(error)
  }
}

/** 当前登录令牌（供 downloadFile 等需要显式带头、走不到拦截器的场景使用）。 */
export function currentToken(): string {
  return (Taro.getStorageSync('token') as string) || ''
}

/**
 * 即时聊天 WebSocket 地址：由 API_BASE 推导 ws/wss，并携带鉴权 token。
 * 发送仍走 REST，WebSocket 仅用于接收实时消息。
 */
export function chatWsUrl(id: string | number): string {
  const baseURL = typeof API_BASE !== 'undefined' ? API_BASE : ''
  const ws = baseURL.replace(/^http(s)?:\/\//, (_m, s) => (s ? 'wss://' : 'ws://'))
  return `${ws}/chat/ws/chat/${id}?token=${encodeURIComponent(currentToken())}`
}

/**
 * 文档读取绝对地址。
 *
 * `uploads/documents` 已不再由静态服务托管，证件、合同等敏感文件只能经
 * `/documents/{id}/file`（内联）或 `/download`（附件）带鉴权取件，
 * 因此必须用绝对地址配合 Authorization 头请求，不能再直接用落库的 file_url。
 *
 * 这里额外拼 `?token=`：小程序的 `<Image>` / `previewImage` **无法自定义请求头**，
 * 只靠 Authorization 头的话文档图会 401。后端为文件类接口专门开放了 query token。
 * （mobile 端 `lib/api.ts` 一直是这么做的，此前小程序漏了。）
 */
export function documentFileUrl(id: string, mode: 'file' | 'download' = 'download') {
  const baseURL = typeof API_BASE !== 'undefined' ? API_BASE : ''
  const token = currentToken()
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${baseURL}/documents/${id}/${mode}${query}`
}

export default {
  get<T = unknown>(url: string, header?: Record<string, string>) {
    return request<T>({ url, method: 'GET', header })
  },
  post<T = unknown>(url: string, data?: unknown, header?: Record<string, string>) {
    return request<T>({ url, method: 'POST', data, header })
  },
  put<T = unknown>(url: string, data?: unknown, header?: Record<string, string>) {
    return request<T>({ url, method: 'PUT', data, header })
  },
  delete<T = unknown>(url: string, header?: Record<string, string>) {
    return request<T>({ url, method: 'DELETE', header })
  }
}
