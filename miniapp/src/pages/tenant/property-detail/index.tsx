import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Image, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { request } from '@/lib/api'
import { favoritesApi, saleListingApi, viewingsApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as formatMoney } from '@/utils/format'
import { ICONS, iconStyle } from '@/utils/icons'
import './index.scss'
import { useI18n } from '@/i18n'

interface PropertyItem {
  id?: string
  project_id?: string
  room_number?: string
  floor?: number
  building?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  deposit_amount?: number
  deposit_months?: number
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  status?: string
  photos?: any[]
  furnished?: boolean
  available_from?: string
  video_url?: string
  project_name?: string
}

interface ProjectItem {
  id?: string
  name?: string
  address?: string
  district?: string
  city?: string
  province?: string
  country?: string
  nearest_subway?: string
  developer?: string
  property_management_company?: string
  amenities?: Record<string, any>
}

interface SaleListingItem {
  id?: string
  property_id?: string
  title?: string
  asking_price?: number
  currency?: string
  sale_type?: string
  status?: string
}

const buildTypeLabels = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, string> => ({
  apartment: t('prop.typeApartment'),
  house: t('prop.typeHouse'),
  condo: t('prop.typeApartment'),
  commercial: t('prop.typeCommercial')
})

const buildStatusLabels = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, string> => ({
  vacant: t('tpd.statusVacant'),
  rented: t('prop.statusRentedLong'),
  reserved: t('prop.statusReserved'),
  maintenance: t('prop.statusMaintenanceLong')
})

const LOAN_YEARS = 30
const DOWN_PAYMENT_RATIO = 0.3

/** 兼容两种返回形状：直接对象 / { data: 对象 } */
function toBody(res: any) {
  if (res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object') {
    return res.data
  }
  return res
}

function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

function photoUrl(p: any): string {
  if (!p) return ''
  if (typeof p === 'string') return p
  return p.url || p.src || p.path || ''
}

const formatDay = (
  x: string | undefined,
  t: (k: string, p?: Record<string, string | number>) => string
) => {
  if (!x) return ''
  const d = new Date(x)
  if (Number.isNaN(d.getTime())) return String(x).slice(0, 10)
  return t('cal.dateMD', { m: d.getMonth() + 1, d: d.getDate() })
}

