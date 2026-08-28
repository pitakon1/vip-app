import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 公共页面（首页、登录页）不因 401 重定向，让组件自行降级处理
      const pathname = window.location.pathname
      const isPublicRoute = pathname === '/' || pathname === '/login'
      if (!isPublicRoute) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        // 避免已在 /login 时重复跳转
        if (pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  },
)

export default api
