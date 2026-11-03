/**
 * 房源新增/编辑弹窗。
 * 纯结构拆分自 pages/Properties/index.tsx，字段、校验、类名与提交行为保持不变。
 */
import {
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Col,
  Select,
  Switch,
  Upload,
} from 'antd'
import type { FormInstance } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project, Property } from '@/types'
import { useDecorationMap, useOrientationMap } from '@/lib/enumLabels'

// 编辑态回填值：Modal destroyOnClose 每次重建，需在 Form 挂载后再 setFieldsValue
const formValuesFrom = (record: Property) => ({
  project_id: record.project_id, room_number: record.room_number,
  owner_id: record.owner_id, monthly_rent: record.monthly_rent,
  deposit_amount: record.deposit_amount, size_sqm: record.size_sqm,
  bedrooms: record.bedrooms, bathrooms: record.bathrooms, status: record.status,
  // 朝向 / 装修 / 最短租期：后端 Property 同名可写字段，编辑需原样回填
  orientation: record.orientation || undefined,
  decoration: record.decoration || undefined,
  min_lease_months: record.min_lease_months ?? undefined,
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
  vr_url: record.vr_url || undefined,
  ceiling_height_m: record.ceiling_height_m ?? undefined,
  company_registrable: record.company_registrable ?? false,
  land_area_sqm: record.land_area_sqm ?? undefined,
  floor_loading_kg_sqm: record.floor_loading_kg_sqm ?? undefined,
  column_spacing: record.column_spacing || undefined,
  power_capacity_kva: record.power_capacity_kva ?? undefined,
  environmental_permit: record.environmental_permit ?? false,
  whole_floor_only: record.whole_floor_only ?? false,
  whole_building_only: record.whole_building_only ?? false,
})

export default function PropertyFormModal({
  open,
  record,
  editingId,
  submitting,
  form,
  photos,
  projects,
  propertyTypeMap,
  statusLabelMap,
  onCancel,
  onSubmit,
  uploadPhoto,
  removePhoto,
}: {
  open: boolean
  record: Property | null
  editingId: string | null
  submitting: boolean
  form: FormInstance
  photos: string[]
  projects: Project[]
  propertyTypeMap: Record<string, string>
  statusLabelMap: Record<string, string>
  onCancel: () => void
  onSubmit: () => void
  uploadPhoto: (file: File) => void
  removePhoto: (url: string) => void
}) {
  const { t } = useTranslation()
  // 朝向 / 装修选项：字典优先、i18n 兜底（与 C 端筛选面板同源）
  const orientationMap = useOrientationMap()
  const decorationMap = useDecorationMap()

  // 编辑态回填（Modal destroyOnClose 每次重建，Form 挂载后写入）
  useEffect(() => {
    if (open && record) form.setFieldsValue(formValuesFrom(record))
  }, [open, record, form])

  // 表单内的房源类型：用于差异化渲染（住宅 / 商办 / 厂房）专项字段
  const formPropertyType = Form.useWatch('property_type', form) as string | undefined
  const isFormCommercial = ['shop', 'commercial', 'office'].includes(formPropertyType || '')
  const isFormFactory = formPropertyType === 'factory'

  // 照片 url 列表（仅编辑态可上传；随 handleSubmit 一并提交）
  const photoFileList = photos.map((url, idx) => ({
    uid: `photo-${idx}`,
    name: url.split('/').pop() || `photo-${idx}`,
    status: 'done' as const,
    url,
  }))

  return (
    <Modal
      title={editingId ? t('property.editProperty') : t('property.addNew')}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
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
        initialValues={record ? formValuesFrom(record) : undefined}
      >
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
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('publicSite.orientationLabel')} name="orientation">
              <Select
                placeholder={t('publicSite.orientationLabel')}
                allowClear
                options={Object.entries(orientationMap).map(([k, v]) => ({ value: k, label: v }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('publicSite.decorationLabel')} name="decoration">
              <Select
                placeholder={t('publicSite.decorationLabel')}
                allowClear
                options={Object.entries(decorationMap).map(([k, v]) => ({ value: k, label: v }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('property.minLease')} name="min_lease_months">
              <InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('property.minLeasePlaceholder')} />
            </Form.Item>
          </Col>
        </Row>
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
        <Form.Item label={t('publishListing.lblVrUrl')} name="vr_url">
          <Input placeholder="https://..." allowClear />
        </Form.Item>

        {/* 商办专项：层高 + 可注册公司 */}
        {isFormCommercial && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('publishListing.lblCeilingHeight')} name="ceiling_height_m">
                <InputNumber style={{ width: '100%' }} min={0} placeholder={t('publishListing.lblCeilingHeight')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('publishListing.lblCompanyRegistrable')} name="company_registrable" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        )}

        {/* 厂房专项 */}
        {isFormFactory && (
          <>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label={t('publishListing.lblLandArea')} name="land_area_sqm">
                  <InputNumber style={{ width: '100%' }} min={0} placeholder={t('publishListing.lblLandArea')} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={t('publishListing.lblFloorLoading')} name="floor_loading_kg_sqm">
                  <InputNumber style={{ width: '100%' }} min={0} placeholder={t('publishListing.lblFloorLoading')} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={t('publishListing.lblColumnSpacing')} name="column_spacing">
                  <Input placeholder={t('publishListing.lblColumnSpacing')} allowClear />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label={t('publishListing.lblPowerCapacity')} name="power_capacity_kva">
                  <InputNumber style={{ width: '100%' }} min={0} placeholder={t('publishListing.lblPowerCapacity')} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}><Form.Item label={t('publishListing.lblEnvironmentalPermit')} name="environmental_permit" valuePropName="checked"><Switch /></Form.Item></Col>
              <Col span={8}><Form.Item label={t('publishListing.lblWholeFloorOnly')} name="whole_floor_only" valuePropName="checked"><Switch /></Form.Item></Col>
              <Col span={8}><Form.Item label={t('publishListing.lblWholeBuildingOnly')} name="whole_building_only" valuePropName="checked"><Switch /></Form.Item></Col>
            </Row>
            <Form.Item label={t('publishListing.lblCompanyRegistrable')} name="company_registrable" valuePropName="checked">
              <Switch />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  )
}
