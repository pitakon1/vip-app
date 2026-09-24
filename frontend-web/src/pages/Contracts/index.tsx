import { useEffect, useState } from 'react'
import { message } from 'antd'
import { contractsApi } from '@/services/api'
import { useTranslation } from 'react-i18next'
import './contracts.css'

interface Contract {
  id: string
  title: string
  status: string
  language: string
  document_hash?: string
  created_at?: string
}

interface Party {
  id: string
  name: string
  role: string
  signed?: boolean
  signature?: string
}

const statusLabel: Record<string, string> = {
  draft: 'contracts.stDraft',
  sent: 'contracts.stPendingSign',
  partially_signed: 'contracts.stPendingSign',
  signed: 'contracts.stSigned',
  completed: 'contracts.stCompleted',
  voided: 'contracts.stVoided',
}

const Contracts = () => {
  const { t } = useTranslation()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [detail, setDetail] = useState<{ contract?: Contract; parties: Party[] }>({ parties: [] })
  const [form, setForm] = useState({
    landlord: '张三',
    tenant: '李四',
    property: '曼谷 · Sukhumvit 38 号公寓',
    rent: '25000',
    months: '12',
    language: 'zh',
  })

  const loadList = () => {
    contractsApi
      .list()
      .then((res) => setContracts(res.data || []))
      .catch(() => message.warning(t('contracts.errList')))
  }
  useEffect(loadList, [])

  const handleGenerate = () => {
    contractsApi
      .generate({
        language: form.language,
        counters: {
          landlord_name: form.landlord,
          tenant_name: form.tenant,
          property: form.property,
          monthly_rent: Number(form.rent),
          months: Number(form.months),
          currency: 'THB',
        },
      })
      .then(() => {
        message.success(t('contracts.msgGenerated'))
        loadList()
      })
      .catch(() => message.error(t('contracts.errGenerate')))
  }

  const handleOpen = (id: string) => {
    contractsApi.get(id).then((res) => {
      const data = res.data
      setDetail({
        contract: {
          id: data.id,
          title: data.title,
          status: data.status,
          language: data.language,
          document_hash: data.document_hash,
        },
        parties: (data.parties || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          signed: p.signed,
          signature: p.signature,
        })),
      })
    })
  }

  const handleAddParty = () => {
    if (!detail.contract) return
    contractsApi
      .addParty(detail.contract.id, { name: '王五', role: 'tenant', email: 'w@example.com' })
      .then(() => {
        message.success(t('contracts.msgPartyAdded'))
        handleOpen(detail.contract!.id)
      })
      .catch(() => message.error(t('contracts.errAddParty')))
  }

  const handleSign = (partyId: string) => {
    if (!detail.contract) return
    contractsApi
      .sign(detail.contract.id, partyId)
      .then(() => {
        message.success(t('contracts.msgSigned'))
        handleOpen(detail.contract!.id)
      })
      .catch(() => message.error(t('contracts.errSign')))
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('contracts.title')}</h2>
          <p className="rent-page-header__subtitle">{t('contracts.subtitle')}</p>
        </div>
      </div>

      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('contracts.genTitle')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('contracts.genHint')}</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-grid rent-grid--3 rent-mb-3">
            <div className="rent-field">
              <label className="rent-label">{t('contracts.fLandlord')}</label>
              <input className="rent-input" value={form.landlord} onChange={(e) => setForm({ ...form, landlord: e.target.value })} />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('contracts.fTenant')}</label>
              <input className="rent-input" value={form.tenant} onChange={(e) => setForm({ ...form, tenant: e.target.value })} />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('contracts.fProperty')}</label>
              <input className="rent-input" value={form.property} onChange={(e) => setForm({ ...form, property: e.target.value })} />
            </div>
          </div>
          <div className="rent-grid rent-grid--3 rent-mb-3">
            <div className="rent-field">
              <label className="rent-label">{t('contracts.fRent')}</label>
              <input className="rent-input" type="number" value={form.rent} onChange={(e) => setForm({ ...form, rent: e.target.value })} />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('contracts.fMonths')}</label>
              <input className="rent-input" type="number" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('contracts.fLanguage')}</label>
              <select className="rent-input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                <option value="zh">{t('contracts.langZh')}</option>
                <option value="en">English</option>
                <option value="th">ไทย</option>
              </select>
            </div>
          </div>
          <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
            <button className="rent-btn rent-btn--primary" onClick={handleGenerate}>
              {t('contracts.generate')}
            </button>
          </div>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('contracts.listTitle')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('contracts.thTitle')}</th>
                  <th>{t('contracts.thLanguage')}</th>
                  <th>{t('contracts.thStatus')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="rent-empty">{t('contracts.noContracts')}</div>
                    </td>
                  </tr>
                ) : (
                  contracts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="rent-text-bold">{c.title}</div>
                        {c.document_hash && (
                          <div className="rent-text-sm rent-text-muted">hash: {c.document_hash.slice(0, 16)}…</div>
                        )}
                      </td>
                      <td>{c.language}</td>
                      <td>
                        <span className="rent-badge rent-badge--neutral">{statusLabel[c.status] ? t(statusLabel[c.status]) : c.status}</span>
                      </td>
                      <td>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleOpen(c.id)}>
                          {t('contracts.sign')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detail.contract && (
        <div className="rent-card rent-mt-5">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('contracts.signTitle', { title: detail.contract.title })}</h3>
            <span className="rent-text-sm rent-text-muted">{t('contracts.statusLabel', { s: statusLabel[detail.contract.status] ? t(statusLabel[detail.contract.status]) : detail.contract.status })}</span>
          </div>
          <div className="rent-card__body">
            <div className="rent-grid rent-grid--2 rent-mb-3">
              {detail.parties.length === 0 ? (
                <div className="rent-empty">{t('contracts.noParties')}</div>
              ) : (
                detail.parties.map((p) => (
                  <div key={p.id} className="rent-contract-party">
                    <div>
                      <div className="rent-text-bold">{p.name}</div>
                      <div className="rent-text-sm rent-text-muted">{t('contracts.roleLabel', { r: p.role })}</div>
                    </div>
                    <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
                      {p.signed ? (
                        <span className="rent-badge rent-badge--success">{t('contracts.stSigned')}</span>
                      ) : (
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => handleSign(p.id)}>
                          {t('contracts.sign')}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={handleAddParty}>
                + {t('contracts.addParty')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Contracts