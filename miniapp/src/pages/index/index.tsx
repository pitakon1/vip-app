import { useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { useI18n } from '@/i18n'
import './index.scss'

export default function IndexPage() {
  const { t } = useI18n()
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  useEffect(() => {
    // 兜底从本地存储加载，确保 token/user 为最新
    loadFromStorage()
    const currentToken = useAuthStore.getState().token
    const currentUser = useAuthStore.getState().user

    // 未登录不再跳登录页——直接进 C 端公开站（找房 / 学校 / 小区）。
    // 内容全部来自匿名接口 `/public/*`，只有办自己的事时才会被要求登录。
    if (!currentToken) {
      Taro.redirectTo({ url: '/pages/public/listings/index' })
      return
    }

    // 根据角色重定向到对应首页
    if (currentUser?.role === 'owner') {
      Taro.redirectTo({ url: '/pages/owner/home/index' })
    } else if (currentUser?.role === 'tenant') {
      Taro.redirectTo({ url: '/pages/tenant/home/index' })
    } else if (currentUser?.role === 'admin') {
      Taro.redirectTo({ url: '/pages/admin/home/index' })
    } else if (currentUser?.role === 'employee' || currentUser?.role === 'agent') {
      Taro.redirectTo({ url: '/pages/employee/home/index' })
    } else {
      // 有 token 但角色未知，跳转到我的页面
      Taro.redirectTo({ url: '/pages/profile/index' })
    }
  }, [token, user, loadFromStorage])

  return (
    <View className='index-page'>
      <View className='loading-wrapper'>
        <Text className='loading-text'>{t('pub.loading')}</Text>
      </View>
    </View>
  )
}
