import { useEffect, useState } from 'react'
import { message } from 'antd'
import { contractsApi } from '@/services/api'
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
  draft: '草稿',
  sent: '待签署',
  partially_signed: '待签署',
  signed: '已签署',
  completed: '已完成',
  voided: '已作废',
}

const Contracts = () => {
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
      .catch(() => message.warning('合同列表加载失败'))
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
        message.success('合同已自动生成')
        loadList()
      })
      .catch(() => message.error('合同生成失败'))
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
        message.success('已追加签署方')
        handleOpen(detail.contract!.id)
      })
  }

  const handleSign = (partyId: string) => {
    if (!detail.contract) return
    contractsApi
      .sign(detail.contract.id, partyId)
      .then((res) => {
        message.success('签署成功')
        handleOpen(detail.contract!.id)
      })
      .catch(() => message.error('签署失败'))
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">电子签合同</h2>
          <p className="rent-page-header__subtitle">根据用户信息自动生成合同并数字签名</p>
        </div>
      </div>

      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">自动生成合同</h3>
          <span className="rent-text-sm rent-text-muted">填入租约信息 → 一键生成 HTML 合同（含 SHA-256 哈希存证）</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-grid rent-grid--3 rent-mb-3">
            <div className="rent-field">
              <label className="rent-label">房东 / 出租方</label>
              <input className="rent-input" value={form.landlord} onChange={(e) => setForm({ ...form, landlord: e.target.value })} />
            </div>
            <div className="rent-field">
              <label className="rent-label">租客 / 承租方</label>
              <input className="rent-input" value={form.tenant} onChange={(e) => setForm({ ...form, tenant: e.target.value })} />
            </div>
            <div className="rent-field">
              <label className="rent-label">房源</label>
              <input className="rent-input" value={form.property} onChange={(e) => setForm({ ...form, property: e.target.value })} />
            </div>
          </div>
          <div className="rent-grid rent-grid--3 rent-mb-3">
            <div className="rent-field">
              <label className="rent-label">月租金（THB）</label>
              <input className="rent-input" type="number" value={form.rent} onChange={(e) => setForm({ ...form, rent: e.target.value })} />
            </div>
            <div className="rent-field">
              <label className="rent-label">租期（月）</label>
              <input className="rent-input" type="number" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} />
            </div>
            <div className="rent-field">
              <label className="rent-label">合同语言</label>
              <select className="rent-input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="th">ไทย</option>
              </select>
            </div>
          </div>
          <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
            <button className="rent-btn rent-btn--primary" onClick={handleGenerate}>
              生成合同
            </button>
          </div>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">合同列表</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>语言</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="rent-empty">暂无合同</div>
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
                        <span className="rent-badge rent-badge--neutral">{statusLabel[c.status] || c.status}</span>
                      </td>
                      <td>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleOpen(c.id)}>
                          签署
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
            <h3 className="rent-card__title">签署 · {detail.contract.title}</h3>
            <span className="rent-text-sm rent-text-muted">状态：{statusLabel[detail.contract.status] || detail.contract.status}</span>
          </div>
          <div className="rent-card__body">
            <div className="rent-grid rent-grid--2 rent-mb-3">
              {detail.parties.length === 0 ? (
                <div className="rent-empty">尚未添加签署方</div>
              ) : (
                detail.parties.map((p) => (
                  <div key={p.id} className="rent-contract-party">
                    <div>
                      <div className="rent-text-bold">{p.name}</div>
                      <div className="rent-text-sm rent-text-muted">角色：{p.role}</div>
                    </div>
                    <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
                      {p.signed ? (
                        <span className="rent-badge rent-badge--success">已签署</span>
                      ) : (
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => handleSign(p.id)}>
                          签署
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={handleAddParty}>
                + 追加签署方
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Contracts