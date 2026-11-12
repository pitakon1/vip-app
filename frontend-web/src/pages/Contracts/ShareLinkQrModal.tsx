/**
 * 免登录签署链接二维码弹窗：展示二维码、链接与扫码提示，支持一键复制链接。
 * 二维码由后端返回的 qr_data_url（PNG data URL）；生成失败时只保留链接复制。
 */
import { Modal, message } from 'antd'
import { useTranslation } from 'react-i18next'

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement('textarea')
  el.value = text
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

export default function ShareLinkQrModal({
  open,
  onCancel,
  partyName,
  qrDataUrl,
  url,
}: {
  open: boolean
  onCancel: () => void
  partyName: string
  qrDataUrl: string
  url: string
}) {
  const { t } = useTranslation()

  const handleCopy = () => {
    copyText(url)
      .then(() => message.success(t('contracts.msgLinkCopied')))
      .catch(() => message.error(t('contracts.errCopyLink')))
  }

  return (
    <Modal
      open={open}
      title={partyName ? t('contracts.qrTitle', { name: partyName }) : t('contracts.showQr')}
      onCancel={onCancel}
      footer={
        <button className="rent-btn rent-btn--ghost" onClick={onCancel}>
          {t('common.close')}
        </button>
      }
      width={440}
    >
      <div className="kf-qr">
        {qrDataUrl ? (
          <img className="kf-qr__img" src={qrDataUrl} alt={partyName} />
        ) : (
          <p className="rent-text-sm rent-text-muted">{t('contracts.qrFailed')}</p>
        )}
        <p className="rent-text-sm rent-text-muted" style={{ textAlign: 'center' }}>
          {t('contracts.qrTip')}
        </p>
        <div className="kf-qr__link">
          <code>{url}</code>
          <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={handleCopy}>
            {t('contracts.copyLink')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
