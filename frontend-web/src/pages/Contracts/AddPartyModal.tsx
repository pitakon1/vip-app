/**
 * 追加签署方弹窗。
 * 纯结构拆分自 pages/Contracts/index.tsx，字段与选项保持不变。
 */
import { Modal } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

type PartyForm = { name: string; email: string; role: string }

export default function AddPartyModal({
  open,
  form,
  setForm,
  onCancel,
  onOk,
}: {
  open: boolean
  form: PartyForm
  setForm: Dispatch<SetStateAction<PartyForm>>
  onCancel: () => void
  onOk: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      title={t('contracts.addParty')}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      onOk={onOk}
      onCancel={onCancel}
    >
      <div className="rent-field" style={{ marginBottom: 12 }}>
        <label className="rent-label">{t('contracts.fName')}</label>
        <input className="rent-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="rent-field" style={{ marginBottom: 12 }}>
        <label className="rent-label">{t('contracts.fEmail')}</label>
        <input className="rent-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="rent-field">
        <label className="rent-label">{t('contracts.fRole')}</label>
        <select className="rent-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="tenant">tenant</option>
          <option value="landlord">landlord</option>
          <option value="agent">agent</option>
          <option value="witness">witness</option>
        </select>
      </div>
    </Modal>
  )
}
