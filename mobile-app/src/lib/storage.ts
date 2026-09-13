/**
 * 跨平台 token 存储：原生端用 expo-secure-store，Web 端降级为 localStorage。
 * 避免 SecureStore 在 Web 上不可用导致登录/鉴权失败。
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'auth_token';

export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(token: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(TOKEN_KEY, token);
      } catch {
        /* ignore */
      }
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async remove(): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};