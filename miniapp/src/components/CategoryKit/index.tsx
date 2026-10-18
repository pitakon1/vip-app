/**
 * 贝壳式分类页共用外壳（小程序）。
 *
 * 与 App 端 `mobile-app/src/screens/category/CategoryShell.tsx` 同一套 6 段骨架，
 * 用 Taro 组件 + SCSS 重建（不照抄 RN 代码，只对齐信息结构）：
 *  1) CategoryTopBar     顶部栏（磨砂玻璃 rgba(255,255,255,0.88) + blur，胶囊项 999px）
 *  2) EntryGrid          入口宫格（固定 4 列 25%，对齐小程序「服务宫格」既有规范）
 *  3) CapsuleRow         数据胶囊（新房页）
 *  4) PlainTabs          纯文字 Tab（选中深墨加粗 / 未选中浅灰，无底色无描边）
 *  5) MarketCompareCard  行情对比卡 / ServiceBar 服务条 / BannerCard 严选横幅
 *  6) FilterBar          筛选行 + 顶部下拉面板（方块选项，非胶囊）+ 快捷标签
 *     CategoryListScreen 列表页外壳：顶栏 + 滚动区（中段模块 / Tab / 筛选 / 卡片）+ 底部导航
 *
 * 颜色一律取 app.scss 的 CSS 变量（--primary / --ink* / --surface-2 / --radius-* / --shadow-*），
 * 禁止硬编码色值、禁止渐变。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { iconStyle, type IconKey } from '@/utils/icons'
import { useI18n } from '@/i18n'
import BottomNav from '@/components/BottomNav'
import StateBlock from '@/components/StateBlock'
import './index.scss'

// ==================== 类型 ====================

export interface GridItem {
  key: string
  label: string
  icon: IconKey
  onPress?: () => void
}

export interface CapsuleItem {
  key: string
  value: string | number
  label: string
}

export interface FilterOption {
  value: string
  label: string
}

/** 一个筛选组 = 筛选行上的一枚触发块；`children` 存在时，面板一次性铺开多组（「更多」）。 */
export interface FilterGroup {
  key: string
  label: string
  options?: FilterOption[]
  children?: FilterGroup[]
}

export interface QuickTag {
  key: string
  label: string
  /** 绑定的筛选组 key；点击即在「该值 ↔ 不限」间切换。 */
  group?: string
  value?: string
  /** 置 true 时点击清空全部筛选（仅保留排序），对应「全部」标签。 */
  reset?: boolean
}

/** 分类页筛选状态：组 key → 选中值（'' 表示「不限」）。 */
export type FilterValues = Record<string, string>

export interface CategoryQueryState {
  values: FilterValues
  keyword: string
  tab?: string
  sort: string
}

// ==================== 顶部栏 ====================

export function CategoryTopBar({
  title,
  city,
  onCityPress,
  searchPlaceholder,
  keyword,
  onKeywordChange
}: {
  title: string
  city?: string
  onCityPress?: () => void
  searchPlaceholder: string
  keyword: string
  onKeywordChange: (v: string) => void
}) {
  const { t } = useI18n()
  const statusBarH = useMemo(() => {
    try {
      return Taro.getSystemInfoSync().statusBarHeight || 20
    } catch {
      return 20
    }
  }, [])

  const goBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack({ delta: 1 })
    else Taro.redirectTo({ url: '/pages/tenant/home/index' })
  }

  return (
    <View className='ck-top' style={{ paddingTop: `${statusBarH}px` }}>
      <View className='ck-top__row'>
        <View className='ck-top__back' hoverClass='ck-hover' onClick={goBack}>
          <View className='icon-svg' style={iconStyle('back', 40)} />
        </View>
        <Text className='ck-top__title'>{title}</Text>
      </View>
      <View className='ck-top__row2'>
        <View className='ck-city' hoverClass='ck-hover' onClick={onCityPress}>
          <View className='icon-svg' style={iconStyle('location', 26)} />
          <Text className='ck-city__text'>{city || t('home.selectCity')}</Text>
          <Text className='ck-city__arrow'>▾</Text>
        </View>
        <View className='ck-search'>
          <View className='icon-svg' style={iconStyle('search', 28)} />
          <Input
            className='ck-search__input'
            value={keyword}
            placeholder={searchPlaceholder}
            onInput={((e: any) => onKeywordChange(e.detail.value)) as any}
          />
        </View>
      </View>
    </View>
  )
}

