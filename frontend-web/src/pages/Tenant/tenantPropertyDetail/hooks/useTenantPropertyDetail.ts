import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { message } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { OPTION_PAGE_SIZE } from '@/lib/pagination'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { errorText } from '@/lib/errorText'
import { ICONS } from '../icons'
import { makePropertyTypeLabel, photoUrl, toBody, toItems } from '../utils'
import type { Benchmark, DetailPayload, FactItem, LoanResult, PoiItem, ProjectItem, PropertyItem, SaleListingItem } from '../types'

/** 租客房源详情：数据拉取 + 收藏 + 预约 + 贷款试算 + 描述翻译 */
export const useTenantPropertyDetail = () => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryClient = useQueryClient()

  const [biz, setBiz] = useState<'rent' | 'buy'>('rent')
  const [photoIndex, setPhotoIndex] = useState(0)
  const [favBusy, setFavBusy] = useState(false)

  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingAt, setBookingAt] = useState<dayjs.Dayjs | null>(null)
  const [bookingNote, setBookingNote] = useState('')
  const [bookingBusy, setBookingBusy] = useState(false)

  const [loanOpen, setLoanOpen] = useState(false)
  const [loanDownPct, setLoanDownPct] = useState<number>(30)
  const [loanYears, setLoanYears] = useState<number>(30)
  const [loanRate, setLoanRate] = useState<number | null>(null)

  const [translating, setTranslating] = useState(false)
  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null)
  const [transTarget, setTransTarget] = useState('zh')

  // 房源详情 + 同小区横评 + 在售挂牌：缓存优先（localStorage seed），后台刷新
  const dataQ = useCachedQuery<DetailPayload>({
    queryKey: ['tenant-property-detail', id ?? 'none'],
    cacheKey: `tenant-property-detail:${id ?? 'none'}`,
    queryFn: async (): Promise<DetailPayload> => {
      if (!id) return { detail: null, project: null, saleListing: null, peers: [] }
      const res = await api.get(`/properties/${id}`)
      const data = toBody(res) as PropertyItem | null
      const projectId = data?.project_id

      const [projRes, saleRes, peerRes] = await Promise.allSettled([
        projectId ? api.get(`/projects/${projectId}`) : Promise.resolve(null),
        api.get('/sale-listings', { params: { page: 1, page_size: OPTION_PAGE_SIZE } }),
        projectId
          ? api.get('/properties', { params: { project_id: projectId, page: 1, page_size: OPTION_PAGE_SIZE } })
          : Promise.resolve(null),
      ])

      let project: ProjectItem | null = null
      if (projRes.status === 'fulfilled' && projRes.value) {
        project = toBody(projRes.value) as ProjectItem
      }

      let saleListing: SaleListingItem | null = null
      if (saleRes.status === 'fulfilled') {
        const listings = toItems(saleRes.value) as SaleListingItem[]
        saleListing = listings.find((l) => String(l.property_id) === String(id)) || null
      }

      let peers: PropertyItem[] = []
      if (peerRes.status === 'fulfilled' && peerRes.value) {
        const items = toItems(peerRes.value) as PropertyItem[]
        peers = items.filter((p) => String(p.id) !== String(id))
      }

      return { detail: data, project, saleListing, peers }
    },
  })
  const detail = dataQ.data?.detail ?? null
  const project = dataQ.data?.project ?? null
  const saleListing = dataQ.data?.saleListing ?? null
  const peers = dataQ.data?.peers ?? []
  const loading = dataQ.isPending && !dataQ.data

  // 收藏状态：实时查询不落盘缓存，避免收藏态跨会话陈旧
  const favQ = useQuery({
    queryKey: ['tenant-property-fav', id ?? 'none', uid],
    queryFn: async () => {
      try {
        const res = await api.get(`/favorites/status/${id}`)
        return Boolean(toBody(res)?.favorited)
      } catch {
        return false
      }
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  })
  const favorited = favQ.data ?? false

  useEffect(() => {
    if (dataQ.isError && !dataQ.data) {
      message.error(t('tenantPropertyDetail.fetchFailed'))
    }
  }, [dataQ.isError, dataQ.data, t])

  useEffect(() => {
    setTranslatedDesc(null)
    setPhotoIndex(0)
    setBiz('rent')
    window.scrollTo?.({ top: 0 })
  }, [id])

  const photos = useMemo(() => {
    const raw = Array.isArray(detail?.photos) ? detail!.photos : []
    return raw.map(photoUrl).filter(Boolean) as string[]
  }, [detail])

  const currency = detail?.currency || 'THB'

  // 同小区均价横评（同项目其他房源月租金均值）
  const benchmark = useMemo<Benchmark | null>(() => {
    const rent = Number(detail?.monthly_rent || 0)
    const values = peers.map((p) => Number(p.monthly_rent || 0)).filter((v) => v > 0)
    if (!rent || values.length < 1) return null
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    if (!avg) return null
    const diff = ((avg - rent) / avg) * 100
    return {
      avg,
      pct: Math.abs(Math.round(diff)),
      lower: diff > 0,
      currency: peers[0]?.currency || currency,
    }
  }, [detail, peers, currency])

  const facts = useMemo<FactItem[]>(() => {
    const d = detail
    const propertyTypeLabel = makePropertyTypeLabel(t)
    const floorText = d?.floor
      ? d?.building
        ? t('tenantPropertyDetail.buildingFloor', { building: d.building, floor: d.floor })
        : t('tenantPropertyDetail.floorText', { floor: d.floor })
      : null
    const layoutText =
      d?.bedrooms || d?.bathrooms ? t('tenantPropertyDetail.roomBath', { bed: d?.bedrooms ?? 0, bath: d?.bathrooms ?? 0 }) : null
    return [
      { key: 'area', icon: ICONS.area, label: t('tenantPropertyDetail.badgeArea'), value: d?.size_sqm ? t('tenantPropertyDetail.areaValue', { area: d.size_sqm }) : t('tenantPropertyDetail.noValue') },
      { key: 'layout', icon: ICONS.layout, label: t('tenantPropertyDetail.badgeLayout'), value: layoutText || t('tenantPropertyDetail.noValue') },
      { key: 'floor', icon: ICONS.layers, label: t('tenantPropertyDetail.badgeFloor'), value: floorText || t('tenantPropertyDetail.noValue') },
      {
        key: 'type',
        icon: ICONS.tag,
        label: t('tenantPropertyDetail.badgeType'),
        value: propertyTypeLabel[String(d?.property_type || '')] || t('tenantPropertyDetail.noValue'),
      },
      { key: 'furniture', icon: ICONS.sofa, label: t('tenantPropertyDetail.badgeFurniture'), value: d?.furnished ? t('tenantPropertyDetail.furnitureFull') : t('tenantPropertyDetail.furnitureNone') },
    ]
  }, [detail, t])

  const chips = useMemo(() => {
    const d = detail
    if (!d) return [] as string[]
    const list: string[] = []
    const typeLabel = makePropertyTypeLabel(t)[String(d.property_type || '')]
    if (typeLabel) list.push(typeLabel)
    if (d.furnished) list.push(t('tenantPropertyDetail.chipFurniture'))
    if (d.deposit_months) list.push(t('tenantPropertyDetail.chipDeposit', { deposit: d.deposit_months }))
    if (d.available_from) {
      const dt = dayjs(d.available_from)
      if (dt.isValid()) list.push(t('tenantPropertyDetail.chipAvailable', { date: dt.format(t('tenantDashboard.monthDayFormat')) }))
    }
    if (d.video_url) list.push(t('tenantPropertyDetail.chipVideo'))
    if (d.status === 'vacant') list.push(t('tenantPropertyDetail.chipViewNow'))
    return list
  }, [detail, t])

  const pois = useMemo<PoiItem[]>(() => {
    if (!project) return []
    const list: PoiItem[] = []
    if (project.nearest_subway) {
      list.push({ key: 'subway', icon: ICONS.subway, name: project.nearest_subway, label: t('tenantPropertyDetail.poiSubway') })
    }
    const region = [project.city, project.district].filter(Boolean).join(' · ')
    if (region) {
      list.push({ key: 'region', icon: ICONS.pin, name: region, label: t('tenantPropertyDetail.poiRegion') })
    }
    if (project.property_management_company) {
      list.push({
        key: 'pm',
        icon: ICONS.users,
        name: project.property_management_company,
        label: t('tenantPropertyDetail.poiPm'),
      })
    }
    return list
  }, [project, t])

  const buyPrice = Number(saleListing?.asking_price || 0)
  const buyCurrency = saleListing?.currency || currency
  const buyDown = buyPrice * (Number(loanDownPct || 0) / 100)
  const buyLoanAmount = Math.max(buyPrice - buyDown, 0)

  const loanResult = useMemo<LoanResult | null>(() => {
    const principal = buyLoanAmount
    const months = Number(loanYears || 0) * 12
    const monthlyRate = Number(loanRate || 0) / 100 / 12
    if (!principal || months <= 0) return null
    if (monthlyRate <= 0) return { principal, months, monthly: null }
    const monthly = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
    return { principal, months, monthly }
  }, [buyLoanAmount, loanYears, loanRate])

  const handleToggleFavorite = async () => {
    if (!id || favBusy) return
    setFavBusy(true)
    const next = !favorited
    queryClient.setQueryData(['tenant-property-fav', id, uid], next)
    try {
      if (favorited) {
        await api.delete(`/favorites/${id}`)
        message.success(t('tenantPropertyDetail.unFavored'))
      } else {
        await api.post('/favorites', { property_id: id })
        message.success(t('tenantPropertyDetail.favored'))
      }
    } catch (err) {
      queryClient.setQueryData(['tenant-property-fav', id, uid], !next)
      message.error(errorText(err, t('tenantPropertyDetail.opFailed')))
    } finally {
      setFavBusy(false)
    }
  }

  const handleBooking = async () => {
    if (!id || !bookingAt) {
      message.warning(t('tenantPropertyDetail.warnViewingTime'))
      return
    }
    setBookingBusy(true)
    try {
      await api.post('/viewings', {
        property_id: id,
        scheduled_at: bookingAt.toISOString(),
        notes: bookingNote || null,
      })
      message.success(t('tenantPropertyDetail.bookedSubmitted'))
      setBookingOpen(false)
      setBookingAt(null)
      setBookingNote('')
    } catch (err) {
      message.error(errorText(err, t('tenantPropertyDetail.submitFailed')))
    } finally {
      setBookingBusy(false)
    }
  }

  const handleTranslate = async () => {
    const source = detail?.description || ''
    if (!source) {
      message.warning(t('tenantPropertyDetail.warnTranslate'))
      return
    }
    setTranslating(true)
    try {
      const res = await api.post('/translate', { text: source, target: transTarget })
      const data = res.data?.data ?? res.data
      setTranslatedDesc(data?.translated_text || source)
    } catch {
      message.error(t('tenantPropertyDetail.translateFailed'))
    } finally {
      setTranslating(false)
    }
  }

  return {
    detail,
    project,
    saleListing,
    peers,
    loading,
    photos,
    currency,
    benchmark,
    facts,
    chips,
    pois,
    biz,
    setBiz,
    photoIndex,
    setPhotoIndex,
    favorited,
    favBusy,
    handleToggleFavorite,
    bookingOpen,
    setBookingOpen,
    bookingAt,
    setBookingAt,
    bookingNote,
    setBookingNote,
    bookingBusy,
    handleBooking,
    loanOpen,
    setLoanOpen,
    loanDownPct,
    setLoanDownPct,
    loanYears,
    setLoanYears,
    loanRate,
    setLoanRate,
    buyPrice,
    buyCurrency,
    buyDown,
    buyLoanAmount,
    loanResult,
    translating,
    translatedDesc,
    setTranslatedDesc,
    transTarget,
    setTransTarget,
    handleTranslate,
  }
}
