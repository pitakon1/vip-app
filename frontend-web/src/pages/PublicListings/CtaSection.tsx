import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

/**
 * 底部 CTA（登录 / 注册 / 进入系统）。
 */
export default function CtaSection({
  token,
  onEnterSystem,
}: {
  token: string | null
  onEnterSystem: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <section className="rent-cta">
      <div className="rent-cta__inner">
        <div className="rent-cta__text">
          <div className="rent-cta__title">{t('home.ctaTitle')}</div>
          <div className="rent-cta__desc">{t('home.ctaDesc')}</div>
        </div>
        <div className="rent-cta__actions">
          {!token && (
            <button className="rent-btn rent-btn--ghost rent-cta__ghost" onClick={() => navigate('/login')}>
              {t('home.login')}
            </button>
          )}
          <button className="rent-btn rent-btn--primary rent-btn--lg rent-cta__primary" onClick={token ? onEnterSystem : () => navigate('/register')}>
            {token ? t('home.enterSystem') : t('register.submit')}
          </button>
        </div>
      </div>
    </section>
  )
}
