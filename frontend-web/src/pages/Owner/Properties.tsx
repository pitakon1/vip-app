import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Col,
  Select,
  Spin,
  Switch,
  Upload,
  message,
} from 'antd'
import { ExclamationCircleOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { propertiesApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import '../Properties/properties.css'
import './dashboard.css'

interface OwnerProperty {
  id: string
  room_number?: string
  project_id?: string
  project_name?: string
  name?: string
  status: string
  monthly_rent?: number
  sale_price?: number
  currency?: string
  address?: string
  city?: string
  size_sqm?: number
  bedrooms?: number
  bathrooms?: number
  building?: string
  floor?: number
  property_type?: string
  furnished?: boolean
  available_from?: string
  description?: string
  photos?: string[]
  video_url?: string
  deposit_amount?: number
  deposit_months?: number
  [key: string]: any
}

const PAGE_SIZE = 10

// 卡片 banner 纯色主题（对齐管理员端 rent-prop-card；禁用渐变）
const BANNER_COLORS = ['var(--rent-primary)', 'var(--rent-accent)', 'var(--state-success)']

const bannerColorFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) {
    h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  }
  return BANNER_COLORS[h % BANNER_COLORS.length]
}

const formatRent = (v: any) => Number(v || 0).toLocaleString()

const statusLabelMap: Record<string, string> = {
  vacant: 'ownerProperties.stVacant',
  rented: 'ownerProperties.stRented',
  maintenance: 'ownerProperties.stMaintenance',
  reserved: 'ownerProperties.stReserved',
}

const propertyTypeMap: Record<string, string> = {
  apartment: 'ownerProperties.typeApartment',
  condo: 'ownerProperties.typeApartment',
  villa: 'ownerProperties.typeVilla',
  house: 'ownerProperties.typeHouse',
  shop: 'ownerProperties.typeShop',
  commercial: 'ownerProperties.typeCommercial',
  office: 'ownerProperties.typeOffice',
}

