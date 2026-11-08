import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Modal, Spin, Steps } from 'antd'
import { brokerApi, brokerAgreementsApi, contractsApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import './agreements.css'
import { errorText } from '@/lib/errorText'

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
  email?: string | null
  role: string
  user_id?: string | null
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
  const [brokerError, setBrokerError] = useState<string | null>(null)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const currentUserEmail = useAuthStore((s) => s.user?.email)
  const [signingKey, setSigningKey] = useState<string | null>(null)
  // 签约预览
  const [detail, setDetail] = useState<ContractDetail | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [signing, setSigning] = useState(false)

  // 协议文案随语言切换重建（角色/键仍是固定枚举）
  const agreementItems = useMemo(
    () => [
      { key: 'listing_agent' as const, role: 'listing_agent' as const, title: t('brokerAgreements.agListingTitle'), desc: t('brokerAgreements.agListingDesc') },
      { key: 'distributor' as const, role: 'distributor' as const, title: t('brokerAgreements.agDistTitle'), desc: t('brokerAgreements.agDistDesc') },
    ],
    [t],
  )

  const refreshBroker = useCallback(async () => {
    setLoading(true)
    setBrokerError(null)
    try {
      const res = await brokerApi.me()
      const b = res.data?.data ?? res.data
      const id = b?.id || null
      setBrokerId(id)
      // 非经纪人账号没有档案：给出明确空态，而不是一直停在「正在加载」
      if (!id) setBrokerError(t('brokerAgreements.noBrokerProfile'))
    } catch (err: any) {
      setBrokerId(null)
      const status = err?.response?.status
      setBrokerError(
        status === 404
          ? t('brokerAgreements.noBrokerProfile')
          : errorText(err, t('brokerAgreements.loadBrokerFailed')),
      )
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadAgreements = useCallback(async (bid: string) => {
    try {
      const res = await brokerAgreementsApi.list(bid)
      setAgreements(res.data?.data ?? res.data)
    } catch (err: any) {
      message.error(errorText(err, t('brokerAgreements.loadFailed')))
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
        parties: (data.parties || []).map((p: any) => ({ id: p.id, name: p.name, email: p.email, role: p.role, user_id: p.user_id, signed: p.signed })),
      })
      setModalOpen(true)
    } catch (err: any) {
      message.error(errorText(err, t('brokerAgreements.startFailed')))
    } finally {
      setSigningKey(null)
    }
  }

  // 直接签署（移除签署意愿验证：不再发码 / 不传 code）
  const handleSignParty = async (party: ContractParty) => {
    if (!detail) return
    setSigning(true)
    try {
      await contractsApi.sign(detail.id, { partyId: party.id })
      message.success(t('brokerAgreements.signOk'))
      const detailRes = await contractsApi.get(detail.id)
      const data = detailRes.data?.data ?? detailRes.data
      setDetail({ ...data, content_html: data.content_html || detail.content_html, parties: (data.parties || []).map((p: any) => ({ id: p.id, name: p.name, email: p.email, role: p.role, user_id: p.user_id, signed: p.signed })) })
      if (brokerId) loadAgreements(brokerId)
    } catch (err: any) {
      const status = err?.response?.status
      const d = err?.response?.data?.detail
      if (status === 403 && d === 'REAL_NAME_REQUIRED') message.error(t('contracts.realNameFirst'))
      else message.error(errorText(err, t('brokerAgreements.signFailed')))
    } finally {
      setSigning(false)
    }
  }

  const allSigned = (detail?.parties?.length ?? 0) > 0 && (detail?.parties ?? []).every((p) => p.signed)
  // 只允许签「本人」那一方：此前遍历所有未签方，员工可代签平台/他人。
  // 归属判定与后端一致：优先 user_id，未绑定用户时按邮箱匹配登录账号。
  const myParty = (detail?.parties ?? []).find(
    (p) =>
      !p.signed &&
      ((!!p.user_id && p.user_id === currentUserId) ||
        (!p.user_id && !!currentUserEmail && p.email === currentUserEmail)),
  )
  // 经纪人协议是平台单方预签类：乙方（本人）签署后服务端自动补签平台甲方，
  // 所以未签方里有平台甲方是正常的，只需给出「当前账号无可签方」的说明。
  const signPrompt = !myParty && !allSigned ? t('brokerAgreements.notYourParty') : null

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('menu.brokerAgreements')}</h2>
          <p className="rent-page-header__subtitle">{t('brokerAgreements.subtitle')}</p>
        </div>
      </div>

      <Spin spinning={loading}>
        {brokerError ? (
          <div className="rent-empty">
            <p>{brokerError}</p>
            <button className="rent-btn rent-btn--sm" onClick={() => void refreshBroker()}>
              {t('common.retry')}
            </button>
          </div>
        ) : !agreements ? (
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
                      <div className="rent-text-sm rent-text-muted">{t('brokerAgreements.effectivePre')}<a role="button" tabIndex={0} onClick={() => window.location.href = '/properties'} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.href = '/properties' } }}>{t('menu.publishListing')}</a>{t('brokerAgreements.effectivePost')}</div>
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
        width={880}
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
              {myParty && (
                <button className="rent-btn rent-btn--primary rent-btn--sm" disabled={signing} onClick={() => handleSignParty(myParty)}>
                  {signing ? t('brokerAgreements.signingNow') : t('brokerAgreements.signParty', { name: myParty.name })}
                </button>
              )}
              {signPrompt && <span className="rent-text-sm rent-text-muted">{signPrompt}</span>}
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
    </div>
  )
}

export default BrokerAgreements