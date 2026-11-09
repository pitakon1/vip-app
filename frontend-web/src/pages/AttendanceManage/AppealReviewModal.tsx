/**
 * 申诉审批弹窗。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，文案与交互保持不变。
 */
import { Modal } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

export default function AppealReviewModal({
  appealReview,
  appealNote,
  setAppealNote,
  saving,
  onCancel,
  onSubmit,
}: {
  appealReview: { appeal: any; action: 'approved' | 'rejected' } | null
  appealNote: string
  setAppealNote: Dispatch<SetStateAction<string>>
  saving: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={!!appealReview}
      title={appealReview?.action === 'approved' ? t('attAdm.approve') : t('attAdm.reject')}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={saving}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      destroyOnHidden
    >
      {appealReview && (
        <div className="attAdm-form">
          <div className="rent-text-sm rent-text-muted rent-mb-4">
            {appealReview.appeal.name} · {appealReview.appeal.department || '—'} ·{' '}
            {String(appealReview.appeal.date ?? '').slice(0, 10)}
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.thReason')}</label>
            <div className="rent-text-sm">{appealReview.appeal.reason}</div>
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('attAdm.replyNote')}</label>
            <textarea
              className="rent-textarea"
              rows={3}
              placeholder={t('attAdm.phReplyNote')}
              value={appealNote}
              onChange={(e) => setAppealNote(e.target.value)}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
