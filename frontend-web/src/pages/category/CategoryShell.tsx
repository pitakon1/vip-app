/**
 * 贝壳式分类页共用外壳（Web）。
 *
 * 5 个 C 端分类页（租房 / 新房 / 二手房 / 商铺办公 / 厂房）共用同一套 6 段骨架，
 * 差异只在中段模块与卡片字段。本文件提供骨架的通用原语：
 *  1) CategoryTopBar   顶部栏（磨砂玻璃 rgba(255,255,255,0.88) + blur(14px)）
 *  2) EntryGrid        入口宫格（2×5，圆角方块图标 + 文字）
 *  3) CapsuleRow       数据胶囊（新房页）
 *  4) PlainTabs        纯文字 Tab
 *  5) MarketCompareCard / ServiceBar / BannerCard（行情对比 / 服务条 / 严选横幅）
 *  6) CategoryPage     列表页外壳：Tab + 顶部下拉筛选 + 卡片列表（桌面多列网格）
 *
 * 颜色一律取设计令牌（var(--rent-*)），禁止硬编码色值、禁止渐变。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CustomerServiceOutlined } from '@ant-design/icons'
import { Dropdown, Pagination, Spin } from 'antd'
import LocationPicker from '@/components/LocationPicker'
import { useLocationStore } from '@/stores/location'
import type { FilterGroup, FilterValues, QuickTag } from './categoryShared'
import './category.css'

export const PAGE_SIZE = 12

// ==================== 顶部栏 ====================

interface CategoryTopBarProps {
  title: string
  searchPlaceholder: string
  keyword: string
  onKeywordChange: (v: string) => void
  onSearchSubmit?: () => void
  right?: ReactNode
}

/** 顶部栏：返回 + 标题 + 城市（可切换，全局定位）+ 搜索框 + 右侧动作。 */
export function CategoryTopBar({
  title,
  searchPlaceholder,
  keyword,
  onKeywordChange,
  onSearchSubmit,
  right,
}: CategoryTopBarProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [locOpen, setLocOpen] = useState(false)
  const cityLabel = useLocationStore((s) => s.selection.cityLabel)

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <header className="cat-topbar">
      <div className="cat-topbar__inner">
        <button type="button" className="cat-topbar__back" onClick={goBack} aria-label={t('category.back')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="cat-topbar__title">{title}</h1>
        <button type="button" className="rent-portal__loc" onClick={() => setLocOpen(true)} aria-label={t('locate.selectCity')}>
          <svg className="rent-portal__loc-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{cityLabel || t('locate.selectCity')}</span>
          <span className="rent-portal__loc-arrow">▾</span>
        </button>
        <div className="cat-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit?.()}
          />
        </div>
        <div className="cat-topbar__right">{right}</div>
      </div>
      <LocationPicker visible={locOpen} onClose={() => setLocOpen(false)} />
    </header>
  )
}

// ==================== 入口宫格（2×5）====================

export interface GridItem {
  key: string
  label: string
  icon: ReactNode
  onPress: () => void
}

export function EntryGrid({ items }: { items: GridItem[] }) {
  return (
    <div className="cat-grid">
      {items.map((it) => (
        <button key={it.key} type="button" className="cat-grid__item" onClick={it.onPress}>
          <span className="cat-grid__icon">{it.icon}</span>
          <span className="cat-grid__label">{it.label}</span>
        </button>
      ))}
    </div>
  )
}

// ==================== 数据胶囊（新房页）====================

export interface CapsuleItem {
  key: string
  value: string | number
  label: string
}

