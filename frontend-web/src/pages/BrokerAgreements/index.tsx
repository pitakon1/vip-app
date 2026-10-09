import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, message, Modal, Spin, Steps } from 'antd'
import { brokerApi, brokerAgreementsApi, contractsApi } from '@/services/api'
import './agreements.css'

interface AgreementState {
  contract_id: string | null
  status: string
  signed: boolean
}
interface Agreements {
  distributor: AgreementState
  listing_agent: AgreementState
}
interface ContractParty {
  id: string
  name: string
  role: string
  signed?: boolean
}
interface ContractDetail {
  id: string
  title: string
  status: string
  content_html?: string
  parties?: ContractParty[]
}

const BrokerAgreements = () => {
  const { t } = useTranslation()
  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [agreements, setAgreements] = useState<Agreements | null>(null)
  const [loading, setLoading] = useState(false)
  const [signingKey, setSigningKey] = useState<string | null>(null)
  // 签约预览
  const [detail, setDetail] = useState<ContractDetail | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [signing, setSigning] = useState(false)
  // 签前意愿验证（对齐开放签）
  const [pendingParty, setPendingParty] = useState<ContractParty | null>(null)
  const [intentOpen, setIntentOpen] = useState(false)
  const [intentCode, setIntentCode] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [sendingCode, setSendingCode] = useState(false)

  // 协议文案随语言切换重建（角色/键仍是固定枚举）
  const agreementItems = useMemo(
    () => [
      { key: 'listing_agent' as const, role: 'listing_agent' as const, title: t('brokerAgreements.agListingTitle'), desc: t('brokerAgreements.agListingDesc') },
      { key: 'distributor' as const, role: 'distributor' as const, title: t('brokerAgreements.agDistTitle'), desc: t('brokerAgreements.agDistDesc') },
    ],
    [t],
  )

  const refreshBroker = useCallback(async () => {
    try {
      const res = await brokerApi.me()
      const b = res.data?.data ?? res.data
      setBrokerId(b?.id || null)
    } catch {
      /* noop */
    }
  }, [])

  const loadAgreements = useCallback(async (bid: string) => {
    try {
      const res = await brokerAgreementsApi.list(bid)
      setAgreements(res.data?.data ?? res.data)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('brokerAgreements.loadFailed'))
    }
  }, [t])

  useEffect(() => { refreshBroker() }, [refreshBroker])
  useEffect(() => {
    if (brokerId) loadAgreements(brokerId)
  }, [brokerId, loadAgreements])

  const startSign = async (key: 'listing_agent' | 'distributor', role: 'listing_agent' | 'distributor') => {
    if (!brokerId) return
    setSigningKey(key)
    try {
      const res = await brokerAgreementsApi.create(brokerId, role)
      const created = res.data?.data ?? res.data
      const contractId = created?.contract_id
      if (!contractId) throw new Error(t('brokerAgreements.errNoContract'))
      const detailRes = await contractsApi.get(contractId)
      const data = detailRes.data?.data ?? detailRes.data
      setDetail({
        id: data.id,
        title: data.title,
        status: data.status,
        content_html: data.content_html,
        parties: (data.parties || []).map((p: any) => ({ id: p.id, name: p.name, role: p.role, signed: p.signed })),
      })
      setModalOpen(true)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('brokerAgreements.startFailed'))
    } finally {
      setSigningKey(null)
    }
  }

  const requestIntentCode = async () => {
    if (!detail || !pendingParty || sendingCode) return
    setSendingCode(true)
    try {
      const r = await contractsApi.signCode(detail.id, pendingParty.id)
      setCodeSentTo(r.data?.to_masked)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('contracts.errCode'))
    } finally {
      setSendingCode(false)
    }
  }

  const handleSignParty = async (party: ContractParty) => {
    if (!detail) return
    setPendingParty(party)
    setIntentCode('')
    setCodeSentTo(null)
    setIntentOpen(true)
    // 打开即自动发码
    await requestIntentCode()
  }

  const confirmIntentSign = async () => {
    if (!detail || !pendingParty) return
    if (!intentCode.trim()) {
      message.warning(t('contracts.intentCodeBlank'))
      return
    }
    setSigning(true)
    try {
      await contractsApi.sign(detail.id, { partyId: pendingParty.id, code: intentCode.trim() })
      setIntentOpen(false)
      message.success(t('brokerAgreements.signOk'))
      const detailRes = await contractsApi.get(detail.id)
      const data = detailRes.data?.data ?? detailRes.data
      setDetail({ ...data, content_html: undefined, parties: (data.parties || []).map((p: any) => ({ id: p.id, name: p.name, role: p.role, signed: p.signed })) })
      if (brokerId) loadAgreements(brokerId)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('brokerAgreements.signFailed'))
    } finally {
      setSigning(false)
    }
  }

  const allSigned = (detail?.parties?.length ?? 0) > 0 && (detail?.parties ?? []).every((p) => p.signed)

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('menu.brokerAgreements')}</h2>
          <p className="rent-page-header__subtitle">{t('brokerAgreements.subtitle')}</p>
        </div>
      </div>

      <Spin spinning={loading}>
        {!agreements ? (
          <div className="rent-empty">{t('brokerAgreements.loadingStatus')}</div>
        ) : (
          <div className="rent-agreement-list">
            {agreementItems.map((a) => {
              const st = agreements[a.key]
              const signed = st?.signed
              return (
                <div className="rent-card rent-mb-4" key={a.key}>
                  <div className="rent-card__header">
                    <div>
                      <h3 className="rent-card__title">{a.title}</h3>
                      <span className="rent-text-sm rent-text-muted">{a.desc}</span>
                    </div>
                    <div>
                      {signed ? (
                        <span className="rent-badge rent-badge--success">{t('brokerAgreements.signedActive')}</span>
                      ) : (
                        <span className={`rent-badge ${st && st.contract_id ? 'rent-badge--warning' : 'rent-badge--neutral'}`}>
                          {st && st.contract_id ? t('brokerAgreements.signing') : t('brokerAgreements.unsigned')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rent-card__body">
                    {signed ? (
                      <div className="rent-text-sm rent-text-muted">{t('brokerAgreements.effectivePre')}<a onClick={() => window.location.href = '/publish-listing'}>{t('menu.publishListing')}</a>{t('brokerAgreements.effectivePost')}</div>
                    ) : (
                      <button className="rent-btn rent-btn--primary rent-btn--sm" disabled={signingKey === a.key || !brokerId} onClick={() => startSign(a.key, a.role)}>
                        {signingKey === a.key ? t('brokerAgreements.generating') : t('brokerAgreements.startSign')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Spin>

      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={720}
        title={detail?.title || t('brokerAgreements.preview')}
      >
        {detail && (
          <div>
            <div className="rent-mb-4">
              <Steps
                size="small"
                current={allSigned ? detail.parties!.length : detail.parties!.filter((p) => p.signed).length}
                items={detail.parties!.map((p) => ({ title: p.name, description: p.signed ? t('brokerAgreements.signed') : t('brokerAgreements.pendingSign') }))}
              />
            </div>
            {detail.content_html && (
              <div className="rent-contract-preview" dangerouslySetInnerHTML={{ __html: detail.content_html }} style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--rent-border)', borderRadius: 8, padding: 16, marginBottom: 16 }} />
            )}
            <div className="rent-flex rent-gap-2" style={{ flexWrap: 'wrap' }}>
              {detail.parties!.map((p) => (
                <span key={p.id} className={`rent-badge ${p.signed ? 'rent-badge--success' : 'rent-badge--warning'}`}>
                  {t('brokerAgreements.partyStatus', { name: p.name, status: p.signed ? t('brokerAgreements.signed') : t('brokerAgreements.pendingSign') })}
                </span>
              ))}
            </div>
            <div className="rent-flex rent-gap-3" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              {detail.parties!.filter((p) => !p.signed).map((p) => (
                <button key={p.id} className="rent-btn rent-btn--primary rent-btn--sm" disabled={signing} onClick={() => handleSignParty(p)}>
                  {signing ? t('brokerAgreements.signingNow') : t('brokerAgreements.signParty', { name: p.name })}
                </button>
              ))}
              {allSigned && (
                <span className="rent-text-bold" style={{ color: 'var(--state-success)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m8 12 3 3 5-6" />
                  </svg>
                  {t('brokerAgreements.allSigned')}
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={intentOpen}
        onCancel={() => setIntentOpen(false)}
        width={420}
        title={t('contracts.intentTitle')}
        okText={t('contracts.intentConfirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: signing }}
        onOk={confirmIntentSign}
      >
        <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 12 }}>{t('contracts.intentDesc')}</div>
        {pendingParty && (
          <div className="rent-text-sm" style={{ marginBottom: 12 }}>
            {t('brokerAgreements.signParty', { name: pendingParty.name })}
            {codeSentTo && <span className="rent-text-muted"> · {t('contracts.intentTo', { contact: codeSentTo })}</span>}
          </div>
        )}
        <Input.Password
          value={intentCode}
          onChange={(e) => setIntentCode(e.target.value)}
          placeholder={t('contracts.verifyCodePlaceholder')}
          autoComplete="one-time-code"
          style={{ marginBottom: 12 }}
        />
        <Button type="link" size="small" loading={sendingCode} onClick={requestIntentCode} style={{ paddingLeft: 0 }}>
          {t('contracts.resend')}
        </Button>
      </Modal>
    </div>
  )
}

export default BrokerAgreements