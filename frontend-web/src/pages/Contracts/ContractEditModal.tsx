/**
 * 合同编辑弹窗（标题 + HTML 正文）。
 * 纯结构拆分自 pages/Contracts/index.tsx，字段与保存行为保持不变。
 */
import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'

export default function ContractEditModal({
  open,
  title,
  content,
  onTitleChange,
  onContentChange,
  onCancel,
  onOk,
}: {
  open: boolean
  title: string
  content: string
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onCancel: () => void
  onOk: () => void
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      title={t('contracts.edit')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      onOk={onOk}
      onCancel={onCancel}
    >
      <div className="rent-field" style={{ marginBottom: 12 }}>
        <label className="rent-label">{t('contracts.thTitle')}</label>
        <input className="rent-input" value={title} onChange={(e) => onTitleChange(e.target.value)} />
      </div>
      <div className="rent-field">
        <label className="rent-label">HTML</label>
        <textarea
          className="rent-input"
          rows={8}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="<h1>...</h1>"
        />
      </div>
    </Modal>
  )
}
