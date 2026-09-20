import { useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import {
  notificationsApi,
  translateApi,
  propertiesApi,
  favoritesApi
} from '@/services/api'
import { fmtMoney as formatMoney } from '@/utils/format'
import type { NotificationType } from '@/types'
import { iconStyle } from '@/utils/icons'
import { getCacheSync, isFreshSync, setCache } from '@/utils/cache'
import BottomNav from '@/components/BottomNav'
import './index.scss'

const TYPE_MAP: Record<NotificationType, { text: string; color: string; bg: string }> = {
  payment: { text: '租金提醒', color: 'var(--error)', bg: 'rgba(var(--error-rgb), 0.1)' },
  lease: { text: '合同到期', color: 'var(--warning)', bg: 'rgba(var(--warning-rgb), 0.1)' },
  maintenance: { text: '维修通知', color: 'var(--primary)', bg: 'var(--sidebar-active)' },
  system: { text: '系统通知', color: 'var(--ink-3)', bg: 'var(--surface-2)' }
}

/** 通知行（后端返回 subject/content/status/related_entity_type，无 type 字段） */
interface NotifRow {
  id: number | string
  subject?: string
  title?: string
  content?: string
  status?: string
  read?: boolean
  related_entity_type?: string
  template_key?: string
  created_at?: string
  createdAt?: string
  [key: string]: any
}

// 按关联实体推导通知分类（后端无 type 字段）
const RENT_KEYS = ['lease', 'payment', 'rent', 'invoice', 'deposit']
const SERVICE_KEYS = ['maintenance', 'service_order', 'service', 'repair', 'ticket']

const notifCategory = (n: NotifRow): NotificationType => {
  const raw = `${n?.related_entity_type || ''} ${n?.template_key || ''}`.toLowerCase()
  if (SERVICE_KEYS.some((k) => raw.includes(k))) return 'maintenance'
  if (raw.includes('lease')) return 'lease'
  if (RENT_KEYS.some((k) => raw.includes(k))) return 'payment'
  return 'system'
}

const notifTitle = (n: NotifRow) => n?.subject || n?.title || '通知'
const notifTime = (n: NotifRow) => n?.created_at || n?.createdAt || ''

function pickList<T>(res: any): T[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatDay = (x?: string) => (x ? String(x).slice(0, 10) : '')

const propertyTitle = (item: any) =>
  item?.room_number ||
  item?.project_name ||
  item?.building ||
  item?.address ||
  `房源 #${String(item?.id ?? '').slice(0, 8)}`

const propertyAddress = (item: any) =>
  [item?.city, item?.address || item?.project_name].filter(Boolean).join(' · ')

const propertyTags = (item: any): string[] =>
  [item?.property_type, item?.furnished ? '拎包入住' : '', item?.bedrooms ? `${item.bedrooms}卧` : '']
    .filter(Boolean)
    .slice(0, 3) as string[]

export default function TenantHomePage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  const [notifications, setNotifications] = useState<NotifRow[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [biz, setBiz] = useState<'rent' | 'buy'>('rent')
  const [keyword, setKeyword] = useState('')
  const [city, setCity] = useState('')
  const [translateText, setTranslateText] = useState('')
  const [translated, setTranslated] = useState('')
  const [translating, setTranslating] = useState(false)
  // 已收藏房源集合 + 请求中的房源（避免连点重复提交）
  const [favSet, setFavSet] = useState<Set<string>>(new Set())
  const [favPending, setFavPending] = useState<Set<string>>(new Set())

  const loadData = async (opts?: { force?: boolean }) => {
    // SWR：同步读缓存先渲染（秒开），再后台请求刷新并回写缓存。
    // 房源为公开数据缓存全局一份；通知按用户隔离。
    const uid = String(useAuthStore.getState().user?.id ?? 'anon')
    const propsKey = 'tenant-home:props'
    const notifKey = `tenant-home:notifs:${uid}`

    const cachedProps = getCacheSync<any[]>(propsKey)
    const cachedNotifs = getCacheSync<NotifRow[]>(notifKey)
    if (cachedProps && cachedProps.length) setProperties(cachedProps)
    if (cachedNotifs && cachedNotifs.length) setNotifications(cachedNotifs)

    // 缓存新鲜且非强制刷新：直接展示缓存，不发请求
    if (!opts?.force && isFreshSync(propsKey) && isFreshSync(notifKey)) {
      setLoading(false)
      return
    }

    setLoading(true)
    const [propsRes, notifRes] = await Promise.all([
      propertiesApi.list({ page: 1, pageSize: 100 }).catch(() => null),
      notificationsApi.mine().catch(() => null)
    ])
    const props = pickList<any>(propsRes)
    const notifs = pickList<NotifRow>(notifRes)
    setProperties(props)
    setNotifications(notifs)
    if (props.length) setCache(propsKey, props)
    if (notifRes) setCache(notifKey, notifs)
    if (props.length === 0 && !propsRes) {
      // 全部接口失败时给出提示，但不注入任何占位数据
      Taro.showToast({ title: '加载失败，请下拉重试', icon: 'none' })
    }
    setLoading(false)
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    loadData()
    fetchFavorites()
  })

  // 收藏状态：与找房页保持一致，走真实接口
  const fetchFavorites = async () => {
    try {
      const res: any = await favoritesApi.list({ page: 1, limit: 1000 })
      const list = pickList<any>(res)
      setFavSet(new Set(list.map((f: any) => String(f.property_id ?? f.id)).filter(Boolean)))
    } catch (error) {
      console.error('[TenantHome] 加载收藏状态失败', error)
    }
  }

  const toggleFavorite = async (propertyId: string) => {
    if (!propertyId || favPending.has(propertyId)) return
    const isFav = favSet.has(propertyId)
    setFavPending((prev) => new Set(prev).add(propertyId))
    // 乐观更新，失败后回滚
    setFavSet((prev) => {
      const next = new Set(prev)
      if (isFav) next.delete(propertyId)
      else next.add(propertyId)
      return next
    })
    try {
      if (isFav) await favoritesApi.remove(propertyId)
      else await favoritesApi.add(propertyId)
    } catch (error) {
      console.error('[TenantHome] 收藏操作失败', error)
      setFavSet((prev) => {
        const next = new Set(prev)
        if (isFav) next.add(propertyId)
        else next.delete(propertyId)
        return next
      })
      Taro.showToast({ title: '操作失败，请重试', icon: 'none' })
    } finally {
      setFavPending((prev) => {
        const next = new Set(prev)
        next.delete(propertyId)
        return next
      })
    }
  }

  const handleReadAll = async () => {
    try {
      await notificationsApi.readAll()
      setNotifications((list) => list.map((n) => ({ ...n, read: true })))
      Taro.showToast({ title: '已全部标记为已读', icon: 'success' })
    } catch (error) {
      console.error('[TenantHome] 标记已读失败', error)
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  const goQuick = (url: string) => {
    Taro.navigateTo({ url })
  }

  const handleTranslate = async () => {
    const text = translateText.trim()
    if (!text || translating) return
    setTranslating(true)
    try {
      const res: any = await translateApi.translate(text, 'en')
      const out = res?.translated_text ?? res?.translation ?? res?.text ?? res?.data?.translated_text
      setTranslated(String(out || res))
    } catch (error) {
      console.error('[TenantHome] 翻译失败', error)
      setTranslated('翻译失败，请稍后重试')
    } finally {
      setTranslating(false)
    }
  }

  // ===== 派生数据 =====
  const rentItems = properties
    .filter((p) => !p?.sale_price || p?.monthly_rent)
    .slice()
    .sort(
      (a, b) =>
        new Date(b?.created_at || b?.published_at || 0).getTime() -
        new Date(a?.created_at || a?.published_at || 0).getTime()
    )
  const saleItems = properties
    .filter((p) => Number(p?.sale_price) > 0)
    .slice()
    .sort((a, b) => Number(b?.sale_price || 0) - Number(a?.sale_price || 0))

  const featuredItems = rentItems.slice(0, 6)
  const newItems = rentItems.slice(0, 6)
  const commItems = saleItems.slice(0, 3)

  const cities = Array.from(
    new Set(properties.map((p) => p?.city).filter(Boolean))
  ) as string[]
  const cityLabel = city || cities[0] || '选择城市'

  const feedItems = notifications.slice(0, 4)

  const handleSearch = () => {
    const params = [`biz=${biz}`]
    const q = keyword.trim()
    if (q) params.push(`q=${encodeURIComponent(q)}`)
    Taro.navigateTo({ url: `/pages/tenant/listings/index?${params.join('&')}` })
  }

  const handlePickCity = () => {
    if (cities.length === 0) {
      Taro.showToast({ title: '暂无可选城市', icon: 'none' })
      return
    }
    Taro.showActionSheet({
      itemList: ['全部城市', ...cities],
      success: (res) => setCity(res.tapIndex === 0 ? '' : cities[res.tapIndex - 1])
    })
  }

  const renderRail = (title: string, items: any[]) => (
    <View className='rv-sec'>
      <View className='rv-sec__head'>
        <Text className='rv-sec__title'>{title}</Text>
        <Text className='rv-sec__more' onClick={() => goQuick('/pages/tenant/listings/index')}>
          更多 ›
        </Text>
      </View>
      {items.length === 0 ? (
        <View className='empty-state'>
          <View className='empty-state__icon icon-svg' style={iconStyle('home', 80)} />
          <Text>暂无房源</Text>
        </View>
      ) : (
        <ScrollView scrollX className='rv-rail'>
          <View className='rv-rail-inner'>
            {items.map((item) => (
              <View
                key={item?.id}
                className='rv-prop'
                onClick={() =>
                  goQuick(`/pages/tenant/property-detail/index?id=${item?.id}`)
                }
              >
                <View className='rv-prop__img'>
                  <View className='rv-prop__img-icon icon-svg' style={iconStyle('home', 48)} />
                  {!!item?.property_type && (
                    <Text className='rv-prop__badge'>{item.property_type}</Text>
                  )}
                  <View
                    className='rv-prop__fav'
                    aria-label={favSet.has(String(item?.id)) ? '取消收藏' : '收藏'}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(String(item?.id))
                    }}
                  >
                    <View
                      className='icon-svg'
                      style={iconStyle(
                        favSet.has(String(item?.id)) ? 'heartFill' : 'heart',
                        32
                      )}
                    />
                  </View>
                </View>
                <View className='rv-prop__body'>
                  <Text className='rv-prop__name'>{propertyTitle(item)}</Text>
                  <Text className='rv-prop__addr'>{propertyAddress(item) || '—'}</Text>
                  <View className='rv-prop__tags'>
                    {propertyTags(item).map((tag) => (
                      <Text key={tag} className='rv-tag'>{tag}</Text>
                    ))}
                  </View>
                  <View className='rv-prop__bottom'>
                    <Text className='rv-prop__price'>
                      {Number(item?.sale_price) > 0
                        ? formatMoney(item.sale_price, item?.currency)
                        : `${formatMoney(item?.monthly_rent, item?.currency)}/月`}
                    </Text>
                    <Text className='rv-prop__meta'>{formatDay(item?.created_at || item?.published_at)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )

  return (
    <View className='tenant-home-page'>
      <View className='page-container'>
        <View className='rv-hero'>
          <View className='rv-hero__loc' onClick={handlePickCity}>
            <Text className='rv-hero__loc-text'>{cityLabel}</Text>
            <Text className='rv-hero__loc-arrow'>▾</Text>
          </View>
          <View className='rv-hero__search'>
            <Input
              className='rv-hero__search-input'
              value={keyword}
              placeholder='区域 / 楼盘 / 关键词'
              onInput={((e: any) => setKeyword(e.detail.value)) as any}
              onConfirm={handleSearch}
            />
            <View className='rv-hero__search-btn' onClick={handleSearch}>
              <Text className='rv-hero__search-btn-text'>搜索</Text>
            </View>
          </View>
        </View>

        <View className='rv-tabs'>
          <View
            className={`rv-tab ${biz === 'rent' ? 'rv-tab--active' : ''}`}
            onClick={() => setBiz('rent')}
          >
            <Text className='rv-tab-text'>租房</Text>
          </View>
          <View
            className={`rv-tab ${biz === 'buy' ? 'rv-tab--active' : ''}`}
            onClick={() => setBiz('buy')}
          >
            <Text className='rv-tab-text'>买房</Text>
          </View>
        </View>

        <View className='browse-banner' onClick={() => goQuick('/pages/tenant/listings/index')}>
          <View className='browse-banner__icon icon-svg' style={iconStyle('home', 44)} />
          <View className='browse-banner__body'>
            <Text className='browse-banner__title'>找房源</Text>
            <Text className='browse-banner__sub'>搜索房源 · 查看详情 · 预约看房</Text>
          </View>
          <Text className='browse-banner__arrow'>›</Text>
        </View>

        {renderRail('精选房源', featuredItems)}
        {renderRail('新上房源', newItems)}
        {renderRail('热门二手房', commItems)}

        <View className='rv-block-head'>
          <Text className='rv-block-title rv-block-title--inline'>最近动态</Text>
          {notifications.length > 0 && (
            <Text className='rv-block-link' onClick={handleReadAll}>全部已读</Text>
          )}
        </View>
        <View className='feed-card'>
          {loading && feedItems.length === 0 && (
            <View className='empty-state'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && feedItems.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('megaphone', 80)} />
              <Text>暂无动态</Text>
            </View>
          )}
          {feedItems.map((n) => {
            const category = notifCategory(n)
            const info = TYPE_MAP[category] || TYPE_MAP.system
            return (
              <View key={n.id} className='feed-item'>
                <View
                  className='feed-icon icon-svg'
                  style={iconStyle(
                    category === 'payment' ? 'card' : category === 'maintenance' ? 'edit' : 'megaphone',
                    32
                  )}
                />
                <View className='feed-body'>
                  <Text className='feed-title'>{notifTitle(n)}</Text>
                  <Text className='feed-desc'>{n.content || '—'}</Text>
                </View>
                <Text className='feed-badge' style={{ color: info.color, backgroundColor: info.bg }}>
                  {info.text}
                </Text>
              </View>
            )
          })}
        </View>

        <View className='translate-section'>
          <Text className='translate-title'>房源翻译</Text>
          <Text className='translate-desc'>输入房源描述，一键翻译为英文</Text>
          <Input
            className='translate-input'
            value={translateText}
            placeholder='输入要翻译的中文房源描述'
            onInput={((e: any) => setTranslateText((e as any).detail.value)) as any}
          />
          <View className={`translate-btn ${translating ? 'disabled' : ''}`} onClick={handleTranslate}>
            <Text className='translate-btn-text'>{translating ? '翻译中...' : 'Google 翻译'}</Text>
          </View>
          {translated && <Text className='translate-result'>{translated}</Text>}
        </View>
      </View>

      <BottomNav role='tenant' active='dashboard' />
    </View>
  )
}