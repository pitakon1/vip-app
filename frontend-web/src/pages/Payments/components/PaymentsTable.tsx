import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import type { Payment } from '@/types'
import { CHANNEL_LABEL_KEYS, statusMeta, typeMeta } from '../constants'
import { formatAmount, formatDateTime, formatFee, lateFeeDue, toDisplayStatus, toDisplayType } from '../utils'
import type { DetailType } from '../types'

interface Props {
  items: Payment[]
  filtered: boolean
  resolveTenantName: (p: Payment) => string
  onOpenDetail: (record: Payment, type?: DetailType) => void
  onOpenConfirm: (record: Payment) => void
  onOpenWaive: (record: Payment) => void
  onOpenRefund: (record: Payment) => void
}

/** 收付款流水表格 */
export default function PaymentsTable({
  items,
  filtered,
  resolveTenantName,
  onOpenDetail,
  onOpenConfirm,
  onOpenWaive,
  onOpenRefund,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-table-wrap payments-table-wrap">
      <table className="rent-table">
        <thead>
          <tr>
            <th>{t('payments.thCode')}</th>
            <th>{t('payments.thDate')}</th>
            <th>{t('payments.thTenantOwner')}</th>
            <th>{t('payments.thType')}</th>
            <th className="rent-money">{t('payments.thAmount')}</th>
            <th className="rent-money">{t('payments.thLateFee')}</th>
            <th>{t('payments.thChannel')}</th>
            <th>{t('payments.thContract')}</th>
            <th>{t('common.status')}</th>
            <th>{t('common.action')}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <DataState
                  empty
                  emptyTitle={t('payments.empty')}
                  filtered={filtered}
                />
              </td>
            </tr>
          ) : items.map((p) => {
            const ds = toDisplayStatus(p)
            const dt = toDisplayType(p)
            const sMeta = statusMeta[ds]
            const tMeta = typeMeta[dt]
            const code = (p as any).code || `PMT-${p.id}`
            const tenantName = resolveTenantName(p)
            // 后端 Lease 无合同号字段：以租约 ID 前 8 位生成可读合同编号
            const contractCode =
              (p as any).contract_code ||
              (p.lease_id ? `LS-${String(p.lease_id).slice(0, 8).toUpperCase()}` : '-')
            const date = formatDateTime(p.paid_at || p.due_date)
            const channelKey = CHANNEL_LABEL_KEYS[String(p.channel || '')]
            const channel = channelKey ? t(channelKey) : (p.channel || '-')
            // 后端准入规则（实测）：refund 仅允许 succeeded；confirm 仅允许
            // pending / processing。这里直接按后端原始状态判断，不再用派生
            // 展示态（后者把 failed/expired/pending 过期统一并成 overdue，
            // 会让退款按钮出现在必然 400 的失败单上）。
            const isRefundable = p.status === 'succeeded'
            const isConfirmable = p.status === 'pending' || p.status === 'processing'
            const feeDue = lateFeeDue(p)
            return (
              <tr key={p.id}>
                <td><span className="rent-mono">{code}</span></td>
                <td className="rent-table__mono">{date}</td>
                <td>{tenantName}</td>
                <td>
                  <span className={`rent-badge ${tMeta.badge}`}>{t(tMeta.label)}</span>
                </td>
                <td className="rent-money rent-num">{formatAmount(p)}</td>
                <td className="rent-money rent-num">
                  {feeDue > 0 ? (
                    <>
                      <span style={{ color: 'var(--state-error)' }}>{formatFee(feeDue)}</span>
                      {Number(p.late_fee_waived || 0) > 0 && (
                        <span className="rent-text-muted rent-text-sm">
                          {t('payments.waivedSuffix', { amount: formatFee(Number(p.late_fee_waived)) })}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="rent-text-muted">-</span>
                  )}
                </td>
                <td>{channel}</td>
                <td><span className="rent-mono">{contractCode}</span></td>
                <td>
                  <span className={`rent-badge ${sMeta.badge}`}>
                    <span className="rent-badge--dot" style={{ background: sMeta.dot }} />
                    {t(sMeta.label)}
                  </span>
                </td>
                <td>
                  <div className="rent-flex rent-gap-2">
                    <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onOpenDetail(p, 'detail')}>{t('payments.btnView')}</button>
                    {isConfirmable && (
                      <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => onOpenConfirm(p)}>{t('payments.btnConfirm')}</button>
                    )}
                    {feeDue > 0 && (
                      <button
                        className="rent-btn rent-btn--ghost rent-btn--sm"
                        onClick={() => onOpenWaive(p)}
                      >
                        {t('payments.btnWaive')}
                      </button>
                    )}
                    {isRefundable && (
                      <button
                        className="rent-btn rent-btn--ghost rent-btn--sm"
                        style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                        onClick={() => onOpenRefund(p)}
                      >
                        {t('payments.btnRefund')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
