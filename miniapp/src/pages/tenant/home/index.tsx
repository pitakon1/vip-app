import { OPTION_PAGE_SIZE } from '@/lib/pagination'
/**
 * C 端首页（业主 / 租客 / 未登录访客统一）。
 *
 * 对齐 App `screens/tenant/HomeScreen.tsx`：公开内容首页
 * - 定位城市 + 搜索（找房，匿名可用）
 * - 黄金导航 7 个分类磁贴（每项进各自分类页）
 * - 当前分类房源 rail（数据来自 `/public/home`，一次取齐、切换无加载态）
 * - 国际学校 rail（点学校带着学校筛选进找房）
 * - 最近动态（账单 + 报修，登录后才有；访客为空态）
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, Input, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { paymentsApi, maintenanceApi } from '@/services/api'
import {
  publicApi,
  type PublicListing,
  type PublicProject,
  type PublicSchool
} from '@/services/publicApi'
import { schoolStageLabel, curriculumLabel } from '@/lib/publicSite'
import { fmtMoney, fmtDate } from '@/utils/format'
import { iconStyle, type IconKey } from '@/utils/icons'
import { useLocationStore } from '@/stores/location'
import { useI18n } from '@/i18n'
import BottomNav, { type NavRole } from '@/components/BottomNav'
import StatusTop from '@/components/StatusTop'
import './index.scss'

interface PublicHome {
  listings: PublicListing[]
  sale: PublicListing[]
  commercial: PublicListing[]
  factory: PublicListing[]
  hotel: PublicListing[]
  land: PublicListing[]
  projects: PublicProject[]
  schools: PublicSchool[]
}

type BizKey = 'rent' | 'new' | 'resale' | 'commercial' | 'factory' | 'hotel' | 'land'

interface BizItem {
  key: BizKey
  labelKey: string
  titleKey: string
  icon: IconKey
  path: string
}

/** 黄金导航与下方房源 rail 共用这份定义：分类 / 顺序 / 文案两处永远一致（对齐 App BIZ_ITEMS）。 */
const BIZ_ITEMS: BizItem[] = [
  { key: 'rent', labelKey: 'home.goldRent', titleKey: 'home.featured', icon: 'navRent', path: '/pages/tenant/category-rent/index' },
  { key: 'new', labelKey: 'home.goldNew', titleKey: 'category.newTitle', icon: 'navNew', path: '/pages/tenant/category-new/index' },
  { key: 'resale', labelKey: 'home.goldResale', titleKey: 'home.hotSecondHand', icon: 'navResale', path: '/pages/tenant/category-resale/index' },
  { key: 'commercial', labelKey: 'home.goldCommercial', titleKey: 'category.commTitle', icon: 'navShop', path: '/pages/tenant/category-commercial/index' },
  { key: 'factory', labelKey: 'home.goldFactory', titleKey: 'category.factTitle', icon: 'navFactory', path: '/pages/tenant/category-factory/index' },
  { key: 'hotel', labelKey: 'home.goldHotel', titleKey: 'category.hotelTitle', icon: 'navHotel', path: '/pages/tenant/category-hotel/index' },
  { key: 'land', labelKey: 'home.goldLand', titleKey: 'category.landTitle', icon: 'navLand', path: '/pages/tenant/category-land/index' }
]

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  apartment: 'prop.typeApartment',
  condo: 'prop.typeApartment',
  villa: 'prop.typeVilla',
  house: 'prop.typeVilla',
  townhouse: 'prop.typeTownhouse',
  office: 'prop.typeOffice',
  shop: 'prop.typeCommercial',
  factory: 'prop.typeFactory',
  hotel: 'prop.typeHotel',
  land: 'prop.typeLand'
}

