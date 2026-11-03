import { Alert, Button } from 'antd'
import { useTranslation } from 'react-i18next'
import type { Broker, CommissionRule, DealType, Scope } from '../types'
import { rateAsPercent } from '../utils'

interface CommissionRulesTabProps {
  loading: boolean
  loadFailed: boolean
  items: CommissionRule[]
  pagedItems: CommissionRule[]
  page: number
  pageCount: number
  pageSize: number
  brokers: Broker[]
  dealTypeText: Record<DealType, string>
  scopeText: Record<Scope, string>
  onRefresh: () => void
  onPrev: () => void
  onNext: () => void
  onEdit: (rule: CommissionRule) => void
  onToggle: (rule: CommissionRule) => void
  onDelete: (rule: CommissionRule) => void
}

export default function CommissionRulesTab({
  loading,
  loadFailed,
  items,
  pagedItems,
  page,
  pageCount,
  pageSize,
  brokers,
  dealTypeText,
  scopeText,
  onRefresh,
  onPrev,
  onNext,
  onEdit,
  onToggle,
  onDelete,
}: CommissionRulesTabProps) {
  const { t } = useTranslation()
  return (
    <>
      {loadFailed && !loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('commissionRules.fetchFailed')}
          action={<Button size="small" onClick={() => onRefresh()}>{t('common.retry')}</Button>}
        />
      )}

      {loading ? (
        <div className="rent-empty"><div className="rent-text-muted">{t('common.loading')}</div></div>
      ) : (
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('commissionRules.listTitle')}</h3>
            <span className="rent-badge rent-badge--neutral">{t('commissionRules.countItem', { count: items.length })}</span>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            {items.length === 0 ? (
              <div className="rent-empty rent-text-muted">{t('commissionRules.empty')}</div>
            ) : (
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>{t('commissionRules.colName')}</th>
                      <th>{t('commissionRules.colDealType')}</th>
                      <th>{t('commissionRules.colRate')}</th>
                      <th>{t('commissionRules.colScope')}</th>
                      <th>{t('commissionRules.colLimits')}</th>
                      <th>{t('commissionRules.colStatus')}</th>
                      <th>{t('commissionRules.colAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedItems.map((r) => {
                      const scopeDetail =
                        r.scope === 'by_department'
                          ? r.department || '—'
                          : r.scope === 'by_employee'
                            ? r.employee_name || r.employee_id || '—'
                            : r.scope === 'by_broker'
                              ? brokers.find((b) => b.id === r.broker_id)?.partner_name || r.broker_id || '—'
                              : t('commissionRules.allScope')
                      const limits =
                        r.minimum_amount != null || r.cap_amount != null
                          ? `฿${Number(r.minimum_amount ?? 0)} ~ ${r.cap_amount != null ? `฿${Number(r.cap_amount)}` : t('commissionRules.noCap')}`
                          : t('commissionRules.noLimit')
                      return (
                        <tr key={r.id}>
                          <td>
                            <div>{r.name}</div>
                            {r.description && (
                              <div className="rent-text-sm rent-text-muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.description}
                              </div>
                            )}
                          </td>
                          <td>{dealTypeText[r.deal_type] || r.deal_type}</td>
                          <td className="cr-rate">{rateAsPercent(r.rate)}</td>
                          <td>
                            <div>{scopeText[r.scope] || r.scope}</div>
                            <div className="rent-text-sm rent-text-muted">{scopeDetail}</div>
                          </td>
                          <td><span className="rent-table__mono">{limits}</span></td>
                          <td>
                            <span className={`rent-badge ${r.is_active ? 'rent-badge--success' : 'rent-badge--neutral'}`}>
                              {r.is_active ? t('commissionRules.active') : t('commissionRules.inactive')}
                            </span>
                          </td>
                          <td>
                            <div className="rent-flex rent-gap-2">
                              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onEdit(r)}>{t('common.edit')}</button>
                              <button
                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                onClick={() => onToggle(r)}
                              >
                                {r.is_active ? t('commissionRules.inactive') : t('commissionRules.active')}
                              </button>
                              <button
                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                                onClick={() => onDelete(r)}
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {items.length > 0 && (
              <div className="rent-pagination" style={{ marginTop: 14, padding: '0 22px 16px' }}>
                <span className="rent-pagination__info">共 {items.length} 条 · 每页 {pageSize} 条</span>
                <button className="rent-pagination__btn" onClick={onPrev} disabled={page <= 1}>上一页</button>
                <span className="rent-pagination__info">{page} / {pageCount}</span>
                <button className="rent-pagination__btn" onClick={onNext} disabled={page >= pageCount}>下一页</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="rent-form-hint" style={{ marginTop: 12 }}>
        {t('commissionRules.rulesHint')}
      </div>
    </>
  )
}
