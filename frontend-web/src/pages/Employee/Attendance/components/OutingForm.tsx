import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'

interface OutingFormProps {
  formRef: RefObject<HTMLDivElement>
  location: string
  onLocationChange: (value: string) => void
  returnTime: string
  onReturnChange: (value: string) => void
  reason: string
  onReasonChange: (value: string) => void
  onReset: () => void
  onSubmit: () => void
}

/** 外勤登记表单（定位超范围时作为补充流程）。 */
const OutingForm = ({
  formRef,
  location,
  onLocationChange,
  returnTime,
  onReturnChange,
  reason,
  onReasonChange,
  onReset,
  onSubmit,
}: OutingFormProps) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card" ref={formRef}>
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('attendance.outingRegister')}</h3>
        <span className="rent-caption">{t('attendance.outingFormHint')}</span>
      </div>
      <div className="rent-card__body">
        <div className="rent-grid rent-grid--2 rent-mb-4">
          <div className="rent-field">
            <label className="rent-label">{t('attendance.labelOutingLocation')}</label>
            <input
              className="rent-input"
              type="text"
              placeholder={t('attendance.phOutingLocation')}
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
            />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attendance.labelOutingReturn')}</label>
            <input
              className="rent-input"
              type="datetime-local"
              value={returnTime}
              onChange={(e) => onReturnChange(e.target.value)}
            />
          </div>
        </div>
        <div className="rent-field rent-mb-4">
          <label className="rent-label">{t('attendance.labelOutingReason')}</label>
          <textarea
            className="rent-textarea"
            rows={3}
            placeholder={t('attendance.phOutingReason')}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </div>
        <div className="rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="rent-btn rent-btn--secondary" onClick={onReset}>
            {t('common.cancel')}
          </button>
          <button className="rent-btn rent-btn--primary" onClick={onSubmit}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {t('attendance.submitOuting')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OutingForm
