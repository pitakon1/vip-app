import { useState } from 'react'
import { message } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { contractsApi, contractsPublicApi } from '@/services/api'
import { useTranslation } from 'react-i18next'

interface SigRecord {
  party_name?: string
  method?: string
  signed_at?: string
  ip?: string
  signature_hash?: string
  field_id?: string
  signature_success?: boolean
}

interface Report {
  contract_id?: string
  title?: string
  status?: string
  document_hash?: string
  content_sha256?: string
  sign_digest?: string
  tampered?: boolean
  sign_types_summary?: Record<string, number>
  signatures?: SigRecord[]
  verified?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const Verify = () => {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const initial = params.get('id') || params.get('token') || ''
  const [input, setInput] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    const raw = input.trim()
    if (!raw) {
      message.warning(t('contracts.verifyInput'))
      return
    }
    setLoading(true)
    setError('')
    try {
      // 判断是合同 id（UUID）还是公开 token
      const isUuid = UUID_RE.test(raw)
      const res = isUuid
        ? await contractsApi.verify(raw)
        : await contractsPublicApi.verify(raw)
      setReport(res.data as Report)
    } catch (err: any) {
      setReport(null)
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 401 || status === 403) {
        setError(t('contracts.verifyNeedLogin'))
      } else {
        setError(detail || t('contracts.verifyFail'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('contracts.verifyTitle')}</h2>
          <p className="rent-page-header__subtitle">{t('contracts.verifyHint')}</p>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__body">
          <div className="rent-field" style={{ marginBottom: 12 }}>
            <label className="rent-label">{t('contracts.verifyInput')}</label>
            <input
              className="rent-input"
              value={input}
              placeholder={t('contracts.verifyPlaceholder')}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <button className="rent-btn rent-btn--primary" disabled={loading} onClick={run}>
            {loading ? t('common.loading') : t('contracts.verifyBtn')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rent-card" style={{ marginTop: 16 }}>
          <div className="rent-card__body">
            <div style={{ color: '#dc2626' }}>{error}</div>
          </div>
        </div>
      )}

      {report && (
        <div className="rent-card" style={{ marginTop: 16 }}>
          <div className="rent-card__header">
            <h3 className="rent-card__title">{report.title || t('contracts.verifyReport')}</h3>
            {report.tampered ? (
              <span className="rent-badge rent-badge--error">{t('contracts.verifyTampered')}</span>
            ) : report.verified === false ? (
              <span className="rent-badge rent-badge--warning">{t('contracts.verifyNoSig')}</span>
            ) : (
              <span className="rent-badge rent-badge--success">{t('contracts.verifyOk')}</span>
            )}
          </div>
          <div className="rent-card__body">
            <div className="rent-verify-row"><span>{t('contracts.verifyTamperedLbl')}</span><b>{report.tampered ? t('contracts.yes') : t('contracts.no')}</b></div>
            <div className="rent-verify-row"><span>{t('contracts.documentHash')}</span><code className="rent-verify-code">{report.document_hash || '-'}</code></div>
            <div className="rent-verify-row"><span>content_sha256</span><code className="rent-verify-code">{report.content_sha256 || '-'}</code></div>
            <div className="rent-verify-row"><span>sign_digest</span><code className="rent-verify-code">{report.sign_digest || '-'}</code></div>
            {report.sign_types_summary && (
              <div className="rent-verify-row">
                <span>{t('contracts.signTypes')}</span>
                <span>
                  {Object.entries(report.sign_types_summary)
                    .map(([m, n]) => `${t(`contracts.method_${m}`)} × ${n}`)
                    .join('，') || '-'}
                </span>
              </div>
            )}

            <div className="rent-text-bold" style={{ margin: '16px 0 8px' }}>{t('contracts.signaturesTitle')}</div>
            {!report.signatures || report.signatures.length === 0 ? (
              <div className="rent-text-sm rent-text-muted">{t('contracts.verifyNoSig')}</div>
            ) : (
              <div className="rent-verify-table">
                <table className="rent-table" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>{t('contracts.fName')}</th>
                      <th>{t('contracts.methodLbl')}</th>
                      <th>{t('contracts.signedAt')}</th>
                      <th>IP</th>
                      <th>{t('contracts.verifySigResult')}</th>
                      <th>field_id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.signatures.map((s, i) => (
                      <tr key={i}>
                        <td>{s.party_name || '-'}</td>
                        <td>{t(`contracts.method_${s.method}`) || s.method}</td>
                        <td>{s.signed_at ? new Date(s.signed_at).toLocaleString() : '-'}</td>
                        <td>{s.ip || '-'}</td>
                        <td>
                          {s.signature_success ? (
                            <span className="rent-badge rent-badge--success">{t('contracts.verifyOk')}</span>
                          ) : (
                            <span className="rent-badge rent-badge--error">{t('contracts.verifyTampered')}</span>
                          )}
                        </td>
                        <td>{s.field_id ? s.field_id.slice(0, 8) + '…' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
        .rent-verify-row{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-bottom:1px dashed var(--rent-line,#eef2f5)}
        .rent-verify-row>span{width:170px;flex-shrink:0;color:var(--rent-ink-3,#64748b);font-size:13px}
        .rent-verify-code{word-break:break-all;font-size:12px;color:#2563eb}
      `}</style>
    </div>
  )
}

export default Verify