const Properties = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const propsQueryKey: string[] = ['owner-properties', 'list', uid]

  const q = useCachedQuery<OwnerProperty[]>({
    queryKey: propsQueryKey,
    cacheKey: `owner-properties:list:${uid}`,
    queryFn: async () => {
      try {
        const res = await api.get('/owners/me/properties')
        const payload = res.data?.data ?? res.data
        return payload?.items ?? []
      } catch (err: any) {
        message.error(err?.response?.data?.message || t('ownerProperties.errFetch'))
        return []
      }
    },
  })
  const allItems = q.data ?? []
  const loading = q.isPending && !q.data
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  // 筛选参数
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  // 房间数：''=不限, '0'=单间, '1'/'2'/'3'=精确居室, '4'=4室及以上
  const [bedrooms, setBedrooms] = useState('')
  // 价格区间：''=不限, 预设区间 key（如 '5000-10000'/'50000+'）, 'custom'=自定义
  const [priceRange, setPriceRange] = useState('')
  const [priceCustomMin, setPriceCustomMin] = useState('')
  const [priceCustomMax, setPriceCustomMax] = useState('')
  // 面积区间：''=不限, 预设区间 key（如 '50-100'/'200+'）, 'custom'=自定义
  const [areaRange, setAreaRange] = useState('')
  const [areaCustomMin, setAreaCustomMin] = useState('')
  const [areaCustomMax, setAreaCustomMax] = useState('')
  const [sort, setSort] = useState('created')
  const [page, setPage] = useState(1)

  // 新增/编辑弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<OwnerProperty | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  // 照片 url 列表（仅编辑态可上传；随 handleSubmit 一并提交）
  const [photos, setPhotos] = useState<string[]>([])
  // 打开编辑时的基线照片（取消时回滚会话内新增的照片）
  const [basePhotos, setBasePhotos] = useState<string[]>([])
  const sessionUploadsRef = useRef<string[]>([])

  // 统计（名下房源 / 在租 / 空置 / 在售）
  const statusCount = useMemo(() => {
    const count = { vacant: 0, rented: 0, for_sale: 0 }
    allItems.forEach((p) => {
      const s = String(p.status || '').toLowerCase()
      if (s === 'vacant' || s === 'available') count.vacant += 1
      else if (s === 'for_sale' || s === 'on_sale' || s === 'sale') count.for_sale += 1
      else if (s === 'rented' || s === 'active') count.rented += 1
    })
    return count
  }, [allItems])

  const totalProps = allItems.length
  const occupancyPct = totalProps > 0 ? Math.round((statusCount.rented / totalProps) * 100) : 0

  // 前端筛选 + 排序（客户端过滤，与管理员端一致）
  const filteredItems = useMemo(() => {
    let list = [...allItems]
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      list = list.filter((it: any) =>
        [it.room_number, it.address, it.building]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw))
      )
    }
    if (status) {
      list = list.filter((it: any) => (it.status || 'vacant').toLowerCase() === status)
    }
    // 房型：'0'=单间, '1'/'2'/'3' 精确, '4'=≥4
    if (bedrooms !== '') {
      const n = Number(bedrooms)
      if (bedrooms === '4') {
        list = list.filter((it: any) => Number(it.bedrooms || 0) >= 4)
      } else {
        list = list.filter((it: any) => Number(it.bedrooms || 0) === n)
      }
    }
    // 价格区间：预设区间 or 自定义
    {
      let pMin = 0, pMax = Infinity
      if (priceRange === 'custom') {
        if (priceCustomMin) { const mn = Number(priceCustomMin); if (!Number.isNaN(mn)) pMin = mn }
        if (priceCustomMax) { const mx = Number(priceCustomMax); if (!Number.isNaN(mx)) pMax = mx }
      } else if (priceRange) {
        if (priceRange.endsWith('+')) {
          const mn = Number(priceRange.slice(0, -1))
          if (!Number.isNaN(mn)) pMin = mn
        } else {
          const [mn, mx] = priceRange.split('-').map(Number)
          if (!Number.isNaN(mn)) pMin = mn
          if (!Number.isNaN(mx)) pMax = mx
        }
      }
      list = list.filter((it: any) => {
        const r = Number(it.monthly_rent || 0)
        return r >= pMin && r <= pMax
      })
    }
    // 面积区间：预设区间 or 自定义
    {
      let aMin = 0, aMax = Infinity
      if (areaRange === 'custom') {
        if (areaCustomMin) { const mn = Number(areaCustomMin); if (!Number.isNaN(mn) && mn > 0) aMin = mn }
        if (areaCustomMax) { const mx = Number(areaCustomMax); if (!Number.isNaN(mx) && mx > 0) aMax = mx }
      } else if (areaRange) {
        if (areaRange.endsWith('+')) {
          const mn = Number(areaRange.slice(0, -1))
          if (!Number.isNaN(mn)) aMin = mn
        } else {
          const [mn, mx] = areaRange.split('-').map(Number)
          if (!Number.isNaN(mn)) aMin = mn
          if (!Number.isNaN(mx)) aMax = mx
        }
      }
      list = list.filter((it: any) => {
        const s = Number(it.size_sqm || 0)
        return s >= aMin && s <= aMax
      })
    }
    switch (sort) {
      case 'rent-asc': list.sort((a: any, b: any) => a.monthly_rent - b.monthly_rent); break
      case 'rent-desc': list.sort((a: any, b: any) => b.monthly_rent - a.monthly_rent); break
      case 'created':
      default:
        list.sort((a: any, b: any) => dayjs(b.created_at || 0).valueOf() - dayjs(a.created_at || 0).valueOf())
        break
    }
    return list
  }, [allItems, keyword, status, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort])

  useEffect(() => { setPage(1) }, [keyword, status, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort])

  const total = filteredItems.length
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

  // 分页页码（对齐管理员端 rent-pagination 结构）
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageNumbers: (number | string)[] = useMemo(() => {
    const nums: (number | string)[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i)
    } else {
      nums.push(1)
      if (page > 4) nums.push('prev-ellipsis')
      const start = Math.max(2, page - 1)
      const end = Math.min(totalPages - 1, page + 1)
      for (let i = start; i <= end; i++) nums.push(i)
      if (page < totalPages - 3) nums.push('next-ellipsis')
      nums.push(totalPages)
    }
    return nums
  }, [page, totalPages])

  // ==================== CRUD ====================

  const openCreate = () => {
    setEditingId(null)
    setEditingRecord(null)
    setBasePhotos([])
    setPhotos([])
    setModalOpen(true)
  }

  const openEdit = (record: OwnerProperty) => {
    setEditingId(String(record.id))
    setEditingRecord(record)
    setBasePhotos(record.photos || [])
    setPhotos(record.photos || [])
    setModalOpen(true)
  }

  // 取消编辑：回滚本次会话新上传的照片（仅删除会话内新增、不属于基线的），保持服务端与展示一致
  const handleCancel = () => {
    const toRemove = sessionUploadsRef.current.filter((u) => !basePhotos.includes(u))
    if (editingId && toRemove.length) {
      toRemove.forEach((u) => {
        propertiesApi.deletePhoto(editingId!, u).catch(() => {})
      })
    }
    sessionUploadsRef.current = []
    setPhotos(basePhotos)
    setModalOpen(false)
  }

  // 编辑态回填（Modal destroyOnClose 每次重建，Form 挂载后写入）
  useEffect(() => {
    if (!modalOpen || !editingRecord) return
    form.setFieldsValue({
      room_number: editingRecord.room_number,
      building: editingRecord.building ?? undefined,
      floor: editingRecord.floor ?? undefined,
      address: editingRecord.address || undefined,
      property_type: editingRecord.property_type || undefined,
      currency: editingRecord.currency || 'THB',
      monthly_rent: editingRecord.monthly_rent,
      deposit_amount: editingRecord.deposit_amount ?? 0,
      deposit_months: editingRecord.deposit_months ?? 2,
      size_sqm: editingRecord.size_sqm ?? undefined,
      bedrooms: editingRecord.bedrooms ?? undefined,
      bathrooms: editingRecord.bathrooms ?? undefined,
      status: editingRecord.status || 'vacant',
      available_from: typeof editingRecord.available_from === 'string' ? editingRecord.available_from.slice(0, 10) : undefined,
      furnished: editingRecord.furnished ?? false,
      description: editingRecord.description || undefined,
      video_url: editingRecord.video_url || undefined,
    })
  }, [modalOpen, editingRecord, form])

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('ownerProperties.deleteTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('ownerProperties.deleteContent'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await propertiesApi.delete(String(id))
          message.success(t('ownerProperties.msgDeleted'))
          queryClient.setQueryData<OwnerProperty[]>(propsQueryKey, (old) =>
            (old ?? []).filter((p) => String(p.id) !== String(id)),
          )
        } catch (err: any) {
          message.error(err?.response?.data?.detail || t('ownerProperties.errDeleteFailed'))
        }
      },
    })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      // 照片仅在编辑态存在；构建提交载荷时按 editingId 合并照片 url 列表
      const payload = editingId ? { ...values, photos } : values
      if (editingId) {
        await propertiesApi.update(editingId, payload)
        message.success(t('ownerProperties.msgUpdated'))
      } else {
        await propertiesApi.create(payload)
        message.success(t('ownerProperties.msgCreated'))
      }
      setModalOpen(false)
      refresh()
    } catch (err: any) {
      if (err?.errorFields) return
      const detail = err?.response?.data?.detail
      message.error(typeof detail === 'string' && detail ? detail : err?.response?.data?.message || t('ownerProperties.errSaveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  // ==================== 照片上传/删除（仅编辑态） ====================

  const uploadPhoto = async (file: File) => {
    if (!editingId) { message.warning(t('ownerProperties.warnSaveFirst')); return }
    try {
      const res = await propertiesApi.uploadPhotos(editingId, [file])
      const d = res.data?.data ?? res.data
      const next = Array.isArray(d?.photos) ? d.photos : []
      setPhotos((prev) => {
        const added = next.filter((u: string) => !prev.includes(u))
        sessionUploadsRef.current.push(...added)
        return next
      })
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('ownerProperties.errPhotoUpload'))
    }
  }

  const removePhoto = async (url: string) => {
    if (!editingId) return
    try {
      const res = await propertiesApi.deletePhoto(editingId, url)
      const d = res.data?.data ?? res.data
      setPhotos(Array.isArray(d?.photos) ? d.photos : [])
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('ownerProperties.errPhotoDelete'))
    }
  }

  const photoFileList = photos.map((url, idx) => ({
    uid: `photo-${idx}`,
    name: url.split('/').pop() || `photo-${idx}`,
    status: 'done' as const,
    url,
  }))

  // ==================== 列表项渲染 ====================

  const renderListItem = (item: OwnerProperty) => {
    const title = item.name || (item.project_name ? `${item.project_name} · ${item.room_number || ''}` : (item.room_number || item.address || '—'))
    const ptype = propertyTypeMap[item.property_type || ''] || item.property_type || 'ownerProperties.typeApartment'
    const statusKey = (item.status || 'vacant').toLowerCase()
    const beds = Number(item.bedrooms || 0)
    const baths = Number(item.bathrooms || 0)
    const size = Number(item.size_sqm || 0)
    const rent = Number(item.monthly_rent || 0)
    const seed = String(item.id || item.room_number || '')
    const curSymbol = item.currency === 'USD' ? '$' : item.currency === 'CNY' ? '¥' : '฿'

    const statusTone =
      statusKey === 'rented' ? 'success'
      : statusKey === 'vacant' ? 'warning'
      : statusKey === 'maintenance' ? 'info'
      : statusKey === 'reserved' ? 'warning'
      : 'neutral'

    return (
      <div
        className="rent-card rent-prop-card"
        key={item.id}
        onClick={() => navigate(`/properties/detail/${item.id}`)}
      >
        {/* 头部纯色 banner + 类型角标 */}
        <div className="rent-prop-card__banner" style={{ background: bannerColorFor(seed) }}>
          <span className="rent-prop-card__type-badge">{t(ptype)}</span>
        </div>

        {/* 主体 */}
        <div className="rent-prop-card__body">
          <h3 className="rent-prop-card__name">{title}</h3>
          <p className="rent-prop-card__address">{item.address || '—'}</p>
          <div className="rent-prop-card__stats">
            <span className="rent-prop-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              {size}㎡
            </span>
            <span className="rent-prop-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8V6a2 2 0 0 1 2-2h4"/></svg>
              {beds} {t('ownerProperties.unitBedroom')}
            </span>
            <span className="rent-prop-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/><path d="M2 12h20v3a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="7" y1="19" x2="7" y2="22"/><line x1="17" y1="19" x2="17" y2="22"/></svg>
              {baths} {t('ownerProperties.unitBath')}
            </span>
          </div>
          <div className="rent-prop-card__rent-row">
            <span className="rent-prop-card__rent">{curSymbol}{formatRent(rent)}<span className="rent-prop-card__rent-unit">{t('ownerProperties.perMonth')}</span></span>
            <span className={`rent-badge rent-badge--${statusTone}`}>
              {t(statusLabelMap[statusKey] || item.status)}
            </span>
          </div>
        </div>

        {/* 卡片底部操作：查看详情 / 委托挂牌 / 编辑 / 删除 */}
        <div className="rent-card__footer rent-prop-card__footer">
          <a
            className="rent-btn rent-btn--ghost rent-btn--sm"
            onClick={(e) => { e.stopPropagation(); navigate(`/properties/detail/${item.id}`) }}
          >
            {t('ownerProperties.viewDetail')}
          </a>
          <button
            className="rent-btn rent-btn--ghost rent-btn--sm"
            onClick={(e) => { e.stopPropagation(); navigate('/owner/marketing') }}
          >
            {t('ownerProperties.entrustListing')}
          </button>
          <button
            className="rent-btn rent-btn--secondary rent-btn--sm"
            onClick={(e) => { e.stopPropagation(); openEdit(item) }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
            {t('common.edit')}
          </button>
          <button
            className="rent-btn rent-btn--danger rent-btn--sm"
            onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            {t('common.delete')}
          </button>
        </div>
      </div>
    )
  }

  // ==================== 渲染 ====================

  return (
    <div className="rent-main">

      {/* Page Header（对齐管理员端 admin-properties） */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('ownerProperties.title')}</h2>
          <p className="rent-page-header__subtitle">{t('ownerProperties.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button type="button" className="rent-btn rent-btn--primary" onClick={() => navigate('/owner/marketing')}>
            {t('ownerProperties.entrustListing')}
          </button>
          <button type="button" className="rent-btn rent-btn--primary" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('ownerProperties.createTitle')}
          </button>
        </div>
      </div>

      {/* ===== 统计行 ===== */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__body" style={{ padding: 12 }}>
          <div className="rent-grid rent-grid--4" style={{ gap: 12 }}>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('ownerProperties.statTotal')}</div>
              <div className="rent-stat-card__value">
                {totalProps} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('ownerProperties.unitSuit')}</span>
              </div>
              <div className="rent-stat-card__delta">{statusCount.for_sale} {t('ownerProperties.onSaleSuffix')}</div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('ownerProperties.statRented')}</div>
              <div className="rent-stat-card__value">
                {statusCount.rented} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('ownerProperties.unitSuit')}</span>
              </div>
              <div className="rent-stat-card__delta rent-stat-card__delta--up">{t('ownerProperties.occupancyPrefix')} {occupancyPct}%</div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('ownerProperties.statVacant')}</div>
              <div className="rent-stat-card__value">
                {statusCount.vacant} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('ownerProperties.unitSuit')}</span>
              </div>
              <div className="rent-stat-card__delta">{t('ownerProperties.pendingList')}</div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('ownerProperties.statEntrusted')}</div>
              <div className="rent-stat-card__value">
                {statusCount.rented + statusCount.vacant}{' '}
                <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>{t('ownerProperties.unitSuit')}</span>
              </div>
              <div className="rent-stat-card__delta">{t('ownerProperties.includeOnSalePrefix')} {statusCount.for_sale} {t('ownerProperties.unitSuit')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar（对齐管理员端：搜索 + 状态 + 房型 + 价格 + 面积 + 排序） */}
      <div className="rent-filter-bar">
        <div className="rent-search rent-filter-bar__search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder={t('ownerProperties.phSearch')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <select className="rent-form-select rent-filter-bar__select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('ownerProperties.allStatus')}</option>
          <option value="rented">{t('ownerProperties.stRented')}</option>
          <option value="vacant">{t('ownerProperties.stVacant')}</option>
          <option value="maintenance">{t('ownerProperties.stMaintenance')}</option>
          <option value="reserved">{t('ownerProperties.stReserved')}</option>
        </select>
        <select className="rent-form-select rent-filter-bar__select" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)}>
          <option value="">{t('ownerProperties.allLayout')}</option>
          <option value="0">{t('ownerProperties.layoutStudio')}</option>
          <option value="1">{t('ownerProperties.layoutRoom', { n: 1 })}</option>
          <option value="2">{t('ownerProperties.layoutRoom', { n: 2 })}</option>
          <option value="3">{t('ownerProperties.layoutRoom', { n: 3 })}</option>
          <option value="4">{t('ownerProperties.layout4Plus')}</option>
        </select>
        <select className="rent-form-select rent-filter-bar__select" value={priceRange} onChange={(e) => setPriceRange(e.target.value)}>
          <option value="">{t('ownerProperties.allPrice')}</option>
          <option value="0-5000">{t('ownerProperties.priceBelow', { n: '5000' })}</option>
          <option value="5000-10000">5000-10000</option>
          <option value="10000-20000">10000-20000</option>
          <option value="20000-50000">20000-50000</option>
          <option value="50000+">{t('ownerProperties.priceAbove', { n: '50000' })}</option>
          <option value="custom">{t('ownerProperties.customPrice')}</option>
        </select>
        {priceRange === 'custom' && (
          <div className="rent-filter-bar__custom">
            <input
              className="rent-filter-bar__custom-input"
              type="number"
              min={0}
              value={priceCustomMin}
              placeholder={t('ownerProperties.phMin')}
              onChange={(e) => setPriceCustomMin(e.target.value)}
            />
            <span className="rent-filter-bar__custom-sep">-</span>
            <input
              className="rent-filter-bar__custom-input"
              type="number"
              min={0}
              value={priceCustomMax}
              placeholder={t('ownerProperties.phMax')}
              onChange={(e) => setPriceCustomMax(e.target.value)}
            />
          </div>
        )}
        <select className="rent-form-select rent-filter-bar__select" value={areaRange} onChange={(e) => setAreaRange(e.target.value)}>
          <option value="">{t('ownerProperties.allArea')}</option>
          <option value="0-50">{t('ownerProperties.areaBelow', { n: '50' })}</option>
          <option value="50-100">50-100㎡</option>
          <option value="100-200">100-200㎡</option>
          <option value="200+">{t('ownerProperties.areaAbove', { n: '200' })}</option>
          <option value="custom">{t('ownerProperties.customArea')}</option>
        </select>
        {areaRange === 'custom' && (
          <div className="rent-filter-bar__custom">
            <input
              className="rent-filter-bar__custom-input"
              type="number"
              min={0}
              value={areaCustomMin}
              placeholder={t('ownerProperties.phMinArea')}
              onChange={(e) => setAreaCustomMin(e.target.value)}
            />
            <span className="rent-filter-bar__custom-sep">-</span>
            <input
              className="rent-filter-bar__custom-input"
              type="number"
              min={0}
              value={areaCustomMax}
              placeholder={t('ownerProperties.phMaxArea')}
              onChange={(e) => setAreaCustomMax(e.target.value)}
            />
          </div>
        )}
        <select className="rent-form-select rent-filter-bar__select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="created">{t('ownerProperties.sortCreated')}</option>
          <option value="rent-asc">{t('ownerProperties.sortRentAsc')}</option>
          <option value="rent-desc">{t('ownerProperties.sortRentDesc')}</option>
        </select>
      </div>

      {/* Property Card Grid（对齐管理员端 rent-grid--auto） */}
      <Spin spinning={loading}>
        {pagedItems.length === 0 && !loading ? (
          <div className="rent-empty">
            <div className="rent-empty__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div>{t('ownerProperties.empty')}</div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={openCreate}>
                {t('ownerProperties.createTitle')}
              </button>
            </div>
          </div>
        ) : (
          <div className="rent-grid rent-grid--auto">
            {pagedItems.map((item) => renderListItem(item))}
          </div>
        )}
      </Spin>

      {/* Pagination（对齐管理员端 rent-pagination） */}
      {total > 0 && (
        <div className="rent-pagination">
          <span className="rent-pagination__info">{t('ownerProperties.totalRecords', { total })}</span>
          <button
            className="rent-pagination__btn"
            aria-label={t('ownerProperties.prevPage')}
            disabled={page <= 1}
            onClick={() => setPage(Math.max(1, page - 1))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          {pageNumbers.map((n, idx) =>
            n === 'prev-ellipsis' || n === 'next-ellipsis' ? (
              <span className="rent-pagination__info" key={idx} style={{ margin: '0 4px' }}>...</span>
            ) : (
              <button
                key={idx}
                className="rent-pagination__btn"
                data-active={page === n}
                onClick={() => setPage(Number(n))}
              >
                {n}
              </button>
            )
          )}
          <button
            className="rent-pagination__btn"
            aria-label={t('ownerProperties.nextPage')}
            disabled={page >= totalPages}
            onClick={() => setPage(Math.min(totalPages, page + 1))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      )}

      {/* 新增/编辑弹窗（对齐管理员端 Modal+Form，宽 640） */}
      <Modal
        title={editingId ? t('ownerProperties.editTitle') : t('ownerProperties.createTitle')}
        open={modalOpen}
        onCancel={handleCancel}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnClose
        width={640}
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{ currency: 'THB', status: 'vacant', furnished: false, deposit_amount: 0, deposit_months: 2 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('ownerProperties.labelRoomNo')} name="room_number" rules={[{ required: true, message: t('ownerProperties.reqRoomNo') }]}>
                <Input placeholder={t('ownerProperties.phRoomNo')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('ownerProperties.labelBuilding')} name="building">
                <Input placeholder={t('ownerProperties.phBuilding')} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelFloor')} name="floor">
                <InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('ownerProperties.phFloor')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelType')} name="property_type">
                <Select
                  placeholder={t('ownerProperties.phType')}
                  options={Object.entries(propertyTypeMap).map(([k, v]) => ({ value: k, label: t(v) }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelCurrency')} name="currency" rules={[{ required: true, message: t('ownerProperties.reqCurrency') }]}>
                <Select
                  options={[
                    { value: 'THB', label: 'THB' },
                    { value: 'USD', label: '$' },
                    { value: 'CNY', label: 'CNY' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('ownerProperties.labelAddress')} name="address" rules={[{ required: true, message: t('ownerProperties.reqAddress') }]}>
            <Input placeholder={t('ownerProperties.phAddress')} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelRent')} name="monthly_rent" rules={[{ required: true, message: t('ownerProperties.reqRent') }]}>
                <InputNumber style={{ width: '100%' }} min={0} placeholder={t('ownerProperties.phRent')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelDeposit')} name="deposit_amount">
                <InputNumber style={{ width: '100%' }} min={0} placeholder={t('ownerProperties.phDeposit')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelDepositMonths')} name="deposit_months">
                <InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('ownerProperties.phMonths')} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelSize')} name="size_sqm" rules={[{ required: true, message: t('ownerProperties.reqSize') }]}>
                <InputNumber style={{ width: '100%' }} min={0} placeholder={t('ownerProperties.phSize')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelBedrooms')} name="bedrooms">
                <InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('ownerProperties.phBedrooms')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('ownerProperties.labelBathrooms')} name="bathrooms">
                <InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('ownerProperties.phBath')} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item label={t('common.status')} name="status" rules={[{ required: true, message: t('ownerProperties.reqStatus') }]}>
                <Select
                  placeholder={t('ownerProperties.phStatus')}
                  options={Object.entries(statusLabelMap).map(([k, v]) => ({ value: k, label: t(v) }))}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label={t('ownerProperties.labelAvailableFrom')} name="available_from">
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item label={t('ownerProperties.labelFurnished')} name="furnished" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('ownerProperties.labelDescription')} name="description">
            <Input.TextArea rows={4} placeholder={t('ownerProperties.phDescription')} />
          </Form.Item>
          {editingId ? (
            <Form.Item label={t('ownerProperties.labelPhotos')}>
              <Upload
                listType="picture-card"
                fileList={photoFileList}
                accept="image/*"
                onRemove={(file) => {
                  const url = (file as any).url
                  if (url) removePhoto(url)
                  return true
                }}
                customRequest={({ file }) => { uploadPhoto(file as File) }}
              >
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>{t('ownerProperties.upload')}</div>
                </div>
              </Upload>
            </Form.Item>
          ) : null}
          <Form.Item label={t('ownerProperties.labelVideoUrl')} name="video_url">
            <Input placeholder="https://..." allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Properties
