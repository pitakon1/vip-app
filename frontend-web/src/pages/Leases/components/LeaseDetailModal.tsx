import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import type { Lease } from '@/types'
import { depositStatusLabel } from '../constants'

interface Props {
  lease: Lease
  meta: { label: string; badge: string; dot: string }
  resolvePropertyName: (lease: Lease) => string
  resolveTenantName: (lease: Lease) => string
  onClose: () => void
}

/** 详情弹窗：只读展示合同全量信息 */
export default function LeaseDetailModal({
  lease,
  meta,
  resolvePropertyName,
  resolveTenantName,
  onClose,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-modal-backdrop" onClick={onClose}>
      <div
        className="rent-modal leases-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 600 }}
      >
        <div className="rent-modal__header">
          <h3 className="rent-card__title">{t('leases.modalDetailTitle')}</h3>
          <button
            className="rent-btn rent-btn--ghost rent-btn--sm"
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="rent-modal__body">
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelCode')}</label>
              <div className="rent-mono">
                {lease.contract_no || '—'}
              </div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelStatus')}</label>
              <div>
                <span className={`rent-badge ${meta.badge}`}>
                  <span className="rent-badge--dot" style={{ background: meta.dot }} />
                  {t(meta.label)}
                </span>
              </div>
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelPropertyPlain')}</label>
              <div>{resolvePropertyName(lease)}</div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelTenantPlain')}</label>
              <div>{resolveTenantName(lease)}</div>
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelStartPlain')}</label>
              <div>{dayjs(lease.start_date).format('YYYY-MM-DD')}</div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelEndPlain')}</label>
              <div>{dayjs(lease.end_date).format('YYYY-MM-DD')}</div>
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelMonthlyRentPlain')}</label>
              <div className="rent-num">
                {lease.currency || '฿'} {Number(lease.monthly_rent || 0).toLocaleString()}
              </div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('leases.labelDepositPlain')}</label>
              <div className="rent-num">
                {lease.currency || '฿'} {Number(lease.deposit_amount || 0).toLocaleString()}
                <span className="rent-text-muted rent-text-sm" style={{ marginLeft: 8 }}>
                  {depositStatusLabel[lease.deposit_status] ? t(depositStatusLabel[lease.deposit_status]) : lease.deposit_status || '-'}
                </span>
              </div>
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('leases.labelContractFile')}</label>
            <div>
              {lease.contract_url ? (
                <a href={lease.contract_url} target="_blank" rel="noreferrer">
                  {lease.contract_url}
                </a>
              ) : (
                <span className="rent-text-muted">{t('leases.notUploaded')}</span>
              )}
            </div>
          </div>
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('leases.labelSpecialTerms')}</label>
            <div>{lease.special_terms || <span className="rent-text-muted">{t('leases.none')}</span>}</div>
          </div>
        </div>
        <div className="rent-modal__footer">
          <button
            className="rent-btn rent-btn--secondary"
            type="button"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
