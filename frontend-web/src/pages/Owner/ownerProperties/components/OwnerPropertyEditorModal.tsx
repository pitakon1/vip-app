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
import { propertyTypeMap, statusLabelMap } from '../constants'
import { useDecorationMap, useOrientationMap } from '@/lib/enumLabels'
import type { OwnerProperty } from '../types'

// 编辑态回填值：Modal destroyOnHidden 每次重建，需在 Form 挂载后再 setFieldsValue
const formValuesFrom = (record: OwnerProperty) => ({
  room_number: record.room_number,
  building: record.building ?? undefined,
  floor: record.floor ?? undefined,
  address: record.address || undefined,
  property_type: record.property_type || undefined,
  currency: record.currency || 'THB',
  monthly_rent: record.monthly_rent,
  deposit_amount: record.deposit_amount ?? 0,
  deposit_months: record.deposit_months ?? 2,
  size_sqm: record.size_sqm ?? undefined,
  bedrooms: record.bedrooms ?? undefined,
  bathrooms: record.bathrooms ?? undefined,
  orientation: record.orientation || undefined,
  decoration: record.decoration || undefined,
  min_lease_months: record.min_lease_months ?? undefined,
  status: record.status || 'vacant',
  available_from: typeof record.available_from === 'string' ? record.available_from.slice(0, 10) : undefined,
  furnished: record.furnished ?? false,
  description: record.description || undefined,
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

const CREATE_DEFAULTS = { currency: 'THB', status: 'vacant', furnished: false, deposit_amount: 0, deposit_months: 2 }

interface PhotoFile {
  uid: string
  name: string
  status: 'done'
  url: string
}

interface Props {
  open: boolean
  editingId: string | null
  record: OwnerProperty | null
  form: FormInstance
  submitting: boolean
  photoFileList: PhotoFile[]
  onCancel: () => void
  onSubmit: () => void
  onRemovePhoto: (url: string) => void
  onUploadPhoto: (file: File) => void
}

/** 新增/编辑弹窗（对齐管理员端 Modal+Form，宽 640） */
const OwnerPropertyEditorModal = ({
  open,
  editingId,
  record,
  form,
  submitting,
  photoFileList,
  onCancel,
  onSubmit,
  onRemovePhoto,
  onUploadPhoto,
}: Props) => {
  const { t } = useTranslation()
  const orientationMap = useOrientationMap()
  const decorationMap = useDecorationMap()

  // 编辑态回填（Modal destroyOnHidden 每次重建，Form 挂载后写入）
  useEffect(() => {
    if (open && record) form.setFieldsValue(formValuesFrom(record))
  }, [open, record, form])

  // 表单内的房源类型：用于差异化渲染（住宅 / 商办 / 厂房）专项字段
  const formPropertyType = Form.useWatch('property_type', form) as string | undefined
  const isFormCommercial = ['shop', 'commercial', 'office'].includes(formPropertyType || '')
  const isFormFactory = formPropertyType === 'factory'

  return (
    <Modal
      title={editingId ? t('ownerProperties.editTitle') : t('ownerProperties.createTitle')}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={submitting}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      destroyOnHidden
      width={640}
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={record ? formValuesFrom(record) : CREATE_DEFAULTS}
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
                if (url) onRemovePhoto(url)
                return true
              }}
              customRequest={({ file }) => { onUploadPhoto(file as File) }}
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

export default OwnerPropertyEditorModal
