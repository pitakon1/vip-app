import { useState } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { authApi } from '@/services/api';
import { tokenStorage } from '@/lib/storage';
import { useAuthStore } from '@/stores/auth';
import { notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';

// auth-session 在重定向回 App 时收尾
WebBrowser.maybeCompleteAuthSession();

// Google Client ID 来自环境变量（缺省空串 → 本地后端 status.mock=true 时走 mock 兜底）
const GOOGLE_CLIENT_ID: string =
  ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.EXPO_PUBLIC_GOOGLE_CLIENT_ID as string | undefined) || '';

interface OAuthStatus {
  google: { enabled: boolean; mock: boolean };
  apple: { enabled: boolean; mock: boolean };
}

export type MockProvider = 'google' | 'apple';

/**
 * Google / Apple 一键登录共享逻辑（注册/登录页复用）。
 * 流程：先查 oauthStatus → enabled 走系统原生授权 / mock 走本地 mock 邮箱 → 拿到 token 后
 * 复用现有登录成功路径（存 token + 置 useAuthStore，RootNavigator 自动按角色跳转）。
 */
export function useOAuth() {
  const { t } = useI18n();
  const [oauthLoading, setOauthLoading] = useState(false);
  // mock 邮箱 Modal 状态
  const [mockVisible, setMockVisible] = useState(false);
  const [mockProvider, setMockProvider] = useState<MockProvider>('google');
  const [mockEmail, setMockEmail] = useState('');
  const [mockBusy, setMockBusy] = useState(false);

  /** 复用登录成功路径：持久化 token + 写入 auth store（与注册/登录页一致，别重写） */
  const applySession = async (data: any) => {
    const token: string | undefined = data?.token ?? data?.access_token;
    const user = data?.user ?? data?.data?.user;
    if (!token || !user) {
      throw new Error(t('login.badResponse'));
    }
    await tokenStorage.set(token);
    useAuthStore.setState({ user, token, isAuthenticated: true });
  };

  const fetchStatus = async (): Promise<OAuthStatus> => {
    try {
      const { data } = await authApi.oauthStatus();
      return data as OAuthStatus;
    } catch (err) {
      notifyError(t('oauth.loginNotConfigured'), err);
      throw err;
    }
  };

  const openMock = (provider: MockProvider) => {
    setMockProvider(provider);
    setMockEmail('');
    setMockVisible(true);
  };

  const closeMock = () => setMockVisible(false);

  const submitMock = async () => {
    const email = mockEmail.trim();
    if (!email) {
      notifyError(t('common.hint'), new Error(t('oauth.enterMockEmail')));
      return;
    }
    setMockBusy(true);
    try {
      const { data } =
        mockProvider === 'apple'
          ? await authApi.oauthApple({ mock_email: email })
          : await authApi.oauthGoogle({ mock_email: email });
      setMockVisible(false);
      await applySession(data);
    } catch (err: any) {
      notifyError(t('login.failedTitle'), err);
    } finally {
      setMockBusy(false);
    }
  };

  /** Google 登录：优先原生授权，unavailable 时本地 mock 兜底 */
  const loginWithGoogle = async () => {
    if (oauthLoading) return;
    setOauthLoading(true);
    try {
      const s = await fetchStatus();
      if (s.google.enabled) {
        if (!GOOGLE_CLIENT_ID) {
          notifyError(t('oauth.loginNotConfigured'), new Error(t('oauth.googleNotConfigured')));
          return;
        }
        const redirectUri = AuthSession.makeRedirectUri();
        const discovery = await AuthSession.fetchDiscoveryAsync(
          'https://accounts.google.com/.well-known/openid-configuration',
        );
        const authRequest = await AuthSession.loadAsync(
          {
            clientId: GOOGLE_CLIENT_ID,
            redirectUri,
            scopes: ['openid', 'email', 'profile'],
          },
          discovery,
        );
        const result = await authRequest.promptAsync(discovery);
        if (result.type === 'success') {
          const idToken = (result.params as any)?.id_token as string | undefined;
          if (!idToken) {
            notifyError(t('oauth.loginNotConfigured'), new Error(t('oauth.googleMissingId')));
            return;
          }
          const { data } = await authApi.oauthGoogle({ id_token: idToken });
          await applySession(data);
        }
      } else if (s.google.mock) {
        openMock('google');
      } else {
        notifyError(t('oauth.loginNotConfigured'), new Error(t('oauth.googleNotConfigured')));
      }
    } catch (err: any) {
      notifyError(t('login.failedTitle'), err);
    } finally {
      setOauthLoading(false);
    }
  };

  /** Apple 登录：仅 iOS 原生授权，Android/Web 不支持；unavailable 时本地 mock 兜底 */
  const loginWithApple = async () => {
    if (oauthLoading) return;
    setOauthLoading(true);
    try {
      const s = await fetchStatus();
      if (s.apple.enabled) {
        if (Platform.OS !== 'ios') {
          notifyError(t('common.hint'), new Error(t('oauth.appleIosOnly')));
          return;
        }
        const cred = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          ],
        });
        if (cred?.identityToken) {
          const { data } = await authApi.oauthApple({ id_token: cred.identityToken });
          await applySession(data);
        }
      } else if (s.apple.mock) {
        openMock('apple');
      } else {
        notifyError(t('oauth.loginNotConfigured'), new Error(t('oauth.loginNotConfigured')));
      }
    } catch (err: any) {
      notifyError(t('login.failedTitle'), err);
    } finally {
      setOauthLoading(false);
    }
  };

  return {
    oauthLoading,
    loginWithGoogle,
    loginWithApple,
    mockVisible,
    mockProvider,
    mockEmail,
    setMockEmail,
    submitMock,
    closeMock,
    mockBusy,
  };
}