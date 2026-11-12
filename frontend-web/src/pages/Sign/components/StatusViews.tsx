import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { contractsPublicApi } from '@/services/api'
import { pageStyle } from '../constants'
import type { ContractDoc, FailType } from '../types'

/** 复制文本：优先 Clipboard API，非安全上下文降级到隐藏 textarea */
const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

const hasInitiator = (doc: ContractDoc | null) => !!(doc?.initiator_name || doc?.initiator_phone_masked)

/** 发起方联系方式：后端 C-03B 返回字段时展示，缺失时整块不渲染 */
const InitiatorContact = ({ doc }: { doc: ContractDoc | null }) => {
  const { t } = useTranslation()
  const name = (doc?.initiator_name || '').trim()
  const phone = (doc?.initiator_phone_masked || '').trim()
  if (!name && !phone) return null
  const onCopyPhone = async () => {
    const ok = await copyText(phone)
    if (ok) message.success(t('contracts.copyPhoneDone'))
    else message.error(t('contracts.copyFailed'))
  }
  return (
    <div className="kf-status__contact">
      <div className="rent-text-sm rent-text-muted">{t('contracts.initiatorContactHint')}</div>
      <div className="kf-status__contact-row">
        <span className="rent-text-bold">{name || t('contracts.initiatorContact')}</span>
        {phone && <span className="rent-text-sm rent-text-muted">{phone}</span>}
        {phone && (
          <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onCopyPhone}>
            {t('contracts.copyInitiatorPhone')}
          </button>
        )}
      </div>
    </div>
  )
}

/** 逾期 / 已签 等失败态：给出「联系发起方 / 复制链接 / 下载合同」明确出口 */
export const FailView = ({
  fail,
  doc,
  token,
}: {
  fail: Exclude<FailType, null>
  doc: ContractDoc | null
  token: string
}) => {
  const { t } = useTranslation()
  const title =
    fail === 'expired'
      ? t('contracts.errLinkExpired')
      : fail === 'signed'
        ? t('contracts.errAlreadySigned')
        : t('contracts.errGetContract')
  const desc =
    fail === 'expired'
      ? t('contracts.failExpiredDesc')
      : fail === 'signed'
        ? t('contracts.failSignedDesc')
        : t('contracts.failGenericDesc')
  const contact = hasInitiator(doc)
  // 上传型合同给原文；PDF 合同给首页图（与 DocumentPanel 同一地址口径）
  const downloadUrl = doc?.file_url || (doc?.pdf_available ? contractsPublicApi.pdfPageUrl(token, 1) : null)
  const copyLink = async () => {
    const text = `${doc?.title ? `${doc.title}\n` : ''}${window.location.href}`
    const ok = await copyText(text)
    if (ok) message.success(t('contracts.copyLinkDone'))
    else message.error(t('contracts.copyFailed'))
  }
  return (
    <div style={pageStyle}>
      <div className="rent-card">
        <div className="rent-card__body kf-status">
          <div className="rent-text-bold" style={{ fontSize: 18, marginBottom: 8 }}>{title}</div>
          <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 16 }}>{desc}</div>
          {contact && <InitiatorContact doc={doc} />}
          <div className="kf-status__actions">
            <button
              type="button"
              className={`rent-btn ${contact ? 'rent-btn--ghost' : 'rent-btn--primary'}`}
              onClick={copyLink}
            >
              {t('contracts.copyContractLink')}
            </button>
            {downloadUrl && (
              <a className="rent-btn rent-btn--ghost" href={downloadUrl} target="_blank" rel="noreferrer">
                {t('contracts.downloadContract')}
              </a>
            )}
          </div>
          <button type="button" className="kf-status__reload" onClick={() => window.location.reload()}>
            {t('contracts.reloadPage')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 已拒签 */
export const DeclinedView = ({ doc }: { doc: ContractDoc | null }) => {
  const { t } = useTranslation()
  return (
    <div style={pageStyle}>
      <div className="rent-card">
        <div className="rent-card__body kf-status">
          <div className="rent-text-bold" style={{ fontSize: 18, marginBottom: 8 }}>{t('contracts.declinedTitle')}</div>
          <div className="rent-text-sm rent-text-muted">{t('contracts.declinedDesc')}</div>
          {hasInitiator(doc) ? (
            <InitiatorContact doc={doc} />
          ) : (
            <div className="rent-text-sm rent-text-muted" style={{ marginTop: 16 }}>{t('contracts.declineContactHint')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 签署完成；签署后令牌失效，用后端随响应下发的 24h HMAC 凭证下载已签文件 */
export const SuccessView = ({
  download,
}: {
  download?: { url?: string; file_name?: string } | null
}) => {
  const { t } = useTranslation()
  const back = () => {
    if (window.history.length > 1) window.history.back()
    else window.location.assign('/')
  }
  return (
    <div style={pageStyle}>
      <div className="rent-card">
        <div className="rent-card__body kf-status">
          <div className="rent-text-bold" style={{ fontSize: 20, margin: '0 0 6px' }}>{t('contracts.successTitle')}</div>
          <div className="rent-text-sm rent-text-muted">{t('contracts.signedDesc')}</div>
          {download?.url ? (
            <div style={{ marginTop: 20 }}>
              <a
                className="rent-btn rent-btn--primary"
                href={`/api/v1${download.url}`}
                download={download.file_name || undefined}
              >
                {t('contracts.downloadSigned')}
              </a>
              <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>
                {t('contracts.downloadSignedTip')}
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={back}>
              {t('contracts.backPrev')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const LoadingView = () => {
  const { t } = useTranslation()
  return (
    <div style={pageStyle}>
      <div className="rent-card"><div className="rent-card__body" style={{ textAlign: 'center', padding: '32px' }}>{t('common.loading')}</div></div>
    </div>
  )
}
