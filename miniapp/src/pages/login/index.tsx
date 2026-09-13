import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { authApi } from '@/services/api'
import type { User, UserRole } from '@/types'
import './index.scss'

export default function LoginPage() {
  const login = useAuthStore((state) => state.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      Taro.showToast({ title: '请输入邮箱和密码', icon: 'none' })
      return
    }

    setLoading(true)
    Taro.showLoading({ title: '登录中...', mask: true })

    try {
      const res = (await authApi.login(email, password)) as any
      // 后端返回 { access_token, refresh_token, token_type, user } 扁平结构
      const token = res?.access_token || res?.token || res?.data?.access_token || res?.data?.token
      const user = (res?.user || res?.data?.user) as User | undefined

      if (!token || !user) {
        Taro.hideLoading()
        Taro.showToast({ title: '登录返回数据异常', icon: 'none' })
        return
      }

      // 持久化 token 与用户信息
      Taro.setStorageSync('token', token)
      Taro.setStorageSync('user', JSON.stringify(user))
      login(token, user)

      Taro.hideLoading()
      Taro.showToast({ title: '登录成功', icon: 'success' })

      const role: UserRole = user.role
      const homePath = {
        owner: '/pages/owner/home/index',
        tenant: '/pages/tenant/home/index',
        admin: '/pages/admin/home/index',
      }[role] || '/pages/employee/home/index' // agent/employee 进入经纪/员工工作台
      setTimeout(() => {
        Taro.redirectTo({ url: homePath })
      }, 500)
    } catch (error) {
      console.error('[Login] 登录失败', error)
      Taro.hideLoading()
      Taro.showToast({ title: '登录失败，请检查邮箱和密码', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='login-page'>
      <View className='login-header'>
        <Text className='login-title'>VIP Rental</Text>
        <Text className='login-subtitle'>房地产租赁管理系统</Text>
      </View>

      <View className='login-form'>
        <View className='form-item'>
          <Text className='form-label'>邮箱</Text>
          <Input
            className='form-input'
            type='text'
            placeholder='请输入邮箱'
            value={email}
            onInput={(e) => setEmail(e.detail.value)}
          />
        </View>

        <View className='form-item'>
          <Text className='form-label'>密码</Text>
          <Input
            className='form-input'
            type='text'
            password
            placeholder='请输入密码'
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
          />
        </View>

        <Button
          className='login-btn'
          type='primary'
          loading={loading}
          disabled={loading}
          onClick={handleLogin}
        >
          登录
        </Button>

        <View className='login-tip'>
          <Text className='tip-text'>提示：业主/租客/管理员/经纪/员工账号登录后将进入各自对应的工作台</Text>
        </View>
      </View>
    </View>
  )
}
