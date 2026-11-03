/**
 * 请假审批弹窗。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，文案与交互保持不变。
 */
import { Modal } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { LeaveType } from './attendanceTypes'

export default function LeaveReviewModal({
  review,
  replyNote,
  setReplyNote,
  saving,
  leaveTypeLabel,
  onCancel,
  onSubmit,
}: {
  review: { leave: any; action: 'approved' | 'rejected' } | null
  replyNote: string
  setReplyNote: Dispatch<SetStateAction<string>>
  saving: boolean
  leaveTypeLabel: Record<LeaveType, string>
  onCancel: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={!!review}
      title={review?.action === 'approved' ? t('attAdm.approve') : t('attAdm.reject')}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={saving}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      destroyOnClose
    >
      {review && (
        <div className="attAdm-form">
          <div className="rent-text-sm rent-text-muted rent-mb-4">
            {review.leave.name} · {leaveTypeLabel[review.leave.leave_type as LeaveType]} ·{' '}
            {review.leave.start_date} ~ {review.leave.end_date} · {review.leave.days}
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.replyNote')}</label>
            <textarea
              className="rent-textarea"
              rows={3}
              placeholder={t('attAdm.phReplyNote')}
              value={replyNote}
              onChange={(e) => setReplyNote(e.target.value)}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
