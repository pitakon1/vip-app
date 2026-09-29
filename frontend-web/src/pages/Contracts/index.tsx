import { useEffect, useRef, useState } from 'react'
import { message, Modal } from 'antd'
import { contractsApi } from '@/services/api'
import { useTranslation } from 'react-i18next'
import './contracts.css'

interface Contract {
  id: string
  title: string
  status: string
  language?: string
  document_hash?: string
  created_at?: string
  source?: string
  file_path?: string
  can_edit?: boolean
}

interface Party {
  id: string
  name: string
  role: string
  signed?: boolean
  signature?: string
  email?: string
  phone?: string
  declined_at?: string
  decline_reason?: string
  sign_url?: string
}

const statusLabel: Record<string, string> = {
  draft: 'contracts.stDraft',
  sent: 'contracts.stPendingSign',
  partially_signed: 'contracts.stPendingSign',
  signed: 'contracts.stSigned',
  completed: 'contracts.stCompleted',
  voided: 'contracts.stVoided',
  expired: 'contracts.stExpired',
}

const sourceLabel: Record<string, string> = {
  generated: 'contracts.sourceGenerated',
  uploaded: 'contracts.sourceUploaded',
}

// 上传白名单（与后端一致）：pdf / word / 常见图片
const UPLOAD_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif'

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

  // 上传电子合同
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  // 编辑合同
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  // 追加签署方
  const [partyOpen, setPartyOpen] = useState(false)
  const [partyForm, setPartyForm] = useState({ name: '', email: '', role: 'tenant' })
  // 作废合同
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // 上传电子合同
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPendingFile(f)
  }

  const handleUploadConfirm = async () => {
    if (!pendingFile) return
    setUploading(true)
    try {
      // 后端 /contracts/{id}/upload 只给「已存在」的合同挂载文件，且无「仅建空合同」端点。
      // 因此先借 generate 建一条合同记录（title 取文件名），再把文件挂上去标为 uploaded。
      const genRes: any = await contractsApi.generate({
        language: 'zh',
        counters: { title: pendingFile.name.replace(/\.[^.]+$/, '') },
      })
      const cid = genRes?.data?.id
      if (!cid) throw new Error('no contract id')
      await contractsApi.uploadFile(cid, pendingFile)
      message.success(t('contracts.msgUploaded'))
      setPendingFile(null)
      loadList()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(detail || t('contracts.errUpload'))
    } finally {
      setUploading(false)
    }
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
          source: data.source,
          file_path: data.file_path,
          can_edit: data.can_edit,
        },
        parties: (data.parties || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          signed: p.signed,
          signature: p.signature,
          email: p.email,
          phone: p.phone,
          declined_at: p.declined_at,
          decline_reason: p.decline_reason,
          sign_url: p.sign_url,
        })),
      })
    })
  }

  // 复制签署链接
  const handleCopyLink = async (partyId: string) => {
    if (!detail.contract) return
    try {
      const res = await contractsApi.createShareLink(detail.contract.id, partyId)
      const { url } = res.data || {}
      if (!url) throw new Error('no url')
      await navigator.clipboard.writeText(url)
      message.success(t('contracts.msgLinkCopied'))
    } catch {
      message.error(t('contracts.errCopyLink'))
    }
  }

  // 发送签署通知
  const handleSend = () => {
    if (!detail.contract) return
    contractsApi
      .sendContract(detail.contract.id)
      .then((res: any) => {
        message.success(t('contracts.msgSent'))
        const urls = res?.data?.results
        if (Array.isArray(urls)) {
          const text = urls.filter(Boolean).join('\n')
          if (text) message.info(text)
        }
      })
      .catch((err: any) => {
        const d = err?.response?.data?.detail
        message.error(d || t('contracts.errSend'))
      })
  }

  // 编辑合同
  const openEdit = () => {
    const c = detail.contract
    if (!c) return
    setEditTitle(c.title)
    setEditContent('')
    setEditOpen(true)
  }

  const handleEditSave = () => {
    if (!detail.contract) return
    contractsApi
      .updateContract(detail.contract.id, { title: editTitle, content_html: editContent })
      .then(() => {
        message.success(t('contracts.msgEdited'))
        setEditOpen(false)
        loadList()
        handleOpen(detail.contract!.id)
      })
      .catch(() => message.error(t('contracts.errEdit')))
  }

  // 追加签署方
  const handleAddParty = () => {
    if (!detail.contract) return
    if (!partyForm.name.trim()) {
      message.warning(t('contracts.blankName'))
      return
    }
    contractsApi
      .addParty(detail.contract.id, {
        name: partyForm.name.trim(),
        email: partyForm.email.trim() || undefined,
        role: partyForm.role,
      })
      .then(() => {
        message.success(t('contracts.msgPartyAdded'))
        setPartyOpen(false)
        setPartyForm({ name: '', email: '', role: 'tenant' })
        handleOpen(detail.contract!.id)
      })
      .catch((err: any) => {
        const d = err?.response?.data?.detail
        message.error(d || t('contracts.errAddParty'))
      })
  }

  // 作废
  const handleVoid = () => {
    if (!detail.contract) return
    contractsApi
      .voidContract(detail.contract.id, voidReason.trim() || undefined)
      .then(() => {
        message.success(t('contracts.msgVoided'))
        setVoidOpen(false)
        setVoidReason('')
        loadList()
        handleOpen(detail.contract!.id)
      })
      .catch((err: any) => {
        const d = err?.response?.data?.detail
        message.error(d || t('contracts.errVoid'))
      })
  }

  const canEdit = detail.contract?.can_edit

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

      {/* 上传电子合同 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('contracts.uploadTitle')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('contracts.uploadHint')}</span>
        </div>
        <div className="rent-card__body">
          {!pendingFile ? (
            <button className="rent-btn rent-btn--primary" onClick={() => fileInputRef.current?.click()}>
              {t('contracts.pickFile')}
            </button>
          ) : (
            <div className="rent-flex" style={{ gap: 12, alignItems: 'center' }}>
              <span className="rent-text-bold">{pendingFile.name}</span>
              <button className="rent-btn rent-btn--primary rent-btn--sm" disabled={uploading} onClick={handleUploadConfirm}>
                {t('contracts.upload')}
              </button>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" disabled={uploading} onClick={() => setPendingFile(null)}>
                {t('common.cancel')}
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            style={{ display: 'none' }}
            onChange={handleFilePicked}
          />
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
                  <th>{t('contracts.thSource')}</th>
                  <th>{t('contracts.thLanguage')}</th>
                  <th>{t('contracts.thStatus')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="rent-empty">{t('contracts.noContracts')}</div>
                    </td>
                  </tr>
                ) : (
                  contracts.map((c) => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => handleOpen(c.id)}>
                      <td>
                        <div className="rent-text-bold">{c.title}</div>
                        {c.document_hash && (
                          <div className="rent-text-sm rent-text-muted">hash: {c.document_hash.slice(0, 16)}…</div>
                        )}
                      </td>
                      <td>
                        <span className="rent-badge rent-badge--neutral">
                          {sourceLabel[c.source || ''] ? t(sourceLabel[c.source || '']) : (c.source || '-')}
                        </span>
                      </td>
                      <td>{c.language || '-'}</td>
                      <td>
                        <span className="rent-badge rent-badge--neutral">{statusLabel[c.status] ? t(statusLabel[c.status]) : c.status}</span>
                      </td>
                      <td>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={(e) => { e.stopPropagation(); handleOpen(c.id) }}>
                          {t('contracts.open')}
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
            <h3 className="rent-card__title">{detail.contract.title}</h3>
            <span className="rent-badge rent-badge--neutral">
              {statusLabel[detail.contract.status] ? t(statusLabel[detail.contract.status]) : detail.contract.status}
            </span>
          </div>
          <div className="rent-card__body">
            <div className="rent-grid rent-grid--2 rent-mb-3">
              {detail.parties.length === 0 ? (
                <div className="rent-empty">{t('contracts.noParties')}</div>
              ) : (
                detail.parties.map((p) => (
                  <div key={p.id} className="rent-contract-party">
                    <div>
                      <div className="rent-text-bold">
                        {p.name}
                        {p.signed ? (
                          <span className="rent-badge rent-badge--success" style={{ marginLeft: 8 }}>{t('contracts.stSigned')}</span>
                        ) : null}
                      </div>
                      <div className="rent-text-sm rent-text-muted">{t('contracts.roleLabel', { r: p.role })}</div>
                      {(p.email || p.phone) && (
                        <div className="rent-text-sm rent-text-muted">{p.email} {p.phone}</div>
                      )}
                      {p.declined_at && (
                        <div className="rent-text-sm" style={{ color: 'var(--rent-danger, #dc2626)' }}>
                          {t('contracts.declinedAt', { at: p.declined_at })}
                          {p.decline_reason ? `：${p.decline_reason}` : ''}
                        </div>
                      )}
                      {p.sign_url && (
                        <div className="rent-text-sm rent-text-muted">url: {p.sign_url}</div>
                      )}
                    </div>
                    <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
                      {!p.signed && canEdit && (
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleCopyLink(p.id)}>
                          {t('contracts.copyLink')}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            {canEdit && (
              <div className="rent-flex" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={handleSend}>
                  {t('contracts.sendNotice')}
                </button>
                <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={openEdit}>
                  {t('contracts.edit')}
                </button>
                <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setPartyOpen(true)}>
                  + {t('contracts.addParty')}
                </button>
                <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={() => setVoidOpen(true)}>
                  {t('contracts.void')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 编辑合同 */}
      <Modal
        open={editOpen}
        title={t('contracts.edit')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onOk={handleEditSave}
        onCancel={() => setEditOpen(false)}
      >
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.thTitle')}</label>
          <input className="rent-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        </div>
        <div className="rent-field">
          <label className="rent-label">HTML</label>
          <textarea
            className="rent-input"
            rows={8}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="<h1>...</h1>"
          />
        </div>
      </Modal>

      {/* 追加签署方 */}
      <Modal
        open={partyOpen}
        title={t('contracts.addParty')}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onOk={handleAddParty}
        onCancel={() => setPartyOpen(false)}
      >
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.fName')}</label>
          <input className="rent-input" value={partyForm.name} onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })} />
        </div>
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.fEmail')}</label>
          <input className="rent-input" value={partyForm.email} onChange={(e) => setPartyForm({ ...partyForm, email: e.target.value })} />
        </div>
        <div className="rent-field">
          <label className="rent-label">{t('contracts.fRole')}</label>
          <select className="rent-input" value={partyForm.role} onChange={(e) => setPartyForm({ ...partyForm, role: e.target.value })}>
            <option value="tenant">tenant</option>
            <option value="landlord">landlord</option>
            <option value="agent">agent</option>
            <option value="witness">witness</option>
          </select>
        </div>
      </Modal>

      {/* 作废合同 */}
      <Modal
        open={voidOpen}
        title={t('contracts.voidTitle')}
        okText={t('contracts.void')}
        okButtonProps={{ danger: true }}
        cancelText={t('common.cancel')}
        onOk={handleVoid}
        onCancel={() => setVoidOpen(false)}
      >
        <div className="rent-field">
          <label className="rent-label">{t('contracts.voidReason')}</label>
          <textarea className="rent-input" rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}

export default Contracts