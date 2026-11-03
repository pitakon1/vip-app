import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

/**
 * 页脚（对齐原型 rent-footer）。
 */
export default function PortalFooter() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <footer className="rent-footer">
      <div className="rent-footer__inner">
        <div>
          <div className="rent-footer__brand-name">HaoFang.World</div>
          <div className="rent-footer__brand-desc">{t('login.subtagline')}</div>
        </div>
        <div className="rent-footer__col">
          <div className="rent-footer__col-title">{t('home.footerProduct')}</div>
          <button type="button" onClick={() => navigate('/listings')}>{t('browse.rent')}</button>
          <button type="button" onClick={() => navigate('/listings')}>{t('browse.buy')}</button>
          <button type="button" onClick={() => navigate('/map')}>{t('browse.mapFind')}</button>
          <button type="button" onClick={() => navigate('/listings?video=1')}>{t('browse.video')}</button>
        </div>
        <div className="rent-footer__col">
          <div className="rent-footer__col-title">{t('home.footerAbout')}</div>
          <button type="button" onClick={() => navigate('/login')}>{t('home.login')}</button>
          <button type="button" onClick={() => navigate('/company')}>{t('menu.company')}</button>
        </div>
        <div className="rent-footer__col">
          <div className="rent-footer__col-title">{t('home.footerContact')}</div>
          <a tabIndex={-1}>contact@rentflow.com</a>
          <a tabIndex={-1}>+66 2 123 4567</a>
          <a tabIndex={-1}>Bangkok, Thailand</a>
        </div>
      </div>
      <div className="rent-footer__bottom">
        © {new Date().getFullYear()} HaoFang.World · {t('common.appName')}
      </div>
    </footer>
  )
}
