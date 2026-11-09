import { LIST_PAGE_SIZE, OPTION_PAGE_SIZE } from '@/lib/pagination'
import { useCachedQuery } from '@/lib/queryCache'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { propertiesApi, projectsApi, listingsApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import { buildListingPayload } from '@/lib/listingPayload'
import { usePropertyStatusMap, usePropertyTypeMap } from '@/lib/enumLabels'
import useAuthStore from '@/stores/auth'
import type { Project, Property } from '@/types'
import './properties.css'
// 复用 C 端浏览页的筛选面板样式（.rent-loc-panel* / .rent-loc-popover / .rent-price-custom 等），实现完全复刻
import '@/pages/PublicListings/public-listings.css'
import { errorText } from '@/lib/errorText'
import PropertyFilterBar from './PropertyFilterBar'
import PropertyList from './PropertyList'
import PropertyFormModal from './PropertyFormModal'
import { usePropertyFilters, TYPE_CLASS_MAP } from './hooks/usePropertyFilters'
import { usePropertyForm } from './hooks/usePropertyForm'

const PAGE_SIZE = LIST_PAGE_SIZE

// ==================== 组件 ====================

const Properties = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  // 角色感知。兜底为空角色而不是 admin：user 缺失时不应解锁管理态视图
  const role = user?.role || ''
  const isManageMode = role === 'admin' || role === 'agent' || role === 'employee'
  // 新增楼盘：POST /projects 仅 agent/admin 有权限，入口按角色收敛
  const canCreateProject = role === 'admin' || role === 'agent'

  // 筛选（关键词 / 状态 / 类型 / 户型 / 价格 / 面积 / 排序 / 分页 / 定位）
  const filters = usePropertyFilters()

  const [projects, setProjects] = useState<Project[]>([])

  // 选项（枚举 → 文案映射统一收敛到 lib/enumLabels）
  const statusLabelMap = usePropertyStatusMap()

  const propertyTypeMap = usePropertyTypeMap()

  // 导出当前筛选条件下的房源清单（后端生成 CSV，见 /api/v1/exports/properties）
  const handleExport = async () => {
    try {
      await downloadReport(
        '/exports/properties',
        {
          status: filters.status || undefined,
          property_type: filters.typeClass ? TYPE_CLASS_MAP[filters.typeClass] : undefined,
          listing_type: filters.bizType === 'rent' ? 'rent' : filters.bizType ? 'sell' : undefined,
          is_new_development:
            filters.bizType === 'new' ? true : filters.bizType === 'resale' ? false : undefined,
          q: filters.keyword.trim() || undefined,
        },
        'properties.csv',
      )
      message.success(t('propertiesPage.exported'))
    } catch {
      message.error(t('propertiesPage.exportFailed'))
    }
  }

  // 项目列表（房源卡片展示项目名 + 表单项目下拉）
  const fetchProjects = useCallback(async () => {
    try {
      const res = await projectsApi.list()
      const payload = res.data?.data ?? res.data
      setProjects(payload?.items ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // 列表查询走统一缓存（跨会话秒开 + 翻页/改筛选保留上一页结果）
  const listParams = filters.buildParams()
  const listKey = JSON.stringify(listParams)
  // 缓存键必须带身份维度：同一份筛选条件下，admin/employee/owner 看到的
  // 房源范围不同（后端按角色做可见性裁剪），共用 key 会把上一个角色拿到的
  // 列表喂给下一个角色（含空列表），表现为「空缓存串数据」。
  const cacheScope = `${user?.id ?? 'anon'}:${role || 'anon'}`
  const listQuery = useCachedQuery<{ items: Property[]; total: number }>({
    queryKey: ['properties', cacheScope, listKey],
    cacheKey: `properties:${cacheScope}:${listKey}`,
    keepPreviousData: true,
    queryFn: async () => {
      const res = await propertiesApi.list(listParams)
      const payload = res.data?.data ?? res.data
      return { items: (payload?.items ?? []) as Property[], total: Number(payload?.total ?? 0) }
    },
  })

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const loading = listQuery.isFetching && !listQuery.data
  const loadError = listQuery.isError ? errorText(listQuery.error, t('common.loadFailed')) : null

  // 请求序列守卫由 TanStack Query 统一处理（同一 queryKey 只认最新一次结果）
  const fetchData = useCallback(async () => {
    await listQuery.refetch()
  }, [listQuery])

  // 新增/编辑弹窗（表单、照片与提交动作）
  const propertyForm = usePropertyForm({ onSaved: fetchData })

  // ---------- 项目坐标（地图找房点位来源） ----------
  type CoordRow = { id: string; name: string; address: string; lat: number | null; lng: number | null }
  const [coordOpen, setCoordOpen] = useState(false)
  const [coordLoading, setCoordLoading] = useState(false)
  const [coordRows, setCoordRows] = useState<CoordRow[]>([])
  const [coordBusyId, setCoordBusyId] = useState<string | null>(null)

  const openCoordModal = useCallback(async () => {
    setCoordOpen(true)
    setCoordLoading(true)
    try {
      const res = await projectsApi.list({ page: 1, page_size: OPTION_PAGE_SIZE })
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

  // 分页页码（对齐原型 admin-properties 的 rent-pagination 结构）
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageNumbers: (number | string)[] = useMemo(() => {
    const nums: (number | string)[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i)
    } else {
      nums.push(1)
      if (filters.page > 4) nums.push('prev-ellipsis')
      const start = Math.max(2, filters.page - 1)
      const end = Math.min(totalPages - 1, filters.page + 1)
      for (let i = start; i <= end; i++) nums.push(i)
      if (filters.page < totalPages - 3) nums.push('next-ellipsis')
      nums.push(totalPages)
    }
    return nums
  }, [filters.page, totalPages])

  // ==================== CRUD ====================

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
          message.error(errorText(err, t('property.deleteFailed')))
        }
      },
    })
  }

  // 上架/下架已废弃：删除即下架（前端不再调用 listing_status 更新）

  // 一键上架（唯一上架入口）：直接按该房源档案生成上架单
  const handlePublish = (item: Property) => {
    if (Number(item.monthly_rent || 0) <= 0) {
      message.warning(t('listing.listManualRent'))
      return
    }
    Modal.confirm({
      title: t('listing.confirmListTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('listing.confirmListBody'),
      okText: t('listing.actionList'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await listingsApi.create(buildListingPayload(item))
          message.success(t('listing.listedOk'))
        } catch (err: any) {
          message.error(errorText(err, t('property.saveFailed')))
        }
      },
    })
  }

  // 新增楼盘：提交 POST /projects 后刷新项目列表（供房源表单的项目下拉即时可用）
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [projectSubmitting, setProjectSubmitting] = useState(false)
  const [projectForm] = Form.useForm()

  const handleCreateProject = async () => {
    try {
      const values = await projectForm.validateFields()
      setProjectSubmitting(true)
      await projectsApi.create({
        name: values.name,
        address: values.address,
        city: values.city || undefined,
        district: values.district || undefined,
        developer: values.developer || undefined,
        total_units: values.total_units ?? undefined,
        completion_year: values.completion_year ?? undefined,
        tenure: values.tenure || undefined,
        avg_price: values.avg_price ?? undefined,
        sale_status: values.sale_status || undefined,
        open_date: values.open_date || undefined,
      })
      message.success(t('project.msgCreated'))
      setProjectModalOpen(false)
      projectForm.resetFields()
      fetchProjects()
    } catch (err: any) {
      if (err?.errorFields) {
        projectForm.scrollToField(err.errorFields[0].name)
        return
      }
      message.error(errorText(err, t('project.errCreateFailed')))
    } finally {
      setProjectSubmitting(false)
    }
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
          <button className="rent-btn rent-btn--secondary" onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {t('propertiesPage.export')}
          </button>
          {canCreateProject && (
            <button className="rent-btn rent-btn--secondary" onClick={() => { projectForm.resetFields(); setProjectModalOpen(true) }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {t('project.createEntry')}
            </button>
          )}
          {isManageMode && (
            <button className="rent-btn rent-btn--secondary" onClick={openCoordModal}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {t('project.coordEntry')}
            </button>
          )}
          <button className="rent-btn rent-btn--primary" onClick={propertyForm.openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('property.addNew')}
          </button>
        </div>
      </div>

      {/* 贝壳风单行筛选栏 + 结果计数 */}
      <PropertyFilterBar
        filters={filters}
        total={total}
        statusLabelMap={statusLabelMap}
        propertyTypeMap={propertyTypeMap}
      />

      {/* 列表三态 + 卡片网格 + 分页 */}
      <PropertyList
        items={items}
        total={total}
        loading={loading}
        loadError={loadError}
        isFiltering={filters.isFiltering}
        page={filters.page}
        totalPages={totalPages}
        pageNumbers={pageNumbers}
        projects={projects}
        propertyTypeMap={propertyTypeMap}
        statusLabelMap={statusLabelMap}
        isManageMode={isManageMode}
        onRetry={fetchData}
        onPageChange={filters.setPage}
        onPublish={handlePublish}
        onEdit={propertyForm.openEdit}
        onDelete={handleDelete}
      />

      {/* 新增/编辑弹窗 */}
      <PropertyFormModal
        open={propertyForm.modalOpen}
        record={propertyForm.editingRecord}
        editingId={propertyForm.editingId}
        submitting={propertyForm.submitting}
        form={propertyForm.form}
        photos={propertyForm.photos}
        projects={projects}
        propertyTypeMap={propertyTypeMap}
        statusLabelMap={statusLabelMap}
        onCancel={propertyForm.close}
        onSubmit={propertyForm.handleSubmit}
        uploadPhoto={propertyForm.uploadPhoto}
        removePhoto={propertyForm.removePhoto}
      />

      {/* 项目坐标：地图找房的点位取自项目经纬度，无坐标的项目不会出现在地图上 */}
      <Modal
        title={t('project.coordTitle')}
        open={coordOpen}
        onCancel={() => setCoordOpen(false)}
        footer={null}
        width={880}
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

      {/* 新增楼盘（POST /projects 需 agent/admin；入口按角色收敛） */}
      <Modal
        title={t('project.createTitle')}
        open={projectModalOpen}
        onCancel={() => setProjectModalOpen(false)}
        onOk={handleCreateProject}
        confirmLoading={projectSubmitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnHidden
        width={640}
      >
        <Form form={projectForm} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('project.lblName')} name="name" rules={[{ required: true, message: t('project.reqName') }]}>
                <Input placeholder={t('project.lblName')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('project.lblDeveloper')} name="developer">
                <Input placeholder={t('project.lblDeveloper')} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('project.lblAddress')} name="address" rules={[{ required: true, message: t('project.reqAddress') }]}>
            <Input placeholder={t('project.lblAddress')} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item label={t('project.lblCity')} name="city"><Input placeholder={t('project.lblCity')} allowClear /></Form.Item></Col>
            <Col span={12}><Form.Item label={t('project.lblDistrict')} name="district"><Input placeholder={t('project.lblDistrict')} allowClear /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item label={t('project.lblTotalUnits')} name="total_units"><InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('project.lblTotalUnits')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('project.lblCompletionYear')} name="completion_year"><InputNumber style={{ width: '100%' }} min={1900} precision={0} placeholder={t('project.lblCompletionYear')} /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('project.lblAvgPrice')} name="avg_price"><InputNumber style={{ width: '100%' }} min={0} placeholder={t('project.lblAvgPrice')} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('project.lblTenure')} name="tenure">
                <Select allowClear options={[
                  { value: 'freehold', label: t('project.tenureFreehold') },
                  { value: 'leasehold', label: t('project.tenureLeasehold') },
                  { value: 'mixed', label: t('project.tenureMixed') },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('project.lblSaleStatus')} name="sale_status">
                <Select allowClear options={[
                  { value: 'pre_sale', label: t('project.saleStatusPreSale') },
                  { value: 'on_sale', label: t('project.saleStatusOnSale') },
                  { value: 'sold_out', label: t('project.saleStatusSoldOut') },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('project.lblOpenDate')} name="open_date">
            <Input placeholder="YYYY-MM-DD" allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Properties
