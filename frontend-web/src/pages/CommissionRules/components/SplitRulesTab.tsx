import { Alert, Button, Empty, Popconfirm, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import { ROLE_LABELS, SCOPE_LABELS } from '../constants'
import type { SplitRule } from '../types'

interface SplitRulesTabProps {
  splitRules: SplitRule[]
  splitLoading: boolean
  splitError: boolean
  partners: { id: string; name: string }[]
  onFetch: () => void
  onCreate: () => void
  onEdit: (rule: SplitRule) => void
  onToggle: (rule: SplitRule) => void
  onDelete: (rule: SplitRule) => void
}

export default function SplitRulesTab({
  splitRules,
  splitLoading,
  splitError,
  partners,
  onFetch,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
}: SplitRulesTabProps) {
  const { t } = useTranslation()
  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('commissionSplit.title')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('commissionSplit.subtitle')}</span>
        <Button type="primary" size="small" style={{ marginLeft: 'auto' }} onClick={onCreate}>
          {t('commissionSplit.addRule')}
        </Button>
      </div>
      <div className="rent-card__body" style={{ padding: 0 }}>
        {splitError && (
          <Alert
            type="warning"
            showIcon
            style={{ margin: 16 }}
            message={t('commissionSplit.errFetch')}
            action={<Button size="small" onClick={() => onFetch()}>{t('common.retry')}</Button>}
          />
        )}
        {!splitError && splitLoading && (
          <div className="rent-empty" style={{ padding: '32px 0' }}>
            <Spin size="small" style={{ marginRight: 8 }} />
            {t('common.loading')}
          </div>
        )}
        {!splitError && !splitLoading && (
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('commissionSplit.colDealType')}</th>
                  <th>{t('commissionSplit.colRole')}</th>
                  <th>{t('commissionSplit.colPercent')}</th>
                  <th>{t('commissionSplit.colScope')}</th>
                  <th>{t('commissionSplit.colEffective')}</th>
                  <th>{t('commissionSplit.colStatus')}</th>
                  <th>{t('commissionRules.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {splitRules.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="rent-empty">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('commissionSplit.empty')} />
                      </div>
                    </td>
                  </tr>
                ) : (
                  splitRules.map((rule) => {
                    const scopeText = SCOPE_LABELS[rule.scope] ? t(SCOPE_LABELS[rule.scope]) : rule.scope
                    const partnerName = rule.scope === 'by_partner'
                      ? (partners.find((p) => p.id === rule.partner_id)?.name || rule.partner_id || '—')
                      : ''
                    const eff = [rule.effective_from, rule.effective_to]
                      .filter((x) => !!x)
                      .map((x) => String(x).replace('T', ' ').slice(0, 10))
                    return (
                      <tr key={rule.id}>
                        <td>{t(`commissionRules.dealType.${rule.deal_type}`)}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {ROLE_LABELS[rule.role] ? t(ROLE_LABELS[rule.role]) : rule.role}
                          </div>
                        </td>
                        <td className="cr-rate">{Number(rule.percent)}%</td>
                        <td>
                          <div>{scopeText}</div>
                          {rule.scope === 'by_partner' && (
                            <div className="rent-text-sm rent-text-muted">{partnerName}</div>
                          )}
                        </td>
                        <td className="rent-text-sm rent-text-muted">
                          {eff.length ? eff.join(' ~ ') : '—'}
                        </td>
                        <td>
                          <span className={`rent-badge ${rule.is_active ? 'rent-badge--success' : 'rent-badge--neutral'}`}>
                            {rule.is_active ? t('commissionRules.active') : t('commissionRules.inactive')}
                          </span>
                        </td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => onEdit(rule)}>{t('common.edit')}</button>
                            <button
                              className="rent-btn rent-btn--ghost rent-btn--sm"
                              onClick={() => onToggle(rule)}
                            >
                              {rule.is_active ? t('commissionRules.inactive') : t('commissionRules.active')}
                            </button>
                            <Popconfirm
                              title={t('commissionSplit.deleteConfirm')}
                              okText={t('common.delete')}
                              okButtonProps={{ danger: true }}
                              onConfirm={() => onDelete(rule)}
                            >
                              <button
                                className="rent-btn rent-btn--ghost rent-btn--sm"
                                style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
                              >
                                {t('common.delete')}
                              </button>
                            </Popconfirm>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
