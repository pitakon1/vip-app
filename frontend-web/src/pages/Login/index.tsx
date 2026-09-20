import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import OAuthButtons from '@/components/OAuthButtons'
import brandLogo from '@/assets/haofang-logo.jpg'
import './login.css'

// 国家码下拉（带 + 前缀，如 +86），手机号最终提交为「国家码 + 无前导0手机号」
const COUNTRY_CODES = ['+86', '+1', '+66', '+55']

const phoneWithCode = (countryCode: string, phone: string): string =>
  `${countryCode}${phone.replace(/^0/, '')}`

// 根据角色返回对应首页路径
const roleRedirectPath = (role: string): string => {
  switch (role) {
    case 'owner': return '/owner/dashboard'
    case 'tenant': return '/tenant/dashboard'
    case 'employee': return '/employee/dashboard'
    // agent 与 employee 共用销售工作台（与 RoleRedirect 保持一致）
    case 'agent': return '/employee/dashboard'
    default: return '/dashboard'
  }
}

const FEATURES = [
  {
    title: '智能合同管理与电子签约',
    desc: '模板化生成租约，在线签署与归档，到期自动提醒',
  },
  {
    title: '自动化租金收取与财务报表',
    desc: '多币种收款对账，实时生成收支明细与运营分析',
  },
  {
    title: '高效维修工单与租户沟通',
    desc: '租户一键报修，工单分派追踪，消息实时通知',
  },
  {
    title: '多角色协作与权限管理',
    desc: '管理员、业主、租客、员工四端协同，精细化权限控制',
  },
]

const PhoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

const EmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
)

