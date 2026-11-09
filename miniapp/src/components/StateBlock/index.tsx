/**
 * 通用空态 / 错误态 / 加载态块。
 *
 * 对齐 App components/EmptyState：44px 圆形描边图标 + 16px/600 标题 +
 * 主色胶囊按钮（重试 / 清空筛选）。`text` 由调用方传入（通常已走 i18n），
 * 组件本身不内置文案。
 */
import { View, Text } from '@tarojs/components'
import { iconStyle, type IconKey } from '@/utils/icons'
import './index.scss'

interface Props {
  /** 加载态：优先于 error / empty */
  loading?: boolean
  /** 失败态：与空态视觉区分，并提供重试入口 */
  error?: boolean
  /** 空态 */
  empty?: boolean
  /** 空态是否由筛选条件导致（文案仍由调用方传入） */
  filtered?: boolean
  /** 文案（通常由调用方走 i18n 传入） */
  text?: string
  /** 空态图标（缺省用通用文档图标，与 App 默认 file-tray 语义一致） */
  icon?: IconKey
  onRetry?: () => void
  retryText?: string
}

export default function StateBlock({ loading, error, empty, filtered, text, icon, onRetry, retryText }: Props) {
  if (loading) {
    return (
      <View className='state-block'>
        <View className='state-block__spinner' />
        {text ? <Text className='state-block__text'>{text}</Text> : null}
      </View>
    )
  }
  if (error) {
    return (
      <View className='state-block state-block--error'>
        <View className='state-block__error-mark'>!</View>
        {text ? <Text className='state-block__text'>{text}</Text> : null}
        {onRetry && retryText ? (
          <View className='state-block__retry' onClick={onRetry}>
            {retryText}
          </View>
        ) : null}
      </View>
    )
  }
  if (!empty) return null
  return (
    <View className='state-block' data-filtered={filtered ? 'true' : 'false'}>
      <View className='state-block__icon'>
        <View className='icon-svg' style={iconStyle(icon ?? (filtered ? 'search' : 'doc'), 40)} />
      </View>
      {text ? <Text className='state-block__text'>{text}</Text> : null}
    </View>
  )
}
