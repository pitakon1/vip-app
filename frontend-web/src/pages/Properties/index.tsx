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
  message,
} from 'antd'
import {
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { propertiesApi, projectsApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import type { Project, Property } from '@/types'
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
  const [status, setStatus] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [sort, setSort] = useState('created')
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
    if (status) {
      list = list.filter((it: any) => (it.status || 'vacant').toLowerCase() === status)
    }
    if (propertyType) {
      list = list.filter((it: any) => (it.property_type || '').toLowerCase() === propertyType)
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
  }, [allItems, keyword, status, propertyType, sort])

  useEffect(() => { setPage(1) }, [keyword, status, propertyType, sort])

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
          <button className="rent-btn rent-btn--secondary" onClick={() => message.info('导出功能开发中')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            导出
          </button>
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
        <select className="rent-form-select rent-filter-bar__select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="created">最近创建</option>
          <option value="rent-asc">租金升序</option>
          <option value="rent-desc">租金降序</option>
        </select>
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
