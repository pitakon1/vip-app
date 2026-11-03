import { useTranslation } from 'react-i18next'
import { pageStyle } from '../constants'
import type { FailType } from '../types'

/** 逾期 / 已签 等失败态 */
export const FailView = ({ fail }: { fail: Exclude<FailType, null> }) => {
  const { t } = useTranslation()
  return (
    <div style={pageStyle}>
      <div className="rent-card">
        <div className="rent-card__body" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div className="rent-text-bold" style={{ fontSize: 18, marginBottom: 8 }}>
            {fail === 'expired' ? t('contracts.errLinkExpired') : fail === 'signed' ? t('contracts.errAlreadySigned') : t('contracts.errGetContract')}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 已拒签 */
export const DeclinedView = () => {
  const { t } = useTranslation()
  return (
    <div style={pageStyle}>
      <div className="rent-card">
        <div className="rent-card__body" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div className="rent-text-bold" style={{ fontSize: 18, marginBottom: 8 }}>{t('contracts.declinedTitle')}</div>
          <div className="rent-text-sm rent-text-muted">{t('contracts.declinedDesc')}</div>
        </div>
      </div>
    </div>
  )
}

/** 签署完成 */
export const SuccessView = () => {
  const { t } = useTranslation()
  return (
    <div style={pageStyle}>
      <div className="rent-card">
        <div className="rent-card__body" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div className="rent-text-bold" style={{ fontSize: 20, margin: '0 0 6px' }}>{t('contracts.successTitle')}</div>
          <div className="rent-text-sm rent-text-muted">{t('contracts.signedDesc')}</div>
        </div>
      </div>
    </div>
  )
}

export const LoadingView = () => {
  const { t } = useTranslation()
  return (
    <div style={pageStyle}>
      <div className="rent-card"><div className="rent-card__body" style={{ textAlign: 'center', padding: '32px' }}>{t('common.loading')}</div></div>
    </div>
  )
}