// ==================== 入口宫格（固定 4 列 25%）====================

export function EntryGrid({ items }: { items: GridItem[] }) {
  return (
    <View className='ck-grid'>
      {items.map((it) => (
        <View key={it.key} className='ck-grid__item' hoverClass='ck-hover' onClick={it.onPress}>
          <View className='ck-grid__icon'>
            <View className='icon-svg' style={iconStyle(it.icon, 44)} />
          </View>
          <Text className='ck-grid__label'>{it.label}</Text>
        </View>
      ))}
    </View>
  )
}

// ==================== 数据胶囊（新房页）====================

export function CapsuleRow({ items }: { items: CapsuleItem[] }) {
  return (
    <View className='ck-capsule'>
      {items.map((it) => (
        <View key={it.key} className='ck-capsule__item'>
          <Text className='ck-capsule__value'>{it.value}</Text>
          <Text className='ck-capsule__label'>{it.label}</Text>
        </View>
      ))}
    </View>
  )
}

// ==================== 纯文字 Tab ====================

export function PlainTabs({
  items,
  value,
  onChange
}: {
  items: { key: string; label: string }[]
  value?: string
  onChange?: (key: string) => void
}) {
  return (
    <ScrollView scrollX className='ck-tabs' showScrollbar={false}>
      {items.map((it) => {
        const active = value === it.key
        return (
          <View
            key={it.key}
            className={`ck-tab${active ? ' ck-tab--on' : ''}`}
            hoverClass='ck-hover'
            onClick={() => onChange?.(it.key)}
          >
            <Text className='ck-tab__text'>{it.label}</Text>
          </View>
        )
      })}
    </ScrollView>
  )
}

// ==================== 行情对比卡 / 服务条 / 横幅 ====================

export function MarketCompareCard({
  left,
  right,
  actionLabel,
  onPress
}: {
  left: { name: string; price: string }
  right: { name: string; price: string }
  actionLabel: string
  onPress?: () => void
}) {
  return (
    <View className='ck-compare' hoverClass='ck-hover' onClick={onPress}>
      <View className='ck-compare__side'>
        <Text className='ck-compare__dist'>{left.name}</Text>
        <Text className='ck-compare__price'>{left.price}</Text>
      </View>
      <Text className='ck-compare__vs'>VS</Text>
      <View className='ck-compare__side'>
        <Text className='ck-compare__dist'>{right.name}</Text>
        <Text className='ck-compare__price'>{right.price}</Text>
      </View>
      <Text className='ck-compare__link'>{actionLabel}</Text>
    </View>
  )
}

export function ServiceBar({
  text,
  actionLabel,
  onAction
}: {
  text: string
  actionLabel: string
  onAction?: () => void
}) {
  return (
    <View className='ck-service'>
      <View className='icon-svg' style={iconStyle('sparkles', 30)} />
      <Text className='ck-service__text'>{text}</Text>
      <View className='ck-service__btn' hoverClass='ck-hover' onClick={onAction}>
        <Text className='ck-service__btn-text'>{actionLabel}</Text>
      </View>
    </View>
  )
}

export function BannerCard({
  title,
  sub,
  actionLabel,
  onPress
}: {
  title: string
  sub: string
  actionLabel: string
  onPress?: () => void
}) {
  return (
    <View className='ck-banner'>
      <View className='ck-banner__body'>
        <Text className='ck-banner__title'>{title}</Text>
        <Text className='ck-banner__sub'>{sub}</Text>
      </View>
      <View className='ck-banner__btn' hoverClass='ck-hover' onClick={onPress}>
        <Text className='ck-banner__btn-text'>{actionLabel}</Text>
      </View>
    </View>
  )
}

// ==================== 筛选：方块选项 + 顶部下拉面板 ====================

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

