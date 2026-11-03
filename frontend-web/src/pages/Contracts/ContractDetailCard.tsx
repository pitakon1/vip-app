/**
 * 合同详情卡片：签约方信息 + 行内操作按钮。
 * 纯结构拆分自 pages/Contracts/index.tsx，类名、条件与交互保持不变。
 */
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { absSignUrl, statusLabel } from './contractTypes'
import type { ContractDetail } from './hooks/useSignFields'

export default function ContractDetailCard({
  detail,
  canEdit,
  onCopyLink,
  onSend,
  onOpenPreview,
  onOpenSigLib,
  onOpenEdit,
  onOpenParty,
  onOpenVoid,
  onDecline,
}: {
  detail: ContractDetail
  canEdit?: boolean
  onCopyLink: (partyId: string) => void
  onSend: () => void
  onOpenPreview: () => void
  onOpenSigLib: (type: string) => void
  onOpenEdit: () => void
  onOpenParty: () => void
  onOpenVoid: () => void
  onDecline: (partyId: string) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (!detail.contract) return null

  return (
    <div className="rent-card rent-mt-5">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{detail.contract.title}</h3>
        <span className="rent-badge rent-badge--neutral">
          {statusLabel[detail.contract.status] ? t(statusLabel[detail.contract.status]) : detail.contract.status}
        </span>
      </div>
      <div className="rent-card__body">
        <div className="rent-grid rent-grid--2 rent-mb-3">
          {detail.parties.length === 0 ? (
            <div className="rent-empty">{t('contracts.noParties')}</div>
          ) : (
            detail.parties.map((p) => (
              <div key={p.id} className="rent-contract-party">
                <div>
                  <div className="rent-text-bold">
                    {p.name}
                    {p.signed ? (
                      <span className="rent-badge rent-badge--success" style={{ marginLeft: 8 }}>{t('contracts.stSigned')}</span>
                    ) : null}
                  </div>
                  <div className="rent-text-sm rent-text-muted">{t('contracts.roleLabel', { r: p.role })}</div>
                  {(p.email || p.phone) && (
                    <div className="rent-text-sm rent-text-muted">{p.email} {p.phone}</div>
                  )}
                  {p.declined_at && (
                    <div className="rent-text-sm" style={{ color: 'var(--rent-danger, #dc2626)' }}>
                      {t('contracts.declinedAt', { at: p.declined_at })}
                      {p.decline_reason ? `：${p.decline_reason}` : ''}
                    </div>
                  )}
                  {p.sign_url && (
                    <div className="rent-text-sm rent-text-muted">url: {absSignUrl(p.sign_url)}</div>
                  )}
                </div>
                <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
                  {!p.signed && canEdit && (
                    <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onCopyLink(p.id)}>
                      {t('contracts.copyLink')}
                    </button>
                  )}
                  {!p.signed && !p.declined_at && canEdit && (
                    <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={() => onDecline(p.id)}>
                      {t('contracts.decline')}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {canEdit && (
          <div className="rent-flex" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={onSend}>
              {t('contracts.sendNotice')}
            </button>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onOpenPreview}>
              {t('contracts.placeFields')}
            </button>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onOpenSigLib('handwrite')}>
              {t('contracts.mySignLib')}
            </button>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onOpenEdit}>
              {t('contracts.edit')}
            </button>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onOpenParty}>
              + {t('contracts.addParty')}
            </button>
            <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={onOpenVoid}>
              {t('contracts.void')}
            </button>
          </div>
        )}
        <div className="rent-flex" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate(`/verify?id=${detail.contract!.id}`)}>
            {t('contracts.verify')}
          </button>
        </div>
      </div>
    </div>
  )
}
