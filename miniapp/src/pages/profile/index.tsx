import { View, Text, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { authApi } from '@/services/api'
import type { User } from '@/types'
import './index.scss'

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user)
  const login = useAuthStore((state) => state.login)
  const logout = useAuthStore((state) => state.logout)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const token = useAuthStore((state) => state.token)

  useDidShow(() => {
    loadFromStorage()
    // 已登录时拉取最新用户信息
    if (useAuthStore.getState().token) {
      refreshUser()
    }
  })

  const refreshUser = async () => {
    try {
      const res = await authApi.me()
      const latest = (res?.data ?? res) as User | undefined
      const currentToken = useAuthStore.getState().token
      if (latest && currentToken) {
        login(currentToken, latest)
      }
    } catch (error) {
      // 静默失败，使用本地缓存的用户信息
      console.warn('[Profile] 获取用户信息失败', error)
    }
  }

  const handleLogout = () => {
    Taro.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地 token 与用户信息
          logout()
          Taro.removeStorageSync('token')
          Taro.removeStorageSync('user')
          Taro.showToast({ title: '已退出登录', icon: 'success' })
          setTimeout(() => {
            Taro.redirectTo({ url: '/pages/login/index' })
          }, 500)
        }
      }
    })
  }

  const handleNavigate = (url: string) => {
    Taro.navigateTo({ url })
  }

  const roleText =
    user?.role === 'owner' ? '业主' : user?.role === 'tenant' ? '租客' : '未知'

  return (
    <View className='profile-page'>
      <View className='profile-header'>
        <View className='avatar'>
          <Text className='avatar-text'>{user?.name?.charAt(0) || 'U'}</Text>
        </View>
        <View className='user-info'>
          <Text className='user-name'>{user?.name || (token ? '用户' : '未登录')}</Text>
          <Text className='user-role'>{roleText}</Text>
          {user?.email && <Text className='user-email'>{user.email}</Text>}
          {user?.phone && <Text className='user-phone'>{user.phone}</Text>}
        </View>
      </View>

      <View className='menu-list'>
        {user?.role === 'owner' && (
          <>
            <View className='menu-item' onClick={() => handleNavigate('/pages/owner/home/index')}>
              <Text className='menu-text'>我的房屋</Text>
              <Text className='menu-arrow'>›</Text>
            </View>
            <View className='menu-item' onClick={() => handleNavigate('/pages/owner/documents/index')}>
              <Text className='menu-text'>文档管理</Text>
              <Text className='menu-arrow'>›</Text>
            </View>
            <View className='menu-item' onClick={() => handleNavigate('/pages/owner/income/index')}>
              <Text className='menu-text'>收入汇总</Text>
              <Text className='menu-arrow'>›</Text>
            </View>
            <View className='menu-item' onClick={() => handleNavigate('/pages/owner/services/index')}>
              <Text className='menu-text'>增值服务</Text>
              <Text className='menu-arrow'>›</Text>
            </View>
          </>
        )}

        {user?.role === 'tenant' && (
          <>
            <View className='menu-item' onClick={() => handleNavigate('/pages/tenant/home/index')}>
              <Text className='menu-text'>我的通知</Text>
              <Text className='menu-arrow'>›</Text>
            </View>
            <View className='menu-item' onClick={() => handleNavigate('/pages/tenant/documents/index')}>
              <Text className='menu-text'>我的文档</Text>
              <Text className='menu-arrow'>›</Text>
            </View>
            <View className='menu-item' onClick={() => handleNavigate('/pages/tenant/maintenance/index')}>
              <Text className='menu-text'>报修工单</Text>
              <Text className='menu-arrow'>›</Text>
            </View>
            <View className='menu-item' onClick={() => handleNavigate('/pages/tenant/services/index')}>
              <Text className='menu-text'>增值服务</Text>
              <Text className='menu-arrow'>›</Text>
            </View>
          </>
        )}
      </View>

      <View className='logout-wrapper'>
        <Button className='logout-btn' onClick={handleLogout}>
          退出登录
        </Button>
      </View>
    </View>
  )
}
