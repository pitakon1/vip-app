import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'

/** 实名认证弹窗（发送验证码 → 填写姓名/证件号/验证码） */
const RealNameModal = ({
  open,
  step,
  contact,
  onChangeContact,
  realName,
  onChangeRealName,
  idNumber,
  onChangeIdNumber,
  code,
  onChangeCode,
  sendLoading,
  devCode,
  onOk,
  onCancel,
}: {
  open: boolean
  step: 'send' | 'verify'
  contact: string
  onChangeContact: (v: string) => void
  realName: string
  onChangeRealName: (v: string) => void
  idNumber: string
  onChangeIdNumber: (v: string) => void
  code: string
  onChangeCode: (v: string) => void
  sendLoading: boolean
  devCode: string
  onOk: () => void
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      title={t('contracts.realNameTitle')}
      okText={step === 'send' ? t('contracts.sendCode') : t('contracts.completeVerify')}
      cancelText={t('common.cancel')}
      confirmLoading={sendLoading}
      onOk={onOk}
      onCancel={onCancel}
    >
      {step === 'send' ? (
        <div className="rent-field">
          <label className="rent-label">{t('contracts.contactLabel')}</label>
          <input className="rent-input" value={contact} placeholder={t('contracts.contactPlaceholder')} onChange={(e) => onChangeContact(e.target.value)} />
        </div>
      ) : (
        <div>
          <div className="rent-field" style={{ marginBottom: 12 }}>
            <label className="rent-label">{t('contracts.fName')}</label>
            <input className="rent-input" value={realName} placeholder={t('contracts.namePlaceholder')} onChange={(e) => onChangeRealName(e.target.value)} />
          </div>
          <div className="rent-field" style={{ marginBottom: 12 }}>
            <label className="rent-label">{t('contracts.idNumber')}</label>
            <input className="rent-input" value={idNumber} placeholder={t('contracts.idNumberPlaceholder')} onChange={(e) => onChangeIdNumber(e.target.value)} />
          </div>
          <div className="rent-field">
            <label className="rent-label">{t('contracts.verifyCode')}（{contact}）</label>
            <input className="rent-input" value={code} placeholder={t('contracts.verifyCodePlaceholder')} onChange={(e) => onChangeCode(e.target.value)} />
            {/* 本地联调用：后端仅在 DEBUG + OTP_DEV_CODE_ECHO 时下发 dev_code */}
            {devCode ? (
              <div style={{ marginTop: 6, fontSize: 'var(--rent-fs-xs)', color: 'var(--rent-muted-foreground)' }}>
                {t('contracts.devCodeHint')}{devCode}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  )
}

export default RealNameModal
