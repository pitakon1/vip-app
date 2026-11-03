import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import type { Payment } from '@/types'
import { CHANNEL_LABEL_KEYS, statusMeta, typeMeta } from '../constants'
import { formatAmount, formatDateTime, toDisplayStatus, toDisplayType } from '../utils'
import type { DetailType, DocData } from '../types'

interface Props {
  payment: Payment
  detailType: DetailType
  docData: DocData | null
  onOpenDetail: (record: Payment, type?: DetailType) => void
  onClose: () => void
}

/** 详情 / 凭证 / 发票弹窗 */
export default function DetailModal({
  payment,
  detailType,
  docData,
  onOpenDetail,
  onClose,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div className="rent-modal payments-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('payments.modalDetailTitle')}</h3>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          {detailType === 'detail' ? (
            <>
              <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.thCode')}</span><span className="rent-mono">{(payment as any).code || `PMT-${payment.id}`}</span></div></div>
              <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.rowAmount')}</span><span>{formatAmount(payment)} {(payment as any).currency || 'THB'}</span></div></div>
              <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.thType')}</span><span>{t(typeMeta[toDisplayType(payment)].label)}</span></div></div>
              <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('common.status')}</span><span>{t(statusMeta[toDisplayStatus(payment)].label)}</span></div></div>
              <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.thChannel')}</span><span>{CHANNEL_LABEL_KEYS[String(payment.channel || '')] ? t(CHANNEL_LABEL_KEYS[String(payment.channel)]) : (payment.channel || '-')}</span></div></div>
              <div className="rent-form-group"><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.rowDueDate')}</span><span>{formatDateTime(payment.due_date)}</span></div></div>
              <div className="rent-form-group" style={{ marginBottom: 0 }}><div className="rent-modal-row"><span className="rent-text-muted">{t('payments.labelRemark')}</span><span>{payment.description || '-'}</span></div></div>
            </>
          ) : docData === null ? (
            <DataState loading loadingText={t('common.loading')} />
          ) : (docData as any)?.error ? (
            <DataState
              error={t('payments.errDocFetch')}
              retryText={t('common.retry')}
              onRetry={() => onOpenDetail(payment, detailType)}
            />
          ) : (
            <div className="rent-empty">
              {(docData as any)?.url ? (
                <img src={(docData as any).url} alt={t('payments.altDoc')} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
              ) : (
                <pre className="rent-text-muted" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(docData, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
        <div className="rent-modal__footer rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
          {detailType === 'detail' && (
            <>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onOpenDetail(payment, 'receipt')}>{t('payments.btnReceipt')}</button>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onOpenDetail(payment, 'invoice')}>{t('payments.btnInvoice')}</button>
            </>
          )}
          <button className="rent-btn rent-btn--secondary" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
