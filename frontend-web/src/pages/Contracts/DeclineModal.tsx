/**
 * 拒签弹窗：选择签署方 + 填写原因。
 * 纯结构拆分自 pages/Contracts/index.tsx，选项过滤与交互保持不变。
 */
import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import type { Party } from './contractTypes'

export default function DeclineModal({
  open,
  parties,
  partyId,
  setPartyId,
  reason,
  setReason,
  onCancel,
  onOk,
}: {
  open: boolean
  parties: Party[]
  partyId: string
  setPartyId: (v: string) => void
  reason: string
  setReason: (v: string) => void
  onCancel: () => void
  onOk: () => void
}) {
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
      <div className="rent-field" style={{ marginBottom: 12 }}>
        <label className="rent-label">{t('contracts.fieldAssignee')}</label>
        <select className="rent-input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          {parties.filter((p) => !p.signed && !p.declined_at).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.role}）
            </option>
          ))}
        </select>
      </div>
      <div className="rent-field">
        <label className="rent-label">{t('contracts.declineReason')}</label>
        <textarea className="rent-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  )
}
