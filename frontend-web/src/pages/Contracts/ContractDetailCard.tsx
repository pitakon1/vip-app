/**
 * 合同详情卡片：签约方信息 + 行内操作按钮。
 * 纯结构拆分自 pages/Contracts/index.tsx，类名、条件与交互保持不变。
 */
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { downloadFile } from '@/lib/download'
import { errorText } from '@/lib/errorText'
import { absSignUrl, statusLabel, approvalStatusLabel, approvalRoleLabel, approvalFieldLabel, approvalOperatorLabel } from './contractTypes'
import type { ContractDetail } from './hooks/useSignFields'

export default function ContractDetailCard({
  detail,
  canEdit,
  canRevoke,
  onCopyLink,
  onShowQr,
  onRotateLink,
  onSend,
  onOpenPreview,
  onOpenSigLib,
  onOpenEdit,
  onOpenParty,
  onOpenVoid,
  onRevoke,
  onRemind,
  onDecline,
  onOpenSignOrder,
  onOpenCallback,
  onSubmitApproval,
}: {
  detail: ContractDetail
  canEdit?: boolean
  canRevoke?: boolean
  onCopyLink: (partyId: string) => void
  onShowQr: (partyId: string) => void
  onRotateLink: (partyId: string) => void
  onSend: () => void
  onOpenPreview: () => void
  onOpenSigLib: (type: string) => void
  onOpenEdit: () => void
  onOpenParty: () => void
  onOpenVoid: () => void
  onRevoke: () => void
  onRemind: (partyId?: string) => void
  onDecline: (partyId: string) => void
  onOpenSignOrder: () => void
  onOpenCallback: () => void
  onSubmitApproval: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (!detail.contract) return null

  const contract = detail.contract
  // 有效期只对「还在流转中」的合同有意义：已签/已完成/已作废不应显示「已过期」
  const showExpiry =
    !!contract.expires_at &&
    ['draft', 'sent', 'partially_signed'].includes(contract.status)
  // 已签件只有实际产出了存档才显示下载入口（历史合同可能从未产出 PDF）
  const canDownloadSigned = !!contract.signed_pdf_available
  // 存证报告按当前存档实时计算，只要进入签署流程就有意义
  const canDownloadEvidence =
    canDownloadSigned || ['partially_signed', 'signed', 'completed'].includes(contract.status)

  const handleDownload = (path: string, fallbackName: string) => {
    downloadFile(path, fallbackName).catch((err) => {
      message.error(errorText(err, t('contracts.downloadFailed')))
    })
  }

  return (
    <div className="rent-card rent-mt-5" id="contract-detail-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{detail.contract.title}</h3>
        <span className="rent-badge rent-badge--neutral">
          {statusLabel[detail.contract.status] ? t(statusLabel[detail.contract.status]) : detail.contract.status}
        </span>
        {detail.contract.sign_order_type === 'sequential' && (
          <span className="rent-badge rent-badge--neutral">{t('contracts.signOrderSequential')}</span>
        )}
        {showExpiry && (
          <span className={`rent-badge ${contract.expired ? 'rent-badge--warning' : 'rent-badge--neutral'}`}>
            {contract.expired
              ? t('contracts.expiredBadge')
              : t('contracts.expiresAt', { at: new Date(contract.expires_at as string).toLocaleString() })}
          </span>
        )}
      </div>
      <div className="rent-card__body">
        {contract.approval && (
          <div
            className="rent-badge rent-badge--neutral"
            style={{ display: 'block', padding: '10px 12px', marginBottom: 12, whiteSpace: 'normal' }}
          >
            <div className="rent-text-bold">
              {t('contracts.approval.title')} ·{' '}
              {t(approvalStatusLabel[contract.approval.status] || contract.approval.status)}
              {contract.approval.status === 'pending' &&
                ` · ${t('contracts.approval.levelProgress', {
                  current: contract.approval.current_level,
                  total: contract.approval.required_level,
                })}`}
            </div>
            {contract.approval.levels?.length > 0 && (
              <div className="rent-text-sm" style={{ marginTop: 4 }}>
                {contract.approval.levels
                  .map(
                    (lv) =>
                      `${t('contracts.approval.levelN', { n: lv.level })} ${t(
                        approvalRoleLabel[lv.role] || lv.role,
                      )}`,
                  )
                  .join(' → ')}
              </div>
            )}
            {contract.approval.rule_hits?.length > 0 && (
              <div className="rent-text-sm" style={{ marginTop: 4 }}>
                <b>{t('contracts.approval.ruleHits')}：</b>
                {contract.approval.rule_hits
                  .map((hit) => {
                    const range =
                      hit.threshold_max != null ? `${hit.threshold} ~ ${hit.threshold_max}` : `${hit.threshold}`
                    return `${t(approvalFieldLabel[hit.field] || hit.field)} ${
                      approvalOperatorLabel[hit.operator] || hit.operator
                    } ${range}（${t('contracts.approval.actualValue')} ${hit.value}）`
                  })
                  .join('；')}
              </div>
            )}
            {contract.approval.comment && (
              <div className="rent-text-sm" style={{ marginTop: 4 }}>
                {t('contracts.approval.opinion')}：{contract.approval.comment}
              </div>
            )}
            {contract.approval.status === 'pending' && (
              <div className="rent-text-sm" style={{ marginTop: 4 }}>
                {t('contracts.approval.pendingHint')}
              </div>
            )}
            {contract.approval.status === 'rejected' && (
              <div className="rent-text-sm" style={{ marginTop: 4 }}>
                {t('contracts.approval.rejectedHint')}
              </div>
            )}
          </div>
        )}
        {detail.contract.signature_health === 'invalid' && (
          <div
            className="rent-badge rent-badge--warning"
            style={{ display: 'block', padding: '10px 12px', marginBottom: 12, whiteSpace: 'normal' }}
          >
            <b>{t('contracts.signatureInvalid')}</b>
            <div className="rent-text-sm" style={{ marginTop: 4 }}>
              {t('contracts.signatureInvalidTip')}
            </div>
          </div>
        )}
        {showExpiry && contract.expired && (
          <div
            className="rent-badge rent-badge--warning"
            style={{ display: 'block', padding: '10px 12px', marginBottom: 12, whiteSpace: 'normal' }}
          >
            <b>{t('contracts.expiredBadge')}</b>
            <div className="rent-text-sm" style={{ marginTop: 4 }}>{t('contracts.expiredTip')}</div>
          </div>
        )}
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
                    {!p.signed && !!p.sign_order && detail.contract?.sign_order_type === 'sequential' && (
                      <span className="rent-badge rent-badge--neutral" style={{ marginLeft: 8 }}>
                        {t('contracts.signOrderN', { n: p.sign_order })}
                      </span>
                    )}
                    {!p.signed && p.can_sign_now === false && (
                      <span className="rent-badge rent-badge--warning" style={{ marginLeft: 8 }}>
                        {t('contracts.waitingTurn')}
                      </span>
                    )}
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
                  {!p.signed && canEdit && (
                    <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onShowQr(p.id)}>
                      {t('contracts.showQr')}
                    </button>
                  )}
                  {!p.signed && canEdit && (
                    <button
                      className="rent-btn rent-btn--ghost rent-btn--sm"
                      // 仅当前链接未过期时可用：过期后复制/二维码会自动签发新链接，无需「作废」动作
                      disabled={!p.sign_token_expires_at || Date.parse(p.sign_token_expires_at) <= Date.now()}
                      onClick={() => onRotateLink(p.id)}
                    >
                      {t('contracts.rotateLink')}
                    </button>
                  )}
                  {!p.signed && !!p.reminded_count && (
                    <div className="rent-text-sm rent-text-muted">
                      {t('contracts.remindedCount', { n: p.reminded_count })}
                      {p.last_reminded_at
                        ? `（${new Date(p.last_reminded_at).toLocaleString()}）`
                        : ''}
                    </div>
                  )}
                  {!p.signed && !p.declined_at && canEdit && (
                    <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onRemind(p.id)}>
                      {t('contracts.remind')}
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
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onRemind()}>
              {t('contracts.remindAll')}
            </button>
            {contract.can_submit_approval && (
              <button
                className="rent-btn rent-btn--primary rent-btn--sm"
                disabled={contract.status === 'pending_approval'}
                onClick={onSubmitApproval}
              >
                {contract.status === 'pending_approval'
                  ? t('contracts.approval.inProgress')
                  : t('contracts.approval.submit')}
              </button>
            )}
            <button
              className="rent-btn rent-btn--primary rent-btn--sm"
              disabled={contract.status === 'pending_approval'}
              title={contract.status === 'pending_approval' ? t('contracts.approval.sendBlocked') : undefined}
              onClick={onSend}
            >
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
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onOpenSignOrder}>
              {t('contracts.signOrder')}
            </button>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onOpenCallback}>
              {t('contracts.callback')}
            </button>
            <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={onOpenVoid}>
              {t('contracts.void')}
            </button>
            {canRevoke && (
              <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={onRevoke}>
                {t('contracts.revoke')}
              </button>
            )}
          </div>
        )}
        <div className="rent-flex" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {canDownloadSigned && (
            <button
              className="rent-btn rent-btn--ghost rent-btn--sm"
              onClick={() => handleDownload(`/contracts/${contract.id}/signed-file`, `${contract.title || 'contract'}_signed.pdf`)}
            >
              {t('contracts.downloadSignedContract')}
            </button>
          )}
          {canDownloadEvidence && (
            <button
              className="rent-btn rent-btn--ghost rent-btn--sm"
              onClick={() => handleDownload(`/contracts/${contract.id}/evidence-report`, `${contract.title || 'contract'}_evidence.pdf`)}
            >
              {t('contracts.downloadEvidenceReport')}
            </button>
          )}
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate(`/verify?id=${contract.id}`)}>
            {t('contracts.verify')}
          </button>
        </div>
      </div>
    </div>
  )
}
