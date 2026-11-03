/**
 * 通用空态 / 错误态 / 加载态块。
 *
 * 页面里散落大量内联的「加载中…／暂无…」文本，样式与语义各不相同。此组件把三种
 * 形态收敛到一处：`loading` 渲染转圈 + 文案，`error` 渲染错误标记 + 重试入口，
 * `empty` 渲染可选图标 + 文案，三者都走设计令牌。`text` 由调用方传入（通常已走 i18n），
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
  /** 空态图标（缺省不显示图标） */
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
      {icon ? <View className='state-block__icon icon-svg' style={iconStyle(icon, 80)} /> : null}
      {text ? <Text className='state-block__text'>{text}</Text> : null}
    </View>
  )
}
