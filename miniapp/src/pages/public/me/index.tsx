/**
 * 「我的」Tab 的访客态。
 *
 * 这是「浏览不需注册、只在需要登录的动作上才要求注册」的边界页：
 * 用户不登录也能一路浏览到详情，只有点进来办自己的事（租约、缴费、收藏、消息）
 * 才需要登录。所以这里不做强制跳转，只给登录/注册入口，并说明可浏览范围。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import BottomNav from '@/components/BottomNav'
import './index.scss'

const CAPABILITIES = ['房源（租房 / 买房）', '国际学校与周边房源', '小区（楼盘）与在租在售']

export default function PublicMePage() {
  return (
    <View className='pub-page'>
      <View className='pub-inner'>
        <View className='pub-guest'>
          <View className='pub-guest__avatar'>
            <Text>我</Text>
          </View>
          <Text className='pub-guest__title'>浏览无需注册</Text>
          <Text className='pub-guest__sub'>
            内容全部公开。只有查看租约、缴费、收藏、消息这些
            {'\n'}
            与你本人相关的功能时才需要登录。
          </Text>
        </View>

        <View className='pub-card'>
          <Text className='pub-section__title'>现在可以看</Text>
          <View className='pub-guest__caps'>
            {CAPABILITIES.map((cap) => (
              <View className='pub-guest__cap' key={cap}>
                <Text>{cap}</Text>
                <Text className='pub-guest__cap-mark'>✓</Text>
              </View>
            ))}
          </View>
        </View>

        <View className='pub-guest__actions'>
          <View
            className='btn btn--primary btn--block'
            onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}
          >
            <Text>登录</Text>
          </View>
          <View
            className='btn btn--secondary btn--block'
            onClick={() => Taro.navigateTo({ url: '/pages/login/index?mode=register' })}
          >
            <Text>注册新账号</Text>
          </View>
        </View>

        <View className='pub-footer-note'>
          浏览房源、学校、小区无需注册
        </View>
      </View>

      <BottomNav role='guest' active='me' />
    </View>
  )
}
