import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './not-found.css'

/** 404 兜底页：未知路径统一展示并引导返回首页（修复白屏问题）。 */
const NotFound = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="nf-page">
      <div className="nf-card">
        <div className="nf-code">404</div>
        <h2 className="nf-title">{t('common.404.title')}</h2>
        <p className="nf-desc">{t('common.404.desc')}</p>
        <div className="nf-actions">
          <button className="rent-btn rent-btn--primary" onClick={() => navigate('/')}>
            {t('common.404.backHome')}
          </button>
          <button className="rent-btn rent-btn--secondary" onClick={() => navigate(-1)}>
            {t('common.404.back')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotFound