import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useI18n, LANGS, LANG_LABELS } from '@/i18n'
import './index.scss'

/**
 * 语言选择（对齐 App 的 SettingsLanguage 全屏子页）：
 * 选择后即时写入 i18n store 并返回；store 变更会触发所有订阅页重渲染。
 */
export default function LanguagePage() {
  const { t, lang, setLang } = useI18n()

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('profile.language') })
  })

  const choose = (next: (typeof LANGS)[number]) => {
    if (next !== lang) setLang(next)
    Taro.navigateBack()
  }

  return (
    <View className='lang-page'>
      <View className='lang-list'>
        {LANGS.map((id) => (
          <View key={id} className='lang-row' onClick={() => choose(id)}>
            <Text className='lang-row__label'>{LANG_LABELS[id]}</Text>
            {lang === id && <Text className='lang-row__check'>✓</Text>}
          </View>
        ))}
      </View>
    </View>
  )
}
