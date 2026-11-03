/**
 * 下单确认弹窗（真实创建服务订单）。
 * 纯结构拆分自 pages/Tenant/Services.tsx，字段、选项与确认文案保持不变。
 */
import { useTranslation } from 'react-i18next'
import { Modal, Select } from 'antd'
import { formatAmount } from '../constants'
import type { CatalogItem, PropertyOption } from '../types'

export default function BookingModal({
  item,
  propertyId,
  onPropertyChange,
  propertyOptions,
  catalog,
  serviceNameOf,
  unitOf,
  submitting,
  onCancel,
  onOk,
}: {
  item: CatalogItem | null
  propertyId?: string
  onPropertyChange: (value: string) => void
  propertyOptions: PropertyOption[]
  catalog: CatalogItem[]
  serviceNameOf: (code: string, catalogItems: CatalogItem[]) => string
  unitOf: (code: string, catalogItems: CatalogItem[]) => string
  submitting: boolean
  onCancel: () => void
  onOk: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      title={t('tenantServices.bookTitle')}
      open={!!item}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={submitting}
      okText={t('tenantServices.bookConfirm')}
      cancelText={t('tenantServices.cancel')}
    >
      <div className="mt-detail__rows">
        <div className="mt-detail__row">
          <span className="mt-detail__label">{t('tenantServices.detailService')}</span>
          <span className="mt-detail__value">{item ? serviceNameOf(item.code, catalog) : '—'}</span>
        </div>
        <div className="mt-detail__row">
          <span className="mt-detail__label">{t('ownerServices.labelServiceProperty')}</span>
          <span className="mt-detail__value">
            <Select
              style={{ width: '100%' }}
              placeholder={t('ownerServices.msgSelectProperty')}
              value={propertyId}
              onChange={onPropertyChange}
              options={propertyOptions.map((p) => ({ value: p.id, label: p.label }))}
            />
          </span>
        </div>
        <div className="mt-detail__row">
          <span className="mt-detail__label">{t('tenantServices.bookUnitPrice')}</span>
          <span className="mt-detail__value">
            {formatAmount(Number(item?.base_price || 0))}
            {item ? ` / ${unitOf(item.code, catalog)}` : ''}
          </span>
        </div>
        <div className="mt-detail__row">
          <span className="mt-detail__label">{t('tenantServices.bookTotal')}</span>
          <span className="mt-detail__value">{formatAmount(Number(item?.base_price || 0))}</span>
        </div>
        <div className="mt-detail__row">
          <span className="mt-detail__label">{t('tenantServices.bookTax')}</span>
          <span className="mt-detail__value">{t('tenantServices.bookTaxNote')}</span>
        </div>
      </div>
      {!propertyOptions.length && <p className="mt-detail__desc">{t('tenantServices.noLeaseWarn')}</p>}
    </Modal>
  )
}
