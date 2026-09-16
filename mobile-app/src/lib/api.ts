import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../stores/auth';
import { tokenStorage } from './storage';

// baseURL 从环境变量读取（默认 http://localhost:8000/api/v1）。
// Expo 在构建时注入 EXPO_PUBLIC_* 变量，通过 globalThis 访问以兼容不同类型环境。
const API_BASE_URL: string =
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

// 响应拦截器：401 时清除 token 并跳转登录
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await tokenStorage.remove();
      // 通过 zustand store 重置认证状态，RootNavigator 会自动切换到登录页
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