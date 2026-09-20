import { useState, useEffect, useRef } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { authApi } from '@/services/api'
import type { User, UserRole } from '@/types'
import './index.scss'

type OtpMode = 'login' | 'register'

const REGISTER_ROLES: { key: UserRole; label: string }[] = [
  { key: 'tenant', label: '租客' },
  { key: 'owner', label: '业主' },
  { key: 'employee', label: '员工' },
  { key: 'agent', label: '经纪人' }
]

export default function LoginPage() {
  const login = useAuthStore((state) => state.login)
  const token = useAuthStore((state) => state.token)

  // 微信一键登录 / 手机号绑定
  const [wxLoading, setWxLoading] = useState(false)
  const [bindLoading, setBindLoading] = useState(false)

  // 手机号 + 验证码 兜底
  const [mode, setMode] = useState<OtpMode>('login')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('tenant')
  const [showFallback, setShowFallback] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpCountdown, setOtpCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const goHome = (user: User) => {
    const role: UserRole = user.role
    const homePath = {
      owner: '/pages/owner/home/index',
      tenant: '/pages/tenant/home/index',
      admin: '/pages/admin/home/index',
    }[role] || '/pages/employee/home/index'
    setTimeout(() => {
      Taro.redirectTo({ url: homePath })
    }, 400)
  }

  const applyLoginResult = (res: any): User => {
    const token = res?.access_token || res?.token || res?.data?.access_token || res?.data?.token
    const user = (res?.user || res?.data?.user) as User | undefined
    if (!token || !user) throw new Error('登录返回数据异常')

    Taro.setStorageSync('token', token)
    Taro.setStorageSync('user', JSON.stringify(user))
    login(token, user)
    return user
  }

  // ============ 微信一键授权登录 ============
  const handleWxLogin = async () => {
    setWxLoading(true)
    Taro.showLoading({ title: '登录中...', mask: true })
    try {
      const { code } = await Taro.login()
      const res: any = await authApi.wxLogin({ code })
      const user = applyLoginResult(res)
      Taro.hideLoading()
      Taro.showToast({ title: '登录成功', icon: 'success' })
      goHome(user)
    } catch (error: any) {
      Taro.hideLoading()
      if (error?.statusCode === 503) {
        Taro.showToast({ title: '微信登录暂不可用，请在下方输入手机号', icon: 'none' })
        setShowFallback(true)
      } else {
        Taro.showToast({ title: error?.message || '微信登录失败，请重试', icon: 'none' })
      }
    } finally {
      setWxLoading(false)
    }
  }

  // ============ 微信手机号快捷绑定（需登录态） ============
  const handleWxBindPhone = async (e: any) => {
    const c = e?.detail?.code
    if (!c) {
      Taro.showToast({ title: '未获取到手机号授权，请重试', icon: 'none' })
      return
    }
    if (!token) {
      Taro.showToast({ title: '请先完成登录后再绑定手机号', icon: 'none' })
      return
    }
    setBindLoading(true)
    try {
      await authApi.wxBindPhone({ code: c })
      Taro.showToast({ title: '手机号绑定成功', icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title: error?.message || '手机号绑定失败', icon: 'none' })
    } finally {
      setBindLoading(false)
    }
  }

  // ============ 手机号 + 验证码 兜底 ============
  const handleSendOtp = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    setOtpLoading(true)
    try {
      const res: any = await authApi.requestOtp({ recipient: phone, channel: 'sms' })
      Taro.showToast({ title: '验证码已发送', icon: 'success' })
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
      Taro.showToast({ title: error?.message || '验证码发送失败', icon: 'none' })
    } finally {
      setOtpLoading(false)
    }
  }

  const submitOtp = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    if (!otp) {
      Taro.showToast({ title: '请输入验证码', icon: 'none' })
      return
    }
    if (mode === 'register') {
      if (!fullName.trim()) {
        Taro.showToast({ title: '请输入姓名', icon: 'none' })
        return
      }
    }

    setWxLoading(true)
    Taro.showLoading({ title: '提交中...', mask: true })
    try {
      const res: any =
        mode === 'register'
          ? await authApi.register({ phone, code: otp, full_name: fullName.trim(), role })
          : await authApi.loginByOtp({ phone, code: otp })
      const user = applyLoginResult(res)
      Taro.hideLoading()
      Taro.showToast({
        title: mode === 'register' ? '注册成功' : '登录成功',
        icon: 'success'
      })
      goHome(user)
    } catch (error: any) {
      Taro.hideLoading()
      Taro.showToast({ title: error?.message || '操作失败，请重试', icon: 'none' })
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
      <View className='login-header'>
        <Text className='login-title'>VIP Rental</Text>
        <Text className='login-subtitle'>房地产租赁管理系统 · 欢迎登录</Text>
      </View>

      {/* 微信一键登录为主 */}
      <Button
        className='wx-login-btn'
        loading={wxLoading}
        disabled={wxLoading}
        onClick={handleWxLogin}
      >
        <Text className='wx-icon'>微信</Text>
        <Text>微信一键授权登录</Text>
      </Button>

      {/* 已登录用户可主动绑定微信手机号 */}
      {token ? (
        <View className='bind-phone-block'>
          <Text className='bind-phone-tip'>快捷绑定微信手机号</Text>
          <Button
            className='bind-phone-btn'
            openType='getPhoneNumber'
            loading={bindLoading}
            disabled={bindLoading}
            onGetPhoneNumber={handleWxBindPhone}
          >
            授权微信手机号并绑定
          </Button>
        </View>
      ) : null}

      <View className='divider'>
        <View className='divider-line' />
        <Text className='divider-text'>其他方式登录</Text>
        <View className='divider-line' />
      </View>

      {/* 手机号 + 验证码 兜底 */}
      <View className='fallback'>
        <View className='fallback-tabs'>
          <Text
            className={`fallback-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            手机号登录
          </Text>
          <Text
            className={`fallback-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            手机号注册
          </Text>
        </View>

        <View className='form-item'>
          <Text className='form-label'>手机号</Text>
          <Input
            className='form-input'
            type='number'
            maxlength={11}
            placeholder='请输入手机号'
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
          />
        </View>

        {mode === 'register' ? (
          <View className='form-item'>
            <Text className='form-label'>姓名</Text>
            <Input
              className='form-input'
              type='text'
              placeholder='请输入姓名'
              value={fullName}
              onInput={(e) => setFullName(e.detail.value)}
            />
          </View>
        ) : null}

        <View className='form-item'>
          <Text className='form-label'>验证码</Text>
          <View className='otp-row'>
            <Input
              className='form-input otp-input'
              type='number'
              maxlength={6}
              placeholder='请输入验证码'
              value={otp}
              onInput={(e) => setOtp(e.detail.value)}
            />
            <Button
              className='otp-btn'
              loading={otpLoading}
              disabled={otpLoading || otpCountdown > 0}
              onClick={handleSendOtp}
            >
              {otpCountdown > 0 ? `${otpCountdown}s` : '获取验证码'}
            </Button>
          </View>
        </View>

        {mode === 'register' ? (
          <View className='form-item'>
            <Text className='form-label'>身份角色</Text>
            <View className='role-row'>
              {REGISTER_ROLES.map((r) => (
                <Text
                  key={r.key}
                  className={`role-chip ${role === r.key ? 'active' : ''}`}
                  onClick={() => setRole(r.key)}
                >
                  {r.label}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        <Button
          className='login-btn'
          type='primary'
          loading={wxLoading}
          disabled={wxLoading}
          onClick={submitOtp}
        >
          {mode === 'register' ? '注册并登录' : '登 录'}
        </Button>
      </View>

      <View className='login-tip'>
        <Text className='tip-text'>
          提示：微信登录默认以租客身份进入；业主/经纪/员工账号可切换手机号注册选择身份。
        </Text>
      </View>
    </View>
  )
}