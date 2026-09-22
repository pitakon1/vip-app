/**
 * 跨平台 token 存储：原生端用 expo-secure-store，Web 端降级为 localStorage。
 * 避免 SecureStore 在 Web 上不可用导致登录/鉴权失败。
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'auth_token';
/** 刷新令牌键。访问令牌过期时用它静默续期，避免用户被强制登出。 */
export const REFRESH_TOKEN_KEY = 'auth_refresh_token';

/** 按存储键创建一套「读/写/删」接口，原生走 SecureStore、Web 走 localStorage。 */
function createSecureStorage(key: string) {
  return {
    async get(): Promise<string | null> {
      if (Platform.OS === 'web') {
        try {
          return globalThis.localStorage?.getItem(key) ?? null;
        } catch {
          return null;
        }
      }
      return SecureStore.getItemAsync(key);
    },
    async set(value: string): Promise<void> {
      if (Platform.OS === 'web') {
        try {
          globalThis.localStorage?.setItem(key, value);
        } catch {
          /* ignore */
        }
        return;
      }
      await SecureStore.setItemAsync(key, value);
    },
    async remove(): Promise<void> {
      if (Platform.OS === 'web') {
        try {
          globalThis.localStorage?.removeItem(key);
        } catch {
          /* ignore */
        }
        return;
      }
      await SecureStore.deleteItemAsync(key);
    },
  };
}

export const tokenStorage = createSecureStorage(TOKEN_KEY);
export const refreshTokenStorage = createSecureStorage(REFRESH_TOKEN_KEY);
