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

    console.error('[API] 请求失败', { url: fullUrl, statusCode: res.statusCode })
    return Promise.reject(new Error(`请求失败，状态码：${res.statusCode}`))
  } catch (error) {
    console.error('[API] 网络异常', { url: fullUrl, error })
    return Promise.reject(error)
  }
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
