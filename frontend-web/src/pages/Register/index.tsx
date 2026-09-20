import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import brandLogo from '@/assets/haofang-logo.jpg'
import './register.css'

// 可自助注册的角色：业主 / 租客（员工、经纪、管理员需由后台开通）
type RegRole = 'owner' | 'tenant'

// 国家码下拉（带 + 前缀，如 +86），手机号最终提交为「国家码 + 无前导0手机号」
const COUNTRY_CODES = ['+86', '+1', '+66', '+55']

const phoneWithCode = (countryCode: string, phone: string): string =>
  `${countryCode}${phone.replace(/^0/, '')}`

const roleRedirectPath = (role: string): string => {
  switch (role) {
    case 'owner': return '/owner/dashboard'
    case 'tenant': return '/tenant/dashboard'
    case 'employee': return '/employee/dashboard'
    default: return '/dashboard'
  }
}

const Register = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const login = useAuthStore((s) => s.login)

  const [submitting, setSubmitting] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<RegRole>('tenant')

  // 手机号 / 邮箱模式切换
  const [mode, setMode] = useState<'phone' | 'email'>('email')
  const [countryCode, setCountryCode] = useState('+86')
  const [smsCode, setSmsCode] = useState('')
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const countdownRef = useRef<number | null>(null)

  // 验证码 60 秒倒计时
  useEffect(() => {
    if (countdown <= 0) return
    countdownRef.current = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => {
      if (countdownRef.current) window.clearTimeout(countdownRef.current)
    }
  }, [countdown])

  // 处理注册成功后的 token / user / 跳转（手机号与邮箱模式共用）
  const handleAuthSuccess = (payload: any) => {
    const token: string = payload?.access_token ?? payload?.token ?? payload?.accessToken
    const user: User = payload?.user ?? {
      id: String(payload?.id ?? ''),
      full_name: payload?.full_name ?? fullName,
      role: payload?.role ?? role,
      email: String(payload?.email ?? ''),
    }
    if (!token) {
      message.error(t('register.tokenMissing'))
      return false
    }
    login(token, user)
    message.success(t('register.success'))
    navigate(roleRedirectPath(user.role))
    return true
  }

  // 请求发送短信验证码
  const handleRequestOtp = async () => {
    if (!phone) {
      message.warning(t('register.phoneRequired'))
      return
    }
    const recipient = phoneWithCode(countryCode, phone)
    setSending(true)
    try {
      const res = await authApi.requestOtp(recipient, 'sms')
      const devCode = res.data?.dev_code
      if (devCode) {
        setSmsCode(String(devCode))
        message.info(t('register.otpDevHint'))
      } else {
        message.success(t('register.otpSent'))
        setCountdown(60)
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('register.otpFailed'))
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName) {
      message.warning(t('register.nameRequired'))
      return
    }
    if (mode === 'email') {
      if (!email) {
        message.warning(t('register.emailRequired'))
        return
      }
      if (!password) {
        message.warning(t('register.passwordRequired'))
        return
      }
    } else {
      if (!phone) {
        message.warning(t('register.phoneRequired'))
        return
      }
      if (!smsCode) {
        message.warning(t('register.codeRequired'))
        return
      }
    }
    setSubmitting(true)
    try {
      // 注册即返回 token，注册成功后自动登录并直达对应角色首页
      const res: any = mode === 'phone'
        ? await authApi.register({
            phone: phoneWithCode(countryCode, phone),
            code: smsCode,
            full_name: fullName,
            role,
          })
        : await authApi.register({
            email,
            password,
            full_name: fullName,
            phone: phone ? phoneWithCode(countryCode, phone) : undefined,
            role,
          })
      const payload = res?.data?.data ?? res?.data
      if (!handleAuthSuccess(payload)) return
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('register.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="rent-login-page rent-register-page">
      {/* 语言切换（悬浮右上角，不破坏分屏布局） */}
      <div className="rent-login-lang">
        <LanguageSwitcher compact />
      </div>

      {/* ===== 左栏 40%（Reddit 式沉浸视觉栏：氛围图 + 深色渐变 + 品牌 + 短标语） ===== */}
      <section className="rent-register-left">
        <div className="rent-register-left__scrim" aria-hidden="true" />
        <div className="rent-register-left__content">
          <div className="rent-register-brand">
            <img
              className="rent-register-brand__img"
              src={brandLogo}
              alt="HaoFang.World"
            />
          </div>
          <div className="rent-register-left__text">
            <h1 className="rent-register-slogan">{t('register.tagline')}</h1>
            <p className="rent-register-subslogan">{t('register.subtagline')}</p>
          </div>
        </div>
      </section>

      {/* ===== 右栏 60%（居中窄卡片表单，白底大量留白） ===== */}
      <section className="rent-login-right">
        <div className="rent-login-card">
          <div className="rent-login-card__header">
            <h2 className="rent-login-card__title">{t('register.title')}</h2>
            <p className="rent-login-card__subtitle">{t('register.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* 注册方式选择：堆叠大按钮（Reddit 风格），即模式开关 */}
            <div className="rent-auth-method">
              <button
                type="button"
                className={`rent-auth-method__btn${mode === 'phone' ? ' is-active' : ''}`}
                onClick={() => setMode('phone')}
              >
                <span className="rent-auth-method__icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="2" width="12" height="20" rx="3" />
                    <path d="M11 18h2" />
                  </svg>
                </span>
                {t('register.usePhone')}
              </button>

              <button
                type="button"
                className={`rent-auth-method__btn${mode === 'email' ? ' is-active' : ''}`}
                onClick={() => setMode('email')}
              >
                <span className="rent-auth-method__icon" aria-hidden="true">
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 6L2 7" />
                  </svg>
                </span>
                {t('register.useEmail')}
              </button>

              <div className="rent-auth-method__divider">
                <span className="rent-auth-method__or">{t('register.or')}</span>
              </div>
            </div>

            {/* 手机号模式：国家码 + 手机号 → 验证码 */}
            {mode === 'phone' && (
              <>
                <div className="rent-form-group">
                  <label className="rent-form-label" htmlFor="reg-phone">{t('register.phone')}</label>
                  <div className="rent-phone-row">
                    <select
                      id="reg-country"
                      className="rent-form-select"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      id="reg-phone"
                      className="rent-form-input"
                      placeholder={t('register.phonePlaceholder')}
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="rent-form-group">
                  <label className="rent-form-label" htmlFor="reg-code">{t('register.verificationCode')}</label>
                  <div className="rent-otp-row">
                    <input
                      type="text"
                      id="reg-code"
                      className="rent-form-input"
                      placeholder={t('register.codePlaceholder')}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value)}
                    />
                    <button
                      type="button"
                      className="rent-otp-action"
                      onClick={handleRequestOtp}
                      disabled={sending || countdown > 0}
                    >
                      {countdown > 0
                        ? `${t('register.resend')} (${countdown}s)`
                        : (sending ? t('register.sending') : t('register.getCode'))}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* 邮箱模式：邮箱 → 密码 →（选填手机号） */}
            {mode === 'email' && (
              <>
                <div className="rent-form-group">
                  <label className="rent-form-label" htmlFor="reg-email">{t('login.email')}</label>
                  <input
                    type="email"
                    id="reg-email"
                    className="rent-form-input"
                    placeholder={t('login.emailPlaceholder')}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="rent-form-group">
                  <label className="rent-form-label" htmlFor="reg-password">{t('login.password')}</label>
                  <input
                    type="password"
                    id="reg-password"
                    className="rent-form-input"
                    placeholder={t('register.passwordPlaceholder')}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {/* 邮箱模式下可选的手机号（选填） */}
                <div className="rent-form-group">
                  <label className="rent-form-label" htmlFor="reg-phone-opt">{t('register.phone')}</label>
                  <div className="rent-phone-row">
                    <select
                      id="reg-country-opt"
                      className="rent-form-select"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      id="reg-phone-opt"
                      className="rent-form-input"
                      placeholder={t('register.phonePlaceholder')}
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* 姓名 */}
            <div className="rent-form-group">
              <label className="rent-form-label" htmlFor="reg-name">{t('register.name')}</label>
              <input
                type="text"
                id="reg-name"
                className="rent-form-input"
                placeholder={t('register.namePlaceholder')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            {/* 角色选择（两个紧凑胶囊） */}
            <div className="rent-register-role-group">
              <label className="rent-form-label">{t('register.chooseRole')}</label>
              <div className="rent-register-role-grid">
                <button
                  type="button"
                  className={`rent-register-role-card ${role === 'owner' ? 'is-active' : ''}`}
                  onClick={() => setRole('owner')}
                >
                  <span className="rent-register-role-card__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 11l9-8 9 8" />
                      <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
                    </svg>
                  </span>
                  <span className="rent-register-role-card__name">{t('register.owner')}</span>
                </button>

                <button
                  type="button"
                  className={`rent-register-role-card ${role === 'tenant' ? 'is-active' : ''}`}
                  onClick={() => setRole('tenant')}
                >
                  <span className="rent-register-role-card__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                  </span>
                  <span className="rent-register-role-card__name">{t('register.tenant')}</span>
                </button>
              </div>
            </div>

            {/* 注册按钮（全宽胶囊） */}
            <button type="submit" className="rent-btn rent-btn--primary rent-btn--lg rent-btn--block rent-register-submit" disabled={submitting}>
              {submitting ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  {t('register.submitting')}
                </>
              ) : (
                <>
                  {t('register.submit')}
                </>
              )}
            </button>
          </form>

          {/* 底部：已有账号？去登录 */}
          <p className="rent-login-footer">
            {t('register.hasAccount')}
            <a onClick={() => navigate('/login')}>{t('register.goLogin')}</a>
          </p>
        </div>
      </section>
    </main>
  )
}

export default Register
