import { View, Text } from '@tarojs/components'
import type { ReactNode } from 'react'
import './index.scss'

export interface MiniFilterTab {
  key: string
  label: string
  active?: boolean
}

/** 统一筛选 tab 行：纯文字 + 箭头，展开/选中用主色下划线 */
export function FilterTabRow({
  tabs,
  openKey,
  onToggle,
}: {
  tabs: MiniFilterTab[]
  openKey: string
  onToggle: (key: string) => void
}) {
  return (
    <View className='fb-tabs'>
      {tabs.map((tab) => (
        <View
          key={tab.key}
          className={`fb-tab${openKey === tab.key ? ' fb-tab--open' : ''}${tab.active ? ' fb-tab--active' : ''}`}
          onClick={() => onToggle(tab.key)}
        >
          <Text className='fb-tab__text'>{tab.label}</Text>
          <Text className='fb-tab__arrow'>{openKey === tab.key ? '▴' : '▾'}</Text>
        </View>
      ))}
    </View>
  )
}

/** 选项卡片：两列矩形、浅灰底；选中 = 浅色底 + 主色描边 + 主色字 */
export function FilterOptionGrid({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[]
  value: string | string[]
  onChange: (key: string) => void
}) {
  return (
    <View className='fb-opts'>
      {options.map((o) => {
        const on = Array.isArray(value) ? value.includes(o.key) : value === o.key
        return (
          <View
            key={o.key || 'any'}
            className={`fb-opt${on ? ' fb-opt--active' : ''}`}
            onClick={() => onChange(o.key)}
          >
            <Text className='fb-opt__text'>{o.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

/** 左侧一级类目竖栏（贝壳式）：选中白底 + 左侧主色条 */
export function FilterRail({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string }[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <View className='fb-rail'>
      {items.map((it) => (
        <View
          key={it.key}
          className={`fb-rail__item${value === it.key ? ' fb-rail__item--active' : ''}`}
          onClick={() => onChange(it.key)}
        >
          <Text className='fb-rail__text'>{it.label}</Text>
        </View>
      ))}
    </View>
  )
}

/** 竖排列表单选（房产类型沿用列表形态，方便一眼扫完） */
export function FilterList({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <View className='fb-rows'>
      {options.map((o) => {
        const on = value === o.key
        return (
          <View
            key={o.key || 'any'}
            className={`fb-row${on ? ' fb-row--active' : ''}`}
            onClick={() => onChange(o.key)}
          >
            <Text className='fb-row__text'>{o.label}</Text>
            {on ? <Text className='fb-row__check'>✓</Text> : null}
          </View>
        )
      })}
    </View>
  )
}

/** 面板底部操作条：左重置 / 右确定 */
export function FilterPanelActions({
  onReset,
  onConfirm,
  resetLabel,
  confirmLabel,
}: {
  onReset: () => void
  onConfirm: () => void
  resetLabel: string
  confirmLabel: string
}) {
  return (
    <View className='fb-actions'>
      <View className='fb-act fb-act--ghost' onClick={onReset}>
        <Text>{resetLabel}</Text>
      </View>
      <View className='fb-act fb-act--primary' onClick={onConfirm}>
        <Text>{confirmLabel}</Text>
      </View>
    </View>
  )
}

/** 筛选坞：tab 行 + 就地展开面板（同宽、无间隙、无圆角） */
export default function FilterBar({
  tabs,
  openKey,
  onToggle,
  children,
}: {
  tabs: MiniFilterTab[]
  openKey: string
  onToggle: (key: string) => void
  children: ReactNode
}) {
  return (
    <View className={`fb${openKey ? ' fb--open' : ''}`}>
      <FilterTabRow tabs={tabs} openKey={openKey} onToggle={onToggle} />
      {openKey ? <View className='fb-panel'>{children}</View> : null}
    </View>
  )
}
