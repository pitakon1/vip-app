/**
 * 地图找房（C 端公开页，匿名可进）。
 *
 * 数据源是 `GET /public/map-points`：后端只返回「所属楼盘有经纬度」的房源，
 * 所以地图上标出来的每一个点都点得开、都能进详情，不会出现「标了点却查无此房」。
 *
 * 交互口径：
 * - 视野变化（regionchange end）按当前视野 min/max lat/lng 只拉该区域点位（400ms 防抖）；
 * - 顶部两行业务 / 类型筛选（方块样式，对齐 C 端筛选规范），本页口径可直接覆盖
 *   租房 / 买房 / 新房 / 二手房 / 写字楼 / 商铺 / 厂房；
 * - 底部为当前视野的点位卡片列表，点击进公开房源详情。
 *
 * 城市参数统一传定位 Store 的 cityKey（后端做 slug 归一化），不传中文 cityLabel。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Image, Map, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { publicApi, type PublicMapPoint } from '@/services/publicApi'
import { fmtMoney } from '@/utils/format'
import { useI18n } from '@/i18n'
import { useLocationStore } from '@/stores/location'
import { ICONS } from '@/utils/icons'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'

type Biz = '' | 'rent' | 'sell'
type Cat = '' | 'new' | 'resale' | 'office' | 'shop' | 'factory'

/** 地图初始中心（仅兜底）：优先取用户定位，其次取首个点位。 */
const DEFAULT_CENTER = { latitude: 13.7563, longitude: 100.5018 }

interface Bounds {
  min_lat: number
  max_lat: number
  min_lng: number
  max_lng: number
}

