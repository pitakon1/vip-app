import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import {
  notificationsApi,
  translateApi,
  propertiesApi,
  favoritesApi
} from '@/services/api'
import { iconStyle } from '@/utils/icons'
import { getCacheSync, isFreshSync, setCache } from '@/utils/cache'
import { TYPE_MAP, notifCategory, notifTitle, pickList, type NotifRow } from '@/lib/homeShared'
import BottomNav from '@/components/BottomNav'
import { useLocationStore } from '@/stores/location'
import PropertyRail from '@/components/PropertyRail'
import StateBlock from '@/components/StateBlock'
import './index.scss'

export default function TenantHomePage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  const [notifications, setNotifications] = useState<NotifRow[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [biz, setBiz] = useState<'rent' | 'buy'>('rent')
  const [keyword, setKeyword] = useState('')
  const [translateText, setTranslateText] = useState('')
  const [translated, setTranslated] = useState('')
  const [translating, setTranslating] = useState(false)
  // 全局定位（国家 → 城市，主页左上角）
  const locationSel = useLocationStore((s) => s.selection)
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

  const cityLabel = locationSel?.cityLabel || '选择城市'

  const feedItems = notifications.slice(0, 4)

  const handleSearch = () => {
    const params = [`biz=${biz}`]
    const q = keyword.trim()
    if (q) params.push(`q=${encodeURIComponent(q)}`)
    Taro.navigateTo({ url: `/pages/tenant/listings/index?${params.join('&')}` })
  }

  const handlePickCity = () => {
    Taro.navigateTo({ url: '/pages/location/index' })
  }

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

        {/* C 端内容入口：国际学校 / 小区。
            泰国买房租房的第一决策因子是国际学校（按距离反查房源），楼盘字典则是
            判断一个小区"有没有货"的最快方式——两者都不该只有未登录访客能进。 */}
        <View className='pub-entry-row'>
          <View className='pub-entry' onClick={() => goQuick('/pages/public/schools/index')}>
            <View className='icon-svg' style={iconStyle('school', 40)} />
            <Text className='pub-entry__text'>国际学校</Text>
            <Text className='pub-entry__arrow'>›</Text>
          </View>
          <View className='pub-entry' onClick={() => goQuick('/pages/public/communities/index')}>
            <View className='icon-svg' style={iconStyle('building', 40)} />
            <Text className='pub-entry__text'>小区</Text>
            <Text className='pub-entry__arrow'>›</Text>
          </View>
        </View>

        <PropertyRail title='精选房源' items={featuredItems} favSet={favSet} onToggleFavorite={toggleFavorite} />
        <PropertyRail title='新上房源' items={newItems} favSet={favSet} onToggleFavorite={toggleFavorite} />
        <PropertyRail title='热门二手房' items={commItems} favSet={favSet} onToggleFavorite={toggleFavorite} />

        <View className='rv-block-head'>
          <Text className='rv-block-title rv-block-title--inline'>最近动态</Text>
          {notifications.length > 0 && (
            <Text className='rv-block-link' onClick={handleReadAll}>全部已读</Text>
          )}
        </View>
        <View className='feed-card'>
          {loading && feedItems.length === 0 && (
            <StateBlock loading text='加载中...' />
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