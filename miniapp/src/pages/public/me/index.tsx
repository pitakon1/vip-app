/**
 * 「我的」Tab 的访客态。
 *
 * 这是「浏览不需注册、只在需要登录的动作上才要求注册」的边界页：
 * 用户不登录也能一路浏览到详情，只有点进来办自己的事（租约、缴费、收藏、消息）
 * 才需要登录。所以这里不做强制跳转，只给登录/注册入口，并说明可浏览范围。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n, LANGS, LANG_LABELS } from '@/i18n'
import BottomNav from '@/components/BottomNav'
import './index.scss'

const CAPABILITIES = ['pub.meCap1', 'pub.meCap2', 'pub.meCap3']

export default function PublicMePage() {
  const { t, lang, setLang } = useI18n()
  return (
    <View className='pub-page'>
      <View className='pub-inner'>
        <View className='pub-guest'>
          <View className='pub-guest__avatar'>
            <Text>{t('pub.meAvatar')}</Text>
          </View>
          <Text className='pub-guest__title'>{t('pub.meTitle')}</Text>
          <Text className='pub-guest__sub'>{t('pub.meSub')}</Text>
        </View>

        <View className='pub-card'>
          <Text className='pub-section__title'>{t('pub.nowAvailable')}</Text>
          <View className='pub-guest__caps'>
            {CAPABILITIES.map((cap) => (
              <View className='pub-guest__cap' key={cap}>
                <Text>{t(cap)}</Text>
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
            <Text>{t('pub.login')}</Text>
          </View>
          <View
            className='btn btn--secondary btn--block'
            onClick={() => Taro.navigateTo({ url: '/pages/login/index?mode=register' })}
          >
            <Text>{t('pub.registerAccount')}</Text>
          </View>
        </View>

        <View className='pub-card'>
          <Text className='pub-section__title'>{t('pub.language')}</Text>
          <View className='pub-chips pub-chips--wrap'>
            {LANGS.map((l) => (
              <View
                key={l}
                className={`pub-chip${lang === l ? ' pub-chip--on' : ''}`}
                onClick={() => setLang(l)}
              >
                <Text>{LANG_LABELS[l]}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className='pub-footer-note'>
          {t('pub.guestHint')}
        </View>
      </View>

      <BottomNav role='guest' active='me' />
    </View>
  )
}
