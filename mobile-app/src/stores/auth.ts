import { create } from 'zustand';
import apiClient from '../lib/api';
import { tokenStorage } from '../lib/storage';
import type { User, UserRole } from '../types';

/**
 * 后端登录响应与 `GET /auth/me` 返回的用户摘要结构一致，
 * 都只有 id / email / full_name / role（见 auth.py 的 `_build_token_response`）。
 */
interface AuthUserPayload {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUserPayload;
}

/** 把后端用户摘要补全为前端 User：后端没有独立用户名，用邮箱/姓名兜底。 */
function toUser(payload: AuthUserPayload): User {
  const email = payload.email ?? undefined;
  const fullName = payload.full_name ?? undefined;
  return {
    id: payload.id,
    username: email ?? '',
    name: fullName ?? email ?? '',
    full_name: fullName,
    email,
    role: (payload.role ?? 'tenant') as UserRole,
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  /** 启动时读取本地凭证并向后端校验，恢复登录态。 */
  restore: () => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  // 初始为 true：RootNavigator 先显示启动占位，等 restore() 判定完本地凭证再决定去登录页还是主页
  isLoading: true,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      // 后端 login 使用 OAuth2PasswordRequestForm（表单格式）
      const { data } = await apiClient.post<LoginResponse>(
        '/auth/login',
        `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      await tokenStorage.set(data.access_token);
      set({
        user: toUser(data.user),
        token: data.access_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  restore: async () => {
    try {
      const token = await tokenStorage.get();
      if (!token) {
        // 「记住我」未勾选时本地不留凭证，直接进登录页
        set({ isLoading: false });
        return;
      }
      // 向后端校验令牌是否仍然有效（登出/改密后 token_version 变更会使其失效）
      const { data } = await apiClient.get<AuthUserPayload>('/auth/me');
      set({
        user: toUser(data),
        token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // 凭证失效或后端不可达：清空本地凭证，回到登录页
      await tokenStorage.remove();
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: () => {
    void tokenStorage.remove();
    // isLoading 必须一并复位，否则在 restore() 期间被登出会卡在启动占位页
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  setUser: (user) => set({ user }),
}));