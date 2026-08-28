import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import apiClient, { TOKEN_STORAGE_KEY } from '../lib/api';
import type { User } from '../types';

interface LoginResponse {
  token: string;
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
      const { data } = await apiClient.post<LoginResponse>('/auth/login', {
        username,
        password,
      });
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, data.token);
      set({
        user: data.user,
        token: data.token,
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
    void SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
