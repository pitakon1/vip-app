/**
 * 业主专享：订阅套餐卡片 + 「我的订阅」列表。
 * 纯结构拆分自 pages/Tenant/Services.tsx，类名、内联样式与交互保持不变。
 */
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { PLANS, fmtMoney, packageStatusLabel, packageTypeLabel } from '../constants'
import { checkIcon } from '../icons'
import type { PackageItem } from '../types'

export default function OwnerPlans({
  packages,
  onSubscribe,
  onCancelPackage,
}: {
  packages: PackageItem[]
  onSubscribe: () => void
  onCancelPackage: (pkg: PackageItem) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="svc-section">
      <div className="svc-section__head">
        <h3 className="svc-section__title">{t('ownerServices.plansTitle')}</h3>
        <span className="svc-section__hint">{t('ownerServices.plansSubtitle')}</span>
      </div>
      <div className="rent-grid rent-grid--3" style={{ marginBottom: 20 }}>
        {PLANS.map((plan) => {
          const checkColor = plan.recommended ? 'var(--rent-primary)' : 'var(--state-success)'
          return (
            <div
              className="rent-card"
              key={plan.id}
              style={
                plan.recommended
                  ? { border: '2px solid var(--rent-primary)', position: 'relative', boxShadow: 'var(--rent-shadow-2)' }
                  : { border: '1px solid var(--rent-border)' }
              }
            >
              {plan.recommended && (
                <div
                  style={{
                    position: 'absolute',
                    top: -1,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--rent-primary)',
                    color: 'var(--rent-primary-foreground)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 14px',
                    borderRadius: '0 0 var(--rent-radius-md) var(--rent-radius-md)',
                  }}
                >
                  {t('ownerServices.recommended')}
                </div>
              )}
              <div className="rent-card__body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <h4
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: plan.recommended ? 'var(--rent-primary)' : 'var(--rent-ink)',
                      margin: '0 0 10px',
                    }}
                  >
                    {t(plan.name)}
                  </h4>
                  <div>
                    <span className="rent-num" style={{ fontSize: 30, color: 'var(--rent-ink)' }}>{plan.price}</span>
                    <span className="rent-text-sm rent-text-muted">{t(plan.unit)}</span>
                  </div>
                </div>
                <hr className="rent-divider" />
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: '0 0 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    flex: 1,
                  }}
                >
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--rent-ink-2)' }}>
                      {checkIcon(checkColor)}
                      {t(f)}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`rent-btn rent-btn--${plan.recommended ? 'primary' : 'secondary'} rent-btn--block`}
                  onClick={onSubscribe}
                >
                  {t('ownerServices.choose')}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 我的订阅（真实数据） */}
      {packages.length > 0 && (
        <div className="rent-sub-section">
          <h4 className="rent-sub-title">{t('ownerServices.mySubscriptions')}</h4>
          <div className="rent-sub-list">
            {packages.map((pkg) => {
              const st = packageStatusLabel(t, pkg.status)
              return (
                <div className="rent-sub-item" key={pkg.id}>
                  <div className="rent-sub-item__main">
                    <div className="rent-sub-item__name">{packageTypeLabel(t, pkg.type)}</div>
                    <div className="rent-sub-item__meta">
                      {t('ownerServices.propertyLabel')} {pkg.property_id} · {dayjs(pkg.start_date).format('YYYY-MM-DD')} ~ {dayjs(pkg.end_date).format('YYYY-MM-DD')}
                    </div>
                  </div>
                  <div className="rent-sub-item__right">
                    <span className="rent-sub-item__amount">{fmtMoney(pkg.amount, pkg.currency)}</span>
                    <span className={`rent-badge rent-badge--${st.tone}`}>{st.label}</span>
                    {pkg.status === 'active' && (
                      <button
                        type="button"
                        className="rent-btn rent-btn--secondary rent-btn--sm"
                        onClick={() => onCancelPackage(pkg)}
                      >
                        {t('ownerServices.cancelSubscription')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
