import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  Popover,
  message,
} from 'antd'
import {
  ExclamationCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { propertiesApi, projectsApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import useAuthStore from '@/stores/auth'
import type { Project, Property } from '@/types'
import { AREA_GROUPS } from '@/data/locationArea'
import { METRO_LINES } from '@/data/locationMetro'
import './properties.css'

// ==================== 常量 ====================

// 房源卡片 banner 主题色（使用设计令牌 CSS 变量，teal 色系层次）
const BANNER_COLORS = [
  'var(--rent-primary)',
  'var(--rent-accent)',
  'var(--state-success)',
]

const bannerColorFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) {
    h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  }
  return BANNER_COLORS[h % BANNER_COLORS.length]
}

const formatRent = (v: any) => Number(v || 0).toLocaleString()

// 命中关键词：房源地址/城市/项目名/城区/区域任一包含即可（区域/地铁筛选，与租客端口径一致）
const matchLocation = (item: any, kws: string[]): boolean =>
  kws.some((k) =>
    [item.address, item.city, item.project_id, item.district, item.area]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(k))
  )

const PAGE_SIZE = 10

// ==================== 组件 ====================

const Properties = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  // 角色感知。兜底为空角色而不是 admin：user 缺失时不应解锁管理态视图
  const role = user?.role || ''
  const isManageMode = role === 'admin' || role === 'agent' || role === 'employee'

  // 数据
  const [allItems, setAllItems] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])

  // 筛选参数
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [propertyType, setPropertyType] = useState('')
  // 房间数：''=不限, '0'=单间, '1'/'2'=精确居室, '3'=3室及以上
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

  // 按区域 / 按地铁定位（与租客端 PublicListings 交互逻辑一致）
  const [locTab, setLocTab] = useState<'area' | 'metro'>('area')
  const [locOpen, setLocOpen] = useState(false)                        // 面板开合
  const [districtSel, setDistrictSel] = useState<string | null>(null) // 已选城区 key
  const [metroSel, setMetroSel] = useState<string[]>([])              // 已选站点 name（已确认）
  const [metroDraft, setMetroDraft] = useState<string[]>([])          // 站点多选草稿（确定后提交）
  const [metroLine, setMetroLine] = useState<string>(METRO_LINES[0].key)
  // 区域面板：国家 → 省市 → 城区 三级下钻（左栏只列国家，右栏先是省市列表，
  // 点省市后右栏换成它的城区）。此前国家/省市平铺在一列，混杂难找。
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country)
  const [areaDrill, setAreaDrill] = useState<string>('') // 已下钻的省市 cityKey，空 = 停在省市列表
  // 只看带视频
  const [onlyVideo, setOnlyVideo] = useState(false)

  // 已选区域/地铁的命中关键词（并入列表筛选）
  const activeLocationKw = useMemo<string[]>(() => {
    if (districtSel) {
      const node = AREA_GROUPS.flatMap((g) => g.children).find((d) => d.key === districtSel)
      return node ? node.kws : []
    }
    if (metroSel.length) {
      const lines = METRO_LINES.flatMap((l) => l.stations)
      return lines.filter((s) => metroSel.includes(s.name)).flatMap((s) => s.kws)
    }
    return []
  }, [districtSel, metroSel])

  // 定位面板：区域点击即生效且与地铁互斥；地铁为草稿多选，确定后提交
  const applyDistrict = (key: string | null) => {
    if (districtSel === key) { setDistrictSel(null); return }
    setDistrictSel(key)
    setMetroSel([])
    setMetroDraft([])
  }
  const resetLoc = () => { setDistrictSel(null); setMetroSel([]); setMetroDraft([]); setAreaDrill('') }
  const onLocOpenChange = (open: boolean) => {
    if (open) {
      setMetroDraft(metroSel)
      // 回显：已选城区时直接下钻到它所在的省市，否则停在省市列表
      if (districtSel) {
        const g = AREA_GROUPS.find((x) => x.children.some((d) => d.key === districtSel))
        if (g) { setAreaCountry(g.country); setAreaDrill(g.cityKey) }
      }
    }
    setLocOpen(open)
  }
  const toggleStation = (name: string) => {
    setMetroDraft((d) => (d.includes(name) ? d.filter((s) => s !== name) : [...d, name]))
  }
  const confirmMetro = () => {
    setMetroSel(metroDraft)
    if (metroDraft.length) setDistrictSel(null)
    setLocOpen(false)
  }
  const clearMetroDraft = () => { setMetroDraft([]); setMetroSel([]) }
  const activeLine = useMemo(() => METRO_LINES.find((l) => l.key === metroLine), [metroLine])
  // 左栏国家清单（按 AREA_GROUPS 出现顺序去重，保持业务顺序）
  const countryList = useMemo(() => Array.from(new Set(AREA_GROUPS.map((g) => g.country))), [])
  // 右栏未下钻时的数据源：当前国家下的省市
  const countryGroups = useMemo(
    () => AREA_GROUPS.filter((g) => g.country === areaCountry),
    [areaCountry],
  )
  // 右栏已下钻时的数据源：该省市的城区
  const activeAreaGroup = useMemo(
    () => AREA_GROUPS.find((g) => g.cityKey === areaDrill),
    [areaDrill],
  )

  // 弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  // 照片 url 列表（仅编辑态可上传；随 handleSubmit 一并提交）
  const [photos, setPhotos] = useState<string[]>([])

  // 项目坐标弹窗：地图找房的点位取自项目经纬度，此处在 Web 端补齐录入入口
  type CoordRow = { id: string; name: string; address: string; lat: number | null; lng: number | null }
  const [coordOpen, setCoordOpen] = useState(false)
  const [coordLoading, setCoordLoading] = useState(false)
  const [coordRows, setCoordRows] = useState<CoordRow[]>([])
  const [coordBusyId, setCoordBusyId] = useState<string | null>(null)

  // 选项
  const statusLabelMap = useMemo<Record<string, string>>(() => ({
    vacant: t('propertyStatus.vacant'),
    rented: t('propertyStatus.rented'),
    reserved: t('propertyStatus.reserved'),
    maintenance: t('propertyStatus.maintenance'),
  }), [t])

  const propertyTypeMap = useMemo<Record<string, string>>(() => ({
    apartment: t('propertyType.apartment'),
    condo: t('propertyType.condo'),
    villa: t('propertyType.villa'),
    house: t('propertyType.house'),
    shop: t('propertyType.shop'),
    commercial: t('propertyType.commercial'),
    office: t('propertyType.office'),
  }), [t])

  // 导出当前筛选条件下的房源清单（后端生成 CSV，见 /api/v1/exports/properties）
  const handleExport = async () => {
    try {
      await downloadReport(
        '/exports/properties',
        { status: status || undefined, property_type: propertyType || undefined, q: keyword.trim() || undefined },
        'properties.csv',
      )
      message.success('房源清单已导出')
    } catch {
      message.error('导出失败，请稍后重试')
    }
  }

  // 数据获取
  const fetchProjects = useCallback(async () => {
    try {
      const res = await projectsApi.list()
      const payload = res.data?.data ?? res.data
      setProjects(payload?.items ?? [])
    } catch { /* ignore */ }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await propertiesApi.list({ page: 1, pageSize: 999 } as any)
      const payload = res.data?.data ?? res.data
      setAllItems(payload?.items ?? [])
    } catch {
      setAllItems([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchProjects() }, [fetchProjects])
  useEffect(() => { fetchData() }, [fetchData])

  // ---------- 项目坐标（地图找房点位来源） ----------
  const openCoordModal = useCallback(async () => {
    setCoordOpen(true)
    setCoordLoading(true)
    try {
      const res = await projectsApi.list({ page: 1, page_size: 100 })
      const payload = res.data?.data ?? res.data
      const items: any[] = payload?.items ?? []
      setCoordRows(items.map((p) => ({
        id: p.id,
        name: p.name || '',
        address: [p.address, p.district, p.city].filter(Boolean).join(' '),
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      })))
    } catch {
      setCoordRows([])
      message.error(t('project.coordLoadFailed'))
    } finally {
      setCoordLoading(false)
    }
  }, [t])

  const patchCoordRow = (id: string, patch: Partial<CoordRow>) =>
    setCoordRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  // 调后端地理编码（未配置地图服务时后端走内置 mock），回填后仍需点保存才落库
  const handleGeocode = async (row: CoordRow) => {
    setCoordBusyId(row.id)
    try {
      const res = await projectsApi.geocode(row.id)
      const d = res.data?.data ?? res.data
      patchCoordRow(row.id, { lat: d?.lat ?? null, lng: d?.lng ?? null })
      message.success(t('project.geocodeDone'))
    } catch {
      message.error(t('project.geocodeFailed'))
    } finally {
      setCoordBusyId(null)
    }
  }

  const handleSaveCoord = async (row: CoordRow) => {
    if (row.lat === null || row.lng === null) {
      message.warning(t('project.coordRequired'))
      return
    }
    setCoordBusyId(row.id)
    try {
      await projectsApi.update(row.id, { lat: row.lat, lng: row.lng })
      message.success(t('project.coordSaved'))
    } catch {
      message.error(t('project.coordSaveFailed'))
    } finally {
      setCoordBusyId(null)
    }
  }

  // 前端筛选 + 排序
  const filteredItems = useMemo(() => {
    let list = [...allItems]
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      list = list.filter((it: any) =>
        [it.room_number, it.address, it.project_id, it.building, it.city]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw))
      )
    }
    if (status) {
      list = list.filter((it: any) => (it.status || 'vacant').toLowerCase() === status)
    }
    if (propertyType) {
      list = list.filter((it: any) => (it.property_type || '').toLowerCase() === propertyType)
    }
    // 按区域 / 按地铁：命中已选城区/站点关键词（与租客端口径一致）
    if (activeLocationKw.length) {
      list = list.filter((it: any) => matchLocation(it, activeLocationKw))
    }
    // 只看带视频
    if (onlyVideo) {
      list = list.filter((it: any) => !!it.video_url)
    }
    // 房间数（对齐后端 bedrooms_min/bedrooms_max：'0'=单间, '1'/'2'/'3' 精确, '4'=≥4）
    if (bedrooms !== '') {
      const n = Number(bedrooms)
      if (bedrooms === '4') {
        list = list.filter((it: any) => Number(it.bedrooms || 0) >= 4)
      } else {
        list = list.filter((it: any) => Number(it.bedrooms || 0) === n)
      }
    }
    // 价格区间（对齐后端 price_min/price_max）：预设区间 or 自定义
    {
      let pMin = 0, pMax = Infinity
      if (priceRange === 'custom') {
        if (priceCustomMin) { const mn = Number(priceCustomMin); if (!Number.isNaN(mn)) pMin = mn }
        if (priceCustomMax) { const mx = Number(priceCustomMax); if (!Number.isNaN(mx)) pMax = mx }
      } else if (priceRange) {
        const [mn, mx] = priceRange.split('-').map(Number)
        if (!Number.isNaN(mn)) pMin = mn
        if (!Number.isNaN(mx)) pMax = mx
      }
      list = list.filter((it: any) => {
        const r = Number(it.monthly_rent || 0)
        return r >= pMin && r <= pMax
      })
    }
    // 面积区间（对齐后端 area_min/area_max）：预设区间 or 自定义
    {
      let aMin = 0, aMax = Infinity
      if (areaRange === 'custom') {
        if (areaCustomMin) { const mn = Number(areaCustomMin); if (!Number.isNaN(mn) && mn > 0) aMin = mn }
        if (areaCustomMax) { const mx = Number(areaCustomMax); if (!Number.isNaN(mx) && mx > 0) aMax = mx }
      } else if (areaRange) {
        const [mn, mx] = areaRange.split('-').map(Number)
        if (!Number.isNaN(mn)) aMin = mn
        if (!Number.isNaN(mx)) aMax = mx
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
  }, [allItems, keyword, status, propertyType, activeLocationKw, onlyVideo, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort])

  useEffect(() => { setPage(1) }, [keyword, status, propertyType, activeLocationKw, onlyVideo, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort])

  const total = filteredItems.length
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

  // 分页页码（对齐原型 admin-properties 的 rent-pagination 结构）
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
    setPhotos([])
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: Property) => {
    setEditingId(String(record.id))
    setPhotos(record.photos || [])
    form.setFieldsValue({
      project_id: record.project_id, room_number: record.room_number,
      owner_id: record.owner_id, monthly_rent: record.monthly_rent,
      deposit_amount: record.deposit_amount, size_sqm: record.size_sqm,
      bedrooms: record.bedrooms, bathrooms: record.bathrooms, status: record.status,
      address: record.address || undefined,
      building: record.building ?? undefined,
      floor: record.floor ?? undefined,
      property_type: record.property_type || undefined,
      currency: record.currency || 'THB',
      deposit_months: record.deposit_months ?? undefined,
      furnished: record.furnished ?? false,
      available_from: record.available_from || record.available_date || undefined,
      description: record.description || undefined,
      photos: record.photos || [],
      video_url: record.video_url || undefined,
    })
    setModalOpen(true)
  }

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('property.deleteConfirm'),
      icon: <ExclamationCircleOutlined />,
      content: t('property.deleteWarning'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await propertiesApi.delete(String(id))
          message.success(t('property.deleteSuccess'))
          fetchData()
        } catch (err: any) {
          message.error(err?.response?.data?.message || t('property.deleteFailed'))
        }
      },
    })
  }

  // 上架/下架已废弃：删除即下架（前端不再调用 listing_status 更新）

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      // 照片仅在编辑态存在；构建提交载荷时按 editingId 合并照片 url 列表
      const payload = editingId ? { ...values, photos } : values
      if (editingId) { await propertiesApi.update(editingId, payload); message.success(t('property.updateSuccess')) }
      else { await propertiesApi.create(payload); message.success(t('property.createSuccess')) }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || t('property.saveFailed'))
    } finally { setSubmitting(false) }
  }

  // ==================== 照片上传/删除 ====================

  const uploadPhoto = async (file: File) => {
    if (!editingId) { message.warning(t('property.saveFirst')); return }
    try {
      const res = await propertiesApi.uploadPhotos(editingId, [file])
      const d = res.data?.data ?? res.data
      setPhotos(Array.isArray(d?.photos) ? d.photos : [])
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('property.uploadFailed'))
    }
  }

  const removePhoto = async (url: string) => {
    if (!editingId) return
    try {
      const res = await propertiesApi.deletePhoto(editingId, url)
      const d = res.data?.data ?? res.data
      setPhotos(Array.isArray(d?.photos) ? d.photos : [])
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('property.deletePhotoFailed'))
    }
  }

  const photoFileList = photos.map((url, idx) => ({
    uid: `photo-${idx}`,
    name: url.split('/').pop() || `photo-${idx}`,
    status: 'done' as const,
    url,
  }))

  // ==================== 列表项渲染 ====================

  const renderListItem = (item: any) => {
    const projectName = item.project_id || item.building || ''
    const title = projectName ? `${projectName} · ${item.room_number || ''}` : (item.address || item.room_number || '—')
    const ptype = propertyTypeMap[item.property_type] || item.property_type || t('propertyType.apartment')
    const statusKey = (item.status || 'vacant').toLowerCase()
    const beds = Number(item.bedrooms || 0)
    const baths = Number(item.bathrooms || 0)
    const size = Number(item.size_sqm || 0)
    const rent = Number(item.monthly_rent || 0)
    const seed = String(item.id || item.room_number || '')

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
        {/* 头部渐变 + 类型角标 */}
        <div className="rent-prop-card__banner" style={{ background: bannerColorFor(seed) }}>
          <span className="rent-prop-card__type-badge">{ptype}</span>
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
              {beds} 卧
            </span>
            <span className="rent-prop-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/><path d="M2 12h20v3a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="7" y1="19" x2="7" y2="22"/><line x1="17" y1="19" x2="17" y2="22"/></svg>
              {baths} 浴
            </span>
          </div>
          <div className="rent-prop-card__rent-row">
            <span className="rent-prop-card__rent">฿{formatRent(rent)}<span className="rent-prop-card__rent-unit">/月</span></span>
            <span className={`rent-badge rent-badge--${statusTone}`}>
              {statusLabelMap[statusKey] || item.status}
            </span>
          </div>
        </div>

        {/* 卡片底部操作 */}
        <div className="rent-card__footer rent-prop-card__footer">
          <a
            className="rent-btn rent-btn--ghost rent-btn--sm"
            onClick={(e) => { e.stopPropagation(); navigate(`/properties/detail/${item.id}`) }}
          >
            {t('property.viewDetail')}
          </a>
          {isManageMode && (
            <>
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
            </>
          )}
        </div>
      </div>
    )
  }

  // 定位面板图标
  const LocIcon = ({ kind }: { kind: 'area' | 'metro' }) => (
    kind === 'area'
      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="12" rx="2" /><path d="M9 8h6M6 21l1.5-3h9L18 21M8 9v2M12 9v2M16 9v2" /></svg>
  )

  // 定位面板（区域实时单选 · 地铁草稿多选，与租客端 PublicListings 一致）
  const locLabel = (() => {
    if (districtSel) {
      const node = AREA_GROUPS.flatMap((g) => g.children).find((d) => d.key === districtSel)
      return node ? node.label : '按区域'
    }
    if (metroSel.length) {
      const first = metroSel[0]
      return metroSel.length > 1 ? `${first} +${metroSel.length - 1}` : first
    }
    return '按区域'
  })()

  const locPanelContent = (
    <div className="prop-loc-panel">
      <div className="prop-loc-panel__tabs">
        {(['area', 'metro'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`prop-loc-panel__tab ${locTab === tab ? 'prop-loc-panel__tab--active' : ''}`}
            onClick={() => setLocTab(tab)}
          >
            <LocIcon kind={tab} />
            {tab === 'area' ? '按区域' : '按地铁'}
          </button>
        ))}
      </div>

      {locTab === 'area' ? (
        <div className="prop-loc-panel__area">
          <div className="prop-loc-panel__lines">
            {countryList.map((c) => (
              <button
                key={c}
                type="button"
                className={`prop-loc-panel__line ${areaCountry === c ? 'prop-loc-panel__line--active' : ''}`}
                onClick={() => { setAreaCountry(c); setAreaDrill('') }}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="prop-loc-panel__stations">
            {activeAreaGroup ? (
              <>
                <div className="prop-loc-panel__stations-head">
                  <button
                    type="button"
                    className="prop-loc-panel__back"
                    onClick={() => setAreaDrill('')}
                  >
                    ← {areaCountry}
                  </button>
                  <span className="prop-loc-panel__stations-title">{activeAreaGroup.cityLabel}</span>
                </div>
                <div className="prop-loc-panel__chips">
                  <button
                    type="button"
                    className={`prop-loc-panel__chip ${districtSel === null ? 'prop-loc-panel__chip--active' : ''}`}
                    onClick={() => applyDistrict(null)}
                  >
                    不限
                  </button>
                  {activeAreaGroup.children.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={`prop-loc-panel__chip ${districtSel === d.key ? 'prop-loc-panel__chip--active' : ''}`}
                      onClick={() => applyDistrict(d.key)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="prop-loc-panel__stations-title">{areaCountry}</div>
                <div className="prop-loc-panel__chips">
                  {countryGroups.map((g) => (
                    <button
                      key={g.cityKey}
                      type="button"
                      className={`prop-loc-panel__chip ${areaDrill === g.cityKey ? 'prop-loc-panel__chip--active' : ''}`}
                      onClick={() => setAreaDrill(g.cityKey)}
                    >
                      {g.cityLabel}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="prop-loc-panel__metro">
          <div className="prop-loc-panel__lines">
            {METRO_LINES.map((l) => (
              <button
                key={l.key}
                type="button"
                className={`prop-loc-panel__line ${metroLine === l.key ? 'prop-loc-panel__line--active' : ''}`}
                onClick={() => setMetroLine(l.key)}
              >
                {l.cityLabel} · {l.name}
              </button>
            ))}
          </div>
          <div className="prop-loc-panel__stations">
            <div className="prop-loc-panel__stations-title">{activeLine ? `${activeLine.cityLabel} · ${activeLine.name}` : ''}</div>
            <div className="prop-loc-panel__chips">
              {activeLine?.stations.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={`prop-loc-panel__chip ${metroDraft.includes(s.name) ? 'prop-loc-panel__chip--active' : ''}`}
                  onClick={() => toggleStation(s.name)}
                >
                  {s.name}
                </button>
              ))}
              {activeLine && !activeLine.stations.length && <span className="prop-loc-panel__empty">暂无</span>}
            </div>
          </div>
        </div>
      )}

      <div className="prop-loc-panel__footer">
        {locTab === 'metro' && (
          <span className="prop-loc-panel__count">已选 <strong>{metroDraft.length}</strong></span>
        )}
        <div className="prop-loc-panel__actions">
          <button
            type="button"
            className="prop-loc-panel__btn prop-loc-panel__btn--ghost"
            onClick={() => (locTab === 'metro' ? clearMetroDraft() : resetLoc())}
          >
            重置
          </button>
          <button
            type="button"
            className="prop-loc-panel__btn prop-loc-panel__btn--primary"
            onClick={() => (locTab === 'metro' ? confirmMetro() : setLocOpen(false))}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )

  // ==================== 渲染 ====================

  return (
    <div className="rent-main">

      {/* Page Header（对齐原型 admin-properties） */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('property.title')}</h2>
          <p className="rent-page-header__subtitle">{t('property.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary" onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            导出
          </button>
          {isManageMode && (
            <button className="rent-btn rent-btn--secondary" onClick={openCoordModal}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {t('project.coordEntry')}
            </button>
          )}
          <button className="rent-btn rent-btn--primary" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('property.addNew')}
          </button>
        </div>
      </div>

      {/* Filter Bar（对齐原型：搜索 + 状态 + 类型 + 排序） */}
      <div className="rent-filter-bar">
        <div className="rent-search rent-filter-bar__search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder={t('property.searchPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Popover
          trigger="click"
          open={locOpen}
          onOpenChange={onLocOpenChange}
          placement="bottomLeft"
          overlayClassName="prop-loc-popover"
          content={locPanelContent}
        >
          <button
            type="button"
            className={`prop-loc-btn ${activeLocationKw.length ? 'prop-loc-btn--active' : ''}`}
          >
            <LocIcon kind={metroSel.length ? 'metro' : 'area'} />
            {locLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </Popover>
        <select className="rent-form-select rent-filter-bar__select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="rented">{statusLabelMap.rented}</option>
          <option value="vacant">{statusLabelMap.vacant}</option>
          <option value="maintenance">{statusLabelMap.maintenance}</option>
        </select>
        <select className="rent-form-select rent-filter-bar__select" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="apartment">{propertyTypeMap.apartment}</option>
          <option value="villa">{propertyTypeMap.villa}</option>
          <option value="shop">{propertyTypeMap.shop}</option>
          <option value="office">{propertyTypeMap.office}</option>
        </select>
        <select className="rent-form-select rent-filter-bar__select" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)}>
          <option value="">不限房型</option>
          <option value="0">单间</option>
          <option value="1">1室</option>
          <option value="2">2室</option>
          <option value="3">3室</option>
          <option value="4">4室及以上</option>
        </select>
        <select className="rent-form-select rent-filter-bar__select" value={priceRange} onChange={(e) => setPriceRange(e.target.value)}>
          <option value="">不限价格</option>
          <option value="0-5000">5000以下</option>
          <option value="5000-10000">5000-10000</option>
          <option value="10000-20000">10000-20000</option>
          <option value="20000-50000">20000-50000</option>
          <option value="50000+">50000以上</option>
          <option value="custom">自定义价格</option>
        </select>
        {priceRange === 'custom' && (
          <div className="rent-filter-bar__custom">
            <input
              className="rent-filter-bar__custom-input"
              type="number"
              min={0}
              value={priceCustomMin}
              placeholder="最低"
              onChange={(e) => setPriceCustomMin(e.target.value)}
            />
            <span className="rent-filter-bar__custom-sep">-</span>
            <input
              className="rent-filter-bar__custom-input"
              type="number"
              min={0}
              value={priceCustomMax}
              placeholder="最高"
              onChange={(e) => setPriceCustomMax(e.target.value)}
            />
          </div>
        )}
        <select className="rent-form-select rent-filter-bar__select" value={areaRange} onChange={(e) => setAreaRange(e.target.value)}>
          <option value="">不限面积</option>
          <option value="0-50">50㎡以下</option>
          <option value="50-100">50-100㎡</option>
          <option value="100-200">100-200㎡</option>
          <option value="200+">200㎡以上</option>
          <option value="custom">自定义面积</option>
        </select>
        {areaRange === 'custom' && (
          <div className="rent-filter-bar__custom">
            <input
              className="rent-filter-bar__custom-input"
              type="number"
              min={0}
              value={areaCustomMin}
              placeholder="最小"
              onChange={(e) => setAreaCustomMin(e.target.value)}
            />
            <span className="rent-filter-bar__custom-sep">-</span>
            <input
              className="rent-filter-bar__custom-input"
              type="number"
              min={0}
              value={areaCustomMax}
              placeholder="最大"
              onChange={(e) => setAreaCustomMax(e.target.value)}
            />
          </div>
        )}
        <select className="rent-form-select rent-filter-bar__select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="created">最近创建</option>
          <option value="rent-asc">租金升序</option>
          <option value="rent-desc">租金降序</option>
        </select>
        <button
          type="button"
          className={`prop-video-btn ${onlyVideo ? 'prop-video-btn--active' : ''}`}
          onClick={() => setOnlyVideo((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2" /><polygon points="22 7 16 11 16 13 22 17 22 7" /></svg>
          只看带视频
        </button>
      </div>

      {/* Property Card Grid（对齐原型 rent-grid--auto） */}
      <Spin spinning={loading} tip={t('common.loading')}>
        {pagedItems.length === 0 && !loading ? (
          <div className="rent-empty">
            <div className="rent-empty__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div>{t('common.noData')}</div>
          </div>
        ) : (
          <div className="rent-grid rent-grid--auto">
            {pagedItems.map((item: any) => renderListItem(item))}
          </div>
        )}
      </Spin>

      {/* Pagination（对齐原型 rent-pagination） */}
      {total > 0 && (
        <div className="rent-pagination">
          <span className="rent-pagination__info">共 {total} 条记录</span>
          <button
            className="rent-pagination__btn"
            aria-label="上一页"
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
            aria-label="下一页"
            disabled={page >= totalPages}
            onClick={() => setPage(Math.min(totalPages, page + 1))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingId ? t('property.editProperty') : t('property.addNew')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnClose
        width={640}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('property.project')} name="project_id" rules={[{ required: true, message: t('property.projectPlaceholder') }]}>
                <Select placeholder={t('property.projectPlaceholder')} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('property.roomNumber')} name="room_number" rules={[{ required: true, message: t('property.roomNumberPlaceholder') }]}>
                <Input placeholder={t('property.roomNumberPlaceholder')} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item label={t('property.owner')} name="owner_id"><Input placeholder={t('property.ownerPlaceholder')} /></Form.Item></Col>
            <Col span={12}>
              <Form.Item label={t('property.propertyType')} name="property_type">
                <Select placeholder={t('property.propertyTypePlaceholder')} options={Object.entries(propertyTypeMap).map(([k, v]) => ({ value: k, label: v }))} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('property.address')} name="address" rules={[{ required: true, message: t('property.addressPlaceholder') }]}>
            <Input placeholder={t('property.addressPlaceholder')} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item label={t('property.building')} name="building"><InputNumber style={{ width: '100%' }} placeholder={t('property.building')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('property.floor')} name="floor"><InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('property.floor')} /></Form.Item></Col>
            <Col span={8}>
              <Form.Item label={t('property.currency')} name="currency" rules={[{ required: true, message: t('property.currency') }]}>
                <Select placeholder={t('property.currency')} options={[{ value: 'THB', label: 'THB' }, { value: 'USD', label: '$' }, { value: 'CNY', label: 'CNY' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item label={t('property.monthlyRent')} name="monthly_rent" rules={[{ required: true, message: t('property.monthlyRent') }]}><InputNumber style={{ width: '100%' }} min={0} placeholder={t('property.monthlyRent')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('property.deposit')} name="deposit_amount"><InputNumber style={{ width: '100%' }} min={0} placeholder={t('property.deposit')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('property.depositMonths')} name="deposit_months"><InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('property.depositMonths')} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item label={t('property.area')} name="size_sqm" rules={[{ required: true, message: t('property.area') }]}><InputNumber style={{ width: '100%' }} min={0} placeholder={t('property.areaPlaceholder')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('property.bedrooms')} name="bedrooms"><InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('property.bedrooms')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('property.bathrooms')} name="bathrooms"><InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('property.bathrooms')} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item label={t('common.status')} name="status" rules={[{ required: true, message: t('property.statusPlaceholder') }]}>
                <Select placeholder={t('property.statusPlaceholder')} options={Object.entries(statusLabelMap).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
            </Col>
            <Col span={10}><Form.Item label={t('property.availableFrom')} name="available_from"><Input placeholder="YYYY-MM-DD" /></Form.Item></Col>
            <Col span={4}>
              <Form.Item label={t('property.furnished')} name="furnished" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('property.layout')} name="layout">
            <Input placeholder={t('property.layoutPlaceholder')} />
          </Form.Item>
          <Form.Item label={t('property.description')} name="description">
            <Input.TextArea rows={4} placeholder={t('property.descriptionPlaceholder')} />
          </Form.Item>
          {editingId ? (
            <Form.Item label={t('property.photos')}>
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
                  <div style={{ marginTop: 8 }}>{t('property.upload')}</div>
                </div>
              </Upload>
            </Form.Item>
          ) : null}
          <Form.Item label={t('property.videoUrl')} name="video_url">
            <Input placeholder={t('property.videoUrlPlaceholder')} allowClear />
          </Form.Item>
        </Form>
      </Modal>

      {/* 项目坐标：地图找房的点位取自项目经纬度，无坐标的项目不会出现在地图上 */}
      <Modal
        title={t('project.coordTitle')}
        open={coordOpen}
        onCancel={() => setCoordOpen(false)}
        footer={null}
        width={760}
      >
        <p className="coord-modal__hint">{t('project.coordHint')}</p>
        <Spin spinning={coordLoading}>
          {coordRows.length === 0 && !coordLoading ? (
            <div className="coord-modal__empty">{t('common.noData')}</div>
          ) : (
            <div className="coord-modal__list">
              {coordRows.map((row) => (
                <div key={row.id} className="coord-modal__row">
                  <div className="coord-modal__name">
                    <strong>{row.name}</strong>
                    <span>{row.address}</span>
                  </div>
                  <InputNumber
                    className="coord-modal__input"
                    placeholder={t('project.lat')}
                    value={row.lat}
                    step={0.0001}
                    onChange={(v) => patchCoordRow(row.id, { lat: v === null ? null : Number(v) })}
                  />
                  <InputNumber
                    className="coord-modal__input"
                    placeholder={t('project.lng')}
                    value={row.lng}
                    step={0.0001}
                    onChange={(v) => patchCoordRow(row.id, { lng: v === null ? null : Number(v) })}
                  />
                  <button
                    className="rent-btn rent-btn--secondary"
                    disabled={coordBusyId === row.id}
                    onClick={() => handleGeocode(row)}
                  >
                    {t('project.geocode')}
                  </button>
                  <button
                    className="rent-btn rent-btn--primary"
                    disabled={coordBusyId === row.id}
                    onClick={() => handleSaveCoord(row)}
                  >
                    {t('common.save')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Spin>
      </Modal>
    </div>
  )
}

export default Properties
