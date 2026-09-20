import { useState } from 'react'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import brandLogo from '@/assets/haofang-logo.jpg'
import './login.css'

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

const Login = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const login = useAuthStore((s) => s.login)
  const [submitting, setSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: { email?: string; password?: string } = {}
    if (!email) nextErrors.email = t('login.emailRequired')
    if (!password) nextErrors.password = t('login.passwordRequired')
    setErrors(nextErrors)
    if (nextErrors.email || nextErrors.password) return
    setSubmitting(true)
    try {
      const res = await authApi.login(email, password)
      const payload = res.data?.data ?? res.data
      const token: string = payload?.access_token ?? payload?.token ?? payload?.accessToken
      if (!token) {
        message.error(t('login.tokenMissing'))
        return
      }
      // 角色决定登录后进哪一端，绝不能兜底成 admin —— 一旦后端响应缺少 user，
      // 兜底就等于把管理端入口开放给任意账号。宁可报错让用户重试。
      const user: User | undefined = payload?.user
      if (!user?.role) {
        message.error(t('login.loginFailed'))
        return
      }
      login(token, user, payload?.refresh_token)
      message.success(t('login.loginSuccess'))
      navigate(roleRedirectPath(user.role))
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('login.loginFailed'))
    } finally {
      setSubmitting(false)
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

          {/* 测试账号提示：仅开发构建展示，生产构建里这段账号密码不应出现在页面上 */}
          {import.meta.env.DEV && (
            <div className="rent-login-hint">
              测试账号：<span className="rent-mono">admin@viprental.com / admin123</span>（管理员）
              · agent@viprental.com / agent123（经纪）· owner@viprental.com / owner123（业主）
              · tenant@viprental.com / tenant123（租客）
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* 邮箱 */}
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

            {/* 密码 */}
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

          {/* 底部 */}
          <p className="rent-login-footer">
            {t('login.noAccount')}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                message.info(t('login.contactAdminHint'))
              }}
            >
              {t('login.contactAdmin')}
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}

export default Login
