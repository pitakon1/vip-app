/**
 * 年度服务套餐促销 Banner。
 * 纯结构拆分自 pages/Tenant/Services.tsx，展示价、确认弹窗文案与按钮保持不变。
 */
import { useTranslation } from 'react-i18next'
import { Modal } from 'antd'
import { PROMO_PRICE, formatAmount } from '../constants'

export default function PromoBanner({ onBuy }: { onBuy: () => Promise<void> }) {
  const { t } = useTranslation()

  return (
    <section className="svc-promo">
      <div className="svc-promo__decor"></div>
      <div className="svc-promo__decor svc-promo__decor--2"></div>
      <div className="svc-promo__body">
        <div className="svc-promo__icon">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20 12v9H4v-9"/><rect x="2" y="7" width="20" height="5" rx="1"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
        </div>
        <div>
          <h3 className="svc-promo__title">{t('tenantServices.promoTitle')}</h3>
          <p className="svc-promo__desc">{t('tenantServices.promoDesc')}</p>
          <div className="svc-promo__price-row">
            <span className="svc-promo__price">฿{PROMO_PRICE.toLocaleString()}</span>
            <span className="svc-promo__price-old">฿1,680</span>
            <span className="svc-promo__save">{t('tenantServices.saveLabel')}</span>
          </div>
        </div>
      </div>
      <button
        className="svc-promo__btn"
        onClick={() =>
          Modal.confirm({
            title: t('tenantServices.promoTitle'),
            content: t('tenantServices.promoConfirm', { price: formatAmount(PROMO_PRICE) }),
            okText: t('tenantServices.buyNow'),
            cancelText: t('tenantServices.cancel'),
            onOk: onBuy,
          })
        }
      >
        {t('tenantServices.buyNow')}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </section>
  )
}
