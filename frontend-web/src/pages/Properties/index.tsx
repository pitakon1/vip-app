import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Row,
  Col,
  Select,
  Spin,
  message,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { propertiesApi, projectsApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import type { Project, Property } from '@/types'
import './properties.css'

// ==================== 常量 ====================

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
]

const gradientFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) {
    h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  }
  return GRADIENTS[h % GRADIENTS.length]
}

const formatRent = (v: any) => Number(v || 0).toLocaleString()
const formatPerSqm = (rent: number, sqm: number) => {
  const s = Number(sqm || 0)
  if (!s) return '0'
  return Math.round(Number(rent || 0) / s).toLocaleString()
}

// 确定性伪随机关注度
const attentionCount = (id: string) => {
  let h = 0
  for (let i = 0; i < (id || 'x').length; i++) {
    h = (h * 31 + (id || 'x').charCodeAt(i)) >>> 0
  }
  return h % 280
}

const PAGE_SIZE = 10

// mock 兜底数据（后端未启动时展示）
const MOCK_PROPS: Property[] = [
  { id: '1', room_number: 'A-1201', monthly_rent: 18000, currency: 'THB', size_sqm: 45, bedrooms: 1, bathrooms: 1, floor: 12, property_type: 'apartment', address: 'Sukhumvit 12, Bangkok', status: 'vacant', project_id: 'Noble Around', owner_id: '', deposit_amount: 36000, building: 'A', furnished: true },
  { id: '2', room_number: 'B-0805', monthly_rent: 25000, currency: 'THB', size_sqm: 65, bedrooms: 2, bathrooms: 2, floor: 8, property_type: 'condo', address: 'Phrom Phong, Bangkok', status: 'vacant', project_id: 'The Emporio', owner_id: '', deposit_amount: 50000, building: 'B', furnished: true },
  { id: '3', room_number: 'V-03', monthly_rent: 45000, currency: 'THB', size_sqm: 120, bedrooms: 3, bathrooms: 3, floor: 1, property_type: 'villa', address: 'Laguna, Phuket', status: 'rented', project_id: 'Laguna Village', owner_id: '', deposit_amount: 90000, building: '', furnished: true },
  { id: '4', room_number: 'C-1503', monthly_rent: 15000, currency: 'THB', size_sqm: 38, bedrooms: 1, bathrooms: 1, floor: 15, property_type: 'apartment', address: 'Pattaya Central', status: 'vacant', project_id: 'Centara Sea', owner_id: '', deposit_amount: 30000, building: 'C', furnished: false },
  { id: '5', room_number: 'D-2001', monthly_rent: 32000, currency: 'THB', size_sqm: 80, bedrooms: 2, bathrooms: 2, floor: 20, property_type: 'condo', address: 'Riverside, Chiang Mai', status: 'reserved', project_id: 'The River', owner_id: '', deposit_amount: 64000, building: 'D', furnished: true },
  { id: '6', room_number: 'E-0602', monthly_rent: 12000, currency: 'THB', size_sqm: 30, bedrooms: 1, bathrooms: 1, floor: 6, property_type: 'apartment', address: 'Hua Hin Beach', status: 'vacant', project_id: 'Baan San Pluem', owner_id: '', deposit_amount: 24000, building: 'E', furnished: true },
  { id: '7', room_number: 'F-1801', monthly_rent: 28000, currency: 'THB', size_sqm: 70, bedrooms: 2, bathrooms: 1, floor: 18, property_type: 'condo', address: 'Asoke, Bangkok', status: 'rented', project_id: 'Ashton Asoke', owner_id: '', deposit_amount: 56000, building: 'F', furnished: true },
  { id: '8', room_number: 'G-0301', monthly_rent: 38000, currency: 'THB', size_sqm: 95, bedrooms: 3, bathrooms: 2, floor: 3, property_type: 'house', address: 'Rawai, Phuket', status: 'maintenance', project_id: 'Rawai VIP', owner_id: '', deposit_amount: 76000, building: '', furnished: false },
]

// ==================== 组件 ====================

