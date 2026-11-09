import { useState, useEffect, useRef } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { authApi } from '@/services/api'
import type { User, UserRole } from '@/types'
import { useI18n } from '@/i18n'
import './index.scss'
import { errorText } from '@/lib/errorText'
import { REFRESH_TOKEN_KEY } from '@/lib/api'

type OtpMode = 'login' | 'register'

const REGISTER_ROLES: { key: UserRole; label: string }[] = [
  { key: 'tenant', label: 'auth.roleTenant' },
  { key: 'owner', label: 'auth.roleOwner' },
  { key: 'employee', label: 'auth.roleEmployee' },
  { key: 'agent', label: 'auth.roleAgent' }
]

export default function LoginPage() {
  const { t } = useI18n()
  const router = useRouter()
  const login = useAuthStore((state) => state.login)
  const token = useAuthStore((state) => state.token)

  // 微信一键登录 / 手机号绑定
  const [wxLoading, setWxLoading] = useState(false)
  const [bindLoading, setBindLoading] = useState(false)

  // 手机号 + 验证码 兜底。
  // `?mode=register` 可让外部入口直接落在注册 Tab（访客「我的」页的「注册新账号」），
  // 不带参数时行为与之前完全一致（默认登录）。
  const [mode, setMode] = useState<OtpMode>(
    router.params?.mode === 'register' ? 'register' : 'login'
  )
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('tenant')
  const [showFallback, setShowFallback] = useState(router.params?.mode === 'register')
  // 协议勾选：与贝壳一致，未勾选不允许发起登录
  const [agreed, setAgreed] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpCountdown, setOtpCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const ensureAgreed = () => {
    if (agreed) return true
    Taro.showToast({ title: t('auth.agreementRequired'), icon: 'none' })
    return false
  }

  // 「暂不登录」：和贝壳一样直接以访客身份逛房源
  const handleSkip = () => {
    Taro.reLaunch({ url: '/pages/public/listings/index' })
  }

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const goHome = (user: User) => {
    const role = user.role as string
    // 合作公司管理员没有平台管理端首页，落到本公司聚合页（成员/绩效/考勤/房源）
    // 业主与租客统一到同一个 C 端首页
    const homePath =
      {
        owner: '/pages/tenant/home/index',
        tenant: '/pages/tenant/home/index',
        admin: '/pages/admin/home/index',
        partner_admin: '/pages/admin/partner-members/index',
      }[role] || '/pages/employee/home/index'
    setTimeout(() => {
      Taro.redirectTo({ url: homePath })
    }, 400)
  }

  const applyLoginResult = (res: any): User => {
    const token = res?.access_token || res?.token || res?.data?.access_token || res?.data?.token
    const user = (res?.user || res?.data?.user) as User | undefined
    if (!token || !user) throw new Error(t('auth.dataInvalid'))

    Taro.setStorageSync('token', token)
    Taro.setStorageSync('user', JSON.stringify(user))
    // 登录响应同时下发 refresh_token，必须落盘：否则 api 层的静默续期
    // 永远拿不到刷新令牌，access token 过期后直接把用户踢回登录页。
    const refreshToken = res?.refresh_token || res?.data?.refresh_token
    if (refreshToken) {
      Taro.setStorageSync(REFRESH_TOKEN_KEY, refreshToken)
    }
    login(token, user)
    return user
  }

  // ============ 微信一键授权登录 ============
  const handleWxLogin = async () => {
    if (!ensureAgreed()) return
    setWxLoading(true)
    Taro.showLoading({ title: t('auth.loggingIn'), mask: true })
    try {
      const { code } = await Taro.login()
      const res: any = await authApi.wxLogin({ code })
      const user = applyLoginResult(res)
      Taro.hideLoading()
      Taro.showToast({ title: t('auth.loginSuccess'), icon: 'success' })
      goHome(user)
    } catch (error: any) {
      Taro.hideLoading()
      if (error?.statusCode === 503) {
        Taro.showToast({ title: t('auth.wxUnavailable'), icon: 'none' })
        setShowFallback(true)
      } else {
        Taro.showToast({ title:errorText(error, t('auth.wxLoginFailed')), icon: 'none' })
      }
    } finally {
      setWxLoading(false)
    }
  }

  // ============ 微信手机号快捷绑定（需登录态） ============
  const handleWxBindPhone = async (e: any) => {
    const c = e?.detail?.code
    if (!c) {
      Taro.showToast({ title: t('auth.phoneAuthMissing'), icon: 'none' })
      return
    }
    if (!token) {
      Taro.showToast({ title: t('auth.loginFirst'), icon: 'none' })
      return
    }
    setBindLoading(true)
    try {
      await authApi.wxBindPhone({ code: c })
      Taro.showToast({ title: t('auth.bindSuccess'), icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title:errorText(error, t('auth.bindFailed')), icon: 'none' })
    } finally {
      setBindLoading(false)
    }
  }

  // ============ 手机号 + 验证码 兜底 ============
  const handleSendOtp = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: t('auth.phoneInvalid'), icon: 'none' })
      return
    }
    setOtpLoading(true)
    try {
      const res: any = await authApi.requestOtp({ recipient: phone, channel: 'sms' })
      Taro.showToast({ title: t('auth.otpSent'), icon: 'success' })
      if (res?.dev_code) setOtp(String(res.dev_code))

      let n = 60
      setOtpCountdown(n)
      countdownRef.current = setInterval(() => {
        n -= 1
        if (n <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          countdownRef.current = null
          setOtpCountdown(0)
        } else {
          setOtpCountdown(n)
        }
      }, 1000)
    } catch (error: any) {
      Taro.showToast({ title:errorText(error, t('auth.otpSendFailed')), icon: 'none' })
    } finally {
      setOtpLoading(false)
    }
  }

  const submitOtp = async () => {
    if (!ensureAgreed()) return
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: t('auth.phoneInvalid'), icon: 'none' })
      return
    }
    if (!otp) {
      Taro.showToast({ title: t('auth.otpRequired'), icon: 'none' })
      return
    }
    if (mode === 'register') {
      if (!fullName.trim()) {
        Taro.showToast({ title: t('auth.nameRequired'), icon: 'none' })
        return
      }
    }

    setWxLoading(true)
    Taro.showLoading({ title: t('auth.submitting'), mask: true })
    try {
      const res: any =
        mode === 'register'
          ? await authApi.register({ phone, code: otp, full_name: fullName.trim(), role })
          : await authApi.loginByOtp({ phone, code: otp })
      const user = applyLoginResult(res)
      Taro.hideLoading()
      Taro.showToast({
        title: mode === 'register' ? t('auth.registerSuccess') : t('auth.loginSuccess'),
        icon: 'success'
      })
      goHome(user)
    } catch (error: any) {
      Taro.hideLoading()
      Taro.showToast({ title:errorText(error, t('auth.opFailed')), icon: 'none' })
    } finally {
      setWxLoading(false)
    }
  }

  const switchMode = (m: OtpMode) => {
    setMode(m)
    setOtp('')
  }

  return (
    <View className='login-page'>
      {/* 快捷登录态：参考贝壳 —— 纯白首屏，居中品牌 + 两个按钮 + 底部协议 */}
      {!showFallback ? (
        <View className='login-quick'>
          <View className='login-brand'>
            <View className='login-brand__logo'>
              <Text className='login-brand__logo-text'>V</Text>
            </View>
            <Text className='login-brand__name'>VIP Rental</Text>
            <Text className='login-brand__slogan'>{t('auth.slogan')}</Text>
          </View>

          <View className='login-actions'>
            <Button
              className='btn-solid'
              loading={wxLoading}
              disabled={wxLoading}
              onClick={handleWxLogin}
            >
              {t('auth.wxLogin')}
            </Button>

            <Button className='btn-outline' onClick={() => setShowFallback(true)}>
              <View className='phone-icon' />
              <Text className='btn-outline__text'>{t('auth.phoneLogin')}</Text>
            </Button>

            {token ? (
              <Button
                className='btn-text'
                openType='getPhoneNumber'
                loading={bindLoading}
                disabled={bindLoading}
                onGetPhoneNumber={handleWxBindPhone}
              >
                {t('auth.bindPhone')}
              </Button>
            ) : null}

            <View className='login-skip' onClick={handleSkip}>
              <Text className='login-skip__text'>{t('auth.skipLogin')}</Text>
              <View className='login-skip__chev' />
            </View>
          </View>
        </View>
      ) : (
        /* 手机号态：左对齐大标题 + 下划线输入框 + 通栏按钮 */
        <View className='login-phone'>
          <Text className='login-phone__title'>
            {mode === 'register' ? t('auth.phoneRegister') : t('auth.phoneLogin')}
          </Text>

          <View className='login-phone__tabs'>
            <Text
              className={`login-phone__tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              {t('auth.phoneLogin')}
            </Text>
            <Text
              className={`login-phone__tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode('register')}
            >
              {t('auth.phoneRegister')}
            </Text>
          </View>

          <View className='field'>
            <Input
              className='field__input'
              type='number'
              maxlength={11}
              placeholder={t('auth.phonePlaceholder')}
              value={phone}
              onInput={(e) => setPhone(e.detail.value)}
            />
          </View>

          {mode === 'register' ? (
            <View className='field'>
              <Input
                className='field__input'
                type='text'
                placeholder={t('auth.namePlaceholder')}
                value={fullName}
                onInput={(e) => setFullName(e.detail.value)}
              />
            </View>
          ) : null}

          <View className='field'>
            <Input
              className='field__input'
              type='number'
              maxlength={6}
              placeholder={t('auth.otpPlaceholder')}
              value={otp}
              onInput={(e) => setOtp(e.detail.value)}
            />
            <Text
              className={`field__action ${otpCountdown > 0 || otpLoading ? 'is-disabled' : ''}`}
              onClick={otpCountdown > 0 || otpLoading ? undefined : handleSendOtp}
            >
              {otpCountdown > 0 ? `${otpCountdown}s` : t('auth.getOtp')}
            </Text>
          </View>

          {mode === 'register' ? (
            <View className='role-row'>
              {REGISTER_ROLES.map((r) => (
                <Text
                  key={r.key}
                  className={`role-chip ${role === r.key ? 'active' : ''}`}
                  onClick={() => setRole(r.key)}
                >
                  {t(r.label)}
                </Text>
              ))}
            </View>
          ) : null}

          <Button
            className={`btn-solid btn-solid--form ${!phone || !otp ? 'is-disabled' : ''}`}
            loading={wxLoading}
            disabled={wxLoading}
            onClick={submitOtp}
          >
            {mode === 'register' ? t('auth.registerAndLogin') : t('auth.loginBtn')}
          </Button>

          <View className='login-back' onClick={() => setShowFallback(false)}>
            <Text className='login-back__text'>{t('auth.wxLogin')}</Text>
          </View>
        </View>
      )}

      {/* 底部协议：未勾选不允许登录（与贝壳一致） */}
      <View className='agreement'>
        <View
          className={`agreement__box ${agreed ? 'is-checked' : ''}`}
          onClick={() => setAgreed((v) => !v)}
        >
          <View className='agreement__tick' />
        </View>
        <Text className='agreement__text' onClick={() => setAgreed((v) => !v)}>
          {t('auth.agreementPrefix')}
          <Text className='agreement__link'>{t('auth.agreementTerms')}</Text>
        </Text>
      </View>
    </View>
  )
}