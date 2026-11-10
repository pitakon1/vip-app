import { useEffect } from 'react'
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

export default function IndexPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  useEffect(() => {
    // 兜底从本地存储加载，确保 token/user 为最新
    loadFromStorage()
    const currentToken = useAuthStore.getState().token
    const currentUser = useAuthStore.getState().user

    // 未登录不再跳登录页——直接进 C 端公开内容首页（首页/发现的内容全部来自
    // 匿名接口 `/public/*`，只有办自己的事时才会被要求登录），与 App 访客落点一致。
    if (!currentToken) {
      Taro.redirectTo({ url: '/pages/tenant/home/index' })
      return
    }

    // 根据角色重定向到对应首页
    // 业主与租客统一到同一个 C 端首页
    if (currentUser?.role === 'owner' || currentUser?.role === 'tenant') {
      Taro.redirectTo({ url: '/pages/tenant/home/index' })
    } else if (currentUser?.role === 'admin') {
      Taro.redirectTo({ url: '/pages/admin/home/index' })
    } else if (currentUser?.role === 'employee' || currentUser?.role === 'agent') {
      Taro.redirectTo({ url: '/pages/employee/home/index' })
    } else if (currentUser?.role === 'partner_admin') {
      // 合作公司管理员与登录页落点保持一致
      Taro.redirectTo({ url: '/pages/admin/partner-members/index' })
    } else {
      // 有 token 但角色未知，跳转到我的页面
      Taro.redirectTo({ url: '/pages/profile/index' })
    }
    // 只执行一次：loadFromStorage 会写入新的 user 对象，若把它订阅到依赖里会触发无限重渲染。
  }, [loadFromStorage])

  return (
    <View className='index-page'>
      <StateBlock loading text={t('pub.loading')} />
    </View>
  )
}