const Properties = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  // 角色感知
  const role = user?.role || 'admin'
  const isManageMode = role === 'admin' || role === 'agent' || role === 'employee'

  // 数据
  const [allItems, setAllItems] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])

  // 筛选参数
  const [keyword, setKeyword] = useState('')
  const [region, setRegion] = useState('')
  const [roomType, setRoomType] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [areaRange, setAreaRange] = useState('')
  const [sort, setSort] = useState('default')
  const [page, setPage] = useState(1)

  // 弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

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

  const regionOptions = useMemo(() => [
    { value: '', label: t('property.allRegions') },
    { value: '曼谷', label: t('region.bangkok') },
    { value: '普吉', label: t('region.phuket') },
    { value: '清迈', label: t('region.chiangMai') },
    { value: '芭提雅', label: t('region.pattaya') },
    { value: '华欣', label: t('region.huaHin') },
  ], [t])

  const roomTypeOptions = useMemo(() => [
    { value: '', label: t('property.allRoomTypes') },
    { value: '1', label: t('roomType.r1') },
    { value: '2', label: t('roomType.r2') },
    { value: '3', label: t('roomType.r3') },
    { value: '4', label: t('roomType.r4') },
  ], [t])

  const priceOptions = useMemo(() => [
    { value: '', label: t('property.allPrices') },
    { value: '0-5000', label: t('priceRange.below5k') },
    { value: '5000-10000', label: t('priceRange.r5k10k') },
    { value: '10000-20000', label: t('priceRange.r10k20k') },
    { value: '20000-50000', label: t('priceRange.r20k50k') },
    { value: '50000-99999999', label: t('priceRange.above50k') },
  ], [t])

  const areaOptions = useMemo(() => [
    { value: '', label: t('property.allAreas') },
    { value: '0-50', label: t('areaRange.below50') },
    { value: '50-100', label: t('areaRange.r50to100') },
    { value: '100-200', label: t('areaRange.r100to200') },
    { value: '200-999999', label: t('areaRange.above200') },
  ], [t])

  const sortItems = useMemo(() => [
    { value: 'default', label: t('property.defaultSort') },
    { value: 'latest', label: t('property.latest') },
    { value: 'price_asc', label: t('property.priceAsc') },
    { value: 'price_desc', label: t('property.priceDesc') },
    { value: 'area_desc', label: t('property.areaDesc') },
  ], [t])

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
    } catch (err: any) {
      // 后端未启动，使用 mock 数据展示
      setAllItems(MOCK_PROPS)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchProjects() }, [fetchProjects])
  useEffect(() => { fetchData() }, [fetchData])

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
    if (region) {
      list = list.filter((it: any) =>
        [it.city, it.address, it.project_id].filter(Boolean).some((v) => String(v).includes(region))
      )
    }
    if (roomType) {
      const n = Number(roomType)
      list = list.filter((it: any) => n >= 4 ? Number(it.bedrooms) >= 4 : Number(it.bedrooms) === n)
    }
    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number)
      list = list.filter((it: any) => { const r = Number(it.monthly_rent); return r >= min && r <= max })
    }
    if (areaRange) {
      const [min, max] = areaRange.split('-').map(Number)
      list = list.filter((it: any) => { const s = Number(it.size_sqm); return s >= min && s <= max })
    }
    switch (sort) {
      case 'price_asc': list.sort((a: any, b: any) => a.monthly_rent - b.monthly_rent); break
      case 'price_desc': list.sort((a: any, b: any) => b.monthly_rent - a.monthly_rent); break
      case 'area_desc': list.sort((a: any, b: any) => b.size_sqm - a.size_sqm); break
      case 'latest': list.sort((a: any, b: any) => dayjs(b.created_at || 0).valueOf() - dayjs(a.created_at || 0).valueOf()); break
    }
    return list
  }, [allItems, keyword, region, roomType, priceRange, areaRange, sort])

  useEffect(() => { setPage(1) }, [keyword, region, roomType, priceRange, areaRange, sort])

  const total = filteredItems.length
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

  // ==================== CRUD ====================

  const openCreate = () => { setEditingId(null); form.resetFields(); setModalOpen(true) }

  const openEdit = (record: Property) => {
    setEditingId(String(record.id))
    form.setFieldsValue({
      project_id: record.project_id, room_number: record.room_number,
      owner_id: record.owner_id, monthly_rent: record.monthly_rent,
      deposit_amount: record.deposit_amount, size_sqm: record.size_sqm,
      bedrooms: record.bedrooms, bathrooms: record.bathrooms, status: record.status,
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

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editingId) { await propertiesApi.update(editingId, values); message.success(t('property.updateSuccess')) }
      else { await propertiesApi.create(values); message.success(t('property.createSuccess')) }
      setModalOpen(false)
      fetchData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || t('property.saveFailed'))
    } finally { setSubmitting(false) }
  }

  // ==================== 辅助函数 ====================

  const relativeTime = (dateStr?: string) => {
    if (!dateStr) return t('property.justNow')
    const d = dayjs(dateStr)
    if (!d.isValid()) return t('property.justNow')
    const now = dayjs()
    const diffDays = now.diff(d, 'day')
    const diffMonths = now.diff(d, 'month')
    const diffYears = now.diff(d, 'year')
    if (diffDays < 1) return t('property.justNow')
    if (diffDays < 30) return `${diffDays} ${t('property.daysAgo')}`
    if (diffMonths < 12) return `${diffMonths} ${t('property.monthsAgo')}`
    return `${diffYears} ${t('property.yearsAgo')}`
  }

  // ==================== 列表项渲染 ====================

  const renderListItem = (item: any) => {
    const projectName = item.project_id || item.building || ''
    const title = projectName ? `${projectName} · ${item.room_number || ''}` : (item.address || item.room_number || '—')
    const ptype = propertyTypeMap[item.property_type] || item.property_type || t('propertyType.apartment')
    const statusKey = (item.status || 'vacant').toLowerCase()
    const beds = Number(item.bedrooms || 0)
    const baths = Number(item.bathrooms || 0)
    const size = Number(item.size_sqm || 0)
    const floor = item.floor || '—'
    const rent = Number(item.monthly_rent || 0)
    const followers = attentionCount(String(item.id || item.room_number || ''))
    const seed = String(item.id || item.room_number || '')

    // 信息行：户型 | 面积 | 装修 | 楼层 | 类型
    const infoParts = [
      `${beds}室${baths}卫`,
      `${size}㎡`,
      item.furnished ? t('browse.furnished') : t('property.unfurnished'),
      `${t('property.floor')} ${floor}`,
      ptype,
    ]

    // 标签
    const tags: { label: string; type: string }[] = []
    tags.push({ label: statusLabelMap[statusKey] || item.status || '', type: statusKey })
    if (item.furnished) tags.push({ label: t('browse.furnished'), type: 'feature' })
    tags.push({ label: t('browse.moveIn'), type: 'feature' })

    return (
      <div
        className="lj-item"
        key={item.id}
        onClick={() => navigate(`/properties/detail/${item.id}`)}
      >
        {/* 左侧图片占位 */}
        <div className="lj-item__img" style={{ background: gradientFor(seed) }}>
          <span className="lj-item__img-text">{item.room_number || '—'}</span>
          <span className={`lj-item__badge lj-item__badge--${statusKey}`}>
            {statusLabelMap[statusKey] || item.status}
          </span>
        </div>

        {/* 右侧内容 */}
        <div className="lj-item__body">
          <div className="lj-item__title">{title}</div>
          <div className="lj-item__info">
            {infoParts.map((p, i) => (
              <span key={i}>
                {i > 0 && <em className="lj-item__sep">|</em>}
                {p}
              </span>
            ))}
          </div>
          <div className="lj-item__meta">
            <EyeOutlined className="lj-item__meta-icon" />
            <span>{followers} {t('property.attention')}</span>
            <em className="lj-item__sep">/</em>
            <span>{relativeTime(item.created_at)}</span>
          </div>
          <div className="lj-item__tags">
            {tags.map((tag, i) => (
              <span key={i} className={`lj-chip lj-chip--${tag.type}`}>{tag.label}</span>
            ))}
          </div>
          <div className="lj-item__bottom">
            <div className="lj-item__price">
              <span className="lj-item__price-num">฿{formatRent(rent)}</span>
              <span className="lj-item__price-unit">{t('property.perMonth')}</span>
              <span className="lj-item__price-per">฿{formatPerSqm(rent, size)}{t('property.perSqm')}</span>
            </div>
            <div className="lj-item__actions" onClick={(e) => e.stopPropagation()}>
              {isManageMode ? (
                <>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>{t('common.edit')}</Button>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)}>{t('common.delete')}</Button>
                </>
              ) : (
                <>
                  <Button size="small" type="text">{t('property.followProperty')}</Button>
                  <Button size="small" type="text">{t('property.compare')}</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ==================== 渲染 ====================

  return (
    <div className="lj-page">
      {/* 顶部工具栏 */}
      <div className="lj-toolbar">
        <div className="lj-toolbar__left">
          <span className="lj-toolbar__title">{t('property.title')}</span>
          <span className="lj-toolbar__sub">{t('property.subtitle')}</span>
        </div>
        {isManageMode && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('property.addNew')}</Button>
        )}
      </div>

      {/* 搜索 + 筛选 */}
      <div className="lj-filter">
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder={t('property.searchPlaceholder')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="lj-filter__search"
        />
        <div className="lj-filter__selects">
          <Select value={region} onChange={setRegion} options={regionOptions} className="lj-filter__select" />
          <Select value={roomType} onChange={setRoomType} options={roomTypeOptions} className="lj-filter__select" />
          <Select value={priceRange} onChange={setPriceRange} options={priceOptions} className="lj-filter__select" />
          <Select value={areaRange} onChange={setAreaRange} options={areaOptions} className="lj-filter__select" />
        </div>
      </div>

      {/* 排序栏 */}
      <div className="lj-sortbar">
        <div className="lj-sortbar__items">
          {sortItems.map((s) => (
            <button
              key={s.value}
              className="lj-sortbar__item"
              data-active={sort === s.value}
              onClick={() => setSort(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="lj-sortbar__count">
          {t('property.found')} <span className="lj-sortbar__count-num">{total}</span> {t('property.units')}
        </div>
      </div>

      {/* 房源列表 */}
      <Spin spinning={loading} tip={t('common.loading')}>
        {pagedItems.length === 0 && !loading ? (
          <div className="lj-empty"><Empty description={t('common.noData')} /></div>
        ) : (
          <div className="lj-list">
            {pagedItems.map((item: any) => renderListItem(item))}
          </div>
        )}
      </Spin>

      {/* 分页 */}
      {total > 0 && (
        <div className="lj-pagination">
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={total}
            showTotal={(tt) => `${t('common.total')} ${tt} ${t('common.items')}`}
            showSizeChanger={false}
            onChange={(p) => setPage(p)}
          />
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
            <Col span={12}><Form.Item label={t('property.layout')} name="layout"><Input placeholder={t('property.layoutPlaceholder')} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item label={t('property.monthlyRent')} name="monthly_rent" rules={[{ required: true, message: t('property.monthlyRent') }]}><InputNumber style={{ width: '100%' }} min={0} placeholder={t('property.monthlyRent')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('property.deposit')} name="deposit_amount"><InputNumber style={{ width: '100%' }} min={0} placeholder={t('property.deposit')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={`${t('property.area')}(㎡)`} name="size_sqm" rules={[{ required: true, message: t('property.area') }]}><InputNumber style={{ width: '100%' }} min={0} placeholder={t('property.areaPlaceholder')} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item label={t('property.bedrooms')} name="bedrooms"><InputNumber style={{ width: '100%' }} min={0} placeholder={t('property.bedrooms')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('property.bathrooms')} name="bathrooms"><InputNumber style={{ width: '100%' }} min={0} placeholder={t('property.bathrooms')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('common.status')} name="status" rules={[{ required: true, message: t('property.statusPlaceholder') }]}><Select placeholder={t('property.statusPlaceholder')} options={Object.entries(statusLabelMap).map(([k, v]) => ({ value: k, label: v }))} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default Properties
