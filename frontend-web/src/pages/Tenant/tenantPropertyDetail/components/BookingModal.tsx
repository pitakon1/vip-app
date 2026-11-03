import { useTranslation } from 'react-i18next'
import { DatePicker, Input, Modal } from 'antd'
import dayjs from 'dayjs'

interface Props {
  open: boolean
  displayName: string
  bookingAt: dayjs.Dayjs | null
  onBookingAtChange: (value: dayjs.Dayjs | null) => void
  bookingNote: string
  onBookingNoteChange: (value: string) => void
  busy: boolean
  onOk: () => void
  onCancel: () => void
}

/** 预约看房弹窗（无 Form，保持原 destroyOnClose 行为） */
const BookingModal = ({
  open,
  displayName,
  bookingAt,
  onBookingAtChange,
  bookingNote,
  onBookingNoteChange,
  busy,
  onOk,
  onCancel,
}: Props) => {
  const { t } = useTranslation()

  return (
    <Modal
      title={t('tenantPropertyDetail.bookModalTitle')}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText={t('tenantPropertyDetail.submitBooking')}
      cancelText={t('common.cancel')}
      confirmLoading={busy}
      destroyOnClose
    >
      <div style={{ marginBottom: 12, color: 'var(--rent-ink-2)', fontSize: 13 }}>
        {displayName}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
          {t('tenantPropertyDetail.viewingTime')}
        </div>
        <DatePicker
          showTime={{ format: 'HH:mm' }}
          format="YYYY-MM-DD HH:mm"
          style={{ width: '100%' }}
          value={bookingAt || undefined}
          disabledDate={(d) => d && d.isBefore(dayjs().startOf('day'))}
          onChange={(v) => onBookingAtChange(v)}
        />
      </div>
      <div>
        <div className="rent-pay-form-label" style={{ marginBottom: 6 }}>
          {t('tenantPropertyDetail.noteOptional')}
        </div>
        <Input.TextArea
          rows={3}
          value={bookingNote}
          onChange={(e) => onBookingNoteChange(e.target.value)}
          placeholder={t('tenantPropertyDetail.notePlaceholder')}
        />
      </div>
    </Modal>
  )
}

export default BookingModal