const pad2 = (n: number) => String(n).padStart(2, '0')
// 默认看房时间：下一个整点（与员工端「预约带看」同口径）
const defaultSlot = () => {
  const d = new Date(Date.now() + 3600000)
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:00`
  }
}

export default function TenantPropertyDetailPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const router = useRouter()
  const propertyId = router.params?.id

  const [fav, setFav] = useState(false)
  const TYPE_LABELS = buildTypeLabels(t)
  const STATUS_LABELS = buildStatusLabels(t)

  const [biz, setBiz] = useState<'rent' | 'buy'>('rent')
  const [photoIndex, setPhotoIndex] = useState(0)
  const [rateInput, setRateInput] = useState('')
  const [showLoan, setShowLoan] = useState(false)

  // 预约看房（真实写接口 POST /viewings）
  const [showBooking, setShowBooking] = useState(false)
  const [bookingNote, setBookingNote] = useState('')
  const [bookingSlot, setBookingSlot] = useState(defaultSlot())
  const [bookingBusy, setBookingBusy] = useState(false)

  interface DetailPayload {
    property: PropertyItem | null
    project: ProjectItem | null
    saleListing: SaleListingItem | null
    peerAvg: number | null
  }

  // 房源详情 + 在售挂牌 + 同小区均价：缓存优先（同步读 storage 秒开），后台刷新
  const { data: payload, loading, refresh } = useSwrCache<DetailPayload>({
    key: `tenant:property-detail:${propertyId ?? 'none'}`,
    fetcher: async (): Promise<DetailPayload> => {
      if (!propertyId) {
        return { property: null, project: null, saleListing: null, peerAvg: null }
      }
      const raw = await request<any>({ url: `/properties/${propertyId}`, method: 'GET' })
      const data = toBody(raw) as PropertyItem | null
      const projectId = data?.project_id
      const results = await Promise.allSettled([
        projectId ? request<any>({ url: `/projects/${projectId}`, method: 'GET' }) : Promise.resolve(null),
        saleListingApi.list({ page: 1, page_size: 100 }),
        projectId
          ? request<any>({ url: `/properties?project_id=${projectId}&page=1&page_size=100`, method: 'GET' })
          : Promise.resolve(null)
      ])

      const [projRes, saleRes, peerRes] = results

      let project: ProjectItem | null = null
      if (projRes.status === 'fulfilled' && projRes.value) {
        project = toBody(projRes.value) as ProjectItem
      }

      let saleListing: SaleListingItem | null = null
      if (saleRes.status === 'fulfilled') {
        const list = pickList(toBody(saleRes.value)) as SaleListingItem[]
        saleListing = list.find((s) => String(s.property_id) === String(propertyId)) || null
      }

      let peerAvg: number | null = null
      if (peerRes.status === 'fulfilled' && peerRes.value) {
        const peers = pickList(toBody(peerRes.value)) as PropertyItem[]
        const rents = peers
          .filter((p) => String(p.id) !== String(propertyId))
          .map((p) => Number(p.monthly_rent || 0))
          .filter((n) => n > 0)
        peerAvg = rents.length >= 2 ? rents.reduce((a, b) => a + b, 0) / rents.length : null
      }

      return { property: data, project, saleListing, peerAvg }
    },
  })
  const property = payload?.property ?? null
  const project = payload?.project ?? null
  const saleListing = payload?.saleListing ?? null
  const peerAvg = payload?.peerAvg ?? null

  const photos = useMemo(
    () => (property?.photos || []).map(photoUrl).filter(Boolean),
    [property]
  )

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
    if (propertyId) {
      favoritesApi.status(String(propertyId)).then((res: any) => {
        const body = toBody(res)
        setFav(!!(body as any)?.favorited)
      }).catch(() => undefined)
    }
  })

  const title = useMemo(() => {
    const parts = [property?.project_name, property?.building, property?.room_number].filter(Boolean)
    return parts.length ? parts.join(' ') : property?.address || t('prop.detailTitle')
  }, [property])

  useEffect(() => {
    if (title) Taro.setNavigationBarTitle({ title })
  }, [title])

  const facts = useMemo(() => {
    const typeLabel = TYPE_LABELS[property?.property_type || ''] || '—'
    const layout =
      property?.bedrooms || property?.bathrooms
        ? t('tpd.layoutRooms', { bed: property?.bedrooms || 0, bath: property?.bathrooms || 0 })
        : '—'
    return [
      { value: property?.size_sqm ? `${property.size_sqm}㎡` : '—', label: t('tpd.factArea') },
      { value: layout, label: t('prop.filterLayout') },
      { value: property?.floor ? t('tpd.floorN', { n: property.floor }) : '—', label: t('tpd.factFloor') },
      { value: typeLabel, label: t('tpd.factType') },
      { value: property?.furnished ? t('tpd.furnishedAll') : t('prop.furnishedNo'), label: t('tpd.factFurniture') }
    ]
  }, [property])

  const chips = useMemo(() => {
    const p = property
    const list: string[] = []
    if (p?.property_type && TYPE_LABELS[p.property_type]) list.push(TYPE_LABELS[p.property_type])
    if (p?.furnished) list.push(t('tpd.furnishedAll'))
    if (p?.deposit_months) list.push(t('tpd.depositMonths', { n: p.deposit_months }))
    if (p?.available_from) list.push(t('tpd.availableFrom', { d: formatDay(p.available_from, t) }))
    if (p?.video_url) list.push(t('prop.videoTag'))
    if (p?.status === 'vacant') list.push(t('tpd.viewAnytime'))
    Object.entries(project?.amenities || {}).forEach(([key, value]) => {
      if (!value) return
      list.push(typeof value === 'string' ? value : key)
    })
    return list.slice(0, 12)
  }, [property, project])

  const pois = useMemo(() => {
    const list: { name: string; meta: string }[] = []
    if (project?.nearest_subway) list.push({ name: t('tpd.poiMetro'), meta: project.nearest_subway })
    const location = [project?.city, project?.district].filter(Boolean).join(' · ')
    const addr = location || project?.address || property?.address
    if (addr) list.push({ name: t('tpd.poiArea'), meta: addr })
    if (project?.property_management_company) {
      list.push({ name: t('tpd.poiMgmt'), meta: project.property_management_company })
    }
    if (project?.developer) list.push({ name: t('pub.developer'), meta: project.developer })
    return list
  }, [project, property])

  const benchmark = useMemo(() => {
    const rent = Number(property?.monthly_rent || 0)
    if (!rent || !peerAvg) return ''
    const diff = Math.round(((rent - peerAvg) / peerAvg) * 100)
    if (diff === 0)
      return t('tpd.benchmarkEqual', { v: `${formatMoney(peerAvg, property?.currency)}/月` })
    return t('tpd.benchmarkDiff', {
      v: `${formatMoney(peerAvg, property?.currency)}/月`,
      dir: diff > 0 ? t('tpd.above') : t('tpd.below'),
      p: Math.abs(diff)
    })
  }, [property, peerAvg])

  const salePrice = Number(saleListing?.asking_price || 0)
  const unitPrice = salePrice && property?.size_sqm ? salePrice / Number(property.size_sqm) : 0
  const loanAmount = salePrice ? salePrice * (1 - DOWN_PAYMENT_RATIO) : 0

  const monthlyPayment = useMemo(() => {
    const rate = Number(rateInput)
    if (!loanAmount || !rate) return 0
    const r = rate / 100 / 12
    const months = LOAN_YEARS * 12
    return (loanAmount * r) / (1 - Math.pow(1 + r, -months))
  }, [loanAmount, rateInput])

  const handleToggleFavorite = async () => {
    const pid = String(propertyId)
    const next = !fav
    setFav(next)
    try {
      if (next) await favoritesApi.add(pid)
      else await favoritesApi.remove(pid)
      Taro.showToast({ title: next ? t('prop.favOn') : t('tpd.favRemoved'), icon: 'none' })
    } catch (error) {
      console.error('[PropertyDetail] 收藏切换失败', error)
      setFav(!next)
      Taro.showToast({ title: t('common.opFailed'), icon: 'none' })
    }
  }

  // 预约看房：展开表单（此前只弹「暂未开放」，与员工端「预约带看」已有能力不一致）
  const goBooking = () => {
    if (!useAuthStore.getState().token) {
      Taro.showToast({ title: t('tpd.loginFirst'), icon: 'none' })
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 600)
      return
    }
    setBookingNote('')
    setBookingSlot(defaultSlot())
    setShowBooking((s) => !s)
  }

  const submitBooking = async () => {
    if (!propertyId) return
    setBookingBusy(true)
    try {
      await viewingsApi.create({
        property_id: propertyId,
        scheduled_at: `${bookingSlot.date}T${bookingSlot.time}:00`,
        notes: bookingNote.trim() || undefined
      })
      Taro.showToast({ title: t('tpd.bookOk'), icon: 'success' })
      setShowBooking(false)
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('prop.bookingFailed'), icon: 'none' })
    } finally {
      setBookingBusy(false)
    }
  }

  const pickPhoto = (index: number) => setPhotoIndex(index)

  if (!loading && !property) {
    return (
      <View className='tenant-property-detail-page'>
        <View className='empty-state'>
          <View className='empty-state__icon icon-svg' style={iconStyle('home', 80)} />
          <Text>{t('pub.listingNotFound')}</Text>
        </View>
      </View>
    )
  }

  const statusText = STATUS_LABELS[property?.status || ''] || ''

  return (
    <View className='tenant-property-detail-page'>
      <ScrollView scrollY className='detail-scroll'>
        <View className='detail-wrap'>
          {/* 1 图片轮播 */}
          <View className='detail-card detail-card--pad0'>
            <View className='gallery-stage'>
              {photos.length ? (
                <Image
                  className='gallery-img'
                  src={photos[Math.min(photoIndex, photos.length - 1)]}
                  mode='aspectFill'
                />
              ) : (
                <View className='gallery-ph'>
                  <View className='icon-svg icon-svg--lg' style={{ backgroundImage: `url("${ICONS.home}")` }} />
                  <Text className='gallery-ph__text'>{t('tpd.noPhotos')}</Text>
                </View>
              )}
              {photos.length > 0 && (
                <Text className='gallery-count'>{`${photoIndex + 1}/${photos.length}`}</Text>
              )}
              {!!property?.video_url && <Text className='gallery-badge'>{t('prop.videoTag')}</Text>}
            </View>
            {photos.length > 1 && (
              <ScrollView scrollX className='gallery-thumbs'>
                {photos.map((url, index) => (
                  <Image
                    key={`${url}-${index}`}
                    className={`gallery-thumb ${index === photoIndex ? 'gallery-thumb--active' : ''}`}
                    src={url}
                    mode='aspectFill'
                    lazyLoad
                    onClick={() => pickPhoto(index)}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          {/* 2 价格区（双业务） */}
          <View className='detail-card'>
            <View className='biz-tabs'>
              {(['rent', 'buy'] as const).map((key) => (
                <View
                  key={key}
                  className={`biz-tab ${biz === key ? 'biz-tab--active' : ''}`}
                  onClick={() => {
                    setBiz(key)
                    setShowLoan(false)
                  }}
                >
                  <Text>{key === 'rent' ? t('pub.typeRent') : t('pub.typeSell')}</Text>
                </View>
              ))}
            </View>

            {biz === 'rent' ? (
              <View className='biz-pane'>
                <View className='price-row'>
                  <View className='price-main'>
                    <Text className='price-value'>
                      {formatMoney(property?.monthly_rent, property?.currency)}
                      <Text className='price-unit'>{t('pub.perMonth')}</Text>
                    </Text>
                  </View>
                  {!!statusText && (
                    <Text className={`price-badge ${property?.status === 'vacant' ? '' : 'price-badge--muted'}`}>
                      {statusText}
                    </Text>
                  )}
                </View>
                {!!chips.length && (
                  <View className='price-tags'>
                    {chips.slice(0, 4).map((c) => (
                      <Text key={c} className='tag tag--primary'>{c}</Text>
                    ))}
                  </View>
                )}
                <Text className='price-name'>{title}</Text>
                <Text className='price-addr'>
                  {[project?.city, project?.district].filter(Boolean).join(' · ') ||
                    property?.address ||
                    t('prop.noAddress')}
                </Text>
                {!!property?.deposit_amount && (
                  <Text className='price-extra'>
                    {t('prop.depositLabel')} {formatMoney(property.deposit_amount, property.currency)}
                    {property?.deposit_months ? t('prop.depositMonthsSuffix', { n: property.deposit_months }) : ''}
                  </Text>
                )}
              </View>
            ) : (
              <View className='biz-pane'>
                {saleListing && salePrice > 0 ? (
                  <>
                    <View className='price-row'>
                      <View className='price-main'>
                        <Text className='price-value'>
                          {formatMoney(salePrice, saleListing.currency || property?.currency)}
                          <Text className='price-unit'>{t('tpd.totalPrice')}</Text>
                        </Text>
                      </View>
                      <Text className='price-badge'>
                        {saleListing.status === 'sold' ? t('home.stClosed') : t('tpd.forSale')}
                      </Text>
                    </View>
                    <View className='loan-line'>
                      <Text className='loan-line__item'>{t('tpd.downPayment', { p: DOWN_PAYMENT_RATIO * 100 })}</Text>
                      <Text className='loan-line__sep'>·</Text>
                      <Text className='loan-line__item'>
                        {t('tpd.loanAmount', { v: formatMoney(loanAmount, saleListing.currency || property?.currency) })}
                      </Text>
                      <Text className='loan-line__sep'>·</Text>
                      <Text className='loan-line__item'>{t('tpd.loanYears', { n: LOAN_YEARS })}</Text>
                    </View>
                    {!!unitPrice && (
                      <Text className='price-extra'>
                        {t('tpd.unitPrice', { v: formatMoney(Math.round(unitPrice), saleListing.currency || property?.currency) })}
                      </Text>
                    )}
                    {showLoan && (
                      <View className='loan-box'>
                        <View className='loan-input'>
                          <Input
                            className='loan-input__field'
                            type='digit'
                            value={rateInput}
                            placeholder={t('tpd.ratePlaceholder')}
                            placeholderStyle='color:#98a1ab'
                            onInput={(e: any) => setRateInput(e.detail.value)}
                          />
                          <Text className='loan-input__unit'>%</Text>
                        </View>
                        <Text className='loan-result'>
                          {monthlyPayment
                            ? t('tpd.monthlyPayment', {
                                v: `${formatMoney(Math.round(monthlyPayment), saleListing.currency || property?.currency)}/月`
                              })
                            : t('tpd.monthlyPaymentHint')}
                        </Text>
                      </View>
                    )}
                    <Text className='price-name'>{title}</Text>
                    <Text className='price-addr'>
                      {[project?.city, project?.district].filter(Boolean).join(' · ') ||
                        property?.address ||
                        t('prop.noAddress')}
                    </Text>
                  </>
                ) : (
                  <View className='biz-empty'>
                    <Text>{t('tpd.notForSale')}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* 3 核心信息 */}
          <View className='detail-card'>
            <Text className='detail-title'>{t('tpd.coreInfo')}</Text>
            <View className='facts-grid'>
              {facts.map((f) => (
                <View key={f.label} className='fact'>
                  <Text className='fact__value'>{f.value}</Text>
                  <Text className='fact__label'>{f.label}</Text>
                </View>
              ))}
            </View>
            {!!benchmark && <Text className='benchmark'>{benchmark}</Text>}
          </View>

          {/* 4 房源卖点与基础配套 */}
          <View className='detail-card'>
            <Text className='detail-title'>{t('tpd.highlights')}</Text>
            {chips.length ? (
              <View className='chips'>
                {chips.map((c) => (
                  <Text key={c} className='chip'>{c}</Text>
                ))}
              </View>
            ) : (
              <View className='empty-state'>
                <Text>{t('tpd.noHighlights')}</Text>
              </View>
            )}
          </View>

          {/* 5 位置与周边 */}
          <View className='detail-card'>
            <Text className='detail-title'>{t('tpd.location')}</Text>
            <View className='map-canvas'>
              <View className='icon-svg icon-svg--lg' style={{ backgroundImage: `url("${ICONS.home}")` }} />
              <Text className='map-pin-label'>{project?.name || property?.address || t('tpd.locationPending')}</Text>
            </View>
            {pois.length ? (
              <View className='pois'>
                {pois.map((poi) => (
                  <View key={poi.name} className='poi'>
                    <Text className='poi__name'>{poi.name}</Text>
                    <Text className='poi__meta'>{poi.meta}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View className='empty-state'>
                <Text>{t('tpd.noPois')}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* 底部固定操作栏 */}
      <View className='detail-bar'>
        <View className='detail-bar__fav' onClick={handleToggleFavorite}>
          <View
            className='icon-svg'
            style={{ backgroundImage: `url("${fav ? ICONS.heartFill : ICONS.heart}")` }}
          />
          <Text className='detail-bar__fav-text'>{fav ? t('prop.favOn') : t('prop.fav')}</Text>
        </View>
        {biz === 'buy' && salePrice > 0 && (
          <View className='detail-bar__loan' onClick={() => setShowLoan((s) => !s)}>
            <Text>{t('tpd.calcLoan')}</Text>
          </View>
        )}
        <View className='detail-bar__book' onClick={goBooking}>
          <Text>{t('tpd.bookNow')}</Text>
        </View>
      </View>

      {/* 预约看房表单（真实写接口 POST /viewings） */}
      {showBooking && (
        <View className='book-mask' onClick={() => setShowBooking(false)}>
          <View className='book-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='book-sheet__title'>{t('tpd.bookViewing')}</Text>
            <Text className='book-sheet__sub'>{property?.project_name || property?.room_number || t('tpd.currentProperty')}</Text>
            <View className='book-sheet__pickers'>
              <Picker
                mode='date'
                value={bookingSlot.date}
                onChange={(e: any) => setBookingSlot((s) => ({ ...s, date: e.detail.value }))}
              >
                <View className='book-sheet__picker'>
                  <Text className='book-sheet__picker-text'>{bookingSlot.date}</Text>
                </View>
              </Picker>
              <Picker
                mode='time'
                value={bookingSlot.time}
                onChange={(e: any) => setBookingSlot((s) => ({ ...s, time: e.detail.value }))}
              >
                <View className='book-sheet__picker'>
                  <Text className='book-sheet__picker-text'>{bookingSlot.time}</Text>
                </View>
              </Picker>
            </View>
            <Input
              className='book-sheet__input'
              value={bookingNote}
              placeholder={t('tpd.bookNotePlaceholder')}
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => setBookingNote(e.detail.value)}
            />
            <View className='book-sheet__foot'>
              <View className='book-sheet__btn book-sheet__btn--ghost' onClick={() => setShowBooking(false)}>
                <Text>{t('common.cancel')}</Text>
              </View>
              <View
                className={`book-sheet__btn book-sheet__btn--primary${bookingBusy ? ' book-sheet__btn--disabled' : ''}`}
                onClick={() => !bookingBusy && submitBooking()}
              >
                <Text>{bookingBusy ? t('common.submitting') : t('prop.confirmBooking')}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}