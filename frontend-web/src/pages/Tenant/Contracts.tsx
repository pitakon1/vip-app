import { useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import { contractsApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import { useAuthStore } from '@/stores/auth'

interface ContractRow {
  id: string
  title: string
  status: string
  source?: string
}

interface Party {
  id: string
  name: string
  role: string
  signed?: boolean
  email?: string
  phone?: string
  real_name_verified?: boolean
}

interface SignField {
  id: string
  party_id?: string | null
  field_type: string
  signed: boolean
}

// 签署区 field_type → method
const FIELD_METHOD: Record<string, string> = {
  signature: 'personal_handwrite',
  seal: 'company_seal',
  date: 'date',
}

const statusMeta: Record<string, { text: string; cls: string }> = {
  draft: { text: 'contracts.stDraft', cls: 'rent-badge--neutral' },
  sent: { text: 'contracts.stPendingSign', cls: 'rent-badge--warning' },
  partially_signed: { text: 'contracts.stPendingSign', cls: 'rent-badge--warning' },
  signed: { text: 'contracts.stSigned', cls: 'rent-badge--success' },
  completed: { text: 'contracts.stCompleted', cls: 'rent-badge--success' },
  voided: { text: 'contracts.stVoided', cls: 'rent-badge--error' },
  expired: { text: 'contracts.stExpired', cls: 'rent-badge--warning' },
  rejected: { text: 'contracts.stRejected', cls: 'rent-badge--error' },
  revoked: { text: 'contracts.stRevoked', cls: 'rent-badge--error' },
}

const TenantContracts = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [list, setList] = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ contract?: ContractRow; parties: Party[]; signFields: SignField[] }>({ parties: [], signFields: [] })
  const [openId, setOpenId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await contractsApi.list()
      setList(res.data || [])
    } catch {
      setLoadError(t('contracts.errList'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const handleOpen = (id: string) => {
    setOpenId(id)
    contractsApi
      .get(id)
      .then((res) => {
        const d = res.data
        setDetail({
          contract: { id: d.id, title: d.title, status: d.status, source: d.source },
          parties: (d.parties || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            signed: p.signed,
            email: p.email,
            phone: p.phone,
            real_name_verified: !!p.real_name_verified_at,
          })),
          signFields: (d.sign_fields || []).map((f: any) => ({
            id: f.id,
            party_id: f.party_id,
            field_type: f.field_type,
            signed: f.signed,
          })),
        })
      })
      .catch(() => message.error(t('contracts.errList')))
  }

  // 当前登录用户是否为该签署方：以姓名 / 邮箱匹配后端 party（后端不含 user_id 回显）
  const isMe = (p: Party) => {
    if (user?.full_name && p.name && p.name === user.full_name) return true
    if (user?.email && p.email && p.email.toLowerCase() === user.email.toLowerCase()) return true
    return false
  }

  const handleSign = (partyId: string) => {
    if (!detail.contract) return
    const party = detail.parties.find((p) => p.id === partyId)
    // 已签署方无需操作
    if (party?.signed) return
    // 若该方有签署区字段，则按字段签署（取第一个未签字段）
    const pendingField = detail.signFields.find(
      (f) => f.party_id === partyId && !f.signed,
    )
    const method = FIELD_METHOD[pendingField?.field_type || 'signature']
    contractsApi
      .sign(detail.contract.id, {
        partyId,
        ...(pendingField ? { fieldId: pendingField.id, method } : {}),
      })
      .then(() => {
        message.success(t('contracts.msgSigned'))
        handleOpen(detail.contract!.id)
      })
      .catch((err: any) => {
        const status = err?.response?.status
        const d = err?.response?.data?.detail
        if (status === 403 && d === 'REAL_NAME_REQUIRED') {
          message.error(t('contracts.realNameFirst'))
        } else {
          message.error(errorText(err, t('contracts.errSign')))
        }
      })
  }

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('contracts.myContracts')}</h3>
      </div>
      <div className="rent-card__body" style={{ padding: '8px 16px' }}>
        {loadError && list.length === 0 ? (
          <DataState
            error={loadError}
            retryText={t('common.retry')}
            onRetry={() => { void load() }}
          />
        ) : loading && list.length === 0 ? (
          <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
        ) : list.length === 0 ? (
          <DataState empty emptyTitle={t('contracts.noContracts')} />
        ) : (
          list.map((c) => {
            const meta = statusMeta[c.status] || statusMeta.draft
            return (
              <div
                key={c.id}
                className="rent-my__row"
                style={{ padding: '14px 0', borderBottom: '1px solid var(--rent-border)', cursor: 'pointer' }}
                onClick={() => handleOpen(c.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="rent-text-sm rent-text-bold" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.title}
                    </span>
                    <span className={`rent-badge ${meta.cls}`}>{t(meta.text)}</span>
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--rent-ink-2)', flexShrink: 0, marginLeft: 12 }}><polyline points="9 18 15 12 9 6" /></svg>
              </div>
            )
          })
        )}
      </div>

      {detail.contract && (
        <div className="rent-card" style={{ marginTop: 16 }}>
          <div className="rent-card__header">
            <h3 className="rent-card__title">{detail.contract.title}</h3>
            <span className={`rent-badge ${(statusMeta[detail.contract.status] || statusMeta.draft).cls}`}>
              {t((statusMeta[detail.contract.status] || statusMeta.draft).text)}
            </span>
          </div>
          <div className="rent-card__body">
            {detail.parties.length === 0 ? (
              <div className="rent-empty">{t('contracts.noParties')}</div>
            ) : (
              detail.parties.map((p) => {
                const me = isMe(p)
                return (
                  <div key={p.id} className="rent-contract-party" style={{ marginBottom: 10 }}>
                    <div>
                      <div className="rent-text-bold">
                        {p.signed ? `${p.name} ✓` : p.name}
                        {me ? `（${t('contracts.meTag')}）` : ''}
                      </div>
                      <div className="rent-text-sm rent-text-muted">{t('contracts.roleLabel', { r: p.role })}</div>
                      {(p.email || p.phone) && (
                        <div className="rent-text-sm rent-text-muted">{p.email} {p.phone}</div>
                      )}
                    </div>
                    <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
                      {p.signed ? (
                        <span className="rent-badge rent-badge--success">{t('contracts.stSigned')}</span>
                      ) : me && openId === detail.contract?.id ? (
                        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => handleSign(p.id)}>
                          {t('contracts.signMe')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TenantContracts