export function CapsuleRow({ items }: { items: CapsuleItem[] }) {
  return (
    <div className="cat-capsules">
      {items.map((it) => (
        <div key={it.key} className="cat-capsule">
          <span className="cat-capsule__value">{it.value}</span>
          <span className="cat-capsule__label">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

// ==================== 纯文字 Tab ====================

export function PlainTabs({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string }[]
  value?: string
  onChange?: (key: string) => void
}) {
  return (
    <div className="cat-tabs">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className="cat-tab"
          data-active={value === it.key}
          onClick={() => onChange?.(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

// ==================== 行情对比卡 / 服务条 / 横幅 ====================

export function MarketCompareCard({
  left,
  right,
  actionLabel,
  onPress,
}: {
  left: { name: string; price: string }
  right: { name: string; price: string }
  actionLabel: string
  onPress?: () => void
}) {
  return (
    <button type="button" className="cat-compare" onClick={onPress}>
      <span className="cat-compare__side">
        <span className="cat-compare__dist">{left.name}</span>
        <span className="cat-compare__price">{left.price}</span>
      </span>
      <span className="cat-compare__vs">VS</span>
      <span className="cat-compare__side">
        <span className="cat-compare__dist">{right.name}</span>
        <span className="cat-compare__price">{right.price}</span>
      </span>
      <span className="cat-compare__link">{actionLabel}</span>
    </button>
  )
}

export function ServiceBar({
  text,
  actionLabel,
  onAction,
}: {
  text: string
  actionLabel: string
  onAction?: () => void
}) {
  return (
    <div className="cat-service">
      <CustomerServiceOutlined className="cat-service__icon" />
      <span className="cat-service__text">{text}</span>
      <button type="button" className="cat-service__btn" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}

export function BannerCard({
  title,
  sub,
  actionLabel,
  onPress,
}: {
  title: string
  sub: string
  actionLabel: string
  onPress?: () => void
}) {
  return (
    <div className="cat-banner">
      <div className="cat-banner__text">
        <div className="cat-banner__title">{title}</div>
        <div className="cat-banner__sub">{sub}</div>
      </div>
      <button type="button" className="cat-banner__btn" onClick={onPress}>
        {actionLabel}
      </button>
    </div>
  )
}

// ==================== 筛选：筛选条下沿整宽下拉面板 ====================

function optionLabel(g: FilterGroup, value: string): string {
  if (g.children && g.children.length) {
    for (const child of g.children) {
      const hit = child.options?.find((o) => o.value === value)
      if (hit) return hit.label
    }
    return g.label
  }
  return g.options?.find((o) => o.value === value)?.label ?? g.label
}

/** 触发块文案：已选则显示所选值文案；「更多」中含已选子项时显示该子项。 */
function triggerLabel(g: FilterGroup, values: FilterValues): string {
  if (g.key === 'sort') {
    const v = values.sort
    return v ? optionLabel(g, v) : g.label
  }
  if (g.children && g.children.length) {
    for (const child of g.children) {
      if (values[child.key]) return optionLabel(child, values[child.key])
    }
    return g.label
  }
  return values[g.key] ? optionLabel(g, values[g.key]) : g.label
}

const isGroupActive = (g: FilterGroup, values: FilterValues): boolean => {
  if (g.children && g.children.length) return g.children.some((c) => !!values[c.key])
  return !!values[g.key]
}

/** 叶子组：有 children 的「更多」面板展开为多个子组，否则自身即叶子。 */
function groupLeaves(g: FilterGroup): FilterGroup[] {
  return g.children && g.children.length ? g.children : [g]
}

function GroupBlocks({
  group,
  values,
  onSelect,
}: {
  group: FilterGroup
  values: FilterValues
  onSelect: (key: string, value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="cat-panel__group">
      <div className="cat-panel__label">{group.label}</div>
      <div className="cat-blocks">
        <button
          type="button"
          className="cat-block"
          data-active={!values[group.key]}
          onClick={() => onSelect(group.key, '')}
        >
          {t('category.filterAny')}
        </button>
        {(group.options ?? []).map((o) => (
          <button
            key={o.value}
            type="button"
            className="cat-block"
            data-active={values[group.key] === o.value}
            onClick={() => onSelect(group.key, o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 贝壳式筛选面板：改动只落到 draft，点「确定」才批量提交。
 * 右栏连续纵向排列所有分组（可滚动）；左栏分组导航点击跳转，右栏滚动回写选中态。
 */
function PanelContent({
  group,
  draft,
  navKey,
  onNavChange,
  onSelect,
  onResetDraft,
  onApplyDraft,
}: {
  group: FilterGroup
  draft: FilterValues
  navKey: string
  onNavChange: (key: string) => void
  onSelect: (key: string, value: string) => void
  onResetDraft: () => void
  onApplyDraft: () => void
}) {
  const { t } = useTranslation()
  const leaves = groupLeaves(group)
  const hasNav = !!group.children && group.children.length > 0
  const contentRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // 左栏点击：右栏滚到对应分组顶部。
  const scrollToSection = (key: string) => {
    const box = contentRef.current
    const el = sectionRefs.current[key]
    if (!box || !el) return
    box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top })
    onNavChange(key)
  }

  // 右栏滚动：取最接近顶部的分组作为左栏选中项。
  const handleScroll = () => {
    const box = contentRef.current
    if (!box) return
    const boxTop = box.getBoundingClientRect().top
    let current = leaves[0]?.key ?? ''
    leaves.forEach((leaf) => {
      const el = sectionRefs.current[leaf.key]
      if (el && el.getBoundingClientRect().top - boxTop <= 12) current = leaf.key
    })
    if (current && current !== navKey) onNavChange(current)
  }

  return (
    <div className="cat-panel">
      <div className="cat-panel__body">
        {hasNav ? (
          <div className="cat-panel__nav">
            {leaves.map((leaf) => (
              <button
                key={leaf.key}
                type="button"
                className={`cat-panel__nav-item${leaf.key === navKey ? ' cat-panel__nav-item--active' : ''}`}
                onClick={() => scrollToSection(leaf.key)}
              >
                {leaf.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="cat-panel__content" ref={contentRef} onScroll={handleScroll}>
          {leaves.map((leaf) => (
            <section
              key={leaf.key}
              className="cat-panel__section"
              ref={(el) => {
                sectionRefs.current[leaf.key] = el
              }}
            >
              <GroupBlocks group={leaf} values={draft} onSelect={onSelect} />
            </section>
          ))}
        </div>
      </div>
      <div className="cat-panel__footer">
        <button type="button" className="cat-panel__btn cat-panel__btn--ghost" onClick={onResetDraft}>
          {t('category.reset')}
        </button>
        <button type="button" className="cat-panel__btn cat-panel__btn--primary" onClick={onApplyDraft}>
          {t('category.confirm')}
        </button>
      </div>
    </div>
  )
}

export function FilterBar({
  groups,
  values,
  onChange,
  onApply,
  quickTags,
  onReset,
}: {
  groups: FilterGroup[]
  values: FilterValues
  onChange: (key: string, value: string) => void
  /** 批量提交：一次「确定」只合并成一个 patch，只触发一次列表请求。 */
  onApply?: (patch: FilterValues) => void
  quickTags?: QuickTag[]
  onReset?: () => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<FilterValues>({})
  const [navKey, setNavKey] = useState('')

  // 打开面板：把当前已应用值快照成 draft（只含本面板叶子 key），不触发任何请求。
  const openPanel = (g: FilterGroup) => {
    const next: FilterValues = {}
    groupLeaves(g).forEach((leaf) => {
      next[leaf.key] = values[leaf.key] ?? ''
    })
    setDraft(next)
    setNavKey(groupLeaves(g)[0]?.key ?? '')
    setOpenKey(g.key)
  }

  const selectDraft = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  // 「重置」只清当前面板的 draft，不提交、不关闭面板。
  const resetDraft = (g: FilterGroup) => {
    setDraft((prev) => {
      const next = { ...prev }
      groupLeaves(g).forEach((leaf) => {
        next[leaf.key] = ''
      })
      return next
    })
  }

  // 「确定」把本面板叶子 key 合并成 patch 一次提交，然后关闭面板。
  const applyDraft = (g: FilterGroup) => {
    const leaves = groupLeaves(g)
    const patch: FilterValues = {}
    leaves.forEach((leaf) => {
      patch[leaf.key] = draft[leaf.key] ?? ''
    })
    if (onApply) {
      onApply(patch)
    } else {
      leaves.forEach((leaf) => {
        if ((values[leaf.key] ?? '') !== (patch[leaf.key] ?? '')) onChange(leaf.key, patch[leaf.key] ?? '')
      })
    }
    setOpenKey(null)
  }

  const activeGroup = openKey ? groups.find((g) => g.key === openKey) : undefined

  return (
    <div className="cat-filterbar">
      <div className="cat-filterbar__row">
        {groups.map((g) => {
          const active = isGroupActive(g, values)
          const chevron = (
            <span className="rent-filter-chip__chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          )
          if (g.key === 'sort') {
            return (
              <Dropdown
                key={g.key}
                trigger={['click']}
                placement="bottomLeft"
                menu={{
                  items: (g.options ?? []).map((o) => ({ key: o.value, label: o.label })),
                  selectable: true,
                  selectedKeys: values.sort ? [values.sort] : [],
                  onClick: ({ key }) => onChange('sort', key),
                }}
              >
                <button
                  type="button"
                  className="cat-filterbar__trigger"
                  data-active={active}
                  onClick={() => setOpenKey(null)}
                >
                  {triggerLabel(g, values)}
                  {chevron}
                </button>
              </Dropdown>
            )
          }
          return (
            <button
              key={g.key}
              type="button"
              className="cat-filterbar__trigger"
              data-active={active}
              onClick={() => (openKey === g.key ? setOpenKey(null) : openPanel(g))}
            >
              {triggerLabel(g, values)}
              {chevron}
            </button>
          )
        })}
        {activeGroup ? (
          <>
            {/* 只捕获点击关闭，不做遮罩变暗 */}
            <div className="cat-filterbar__mask" onClick={() => setOpenKey(null)} />
            <div className="cat-filterbar__dropdown">
              <PanelContent
                group={activeGroup}
                draft={draft}
                navKey={navKey}
                onNavChange={setNavKey}
                onSelect={selectDraft}
                onResetDraft={() => resetDraft(activeGroup)}
                onApplyDraft={() => applyDraft(activeGroup)}
              />
            </div>
          </>
        ) : null}
      </div>
      {quickTags && quickTags.length > 0 ? (
        <div className="cat-quick">
          {quickTags.map((tag) => {
            const anyFilter = groups.some((g) => g.key !== 'sort' && isGroupActive(g, values))
            const active = tag.reset
              ? !anyFilter
              : !!tag.group && !!tag.value && values[tag.group] === tag.value
            return (
              <button
                key={tag.key}
                type="button"
                className="rent-filter-chip"
                data-active={active}
                onClick={() => {
                  if (tag.reset) {
                    onReset?.()
                    return
                  }
                  if (!tag.group) return
                  onChange(tag.group, values[tag.group] === tag.value ? '' : tag.value ?? '')
                }}
              >
                {tag.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// ==================== 列表页外壳 ====================

export interface CategoryQueryState {
  values: FilterValues
  keyword: string
  tab?: string
}

interface CategoryPageProps<T> {
  title: string
  searchPlaceholder: string
  /** 宫格 / 胶囊 / 榜单 / 行情卡 / 服务条 / 横幅等中段模块 */
  top?: ReactNode
  tabs?: { key: string; label: string }[]
  tabValue?: string
  onTabChange?: (key: string) => void
  /** Tab 本身就是某个筛选组（如新房的「榜单」= 排序）时指明该组 key，双向共用同一状态。 */
  tabGroup?: string
  filterGroups: FilterGroup[]
  quickTags?: QuickTag[]
  defaultValues?: FilterValues
  /** 页面把筛选状态映射成接口参数（纯函数，务必 useCallback([]) 稳定引用） */
  buildQuery: (state: CategoryQueryState) => Record<string, unknown>
  /** 稳定的分页请求函数 */
  fetchPage: (page: number, query: Record<string, unknown>) => Promise<{ items: T[]; total: number }>
  renderCard: (item: T) => ReactNode
  keyOf: (item: T) => string
  emptyTitle: string
  emptySub?: string
  layout?: 'grid' | 'wide' | 'project'
  right?: ReactNode
}

export function CategoryPage<T>({
  title,
  searchPlaceholder,
  top,
  tabs,
  tabValue,
  onTabChange,
  tabGroup,
  filterGroups,
  quickTags,
  defaultValues,
  buildQuery,
  fetchPage,
  renderCard,
  keyOf,
  emptyTitle,
  emptySub,
  layout = 'grid',
  right,
}: CategoryPageProps<T>) {
  const { t } = useTranslation()
  const [values, setValues] = useState<FilterValues>({ sort: 'latest', ...defaultValues })
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const reqSeq = useRef(0)

  // 关键词防抖：避免每敲一个字就打一次后端；同时把翻页重置到第 1 页。
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(keyword.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [keyword])

  const tabKey = tabGroup ? values[tabGroup] : tabValue

  const query = useMemo(
    () => buildQuery({ values, keyword: debounced, tab: tabKey }),
    [buildQuery, values, debounced, tabKey],
  )

  useEffect(() => {
    const seq = ++reqSeq.current
    setLoading(true)
    fetchPage(page, query)
      .then((res) => {
        if (seq !== reqSeq.current) return
        setItems(res.items)
        setTotal(res.total)
      })
      .catch(() => {
        if (seq !== reqSeq.current) return
        setItems([])
        setTotal(0)
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false)
      })
  }, [page, query, fetchPage])

  const updateValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }
  // 面板「确定」：一次合并成一个 patch → 一次 values 变化 → 一次列表请求。
  const applyValues = (patch: FilterValues) => {
    setValues((prev) => ({ ...prev, ...patch }))
    setPage(1)
  }
  const resetValues = () => {
    setValues((prev) => ({ sort: prev.sort ?? 'latest' }))
    setPage(1)
  }
  const changeTab = (key: string) => {
    if (tabGroup) updateValue(tabGroup, key)
    else {
      onTabChange?.(key)
      setPage(1)
    }
  }

  const listClass = `cat-list cat-list--${layout}`

  return (
    <div className="cat-page">
      <CategoryTopBar
        title={title}
        searchPlaceholder={searchPlaceholder}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onSearchSubmit={() => setPage(1)}
        right={right}
      />

      <main className="cat-main">
        {top}
        {tabs && tabs.length > 0 ? (
          <PlainTabs items={tabs} value={tabKey} onChange={changeTab} />
        ) : null}
        <FilterBar
          groups={filterGroups}
          values={values}
          onChange={updateValue}
          onApply={applyValues}
          quickTags={quickTags}
          onReset={resetValues}
        />

        <div className="cat-count">{t('category.resultCount', { n: total })}</div>

        {loading ? (
          <div className="cat-loading">
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <div className="cat-empty">
            <div className="cat-empty__title">{emptyTitle}</div>
            {emptySub ? <div className="cat-empty__sub">{emptySub}</div> : null}
          </div>
        ) : (
          <div className={listClass}>
            {items.map((item) => (
              <div key={keyOf(item)}>{renderCard(item)}</div>
            ))}
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className="cat-pager">
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={(p) => setPage(p)}
            />
          </div>
        ) : null}
      </main>
    </div>
  )
}
