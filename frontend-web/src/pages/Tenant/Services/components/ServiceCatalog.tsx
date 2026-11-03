/**
 * 服务分类区（真实价目表）。
 * 纯结构拆分自 pages/Tenant/Services.tsx，类名、价格与按钮文案保持不变。
 */
import { useTranslation } from 'react-i18next'
import { CARD_META, DEFAULT_CARD_META, ICON_TYPE } from '../constants'
import { ServiceIcon } from '../icons'
import type { CatalogItem } from '../types'

export default function ServiceCatalog({
  catalog,
  serviceNameOf,
  unitOf,
  onBook,
}: {
  catalog: CatalogItem[]
  serviceNameOf: (code: string, catalogItems: CatalogItem[]) => string
  unitOf: (code: string, catalogItems: CatalogItem[]) => string
  onBook: (item: CatalogItem) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="svc-section" id="svc-categories">
      <div className="svc-section__head">
        <h3 className="svc-section__title">{t('tenantServices.categoryTitle')}</h3>
        <span className="svc-section__hint">{t('tenantServices.categoryHint')}</span>
      </div>
      {catalog.length === 0 ? (
        <div className="rent-empty">{t('tenantServices.emptyCatalog')}</div>
      ) : (
        <div className="svc-category-grid">
          {catalog.map((item) => {
            const meta = CARD_META[item.code] ?? DEFAULT_CARD_META
            const badge = t(`tenantServices.serviceBadge.${item.code}`, { defaultValue: '' })
            const desc = t(`tenantServices.serviceDesc.${item.code}`, { defaultValue: '' })
            const price = Number(item.base_price || 0)
            return (
              <div key={item.code} className="svc-category-card">
                <div className="svc-category-card__top">
                  <div className="svc-category-card__icon" style={{ background: meta.iconBg, color: meta.iconColor }}>
                    <ServiceIcon type={ICON_TYPE[item.code] ?? 'other'} />
                  </div>
                  {badge && <span className={`svc-pill-badge svc-pill-badge--${meta.badgeType}`}>{badge}</span>}
                </div>
                <h4 className="svc-category-card__title">{serviceNameOf(item.code, catalog)}</h4>
                {desc && <p className="svc-category-card__desc">{desc}</p>}
                <div className="svc-category-card__footer">
                  <div>
                    <span className="svc-category-card__price-label">
                      {price > 0 ? t('tenantServices.priceFrom') : t('tenantServices.priceLabel')}
                    </span>
                    {price > 0 ? (
                      <span className="svc-category-card__price">
                        ฿{price.toLocaleString()}
                        <span className="svc-category-card__price-unit">
                          /{unitOf(item.code, catalog)}
                        </span>
                      </span>
                    ) : (
                      <span className="svc-category-card__price" style={{ color: 'var(--state-success)' }}>
                        {t('tenantServices.freeService')}
                      </span>
                    )}
                  </div>
                  <button className="svc-category-card__btn" onClick={() => onBook(item)}>
                    {t('tenantServices.bookService')}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
