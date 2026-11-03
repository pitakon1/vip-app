import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import SignCanvas from './SignCanvas'

/** 手写签名制作弹窗 */
const SignModal = ({
  open,
  draft,
  rasterizing,
  onChangeDraft,
  onOk,
  onCancel,
}: {
  open: boolean
  draft: string
  rasterizing: boolean
  onChangeDraft: (svg: string) => void
  onOk: () => void
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      title={t('contracts.setSign')}
      okText={t('contracts.confirmSign')}
      cancelText={t('common.cancel')}
      confirmLoading={rasterizing}
      onOk={onOk}
      onCancel={onCancel}
    >
      <SignCanvas value={draft} onChange={onChangeDraft} />
      <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.drawHint')}</div>
    </Modal>
  )
}

export default SignModal
