import { create } from 'zustand';
import apiClient from '../lib/api';
import { tokenStorage } from '../lib/storage';
import type { User } from '../types';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
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
        user: data.user,
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

  logout: () => {
    void tokenStorage.remove();
    set({ user: null, token: null, isAuthenticated: false });
  },

  setUser: (user) => set({ user }),
}));