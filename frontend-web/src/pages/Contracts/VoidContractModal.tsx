/**
 * 作废合同弹窗。
 * 纯结构拆分自 pages/Contracts/index.tsx，文案与提交行为保持不变。
 */
import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'

export default function VoidContractModal({
  open,
  reason,
  onReasonChange,
  onCancel,
  onOk,
}: {
  open: boolean
  reason: string
  onReasonChange: (v: string) => void
  onCancel: () => void
  onOk: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      title={t('contracts.voidTitle')}
      okText={t('contracts.void')}
      okButtonProps={{ danger: true }}
      cancelText={t('common.cancel')}
      onOk={onOk}
      onCancel={onCancel}
    >
      <div className="rent-field">
        <label className="rent-label">{t('contracts.voidReason')}</label>
        <textarea className="rent-input" rows={3} value={reason} onChange={(e) => onReasonChange(e.target.value)} />
      </div>
    </Modal>
  )
}
