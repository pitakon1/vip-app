import { View, Text, ScrollView } from '@tarojs/components'
import { useI18n } from '@/i18n'
import './index.scss'

/** 帮助中心（D-08）：替代原「暂未开放」提示，纯静态内容，不依赖后端 */
export default function Help() {
  const { t } = useI18n()
  const sections = [
    { q: 'help.q1', a: 'help.a1' },
    { q: 'help.q2', a: 'help.a2' },
    { q: 'help.q3', a: 'help.a3' },
    { q: 'help.q4', a: 'help.a4' },
    { q: 'help.q5', a: 'help.a5' },
  ]

  return (
    <ScrollView className='help-page' scrollY>
      <View className='help-page__intro'>{t('help.intro')}</View>
      {sections.map((item) => (
        <View className='help-card' key={item.q}>
          <View className='help-card__q'>{t(item.q)}</View>
          <View className='help-card__a'>{t(item.a)}</View>
        </View>
      ))}
      <View className='help-card'>
        <View className='help-card__q'>{t('help.contactTitle')}</View>
        <View className='help-card__a'>{t('help.contactBody')}</View>
      </View>
    </ScrollView>
  )
}
