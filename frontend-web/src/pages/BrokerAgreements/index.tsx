import { useCallback, useEffect, useState } from 'react'
import { message, Modal, Spin, Steps } from 'antd'
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

const AGREEMENTS: {
  key: 'listing_agent' | 'distributor'
  role: 'listing_agent' | 'distributor'
  title: string
  desc: string
}[] = [
  { key: 'listing_agent', role: 'listing_agent', title: '《房源经纪人上架房源协议》', desc: '签署后即可作为「房源上架经纪人」发布房源' },
  { key: 'distributor', role: 'distributor', title: '《平台经纪人分销协议》', desc: '签署后即可作为「平台分销经纪人」参与分销' },
]

const BrokerAgreements = () => {
  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [agreements, setAgreements] = useState<Agreements | null>(null)
  const [loading, setLoading] = useState(false)
  const [signingKey, setSigningKey] = useState<string | null>(null)
  // 签约预览
  const [detail, setDetail] = useState<ContractDetail | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [signing, setSigning] = useState(false)

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
      message.error(err?.response?.data?.detail || '获取协议状态失败')
    }
  }, [])

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
      if (!contractId) throw new Error('未返回合同')
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
      message.error(err?.response?.data?.detail || '发起签约失败')
    } finally {
      setSigningKey(null)
    }
  }

  const handleSignParty = async (party: ContractParty) => {
    if (!detail) return
    setSigning(true)
    try {
      await contractsApi.sign(detail.id, party.id)
      message.success('签署成功')
      const detailRes = await contractsApi.get(detail.id)
      const data = detailRes.data?.data ?? detailRes.data
      setDetail({ ...data, content_html: undefined, parties: (data.parties || []).map((p: any) => ({ id: p.id, name: p.name, role: p.role, signed: p.signed })) })
      if (brokerId) loadAgreements(brokerId)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '签署失败')
    } finally {
      setSigning(false)
    }
  }

  const allSigned = (detail?.parties?.length ?? 0) > 0 && (detail?.parties ?? []).every((p) => p.signed)

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">经纪人在线签约</h2>
          <p className="rent-page-header__subtitle">查看并签署平台协议，激活房源上架 / 分销资格</p>
        </div>
      </div>

      <Spin spinning={loading}>
        {!agreements ? (
          <div className="rent-empty">加载协议状态中...</div>
        ) : (
          <div className="rent-agreement-list">
            {AGREEMENTS.map((a) => {
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
                        <span className="rent-badge rent-badge--success">已签署 · 已激活</span>
                      ) : (
                        <span className={`rent-badge ${st && st.contract_id ? 'rent-badge--warning' : 'rent-badge--neutral'}`}>
                          {st && st.contract_id ? '签署中' : '未签署'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rent-card__body">
                    {signed ? (
                      <div className="rent-text-sm rent-text-muted">该协议已生效，您可以正常<a onClick={() => window.location.href = '/publish-listing'}>发布房源</a> / 参与分销。</div>
                    ) : (
                      <button className="rent-btn rent-btn--primary rent-btn--sm" disabled={signingKey === a.key || !brokerId} onClick={() => startSign(a.key, a.role)}>
                        {signingKey === a.key ? '生成中...' : '发起在线签署'}
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
        title={detail?.title || '协议预览'}
      >
        {detail && (
          <div>
            <div className="rent-mb-4">
              <Steps
                size="small"
                current={allSigned ? detail.parties!.length : detail.parties!.filter((p) => p.signed).length}
                items={detail.parties!.map((p) => ({ title: p.name, description: p.signed ? '已签署' : '待签署' }))}
              />
            </div>
            {detail.content_html && (
              <div className="rent-contract-preview" dangerouslySetInnerHTML={{ __html: detail.content_html }} style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--rent-border)', borderRadius: 8, padding: 16, marginBottom: 16 }} />
            )}
            <div className="rent-flex rent-gap-2" style={{ flexWrap: 'wrap' }}>
              {detail.parties!.map((p) => (
                <span key={p.id} className={`rent-badge ${p.signed ? 'rent-badge--success' : 'rent-badge--warning'}`}>
                  {p.name}（{p.signed ? '已签署' : '待签署'}）
                </span>
              ))}
            </div>
            <div className="rent-flex rent-gap-3" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              {detail.parties!.filter((p) => !p.signed).map((p) => (
                <button key={p.id} className="rent-btn rent-btn--primary rent-btn--sm" disabled={signing} onClick={() => handleSignParty(p)}>
                  {signing ? '签署中...' : `签署（${p.name}）`}
                </button>
              ))}
              {allSigned && (
                <span className="rent-text-bold" style={{ color: 'var(--state-success)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m8 12 3 3 5-6" />
                  </svg>
                  协议已全部签署
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