/**
 * 合同列表（含加载 / 失败 / 空态）。
 * 纯结构拆分自 pages/Contracts/index.tsx，类名与行渲染逻辑保持不变。
 */
import { useTranslation } from 'react-i18next'
import { Popover } from 'antd'
import DataState from '@/components/DataState'
import { sourceLabel, statusLabel } from './contractTypes'
import type { Contract } from './contractTypes'

/** 仍在流转且已过有效期（与详情卡同一口径） */
const isExpired = (c: Contract) =>
  !!c.expires_at &&
  ['draft', 'sent', 'partially_signed'].includes(c.status) &&
  new Date(c.expires_at) < new Date()

export default function ContractList({
  contracts,
  loading,
  error,
  onRetry,
  onOpen,
  onSuggestResign,
}: {
  contracts: Contract[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpen: (id: string) => void
  onSuggestResign?: (id: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('contracts.listTitle')}</h3>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="rent-table">
            <thead>
              <tr>
                <th>{t('contracts.thTitle')}</th>
                <th>{t('contracts.thSource')}</th>
                <th>{t('contracts.thLanguage')}</th>
                <th>{t('contracts.thStatus')}</th>
                <th>{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {error && contracts.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <DataState
                      error={error}
                      retryText={t('common.retry')}
                      onRetry={onRetry}
                    />
                  </td>
                </tr>
              ) : loading && contracts.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
                  </td>
                </tr>
              ) : contracts.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <DataState empty emptyTitle={t('contracts.noContracts')} />
                  </td>
                </tr>
              ) : (
                contracts.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(c.id)}>
                    <td>
                      <div className="rent-text-bold">{c.title}</div>
                      {c.document_hash && (
                        <div className="rent-text-sm rent-text-muted">hash: {c.document_hash.slice(0, 16)}…</div>
                      )}
                      {isExpired(c) && (
                        <div className="rent-text-sm rent-text-muted" style={{ marginTop: 2 }}>
                          {t('contracts.validUntilExpired', {
                            at: new Date(c.expires_at as string).toLocaleDateString(),
                          })}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="rent-badge rent-badge--neutral">
                        {sourceLabel[c.source || ''] ? t(sourceLabel[c.source || '']) : (c.source || '-')}
                      </span>
                    </td>
                    <td>{c.language || '-'}</td>
                    <td>
                      <div className="rent-badge rent-badge--neutral">{statusLabel[c.status] ? t(statusLabel[c.status]) : c.status}</div>
                      {(c.sign_error || c.signature_health === 'invalid') && (
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
                          {c.sign_error && (
                            <Popover
                              content={c.sign_error_message || t('contracts.signErrorTip')}
                              trigger="click"
                              placement="top"
                            >
                              <span
                                className="rent-badge rent-badge--error"
                                style={{ fontSize: 12, cursor: 'pointer' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t('contracts.signErrorShort')}
                              </span>
                            </Popover>
                          )}
                          {c.signature_health === 'invalid' && (
                            <>
                              <span className="rent-badge rent-badge--warning" style={{ fontSize: 12 }} title={t('contracts.signatureInvalidTip')}>
                                {t('contracts.signatureInvalidShort')}
                              </span>
                              <button
                                type="button"
                                style={{ border: 0, background: 'none', padding: 0, fontSize: 12, color: 'var(--rent-primary)', cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  ;(onSuggestResign || onOpen)(c.id)
                                }}
                              >
                                {t('contracts.suggestResign')}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={(e) => { e.stopPropagation(); onOpen(c.id) }}>
                        {t('contracts.open')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
