import { useState } from 'react'
import { Empty, Input, Modal, Popconfirm, Select } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import type { ManualDealInput, ManualDealRow } from '../types'
import { fmtMoney } from '../utils'

interface Props {
  deals: ManualDealRow[]
  loading: boolean
  saving: boolean
  onCreate: (payload: ManualDealInput) => Promise<boolean>
  onRemove: (id: string) => Promise<void>
}

/**
 * 手工补录成交（线下成交）。
 *
 * 与 App 端「我的业绩 → 补录成交」保持同一口径与校验：
 * 来源 / 类型 / 日期（不晚于今天）/ 成交金额（> 0）/ 佣金 / 客户 / 备注。
 * 后端 `/performance/deals` 对非管理员只允许补录本人，这里是纯前端表单。
 */
export default function ManualDealCard({ deals, loading, saving, onCreate, onRemove }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<ManualDealInput['source']>('platform_customer')
  const [dealType, setDealType] = useState('new_rental')
  const [dateStr, setDateStr] = useState(dayjs().format('YYYY-MM-DD'))
  const [amountStr, setAmountStr] = useState('')
  const [commissionStr, setCommissionStr] = useState('')
  const [customer, setCustomer] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ date?: string; amount?: string }>({})

  const typeOptions = [
    { value: 'new_rental', label: t('employeePerformance.dealNewRental') },
    { value: 'renewal', label: t('employeePerformance.dealRenewal') },
    { value: 'sale_transaction', label: t('employeePerformance.dealSale') },
    { value: 'management', label: t('employeePerformance.dealManagement') },
  ]

  const dealTypeLabel = (key?: string | null) =>
    typeOptions.find((o) => o.value === key)?.label ?? key ?? ''
  const sourceLabel = (key?: string | null) =>
    key === 'self_sourced'
      ? t('employeePerformance.manualSourceSelf')
      : t('employeePerformance.manualSourcePlatform')

  const resetForm = () => {
    setSource('platform_customer')
    setDealType('new_rental')
    setDateStr(dayjs().format('YYYY-MM-DD'))
    setAmountStr('')
    setCommissionStr('')
    setCustomer('')
    setNote('')
    setErrors({})
  }

  const handleSubmit = async () => {
    const amount = Number(amountStr)
    const commission = commissionStr.trim() === '' ? 0 : Number(commissionStr)
    const next: { date?: string; amount?: string } = {}
    if (!dateStr) {
      next.date = t('employeePerformance.manualDateRequired')
    } else {
      const parsed = dayjs(dateStr)
      if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== dateStr) {
        next.date = t('employeePerformance.manualDateInvalid')
      } else if (parsed.isAfter(dayjs(), 'day')) {
        next.date = t('employeePerformance.manualDateFuture')
      }
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      next.amount = t('employeePerformance.manualAmountRequired')
    }
    setErrors(next)
    if (Object.keys(next).length) return

    const ok = await onCreate({
      source,
      deal_type: dealType,
      deal_date: dateStr,
      deal_amount: amount,
      commission_amount: Number.isFinite(commission) ? Math.max(0, commission) : 0,
      customer_name: customer.trim() || undefined,
      note: note.trim() || undefined,
    })
    if (ok) {
      setOpen(false)
      resetForm()
    }
  }

  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employeePerformance.manualTitle')}</h3>
        <button className="rent-btn rent-btn--primary" onClick={() => setOpen(true)}>
          {t('employeePerformance.manualAdd')}
        </button>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        <p className="rent-text-sm rent-text-muted" style={{ padding: '12px 16px 0' }}>
          {t('employeePerformance.manualHint')}
        </p>
        {loading ? (
          <div className="rent-empty" style={{ padding: '24px 0' }}>
            {t('common.loading')}
          </div>
        ) : deals.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('employeePerformance.manualEmpty')}
            style={{ padding: '24px 0' }}
          />
        ) : (
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('employeePerformance.manualDate')}</th>
                  <th>{t('employeePerformance.manualType')}</th>
                  <th>{t('employeePerformance.manualSource')}</th>
                  <th>{t('employeePerformance.manualAmount')}</th>
                  <th>{t('employeePerformance.manualCommission')}</th>
                  <th>{t('employeePerformance.manualCustomer')}</th>
                  <th>{t('employeePerformance.manualNote')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td className="rent-table__mono">{d.deal_date ?? '-'}</td>
                    <td>{dealTypeLabel(d.deal_type)}</td>
                    <td>{sourceLabel(d.source)}</td>
                    <td className="rent-table__mono">{fmtMoney(Number(d.deal_amount) || 0)}</td>
                    <td className="rent-table__mono">
                      {fmtMoney(Number(d.commission_amount) || 0)}
                    </td>
                    <td>{d.customer_name || '-'}</td>
                    <td className="rent-text-muted">{d.note || '-'}</td>
                    <td>
                      <Popconfirm
                        title={t('employeePerformance.manualDeleteConfirm')}
                        okText={t('common.delete')}
                        cancelText={t('common.cancel')}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void onRemove(d.id)}
                      >
                        <button className="rent-btn rent-btn--ghost rent-btn--sm">
                          {t('common.delete')}
                        </button>
                      </Popconfirm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        title={t('employeePerformance.manualTitle')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSubmit}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        destroyOnClose
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            <span className="rent-text-sm rent-text-muted">
              {t('employeePerformance.manualSource')}
            </span>
            <Select
              style={{ width: '100%' }}
              value={source}
              onChange={(v) => setSource(v)}
              options={[
                { value: 'platform_customer', label: t('employeePerformance.manualSourcePlatform') },
                { value: 'self_sourced', label: t('employeePerformance.manualSourceSelf') },
              ]}
            />
          </label>
          <label>
            <span className="rent-text-sm rent-text-muted">
              {t('employeePerformance.manualType')}
            </span>
            <Select
              style={{ width: '100%' }}
              value={dealType}
              onChange={(v) => setDealType(v)}
              options={typeOptions}
            />
          </label>
          <label>
            <span className="rent-text-sm rent-text-muted">
              {t('employeePerformance.manualDate')}
            </span>
            <Input
              placeholder="YYYY-MM-DD"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              status={errors.date ? 'error' : undefined}
            />
            {errors.date && (
              <span className="rent-text-sm" style={{ color: 'var(--state-danger)' }}>
                {errors.date}
              </span>
            )}
          </label>
          <label>
            <span className="rent-text-sm rent-text-muted">
              {t('employeePerformance.manualAmount')}
            </span>
            <Input
              type="number"
              min={0}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              status={errors.amount ? 'error' : undefined}
            />
            {errors.amount && (
              <span className="rent-text-sm" style={{ color: 'var(--state-danger)' }}>
                {errors.amount}
              </span>
            )}
          </label>
          <label>
            <span className="rent-text-sm rent-text-muted">
              {t('employeePerformance.manualCommission')}
            </span>
            <Input
              type="number"
              min={0}
              value={commissionStr}
              onChange={(e) => setCommissionStr(e.target.value)}
            />
          </label>
          <label>
            <span className="rent-text-sm rent-text-muted">
              {t('employeePerformance.manualCustomer')}
            </span>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </label>
          <label>
            <span className="rent-text-sm rent-text-muted">
              {t('employeePerformance.manualNote')}
            </span>
            <Input.TextArea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
