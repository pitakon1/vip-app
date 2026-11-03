/**
 * 房源列表筛选栏的通用小部件与纯函数。
 *
 * 纯结构拆分自 pages/Properties/index.tsx，组件 DOM 结构与类名保持不变。
 */
import { Popover } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// 贝壳风单行筛选项：纯文字 + 下拉箭头（无背景无边框、无胶囊底色）
// 选中/展开态 = 主色文字 + 底部主色下划线（唯一选中指示），点击下方展开顶部下拉面板
export function FilterTab({
  label,
  active,
  open,
  onOpenChange,
  children,
}: {
  label: ReactNode
  active: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const shown = active || open
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={onOpenChange}
      overlayClassName="rent-loc-popover"
      content={children}
    >
      <button
        type="button"
        className={`pf-tab${shown ? ' pf-tab--active' : ''}${open ? ' pf-tab--open' : ''}`}
      >
        {label}
        <span className="pf-tab__chevron">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>
    </Popover>
  )
}

// 复刻 C 端浏览页「户型/状态」单选面板（rent-quick-panel：chips + 重置/确定）
export function OptGrid<T extends string>({
  title,
  options,
  value,
  onPick,
  onReset,
  onClose,
}: {
  title: ReactNode
  options: { key: T; label: string }[]
  value: T
  onPick: (key: T) => void
  onReset: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="rent-loc-panel rent-quick-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group-title">{title}</div>
        <div className="rent-loc-panel__chips">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`rent-loc-panel__chip${value === o.key ? ' rent-loc-panel__chip--active' : ''}`}
              onClick={() => onPick(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={onReset}>
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={onClose}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// 前端排序 key → 后端 sort 参数
export const SORT_MAP: Record<string, string> = {
  'rent-asc': 'price_asc',
  'rent-desc': 'price_desc',
  created: 'latest',
}

// 区间解析：预设 'min-max' / 'min+'（如 '5000-10000' / '50000+'），自定义取输入值。
// 返回空对象表示该侧不限（不传对应参数）。
export const parseRange = (raw: string, customMin: string, customMax: string): { min?: number; max?: number } => {
  const out: { min?: number; max?: number } = {}
  if (raw === 'custom') {
    if (customMin) { const v = Number(customMin); if (!Number.isNaN(v)) out.min = v }
    if (customMax) { const v = Number(customMax); if (!Number.isNaN(v)) out.max = v }
    return out
  }
  if (!raw) return out
  if (raw.endsWith('+')) {
    const v = Number(raw.slice(0, -1))
    if (!Number.isNaN(v)) out.min = v
    return out
  }
  const [a, b] = raw.split('-')
  if (a) { const v = Number(a); if (!Number.isNaN(v)) out.min = v }
  if (b) { const v = Number(b); if (!Number.isNaN(v)) out.max = v }
  return out
}
