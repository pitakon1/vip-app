import { useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import './index.scss'

export default function IndexPage() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  useEffect(() => {
    // 兜底从本地存储加载，确保 token/user 为最新
    loadFromStorage()
    const currentToken = useAuthStore.getState().token
    const currentUser = useAuthStore.getState().user

    if (!currentToken) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }

    // 根据角色重定向到对应首页
    if (currentUser?.role === 'owner') {
      Taro.redirectTo({ url: '/pages/owner/home/index' })
    } else if (currentUser?.role === 'tenant') {
      Taro.redirectTo({ url: '/pages/tenant/home/index' })
    } else {
      // 有 token 但角色未知，跳转到我的页面
      Taro.redirectTo({ url: '/pages/profile/index' })
    }
  }, [token, user, loadFromStorage])

  return (
    <View className='index-page'>
      <View className='loading-wrapper'>
        <Text className='loading-text'>加载中...</Text>
      </View>
    </View>
  )
}