export function FilterBar({
  groups,
  values,
  onChange,
  quickTags,
  onReset
}: {
  groups: FilterGroup[]
  values: FilterValues
  onChange: (key: string, value: string) => void
  quickTags?: QuickTag[]
  onReset?: () => void
}) {
  const { t } = useI18n()
  const [openKey, setOpenKey] = useState<string | null>(null)

  const openGroup = groups.find((g) => g.key === openKey)
  const leaves = useMemo(
    () => (openGroup?.children?.length ? openGroup.children : openGroup ? [openGroup] : []),
    [openGroup]
  )

  const toggleTab = useCallback((key: string) => {
    setOpenKey((prev) => (prev === key ? null : key))
  }, [])

  return (
    <View className='ck-filter'>
      <View className='ck-filter__bar'>
        {groups.map((g) => {
          const active = !!values[g.key]
          const label = active ? optionLabel(g, values[g.key]) : g.label
          return (
            <View
              key={g.key}
              className={`ck-filter__tab${openKey === g.key ? ' ck-filter__tab--open' : ''}${
                active ? ' ck-filter__tab--on' : ''
              }`}
              hoverClass='ck-hover'
              onClick={() => toggleTab(g.key)}
            >
              <Text className='ck-filter__label'>{label}</Text>
              <Text className='ck-filter__arrow'>{openKey === g.key ? '▲' : '▼'}</Text>
            </View>
          )
        })}
      </View>

      {openGroup ? (
        <View className='ck-drop'>
          {leaves.map((g) => (
            <View key={g.key} className='ck-drop__group'>
              <Text className='ck-drop__title'>{g.label}</Text>
              <View className='ck-drop__blocks'>
                <View
                  className={`ck-block${!values[g.key] ? ' ck-block--on' : ''}`}
                  hoverClass='ck-hover'
                  onClick={() => onChange(g.key, '')}
                >
                  <Text className='ck-block__text'>{t('category.filterAny')}</Text>
                </View>
                {(g.options ?? []).map((op) => (
                  <View
                    key={op.value}
                    className={`ck-block${values[g.key] === op.value ? ' ck-block--on' : ''}`}
                    hoverClass='ck-hover'
                    onClick={() => onChange(g.key, op.value)}
                  >
                    <Text className='ck-block__text'>{op.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
          <View className='ck-drop__done' hoverClass='ck-hover' onClick={() => setOpenKey(null)}>
            <Text className='ck-drop__done-text'>{t('category.apply')}</Text>
          </View>
        </View>
      ) : null}

      {quickTags && quickTags.length > 0 ? (
        <ScrollView scrollX className='ck-quick' showScrollbar={false}>
          {quickTags.map((tag) => {
            const anyFilter = groups.some((g) => g.key !== 'sort' && !!values[g.key])
            const active = tag.reset
              ? !anyFilter
              : !!tag.group && !!tag.value && values[tag.group] === tag.value
            return (
              <View
                key={tag.key}
                className={`ck-quick__tag${active ? ' ck-quick__tag--on' : ''}`}
                hoverClass='ck-hover'
                onClick={() => {
                  if (tag.reset) {
                    onReset?.()
                    return
                  }
                  if (!tag.group) return
                  onChange(tag.group, values[tag.group] === tag.value ? '' : tag.value ?? '')
                }}
              >
                <Text className='ck-quick__text'>{tag.label}</Text>
              </View>
            )
          })}
        </ScrollView>
      ) : null}
    </View>
  )
}

// ==================== 列表页外壳 ====================

interface CategoryListScreenProps<T> {
  title: string
  city?: string
  onCityPress?: () => void
  searchPlaceholder: string
  /** 宫格 / 胶囊 / 榜单 / 行情卡 / 服务条 / 横幅等中段模块 */
  top?: React.ReactNode
  tabs?: { key: string; label: string }[]
  tabValue?: string
  onTabChange?: (key: string) => void
  /** 当 Tab 本身就是某个筛选组（如新房的「榜单」= 排序）时，指明该组 key */
  tabGroup?: string
  filterGroups: FilterGroup[]
  quickTags?: QuickTag[]
  defaultFilterValues?: FilterValues
  /** 页面把筛选状态映射成接口参数（纯函数，务必 useCallback([]) 稳定引用） */
  buildQuery: (state: CategoryQueryState) => any
  /** 稳定的分页请求函数，接收 buildQuery 的结果 */
  fetchPage: (page: number, query: any) => Promise<{ items: T[]; total: number }>
  renderCard: (item: T) => React.ReactNode
  keyExtractor: (item: T) => string
  emptyTitle: string
  emptySub?: string
  emptyIcon?: IconKey
}

const PAGE_SIZE = 20
const DEFAULT_VALUES: FilterValues = { sort: 'latest' }

export function CategoryListScreen<T>({
  title,
  city,
  onCityPress,
  searchPlaceholder,
  top,
  tabs,
  tabValue,
  onTabChange,
  tabGroup,
  filterGroups,
  quickTags,
  defaultFilterValues,
  buildQuery,
  fetchPage,
  renderCard,
  keyExtractor,
  emptyTitle,
  emptySub,
  emptyIcon = 'home'
}: CategoryListScreenProps<T>) {
  const { t } = useI18n()

  const [values, setValues] = useState<FilterValues>({ ...DEFAULT_VALUES, ...defaultFilterValues })
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const reqSeq = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 350)
    return () => clearTimeout(timer)
  }, [keyword])

  const query = useMemo(
    () => buildQuery({ values, keyword: debounced, tab: tabValue, sort: values.sort ?? 'latest' }),
    [buildQuery, values, debounced, tabValue]
  )

  const load = useCallback(
    async (targetPage: number) => {
      const seq = ++reqSeq.current
      if (targetPage === 1) setLoading(true)
      else setLoadingMore(true)
      try {
        const res = await fetchPage(targetPage, query)
        if (seq !== reqSeq.current) return
        setTotal(res.total)
        setPage(targetPage)
        setItems((prev) => (targetPage === 1 ? res.items : [...prev, ...res.items]))
      } catch {
        if (seq !== reqSeq.current) return
        if (targetPage === 1) {
          setItems([])
          setTotal(0)
        }
      } finally {
        if (seq === reqSeq.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [fetchPage, query]
  )

  useEffect(() => {
    void load(1)
  }, [load])

  const hasMore = items.length < total

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore) return
    void load(page + 1)
  }

  return (
    <View className='ck-page'>
      <CategoryTopBar
        title={title}
        city={city}
        onCityPress={onCityPress}
        searchPlaceholder={searchPlaceholder}
        keyword={keyword}
        onKeywordChange={setKeyword}
      />

      <ScrollView scrollY className='ck-scroll' onScrollToLower={handleLoadMore}>
        <View className='ck-body'>
          {top}
          {tabs && tabs.length > 0 ? (
            <PlainTabs
              items={tabs}
              value={tabGroup ? values[tabGroup] : tabValue}
              onChange={
                tabGroup ? (k) => setValues((prev) => ({ ...prev, [tabGroup]: k })) : onTabChange
              }
            />
          ) : null}
          <FilterBar
            groups={filterGroups}
            values={values}
            onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
            quickTags={quickTags}
            onReset={() => setValues((prev) => ({ sort: prev.sort ?? 'latest' }))}
          />

          {loading ? (
            <StateBlock loading text={t('category.loading')} />
          ) : items.length === 0 ? (
            <StateBlock empty icon={emptyIcon} text={`${emptyTitle}${emptySub ? ` · ${emptySub}` : ''}`} />
          ) : (
            <>
              <Text className='ck-count'>{t('category.resultCount', { n: total })}</Text>
              {items.map((item) => (
                <View key={keyExtractor(item)}>{renderCard(item)}</View>
              ))}
              {hasMore ? (
                <View className='ck-more' hoverClass='ck-hover' onClick={handleLoadMore}>
                  <Text className='ck-more__text'>
                    {loadingMore ? t('category.loading') : t('category.loadMore')}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      <BottomNav role='tenant' active='browse' />
    </View>
  )
}

export default CategoryListScreen
