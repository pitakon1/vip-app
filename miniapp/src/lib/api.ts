import Taro from '@tarojs/taro'

declare const API_BASE: string

export interface RequestOptions<T = unknown> {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: Record<string, unknown> | unknown
  header?: Record<string, string>
  mockData?: T
}

export interface ApiResponse<T = unknown> {
  data: T
  statusCode: number
  header: Record<string, string>
}

/**
 * 统一请求封装
 * - 请求拦截：从本地存储读取 token，注入 Authorization 头
 * - 响应拦截：401 清除登录态并跳转登录页
 */
export async function request<T = unknown>(options: RequestOptions<T>): Promise<T> {
  const { url, method = 'GET', data, header = {} } = options
  const baseURL = typeof API_BASE !== 'undefined' ? API_BASE : ''
  const fullUrl = url.startsWith('http') ? url : `${baseURL}${url}`

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
    const res = await Taro.request({
      url: fullUrl,
      method,
      data: data as Record<string, unknown>,
      header: finalHeader
    })

    // 响应拦截：401 跳转登录页
    if (res.statusCode === 401) {
      Taro.removeStorageSync('token')
      Taro.removeStorageSync('user')
      Taro.redirectTo({ url: '/pages/login/index' })
      return Promise.reject(new Error('未授权，请重新登录'))
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T
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
 */
export function documentFileUrl(id: string, mode: 'file' | 'download' = 'download') {
  const baseURL = typeof API_BASE !== 'undefined' ? API_BASE : ''
  return `${baseURL}/documents/${id}/${mode}`
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
