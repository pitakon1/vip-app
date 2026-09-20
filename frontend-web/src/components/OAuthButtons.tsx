import { useState } from 'react'
import { Input, Modal, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/services/api'
import './oauth.css'

type Provider = 'google' | 'apple'

interface OAuthButtonsProps {
  // 拿到 OAuth 登录返回的 axios response 后交给页面既有登录成功逻辑（复用，不重写）
  onSuccess: (res: any) => void
}

interface OAuthProviderStatus {
  enabled: boolean
  mock: boolean
}

type OAuthStatus = { google?: OAuthProviderStatus; apple?: OAuthProviderStatus }

// 动态加载外部 SDK 脚本（按需加载，避免首屏阻塞）
const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('sdk load failed'))
    document.head.appendChild(s)
  })

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FBBC05" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <path fill="#EA4335" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#34A853" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#4285F4" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </svg>
)

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
)

const OAuthButtons: React.FC<OAuthButtonsProps> = ({ onSuccess }) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState<Provider | ''>('')
  const [mock, setMock] = useState<{ provider: Provider } | null>(null)
  const [mockEmail, setMockEmail] = useState('')

  // 解析 oauth/status 响应（可能包在 res.data.data 或 res.data 里）
  const parseStatus = (res: any): OAuthStatus => {
    const status = res?.data?.data ?? res?.data ?? res
    return status?.google !== undefined ? status : {}
  }

  // 提交真实 / mock 授权后的统一句柄：调用对应 oauth 接口 → 交给既有登录成功逻辑
  const submitOAuth = async (provider: Provider, payload: any) => {
    const res =
      provider === 'google'
        ? await authApi.oauthGoogle(payload)
        : await authApi.oauthApple(payload)
    onSuccess(res)
  }

  // 拉取登录成功后的下一步：发起真实授权或弹 mock 邮箱框
  const handleClick = async (provider: Provider) => {
    if (loading) return
    setLoading(provider)
    try {
      const statusRes = await authApi.oauthStatus()
      const status = parseStatus(statusRes)
      const cfg = provider === 'google' ? status.google : status.apple

      if (!cfg?.enabled) {
        if (cfg?.mock) {
          // 开发 mock：弹邮箱输入框
          setMock({ provider })
          setLoading('')
          return
        }
        message.warning(t('login.oauthNotConfigured'))
        setLoading('')
        return
      }

      if (provider === 'google') {
        await runGoogle()
      } else {
        await runApple()
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('login.oauthFailed'))
    } finally {
      setLoading('')
    }
  }

  const runGoogle = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
    if (!clientId) throw new Error('missing google client id')
    const win: any = window
    if (!win.google?.accounts?.id) {
      await loadScript('https://accounts.google.com/gsi/client')
    }
    if (!win.google?.accounts?.id) {
      message.error(t('login.oauthLoadFailed', { provider: 'Google' }))
      return
    }
    await new Promise<void>((resolve, reject) => {
      win.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          try {
            if (!response?.credential) {
              message.error(t('login.oauthLoadFailed', { provider: 'Google' }))
              return
            }
            await submitOAuth('google', { id_token: response.credential })
          } catch (err: any) {
            message.error(err?.response?.data?.message || t('login.oauthFailed'))
          }
        },
      })
      win.google.accounts.id.prompt((res: any) => {
        if (res?.isNotDisplayed || res?.isSkippedMoment) {
          reject(new Error('google prompt closed'))
        } else {
          resolve()
        }
      })
    }).catch(() => {
      /* 用户主动关闭授权弹窗，静默处理 */
    })
  }

  const runApple = async () => {
    const clientId = import.meta.env.VITE_APPLE_CLIENT_ID || ''
    if (!clientId) throw new Error('missing apple client id')
    const win: any = window
    if (!win.AppleID?.auth?.signIn) {
      await loadScript(
        'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
      )
    }
    if (!win.AppleID?.auth?.signIn) {
      message.error(t('login.oauthLoadFailed', { provider: 'Apple' }))
      return
    }
    try {
      win.AppleID.auth.init({
        clientId,
        scope: 'name email',
        redirectURI: `${window.location.origin}/login`,
      })
      const response: any = await win.AppleID.auth.signIn()
      const idToken = response?.authorization?.id_token
      if (!idToken) {
        message.error(t('login.oauthLoadFailed', { provider: 'Apple' }))
        return
      }
      await submitOAuth('apple', { id_token: idToken })
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('login.oauthFailed'))
    }
  }

  const handleMockOk = async () => {
    if (!mock) return
    if (!mockEmail.trim()) {
      message.warning(t('login.oauthEmailRequired'))
      return
    }
    setLoading(mock.provider)
    try {
      await submitOAuth(mock.provider, { mock_email: mockEmail.trim() })
      setMock(null)
      setMockEmail('')
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('login.oauthFailed'))
    } finally {
      setLoading('')
    }
  }

  return (
    <div className="rent-oauth">
      <button
        type="button"
        className="continue-btn"
        onClick={() => handleClick('google')}
        disabled={!!loading}
      >
        {loading === 'google' ? (
          <span className="continue-btn__icon rent-oauth__spin" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </span>
        ) : (
          <span className="continue-btn__icon" aria-hidden="true"><GoogleIcon /></span>
        )}
        {t('login.google')}
      </button>

      <button
        type="button"
        className="continue-btn"
        onClick={() => handleClick('apple')}
        disabled={!!loading}
      >
        {loading === 'apple' ? (
          <span className="continue-btn__icon rent-oauth__spin" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </span>
        ) : (
          <span className="continue-btn__icon" aria-hidden="true"><span className="rent-oauth__apple"><AppleIcon /></span></span>
        )}
        {t('login.apple')}
      </button>

      <Modal
        title={t('login.oauthMockTitle')}
        open={!!mock}
        onOk={handleMockOk}
        onCancel={() => {
          setMock(null)
          setMockEmail('')
        }}
        okText={t('login.signIn')}
        cancelText={t('common.cancel')}
        confirmLoading={loading === mock?.provider}
        destroyOnClose
      >
        <p style={{ marginBottom: 12 }}>{t('login.oauthMockHint')}</p>
        <Input
          placeholder="you@example.com"
          value={mockEmail}
          onChange={(e) => setMockEmail(e.target.value)}
          onPressEnter={handleMockOk}
        />
      </Modal>
    </div>
  )
}

export default OAuthButtons