import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import brandLogo from '@/assets/haofang-logo.jpg'

/**
 * 顶栏（对齐原型 rent-portal__header）——compact 模式由外层 PortalLayout 提供，此处由调用方跳过。
 */
export default function PortalHeader({
  biz,
  videoOnly,
  token,
  onEnterSystem,
}: {
  biz: string
  videoOnly: boolean
  token: string | null
  onEnterSystem: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <header className="rent-portal__header">
      <div className="rent-portal__brand" onClick={() => navigate('/')}>
        <img className="rent-portal__logo" src={brandLogo} alt="HaoFang.World" loading="lazy" decoding="async" />
        <span className="rent-portal__name">HaoFang.World</span>
      </div>
      <nav className="rent-portal__nav">
        {/* data-active 必须跟着真实状态走：此前「买房」被写死为高亮，
            即使用户停在「整租」页，顶栏也显示在买房——导航说谎比没有高亮更糟 */}
        <button className="rent-portal__nav-item" data-active={biz === 'rent'} onClick={() => navigate('/')}>{t('browse.rent')}</button>
        <button className="rent-portal__nav-item" data-active={biz === 'sale'} onClick={() => navigate('/listings')}>{t('browse.buy')}</button>
        <button className="rent-portal__nav-item" data-active={false} onClick={() => navigate('/map')}>{t('browse.mapFind')}</button>
        <button className="rent-portal__nav-item" data-active={videoOnly} onClick={() => navigate('/listings?video=1')}>{t('browse.video')}</button>
      </nav>
      <div className="rent-portal__actions">
        <LanguageSwitcher compact />
        {token ? (
          <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={onEnterSystem}>
            {t('home.enterSystem')}
          </button>
        ) : (
          <>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/login')}>
              {t('home.login')}
            </button>
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => navigate('/register')}>
              {t('register.submit')}
            </button>
          </>
        )}
      </div>
    </header>
  )
}
