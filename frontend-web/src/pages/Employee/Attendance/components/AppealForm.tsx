import { useTranslation } from 'react-i18next'
import { Button, DatePicker, Input } from 'antd'
import type { Dayjs } from 'dayjs'

interface AppealFormProps {
  date: Dayjs | null
  onDateChange: (date: Dayjs | null) => void
  reason: string
  onReasonChange: (reason: string) => void
  submitting: boolean
  onSubmit: () => void
}

/** 打卡异常申诉表单。 */
const AppealForm = ({ date, onDateChange, reason, onReasonChange, submitting, onSubmit }: AppealFormProps) => {
  const { t } = useTranslation()

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('attendance.appeal')}</h3>
        <span className="rent-caption">{t('attendance.appealSubmit')}</span>
      </div>
      <div className="rent-card__body">
        <div className="rent-field rent-mb-4">
          <label className="rent-label">{t('attAdm.appealDate')}</label>
          <DatePicker
            value={date}
            onChange={(d) => onDateChange(d)}
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
          />
        </div>
        <div className="rent-field rent-mb-4">
          <label className="rent-label">{t('attendance.appealReason')}</label>
          <Input.TextArea
            rows={3}
            placeholder={t('attendance.appealPlaceholder')}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </div>
        <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
          <Button type="primary" onClick={onSubmit} loading={submitting}>
            {t('attendance.appealSubmit')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AppealForm
