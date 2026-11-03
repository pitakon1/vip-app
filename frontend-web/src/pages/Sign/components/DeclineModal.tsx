import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'

/** 拒签弹窗 */
const DeclineModal = ({
  open,
  reason,
  onChangeReason,
  onOk,
  onCancel,
}: {
  open: boolean
  reason: string
  onChangeReason: (v: string) => void
  onOk: () => void
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      title={t('contracts.declineTitle')}
      okText={t('contracts.decline')}
      okButtonProps={{ danger: true }}
      cancelText={t('common.cancel')}
      onOk={onOk}
      onCancel={onCancel}
    >
      <div className="rent-field">
        <label className="rent-label">{t('contracts.declineReason')}</label>
        <textarea className="rent-input" rows={3} value={reason} placeholder={t('contracts.declineReasonPlaceholder')} onChange={(e) => onChangeReason(e.target.value)} />
      </div>
    </Modal>
  )
}

export default DeclineModal