export default function TenantHomePage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const cityKey = useLocationStore((s) => s.selection.cityKey)
  const cityLabel = useLocationStore((s) => s.selection.cityLabel)
  const navRole: NavRole = !token ? 'guest' : user?.role === 'owner' ? 'owner' : 'tenant'

  const [biz, setBiz] = useState<BizKey>('rent')
  const [keyword, setKeyword] = useState('')
  const [home, setHome] = useState<PublicHome | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    const [homeRes, payRes, mRes] = await Promise.allSettled([
      publicApi.home({ city: cityKey || undefined }),
      token ? paymentsApi.mine() : Promise.resolve(null),
      token ? maintenanceApi.list({ page: 1, page_size: OPTION_PAGE_SIZE }) : Promise.resolve(null)
    ])
    if (homeRes.status === 'fulfilled') {
      const data: any = (homeRes.value as any)?.data ?? homeRes.value
      setHome({
        listings: data?.listings ?? [],
        sale: data?.sale ?? [],
        commercial: data?.commercial ?? [],
        factory: data?.factory ?? [],
        hotel: data?.hotel ?? [],
        land: data?.land ?? [],
        projects: data?.projects ?? [],
        schools: data?.schools ?? []
      })
    } else {
      setFailed(true)
    }
    const payData: any =
      payRes.status === 'fulfilled' ? (payRes.value as any)?.data ?? payRes.value : null
    setPayments(Array.isArray(payData) ? payData : payData?.items ?? [])
    const mData: any = mRes.status === 'fulfilled' ? (mRes.value as any)?.data ?? mRes.value : null
    setTickets(Array.isArray(mData) ? mData : mData?.items ?? [])
    setLoading(false)
  }, [cityKey, token])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useDidShow(() => {
    loadFromStorage()
  })

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  // ---------- 派生数据 ----------
  const bizItem = BIZ_ITEMS.find((b) => b.key === biz) ?? BIZ_ITEMS[0]
  const railItems = useMemo(() => {
    if (!home) return []
    if (biz === 'new') return home.projects
    if (biz === 'resale') return home.sale
    if (biz === 'commercial') return home.commercial
    if (biz === 'factory') return home.factory
    if (biz === 'hotel') return home.hotel
    if (biz === 'land') return home.land
    // 推荐房源与 App 一致只取前 10 条（其余分类取全量）
    return home.listings.slice(0, 10)
  }, [biz, home])

  // 最近动态：账单 + 报修按时间倒序合并（对齐 App 首页「最近动态」）
  const activities = useMemo(() => {
    interface ActivityRow {
      id: string
      type: 'pay' | 'ticket'
      title: string
      sub: string
      badge: string
      at: number
    }
    const rows: ActivityRow[] = payments.map((p) => ({
      id: `pay-${p.id}`,
      type: 'pay' as const,
      title: p.payment_type
        ? t('home.billOf', { type: t(`pay.type.${p.payment_type}`) })
        : t('home.bill'),
      sub: p.description || (p.due_date ? t('home.dueDate', { date: fmtDate(p.due_date) }) : t('home.dueTbd')),
      badge: p.status ? t(`pay.status.${p.status}`) : '',
      at: Date.parse(String(p.paid_at ?? p.due_date ?? '')) || 0
    }))
    rows.push(
      ...tickets.map((tk) => ({
        id: `maint-${tk.id}`,
        type: 'ticket' as const,
        title: t('home.maintTicket'),
        sub: `${tk.title || t('home.repair')} · ${fmtDate(tk.created_at)}`,
        badge: tk.status ? t(`ticket.status.${tk.status}`) : '',
        at: Date.parse(String(tk.created_at ?? '')) || 0
      }))
    )
    return rows.sort((a, b) => b.at - a.at).slice(0, 5)
  }, [payments, tickets, t])

  // ---------- 交互 ----------
  const openCity = () => Taro.navigateTo({ url: '/pages/location/index' })

  const handleSearch = () => {
    const q = keyword.trim()
    Taro.navigateTo({
      url: `/pages/public/listings/index${q ? `?q=${encodeURIComponent(q)}` : ''}`
    })
  }

  const openListing = (id?: string | null) => {
    if (!id) return
    Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${encodeURIComponent(id)}` })
  }

  const openProject = (id?: string | null) => {
    if (!id) return
    Taro.navigateTo({ url: `/pages/public/community-detail/index?id=${encodeURIComponent(id)}` })
  }

  // 学校卡片带着学校跳「找房」并预选学校筛选（默认 3km），与 App 跳转链路一致
  const openSchoolListings = (s: PublicSchool) => {
    const params = [
      `school_id=${encodeURIComponent(s.id)}`,
      `school_name=${encodeURIComponent(s.name ?? '')}`,
      'school_km=3'
    ]
    Taro.navigateTo({ url: `/pages/public/listings/index?${params.join('&')}` })
  }

  const openBiz = (item: BizItem) => {
    setBiz(item.key)
    Taro.navigateTo({ url: item.path })
  }

  const listingPrice = (it: PublicListing): string => {
    if (it.price == null) return t('discover.noPrice')
    const unit = it.listing_type === 'rent' ? t('discover.rentUnit') : ''
    return `${fmtMoney(it.price, it.currency || 'THB')}${unit}`
  }

  const listingTitle = (it: PublicListing): string =>
    it.project_name || it.room_number || t('list.unnamed')

  const listingFacts = (it: PublicListing): string =>
    [
      it.bedrooms ? t('prop.bedroomUnit', { n: it.bedrooms }) : '',
      it.size_sqm ? `${it.size_sqm}${t('pub.sqm')}` : ''
    ]
      .filter(Boolean)
      .join(' · ')

  const projectPrice = (p: PublicProject): string => {
    if (p.rent_price_min != null) return `${fmtMoney(p.rent_price_min, 'THB')}${t('discover.rentUnit')}`
    if (p.sale_price_min != null) return `${fmtMoney(p.sale_price_min, 'THB')}${t('discover.saleUnit')}`
    return t('discover.noPrice')
  }

  const goActivity = (type: 'pay' | 'ticket') => {
    Taro.navigateTo({
      url: type === 'pay' ? '/pages/tenant/payments/index' : '/pages/tenant/maintenance/index'
    })
  }

  return (
    <View className='tenant-home-page'>
      <StatusTop background='var(--hero-top)' />

      {/* 黄金位横幅：主色同色系渐变，定位行用浅色字；搜索卡以负外边距压住横幅下沿 */}
      <View className='th-hero'>
        <View className='th-hero__top' onClick={openCity}>
          <Text className='th-hero__city'>
            {cityLabel ? `${t('home.currentCity')} · ${cityLabel}` : t('home.selectCity')}
          </Text>
          <Text className='th-hero__caret'>▾</Text>
        </View>
      </View>

      <View className='th-search'>
        <View className='icon-svg' style={iconStyle('search', 32)} />
        <Input
          className='th-search__input'
          value={keyword}
          placeholder={t('home.searchPlaceholder')}
          onInput={((e: any) => setKeyword(e.detail.value)) as any}
          onConfirm={handleSearch}
        />
        <View className='th-search__btn' onClick={handleSearch}>
          <Text className='th-search__btn-text'>{t('home.goSearch')}</Text>
        </View>
      </View>

      {/* 黄金导航栏：7 个分类入口，每项跳各自独立的分类页（对齐 App BIZ_ITEMS）
          图标底为一入口一色的鲜明圆，图标统一白色 */}
      <View className='gold-nav'>
        {BIZ_ITEMS.map((item) => (
          <View key={item.key} className='gold-nav__item' onClick={() => openBiz(item)}>
            <View className={`gold-nav__icon gold-nav__icon--${item.key}`}>
              <View className='icon-svg' style={iconStyle(item.icon, 44)} />
            </View>
            <Text className='gold-nav__label'>{t(item.labelKey)}</Text>
          </View>
        ))}
      </View>

      {/* 当前分类房源 rail */}
      <View className='th-section'>
        <View className='th-section__head'>
          <Text className='th-section__title'>{t(bizItem.titleKey)}</Text>
          <Text className='th-section__link' onClick={() => Taro.navigateTo({ url: bizItem.path })}>
            {t('discover.viewAll')}
          </Text>
        </View>

        {loading ? (
          <Text className='th-hint'>{t('pub.loading')}</Text>
        ) : failed ? (
          <View className='th-empty'>
            <Text className='th-empty__title'>{t('loadFailed')}</Text>
            <Text className='th-empty__tag' onClick={() => { setLoading(true); void load() }}>
              {t('common.retry')}
            </Text>
          </View>
        ) : railItems.length === 0 ? (
          <View className='th-empty'>
            <Text className='th-empty__title'>{t('home.noListings')}</Text>
            <Text className='th-empty__sub'>{t('home.noListingsSub')}</Text>
            <Text className='th-empty__tag' onClick={() => Taro.navigateTo({ url: bizItem.path })}>
              {t('home.goSearch')}
            </Text>
          </View>
        ) : (
          <ScrollView className='th-rail' scrollX>
            {biz === 'new'
              ? (railItems as PublicProject[]).map((p) => (
                  <View key={p.id} className='th-card' onClick={() => openProject(p.id)}>
                    <View className='th-card__media'>
                      {p.cover ? (
                        <Image className='th-card__img' src={p.cover} mode='aspectFill' />
                      ) : (
                        <View className='th-card__noimg'>{t('pub.noPhoto')}</View>
                      )}
                    </View>
                    <Text className='th-card__price'>{projectPrice(p)}</Text>
                    <Text className='th-card__title' numberOfLines={1}>
                      {p.name || t('home.noListings')}
                    </Text>
                    <Text className='th-card__sub' numberOfLines={1}>
                      {[p.district, p.city].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))
              : (railItems as PublicListing[]).map((it) => (
                  <View key={it.id} className='th-card' onClick={() => openListing(it.id)}>
                    <View className='th-card__media'>
                      {it.cover ? (
                        <Image className='th-card__img' src={it.cover} mode='aspectFill' />
                      ) : (
                        <View className='th-card__noimg'>{t('pub.noPhoto')}</View>
                      )}
                      {it.property_type ? (
                        <Text className='th-card__badge'>
                          {t(PROPERTY_TYPE_LABEL[it.property_type] || 'tab.properties')}
                        </Text>
                      ) : null}
                    </View>
                    <Text className='th-card__price'>{listingPrice(it)}</Text>
                    <Text className='th-card__title' numberOfLines={1}>
                      {listingTitle(it)}
                    </Text>
                    <Text className='th-card__sub' numberOfLines={1}>
                      {listingFacts(it)}
                    </Text>
                  </View>
                ))}
          </ScrollView>
        )}
      </View>

      {/* 国际学校 rail */}
      {!loading && !failed && (home?.schools?.length ?? 0) > 0 && (
        <View className='th-section'>
          <View className='th-section__head'>
            <Text className='th-section__title'>{t('pub.tabSchools')}</Text>
            <Text
              className='th-section__link'
              onClick={() => Taro.navigateTo({ url: '/pages/public/schools/index' })}
            >
              {t('home.allSchools')}
            </Text>
          </View>
          <ScrollView className='th-rail' scrollX>
            {home!.schools.map((s) => (
              <View key={s.id} className='th-card' onClick={() => openSchoolListings(s)}>
                <View className='th-card__media'>
                  {s.cover_url ? (
                    <Image className='th-card__img' src={s.cover_url} mode='aspectFill' />
                  ) : (
                    <View className='th-card__noimg'>{t('pub.noPhoto')}</View>
                  )}
                  {s.stage ? (
                    <Text className='th-card__badge'>{schoolStageLabel(s.stage)}</Text>
                  ) : null}
                </View>
                <Text className='th-card__title' numberOfLines={1}>
                  {s.name || t('home.unnamedSchool')}
                </Text>
                <Text className='th-card__sub' numberOfLines={1}>
                  {[s.name_en, s.district].filter(Boolean).join(' · ')}
                </Text>
                {s.curriculum ? (
                  <View className='th-card__tags'>
                    <Text className='th-card__tag'>{curriculumLabel(s.curriculum)}</Text>
                  </View>
                ) : null}
                <Text className='th-card__price'>
                  {s.tuition_range || t('home.tuitionNegotiable')}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 最近动态：账单 + 报修（访客为空态，与 App 一致） */}
      <View className='th-section'>
        <View className='th-section__head'>
          <Text className='th-section__title'>{t('home.recentActivity')}</Text>
        </View>
        {activities.length === 0 ? (
          <View className='th-empty'>
            <Text className='th-empty__title'>{t('home.noActivity')}</Text>
            <Text className='th-empty__sub'>{t('home.noActivitySub')}</Text>
          </View>
        ) : (
          <View className='th-activity'>
            {activities.map((a) => (
              <View key={a.id} className='th-activity__row' onClick={() => goActivity(a.type)}>
                <View
                  className={`th-activity__dot th-activity__dot--${a.type}`}
                />
                <View className='th-activity__body'>
                  <Text className='th-activity__title' numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text className='th-activity__sub' numberOfLines={1}>
                    {a.sub}
                  </Text>
                </View>
                {a.badge ? <Text className='th-activity__badge'>{a.badge}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <BottomNav role={navRole} active='dashboard' />
    </View>
  )
}
