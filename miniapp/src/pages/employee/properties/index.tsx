import { useMemo, useState } from 'react'
import { View, Text, Input, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { propertiesApi } from '@/services/api'
import { useI18n } from '@/i18n'
import './index.scss'

interface Property {
  id: string
  room_number?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  bedrooms?: number
  bathrooms?: number
  size_sqm?: number
  status?: string
  photos?: string[]
  furnished?: boolean
  video_url?: string
  [key: string]: any
}

// 状态标签（对齐后端 PropertyStatus: vacant/rented/renewing/maintenance）
const STATUS_META: Record<string, { label: string; cls: string }> = {
  vacant: { label: 'prop.statusVacant', cls: 'p-badge--info' },
  rented: { label: 'prop.statusRented', cls: 'p-badge--success' },
  renewing: { label: 'prop.statusRenewing', cls: 'p-badge--warning' },
  maintenance: { label: 'prop.statusMaintenance', cls: 'p-badge--warning' }
}
const getStatus = (s?: string) =>
  STATUS_META[s ?? ''] ?? { label: s || 'prop.unknown', cls: 'p-badge--neutral' }

// 快捷筛选（状态 / 类型）
type QuickKey = '' | 'rented' | 'vacant' | 'maintenance' | 'apartment' | 'house' | 'shop' | 'office'
const QUICK_CHIPS: { key: QuickKey; label: string; kind: 'status' | 'type' }[] = [
  { key: '', label: 'common.all', kind: 'status' },
  { key: 'rented', label: 'prop.statusRented', kind: 'status' },
  { key: 'vacant', label: 'prop.statusVacant', kind: 'status' },
  { key: 'maintenance', label: 'prop.quickMaintenance', kind: 'status' },
  { key: 'apartment', label: 'prop.typeApartment', kind: 'type' },
  { key: 'house', label: 'prop.typeVilla', kind: 'type' },
  { key: 'shop', label: 'prop.typeCommercial', kind: 'type' },
  { key: 'office', label: 'prop.typeOffice', kind: 'type' }
]

// 类型关键词（后端 property_type 取值未完全标准化，按关键词命中）
const TYPE_KWS: Record<string, string[]> = {
  apartment: ['apartment', 'condo'],
  house: ['house', 'villa'],
  shop: ['shop', 'commercial'],
  office: ['office']
}

const TYPE_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'apartment', label: 'prop.typeApartment' },
  { key: 'house', label: 'prop.typeVilla' },
  { key: 'shop', label: 'prop.typeCommercial' },
  { key: 'office', label: 'prop.typeOffice' }
]

const STATUS_OPTIONS = [
  { key: '', label: 'pub.filterAny' },
  { key: 'rented', label: 'prop.statusRented' },
  { key: 'vacant', label: 'prop.statusVacant' },
  { key: 'renewing', label: 'prop.statusRenewing' },
  { key: 'maintenance', label: 'prop.statusMaintenance' }
]

const SORT_OPTIONS = [
  { key: 'default', label: 'prop.sortDefault' },
  { key: 'rent_asc', label: 'prop.sortRentAsc' },
  { key: 'rent_desc', label: 'prop.sortRentDesc' },
  { key: 'area_desc', label: 'prop.sortAreaDesc' }
]

const TYPE_LABELS: Record<string, string> = {
  apartment: 'prop.typeApartment',
  condo: 'prop.typeApartment',
  house: 'prop.typeHouse',
  villa: 'prop.typeVilla',
  shop: 'prop.typeCommercial',
  commercial: 'prop.typeCommercial',
  office: 'prop.typeOffice'
}

