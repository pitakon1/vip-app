/**
 * 服务页 Hero 区块。
 * 纯结构拆分自 pages/Tenant/Services.tsx，类名、文案与统计展示保持不变。
 */
import { useTranslation } from 'react-i18next'

export default function HeroSection({
  isOwner,
  stats,
}: {
  isOwner: boolean
  stats: { value: string; label: string }[]
}) {
  const { t } = useTranslation()

  return (
    <section className="svc-hero">
      <div className="svc-hero__decor svc-hero__decor--1"></div>
      <div className="svc-hero__decor svc-hero__decor--2"></div>
      <div className="svc-hero__decor svc-hero__decor--3"></div>
      <div className="svc-hero__content">
        {!isOwner && (
          <span className="svc-hero__eyebrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .587l3.668 7.431L24 9.75l-6 5.847 1.417 8.265L12 19.771l-7.417 4.091L6 15.597 0 9.75l8.332-1.732z"/></svg>
            {t('tenantServices.tenantExclusive')}
          </span>
        )}
        <h2 className="svc-hero__title">{t('tenantServices.recommendedTitle')}</h2>
        <p className="svc-hero__subtitle">{t('tenantServices.recommendedSubtitle')}</p>
        <button
          className="svc-hero__action"
          onClick={() => {
            const el = document.getElementById('svc-categories')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('tenantServices.startBooking')}
        </button>
      </div>
      <div className="svc-hero__stats">
        {stats.map((s) => (
          <div key={s.label} className="svc-hero__stat">
            <div className="svc-hero__stat-value">{s.value}</div>
            <div className="svc-hero__stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