export default function PublicMapPage() {
  const { t } = useI18n()
  const router = useRouter()
  const cityKey = useLocationStore((s) => s.selection.cityKey)

  // 初始筛选：从找房页/分类页的地图入口带过来（listing_type / ptype / new）
  const initBiz: Biz = router.params?.listing_type === 'sell' ? 'sell' : router.params?.listing_type === 'rent' ? 'rent' : ''
  const initCat: Cat = (() => {
    const p = router.params ?? {}
    if (p.new === '1') return 'new'
    if (p.new === '0') return 'resale'
    const ptype = p.ptype
    return ptype === 'office' || ptype === 'shop' || ptype === 'factory' ? ptype : ''
  })()

  const [biz, setBiz] = useState<Biz>(initBiz)
  const [cat, setCat] = useState<Cat>(initCat)

  const [points, setPoints] = useState<PublicMapPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const [center, setCenter] = useState(DEFAULT_CENTER)
  const gpsRef = useRef(false)
  const centeredRef = useRef(false)
  const boundsRef = useRef<Bounds | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 类型口径：新房/二手房锁定 sell；写字楼/商铺/厂房走 property_type
  const effectiveListingType: 'rent' | 'sell' | undefined =
    cat === 'new' || cat === 'resale' ? 'sell' : biz || undefined
  const propertyType = cat === 'office' || cat === 'shop' || cat === 'factory' ? cat : undefined
  const isNew = cat === 'new' ? true : cat === 'resale' ? false : undefined

  const fetchPoints = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await publicApi.mapPoints({
        city: cityKey || undefined,
        limit: 200,
        listing_type: effectiveListingType,
        property_type: propertyType,
        is_new_development: isNew,
        ...(boundsRef.current ?? {})
      })
      const raw = res?.data ?? res
      const arr: PublicMapPoint[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
          ? raw.items
          : []
      setPoints(arr.filter((p) => p.lat != null && p.lng != null))
      setFailed(false)
    } catch (err) {
      console.error('[public map] 点位加载失败', err)
      setPoints([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [cityKey, effectiveListingType, propertyType, isNew])

  // 城市 / 筛选变化 → 复用当前视野重新拉取
  useEffect(() => {
    fetchPoints()
  }, [fetchPoints])

  // 默认中心：优先定位，失败则用首个点位
  useEffect(() => {
    Taro.getLocation({ type: 'gcj02' })
      .then((loc) => {
        gpsRef.current = true
        centeredRef.current = true
        setCenter({ latitude: loc.latitude, longitude: loc.longitude })
      })
      .catch(() => {
        /* 用户拒绝定位：改用首个点位作为中心 */
      })
  }, [])

  useEffect(() => {
    if (centeredRef.current || gpsRef.current || points.length === 0) return
    const p = points[0]
    if (p.lat != null && p.lng != null) {
      centeredRef.current = true
      setCenter({ latitude: Number(p.lat), longitude: Number(p.lng) })
    }
  }, [points])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    []
  )

  const onRegionChange = (e: any) => {
    const d = e?.detail ?? {}
    const type = d.type ?? e?.type
    if (type && type !== 'end') return
    // 程序化移动（初始渲染 / center 变更）不按视野收敛，避免空数据时把自己夹死在兜底中心
    const causedBy = d.causedBy ?? e?.causedBy
    if (causedBy === 'update') return
    const region = d.region ?? d.detail?.region ?? e?.region
    const ne = region?.northeast
    const sw = region?.southeast
    if (!ne || !sw) return
    boundsRef.current = {
      min_lat: Math.min(sw.latitude, ne.latitude),
      max_lat: Math.max(sw.latitude, ne.latitude),
      min_lng: Math.min(sw.longitude, ne.longitude),
      max_lng: Math.max(sw.longitude, ne.longitude)
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPoints(), 400)
  }

  const onMarkerTap = (e: any) => {
    const id = Number(e?.detail?.markerId)
    const p = points[id]
    if (p?.id) Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${p.id}` })
  }

  const markers = useMemo(
    () =>
      points.map((p, i) => ({
        id: i,
        latitude: Number(p.lat),
        longitude: Number(p.lng),
        iconPath: ICONS.location,
        width: 32,
        height: 32,
        title: p.project_name || p.room_number || p.address || ''
      })),
    [points]
  )

  const bizOptions: Array<[Biz, string]> = [
    ['', t('pub.typeAll')],
    ['rent', t('pub.typeRent')],
    ['sell', t('pub.typeSell')]
  ]
  const catOptions: Array<[Cat, string]> = [
    ['', t('pub.typeAll')],
    ['new', t('tl.mapNew')],
    ['resale', t('tl.mapResale')],
    ['office', t('tl.mapOffice')],
    ['shop', t('tl.mapShop')],
    ['factory', t('tl.mapFactory')]
  ]

  const openDetail = (id: string) =>
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${id}` })

  return (
    <View className='map-page'>
      <ShellHeader title={t('tl.mapTitle')} />

      {/* 顶部筛选：方块样式（小圆角 + 浅灰底 + 选中描边） */}
      <View className='map-filters'>
        <View className='map-chips'>
          {bizOptions.map(([key, label]) => (
            <View
              key={key || 'all-biz'}
              className={`map-chip${biz === key ? ' map-chip--on' : ''}`}
              onClick={() => setBiz(key)}
            >
              <Text>{label}</Text>
            </View>
          ))}
        </View>
        <View className='map-chips'>
          {catOptions.map(([key, label]) => (
            <View
              key={key || 'all-cat'}
              className={`map-chip${cat === key ? ' map-chip--on' : ''}`}
              onClick={() => setCat(key)}
            >
              <Text>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 地图画布 */}
      <View className='map-canvas'>
        <Map
          className='map-canvas__inner'
          latitude={center.latitude}
          longitude={center.longitude}
          scale={13}
          markers={markers as any}
          showLocation
          onRegionChange={onRegionChange}
          onMarkerTap={onMarkerTap}
          onError={() => {}}
        />
        <View className='map-canvas__count'>
          <Text>{t('tl.mapCount', { n: points.length })}</Text>
        </View>
      </View>

      {/* 底部点位列表 */}
      <View className='map-sheet'>
        {loading ? (
          <View className='pub-loading'>{t('pub.loading')}</View>
        ) : failed ? (
          <View className='pub-empty'>{t('tl.mapLoadFailed')}</View>
        ) : points.length === 0 ? (
          <View className='pub-empty'>{t('tl.mapEmpty')}</View>
        ) : (
          <ScrollView className='map-sheet__scroll' scrollY showScrollbar={false}>
            {points.map((p) => {
              const isSell = p.listing_type === 'sell'
              const price = p.price ?? p.monthly_rent
              const title = p.project_name || p.room_number || p.address || t('pub.listingItem')
              return (
                <View key={p.id} className='pub-listing' onClick={() => openDetail(p.id)}>
                  <View className='pub-listing__media'>
                    {p.cover ? (
                      <Image className='pub-listing__img' src={p.cover} mode='aspectFill' />
                    ) : (
                      <View className='pub-listing__noimg'>
                        <Text>{t('pub.noPhoto')}</Text>
                      </View>
                    )}
                  </View>
                  <View className='pub-listing__body'>
                    <Text className='pub-listing__title'>{title}</Text>
                    {p.room_number && p.project_name ? (
                      <Text className='pub-listing__unit'>{p.room_number}</Text>
                    ) : null}
                    {p.address ? <Text className='pub-listing__addr'>{p.address}</Text> : null}
                    <View className='pub-listing__facts'>
                      {p.bedrooms != null ? <Text>{p.bedrooms} BED</Text> : null}
                      {p.size_sqm != null ? (
                        <Text>
                          {p.size_sqm} {t('pub.sqm')}
                        </Text>
                      ) : null}
                    </View>
                    {price != null ? (
                      <Text className='pub-listing__price'>
                        {fmtMoney(price, p.currency || 'THB')}
                        {isSell ? null : (
                          <Text className='pub-listing__price-sub'>{t('pub.perMonth')}</Text>
                        )}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )
            })}
          </ScrollView>
        )}
      </View>
    </View>
  )
}