function pickList(res: any): Property[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

const formatRent = (v?: number, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', USD: '$', EUR: '€' }
  return `${sym[currency || 'THB'] || '฿'}${Number(v || 0).toLocaleString()}`
}

type FilterTab = null | 'status' | 'type' | 'sort'

export default function EmployeePropertiesPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [listings, setListings] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusKey, setStatusKey] = useState('')
  const [typeKey, setTypeKey] = useState('')
  const [sortKey, setSortKey] = useState('default')
  const [openTab, setOpenTab] = useState<FilterTab>(null)

  const fetchListings = async () => {
    setLoading(true)
    setError(false)
    try {
      const res: any = await propertiesApi.list({ page: 1, page_size: 100 })
      setListings(pickList(res))
    } catch (err) {
      console.error('[Properties] 获取房源失败', err)
      setError(true)
      Taro.showToast({ title: t('prop.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchListings()
  })

  // 快捷 chip：状态与类型互斥（点类型清状态，反之亦然）
  const onQuick = (chip: { key: QuickKey; kind: 'status' | 'type' }) => {
    if (chip.kind === 'status') {
      setStatusKey(chip.key)
      setTypeKey('')
    } else {
      setTypeKey(chip.key)
      setStatusKey('')
    }
  }
  const quickActive: QuickKey = (statusKey || typeKey || '') as QuickKey

  const visibleList = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const kws = TYPE_KWS[typeKey] || []
    const filtered = listings.filter((it) => {
      if (statusKey && it.status !== statusKey) return false
      if (kws.length && !kws.some((k) => String(it.property_type || '').toLowerCase().includes(k)))
        return false
      if (kw) {
        return [it.room_number, it.address]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
          .some((v) => v.includes(kw))
      }
      return true
    })
    switch (sortKey) {
      case 'rent_asc':
        return filtered.sort((a, b) => Number(a.monthly_rent || 0) - Number(b.monthly_rent || 0))
      case 'rent_desc':
        return filtered.sort((a, b) => Number(b.monthly_rent || 0) - Number(a.monthly_rent || 0))
      case 'area_desc':
        return filtered.sort((a, b) => Number(b.size_sqm || 0) - Number(a.size_sqm || 0))
      default:
        return filtered
    }
  }, [listings, keyword, statusKey, typeKey, sortKey])

  // 结果统计：空置套数（真实数据，来自当前筛选结果）
  const vacantCount = useMemo(
    () => visibleList.filter((it) => it.status === 'vacant').length,
    [visibleList]
  )

  const statusLabel = STATUS_OPTIONS.find((o) => o.key === statusKey)?.label || 'prop.statusLabel'
  const typeLabel = TYPE_OPTIONS.find((o) => o.key === typeKey)?.label || 'prop.typeLabel'
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label || 'prop.sortLabel'
  const tabs: { key: Exclude<FilterTab, null>; label: string; active: boolean }[] = [
    { key: 'status', label: t(statusKey ? statusLabel : 'prop.statusLabel'), active: !!statusKey },
    { key: 'type', label: t(typeKey ? typeLabel : 'prop.typeLabel'), active: !!typeKey },
    { key: 'sort', label: t(sortKey !== 'default' ? sortLabel : 'prop.sortLabel'), active: sortKey !== 'default' }
  ]

  // 标签：由真实字段派生
  const tagsOf = (p: Property): string[] => {
    const tags: string[] = []
    if (p.furnished) tags.push(t('prop.furnishedTag'))
    if (p.video_url) tags.push(t('prop.videoTag'))
    if (Array.isArray(p.photos) && p.photos.length > 0) tags.push(t('prop.photoTag', { n: p.photos.length }))
    return tags.slice(0, 3)
  }

  // 点击卡片 → 操作面板（删除房源等同下架，前台天然隐藏）
  const onCardTap = (it: Property) => {
    Taro.showActionSheet({
      itemList: [t('prop.editListing')],
      success: (r) => {
        if (r.tapIndex === 0) {
          Taro.navigateTo({ url: `/pages/employee/property-edit/index?id=${it.id}` })
        }
      }
    })
  }

  return (
    <View className='p-page'>
      {/* 搜索区 */}
      <View className='p-search-wrap'>
        <View className='p-search'>
          <Input
            className='p-search__input'
            value={keyword}
            placeholder={t('prop.searchPlaceholder')}
            placeholderStyle='color:#98a1ab'
            onInput={(e: any) => setKeyword(e.detail.value)}
          />
          {keyword ? (
            <Text className='p-search__clear' onClick={() => setKeyword('')}>
              {t('common.clear')}
            </Text>
          ) : null}
        </View>

        {/* 下拉筛选 */}
        <View className='p-filters'>
          {tabs.map((tab) => (
            <View
              key={tab.key}
              className={`p-chip ${openTab === tab.key ? 'p-chip--open' : ''} ${
                tab.active ? 'p-chip--active' : ''
              }`}
              onClick={() => setOpenTab(openTab === tab.key ? null : tab.key)}
            >
              <Text className='p-chip__text'>{tab.label}</Text>
              <Text className='p-chip__arrow'>{openTab === tab.key ? '▲' : '▼'}</Text>
            </View>
          ))}
        </View>

        {openTab !== null && (
          <View className='p-panel'>
            {openTab !== 'sort' ? (
              <View className='p-panel__chips'>
                {(openTab === 'status' ? STATUS_OPTIONS : TYPE_OPTIONS).map((o) => {
                  const cur = openTab === 'status' ? statusKey : typeKey
                  return (
                    <View
                      key={o.key}
                      className={`p-opt ${cur === o.key ? 'p-opt--active' : ''}`}
                      onClick={() => {
                        if (openTab === 'status') setStatusKey(o.key)
                        else setTypeKey(o.key)
                        setOpenTab(null)
                      }}
                    >
                      <Text>{t(o.label)}</Text>
                    </View>
                  )
                })}
              </View>
            ) : (
              <View className='p-panel__list'>
                {SORT_OPTIONS.map((s) => (
                  <View
                    key={s.key}
                    className={`p-sort ${sortKey === s.key ? 'p-sort--active' : ''}`}
                    onClick={() => {
                      setSortKey(s.key)
                      setOpenTab(null)
                    }}
                  >
                    <Text className='p-sort__text'>{t(s.label)}</Text>
                    {sortKey === s.key && <Text className='p-sort__check'>✓</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 快捷筛选 */}
        <ScrollView scrollX className='p-quick'>
          {QUICK_CHIPS.map((c) => (
            <View
              key={c.label}
              className={`p-quick__item ${quickActive === c.key ? 'p-quick__item--active' : ''}`}
              onClick={() => onQuick(c)}
            >
              <Text>{t(c.label)}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View className='p-body'>
        {/* 结果统计行 */}
        <View className='p-count'>
          <Text className='p-count__text'>
            {t('prop.countTotal')}{' '}
            <Text className='p-count__strong'>{visibleList.length}</Text> {t('prop.countUnitShort')} ·{' '}
            {t('prop.countVacant')}{' '}
            <Text className='p-count__strong p-count__strong--vacant'>{vacantCount}</Text>{' '}
            {t('prop.countUnitShort')}
          </Text>
        </View>

        {loading && listings.length === 0 ? (
          <View className='p-state p-state--loading'>
            <View className='p-state__spinner' />
            <Text className='p-state__title'>{t('prop.loadingList')}</Text>
          </View>
        ) : error ? (
          <View className='p-state'>
            <Text className='p-state__title'>{t('common.loadFailed')}</Text>
            <View className='p-retry' onClick={fetchListings}>
              <Text className='p-retry__text'>{t('common.tapRetry')}</Text>
            </View>
          </View>
        ) : visibleList.length === 0 ? (
          <View className='p-state'>
            <Text className='p-state__title'>{t('prop.empty')}</Text>
            <Text className='p-state__desc'>{t('prop.emptyFiltered')}</Text>
          </View>
        ) : (
          visibleList.map((it) => {
            const st = getStatus(it.status)
            const photo = Array.isArray(it.photos) && it.photos.length ? it.photos[0] : ''
            const tags = tagsOf(it)
            return (
              <View
                key={it.id}
                className='p-card'
                hoverClass='p-card--hover'
                onClick={() => onCardTap(it)}
              >
                <View className='p-card__thumb'>
                  {photo ? (
                    <Image className='p-card__photo' src={photo} mode='aspectFill' lazyLoad />
                  ) : (
                    <Text className='p-card__ph'>{t('prop.listing')}</Text>
                  )}
                  <View className='p-card__type'>
                    <Text>{t(TYPE_LABELS[String(it.property_type || '').toLowerCase()] || 'prop.listing')}</Text>
                  </View>
                </View>

                <View className='p-card__body'>
                  <Text className='p-card__name'>{it.room_number || t('prop.unnamed')}</Text>
                  <Text className='p-card__addr'>{it.address || t('prop.noAddress')}</Text>

                  {tags.length > 0 && (
                    <View className='p-card__tags'>
                      {tags.map((tag) => (
                        <Text key={tag} className='p-card__tag'>
                          {tag}
                        </Text>
                      ))}
                    </View>
                  )}

                  <Text className='p-card__stats'>
                    {it.size_sqm || 0}㎡ · {t('prop.bedroomUnit', { n: it.bedrooms || 0 })}{' '}
                    {t('prop.bathroomUnit', { n: it.bathrooms || 0 })}
                  </Text>

                  {/* 租客行：后端未提供租客姓名，仅在空置时按真实状态展示「无租约」 */}
                  {it.status === 'vacant' && (
                    <Text className='p-card__tenant p-card__tenant--vacant'>{t('prop.noLease')}</Text>
                  )}

                  <View className='p-card__bottom'>
                    <Text className='p-card__rent'>
                      {formatRent(it.monthly_rent, it.currency)}
                      <Text className='p-card__unit'>{t('pub.perMonth')}</Text>
                    </Text>
                    <View className='p-card__badges'>
                      <View className={`p-badge ${st.cls}`}>
                        <Text>{t(st.label)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}