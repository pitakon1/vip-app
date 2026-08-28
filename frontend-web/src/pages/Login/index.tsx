import { useState } from 'react'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import './login.css'

// 根据角色返回对应首页路径
const roleRedirectPath = (role: string): string => {
  switch (role) {
    case 'owner': return '/owner/dashboard'
    case 'tenant': return '/tenant/dashboard'
    case 'employee': return '/employee/dashboard'
    default: return '/dashboard'
  }
}

const Login = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const login = useAuthStore((s) => s.login)
  const [submitting, setSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      message.warning(t('login.emailRequired'))
      return
    }
    if (!password) {
      message.warning(t('login.passwordRequired'))
      return
    }
    setSubmitting(true)
    try {
      const res = await authApi.login(email, password)
      const payload = res.data?.data ?? res.data
      const token: string = payload?.access_token ?? payload?.token ?? payload?.accessToken
      const user: User = payload?.user ?? {
        id: String(payload?.id ?? ''),
        full_name: payload?.full_name ?? payload?.name ?? payload?.username ?? email,
        role: payload?.role ?? 'admin',
        email,
      }
      if (!token) {
        message.error(t('login.tokenMissing'))
        return
      }
      login(token, user)
      message.success(t('login.loginSuccess'))
      navigate(roleRedirectPath(user.role))
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('login.loginFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bk-login-page">
      {/* 顶部栏：返回首页 + 语言切换 */}
      <div className="bk-login-topbar">
        <button className="bk-login-topbar__home" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t('home.backToHome')}
        </button>
        <LanguageSwitcher compact />
      </div>

      {/* 登录卡片 */}
      <div className="bk-login-card">
        {/* 品牌 */}
        <div className="bk-login-brand">
          <div className="bk-login-brand__logo">R</div>
          <div className="bk-login-brand__name">RentFlow</div>
          <div className="bk-login-brand__welcome">{t('login.welcomeBack')}</div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 邮箱 */}
          <div className="bk-login-form-group">
            <label className="bk-login-label" htmlFor="login-email">{t('login.email')}</label>
            <div className="bk-login-input-wrap">
              <span className="bk-login-input-wrap__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </span>
              <input
                type="email"
                id="login-email"
                className="bk-login-input"
                placeholder={t('login.emailPlaceholder')}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="bk-login-form-group">
            <label className="bk-login-label" htmlFor="login-password">{t('login.password')}</label>
            <div className="bk-login-input-wrap">
              <span className="bk-login-input-wrap__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type="password"
                id="login-password"
                className="bk-login-input"
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* 记住我 + 忘记密码 */}
          <div className="bk-login-row">
            <label className="bk-login-checkbox">
              <input type="checkbox" id="remember-me" />
              <span>{t('login.rememberMe')}</span>
            </label>
            <button type="button" className="bk-login-link" onClick={(e) => e.preventDefault()}>
              {t('login.forgotPassword')}
            </button>
          </div>

          {/* 登录按钮 */}
          <button type="submit" className="bk-login-btn" disabled={submitting}>
            {submitting ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                {t('login.signingIn')}
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                {t('login.signIn')}
              </>
            )}
          </button>
        </form>

        {/* 测试账号提示 */}
        <div className="bk-login-hint">{t('login.testAccountHint')}</div>

        {/* 底部 */}
        <p className="bk-login-footer">
          {t('login.noAccount')}<a onClick={(e) => e.preventDefault()}>{t('login.contactAdmin')}</a>
        </p>
      </div>
    </div>
  )
}

export default Login