const Login = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const login = useAuthStore((s) => s.login)
  const [submitting, setSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  // Reddit 分步式：方式选择屏(choose) → 对应表单屏(form)
  const [stage, setStage] = useState<'choose' | 'form'>('choose')
  const [method, setMethod] = useState<'phone' | 'email'>('email')
  const [countryCode, setCountryCode] = useState('+86')
  const [phone, setPhone] = useState('')
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

  // 登录成功后：角色决定进哪一端，绝不兜底成 admin（见原注释）
  const handleAuthSuccess = (res: any) => {
    const payload = res?.data?.data ?? res?.data
    const token: string = payload?.access_token ?? payload?.token ?? payload?.accessToken
    if (!token) {
      message.error(t('login.tokenMissing'))
      return false
    }
    const user: User | undefined = payload?.user
    if (!user?.role) {
      message.error(t('login.loginFailed'))
      return false
    }
    login(token, user, payload?.refresh_token)
    message.success(t('login.loginSuccess'))
    navigate(roleRedirectPath(user.role))
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (method === 'email') {
      const nextErrors: { email?: string; password?: string } = {}
      if (!email) nextErrors.email = t('login.emailRequired')
      if (!password) nextErrors.password = t('login.passwordRequired')
      setErrors(nextErrors)
      if (nextErrors.email || nextErrors.password) return
    } else {
      if (!phone) {
        message.warning(t('login.phoneRequired'))
        return
      }
      if (!smsCode) {
        message.warning(t('login.codeRequired'))
        return
      }
    }
    setSubmitting(true)
    try {
      const res = method === 'phone'
        ? await authApi.loginByOtp(phoneWithCode(countryCode, phone), smsCode)
        : await authApi.login(email, password)
      if (!handleAuthSuccess(res)) return
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('login.loginFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // 请求发送短信验证码
  const handleRequestOtp = async () => {
    if (!phone) {
      message.warning(t('login.phoneRequired'))
      return
    }
    setSending(true)
    try {
      const res = await authApi.requestOtp(phoneWithCode(countryCode, phone), 'sms')
      const devCode = res.data?.dev_code
      if (devCode) {
        setSmsCode(String(devCode))
        message.info(t('login.otpDevHint'))
      } else {
        message.success(t('login.otpSent'))
        setCountdown(60)
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('login.otpFailed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="rent-login-page">
      {/* 语言切换（悬浮右上角，不破坏分屏布局） */}
      <div className="rent-login-lang">
        <LanguageSwitcher compact />
      </div>

      {/* ===== 左栏 40%（品牌区） ===== */}
      <section className="rent-login-left">
        <div className="rent-login-left__content">
          <div className="rent-login-brand">
            <img
              className="rent-login-brand__img"
              src={brandLogo}
              alt="HaoFang.World"
            />
          </div>
          <h1 className="rent-login-tagline">东南亚房地产租赁管理平台</h1>
          <p className="rent-login-subtagline">
            一站式管理您的房源、租约、租金与维修工单，让租赁运营更高效。
          </p>
          <ul className="rent-login-features">
            {FEATURES.map((f) => (
              <li className="rent-login-feature" key={f.title}>
                <span className="rent-login-feature__check">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <div className="rent-login-feature__text">
                  {f.title}
                  <small>{f.desc}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== 右栏 60%（登录表单） ===== */}
      <section className="rent-login-right">
        <div className="rent-login-card">
          <div className="rent-login-card__header">
            <h2 className="rent-login-card__title">{t('login.welcomeBack')}</h2>
            <p className="rent-login-card__subtitle">{t('login.subtitle')}</p>
          </div>

          {stage === 'choose' ? (
            <>
              {/* 方式选择屏：OAuth + 「或」+ 手机号/邮箱 */}
              <div className="rent-auth-social">
                <OAuthButtons onSuccess={handleAuthSuccess} />
                <div className="rent-auth-divider" aria-hidden="true">
                  <span>{t('register.or')}</span>
                </div>
              </div>

              <div className="rent-login-methods">
                <button
                  type="button"
                  className="continue-btn"
                  onClick={() => { setMethod('phone'); setStage('form') }}
                >
                  <span className="continue-btn__icon" aria-hidden="true"><PhoneIcon /></span>
                  {t('login.phone')}
                </button>
                <button
                  type="button"
                  className="continue-btn"
                  onClick={() => { setMethod('email'); setStage('form') }}
                >
                  <span className="continue-btn__icon" aria-hidden="true"><EmailIcon /></span>
                  {t('login.email')}
                </button>
              </div>

              {/* 底部：去注册 */}
              <p className="rent-login-footer">
                {t('login.noAccount')}
                <a
                  onClick={(e) => {
                    e.preventDefault()
                    navigate('/register')
                  }}
                >
                  {t('login.goRegister')}
                </a>
              </p>
            </>
          ) : (
            <>
              {/* 表单屏：左上角返回箭头回方式选择屏 */}
              <div className="rent-login-back">
                <button
                  type="button"
                  className="rent-login-back__btn"
                  onClick={() => { setStage('choose'); setErrors({}) }}
                  aria-label={t('common.back')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
              </div>

              {/* 测试账号提示：仅开发构建展示 */}
              {import.meta.env.DEV && method === 'email' && (
                <div className="rent-login-hint">
                  测试账号：<span className="rent-mono">admin@viprental.com / admin123</span>（管理员）
                  · agent@viprental.com / agent123（经纪）· owner@viprental.com / owner123（业主）
                  · tenant@viprental.com / tenant123（租客）
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* 邮箱密码登录 */}
                {method === 'email' && (
                  <>
                    <div className="rent-form-group">
                      <label className="rent-form-label" htmlFor="login-email">{t('login.email')}</label>
                      <input
                        type="email"
                        id="login-email"
                        className={`rent-form-input${errors.email ? ' rent-form-input--error' : ''}`}
                        placeholder={t('login.emailPlaceholder')}
                        autoComplete="email"
                        autoFocus
                        aria-invalid={!!errors.email}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
                        }}
                      />
                      {errors.email && <div className="rent-form-error" role="alert">{errors.email}</div>}
                    </div>

                    <div className="rent-form-group">
                      <label className="rent-form-label" htmlFor="login-password">{t('login.password')}</label>
                      <input
                        type="password"
                        id="login-password"
                        className={`rent-form-input${errors.password ? ' rent-form-input--error' : ''}`}
                        placeholder={t('login.passwordPlaceholder')}
                        autoComplete="current-password"
                        aria-invalid={!!errors.password}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
                        }}
                      />
                      {errors.password && <div className="rent-form-error" role="alert">{errors.password}</div>}
                    </div>

                    {/* 记住我 + 忘记密码 */}
                    <div className="rent-login-row">
                      <label className="rent-checkbox">
                        <input type="checkbox" id="remember-me" />
                        <span>{t('login.rememberMe')}</span>
                      </label>
                      <a
                        href="#"
                        className="rent-login-link"
                        onClick={(e) => {
                          e.preventDefault()
                          message.info(t('login.forgotPasswordHint'))
                        }}
                      >
                        {t('login.forgotPassword')}
                      </a>
                    </div>
                  </>
                )}

                {/* 手机号 + 验证码登录 */}
                {method === 'phone' && (
                  <>
                    <div className="rent-form-group">
                      <label className="rent-form-label" htmlFor="login-phone">{t('login.phone')}</label>
                      <div className="rent-phone-row">
                        <select
                          id="login-country"
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
                          id="login-phone"
                          className="rent-form-input"
                          placeholder={t('login.phonePlaceholder')}
                          autoComplete="tel"
                          autoFocus
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="rent-form-group">
                      <label className="rent-form-label" htmlFor="login-code">{t('login.verificationCode')}</label>
                      <div className="rent-otp-row">
                        <input
                          type="text"
                          id="login-code"
                          className="rent-form-input"
                          placeholder={t('login.codePlaceholder')}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={smsCode}
                          onChange={(e) => setSmsCode(e.target.value)}
                        />
                        <button
                          type="button"
                          className="rent-btn rent-btn--ghost rent-btn--nowrap"
                          onClick={handleRequestOtp}
                          disabled={sending || countdown > 0}
                        >
                          {countdown > 0
                            ? `${t('register.resend')} (${countdown}s)`
                            : (sending ? t('login.sending') : t('login.getCode'))}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 登录按钮 */}
                <button type="submit" className="rent-btn rent-btn--primary rent-btn--lg rent-btn--block" disabled={submitting}>
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
            </>
          )}
        </div>
      </section>
    </main>
  )
}

export default Login
