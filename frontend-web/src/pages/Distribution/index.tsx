import { useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { brokerApi, propertyDealApi } from '@/services/api'
import { useCachedQuery } from '@/lib/queryCache'

const BROKER_TYPE_KEYS: Record<string, string> = {
  individual: 'distribution.typeIndividual',
  agency: 'distribution.typeAgency',
  franchise: 'distribution.typeFranchise',
  affiliate: 'distribution.typeAffiliate',
}

const BROKER_LEVEL_KEYS: Record<string, string> = {
  silver: 'distribution.levelSilver',
  gold: 'distribution.levelGold',
  platinum: 'distribution.levelPlatinum',
  franchisor: 'distribution.levelFranchisor',
}

const BROKER_STATUS: Record<string, { labelKey: string; badge: string }> = {
  pending: { labelKey: 'distribution.stPending', badge: 'rent-badge--warning' },
  active: { labelKey: 'distribution.stActive', badge: 'rent-badge--success' },
  suspended: { labelKey: 'distribution.stSuspended', badge: 'rent-badge--error' },
  terminated: { labelKey: 'distribution.stTerminated', badge: 'rent-badge--neutral' },
}

interface Broker {
  id: string
  partner_name?: string
  broker_type?: string
  level?: string
  status?: string
  invite_code?: string
  contact_name?: string
  contact_phone?: string
  contact_email?: string
  country?: string
  base_rate?: number
}

interface Referral {
  id: string
  invite_code?: string
  referred_name?: string
  referred_phone?: string
  source?: string
  status?: string
  created_at?: string
}

const TABS = [
  { key: 'brokers', labelKey: 'distribution.tabBrokers' },
  { key: 'referrals', labelKey: 'distribution.tabReferrals' },
  { key: 'split', labelKey: 'distribution.tabSplit' },
]

const shortId = (id?: string) => (id ? String(id).slice(0, 8) : '—')

const Distribution = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('brokers')
  const [brokerCreateOpen, setBrokerCreateOpen] = useState(false)
  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('distribution.title')}</h2>
          <p className="rent-page-header__subtitle">
            {t('distribution.subtitle')}
          </p>
        </div>
        <div className="rent-page-header__actions">
          {activeTab === 'brokers' && (
            <button className="rent-btn rent-btn--primary" type="button" onClick={() => setBrokerCreateOpen(true)}>
              {t('distribution.registerBroker')}
            </button>
          )}
        </div>
      </div>

      <div className="rent-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="rent-tab"
            data-active={activeTab === tab.key}
            onClick={() => {
              setActiveTab(tab.key)
              setBrokerCreateOpen(false)
            }}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'brokers' && <BrokersTab createOpen={brokerCreateOpen} onOpenChange={setBrokerCreateOpen} />}
      {activeTab === 'referrals' && <ReferralsTab />}
      {activeTab === 'split' && <SplitTab />}
    </div>
  )
}

/* ===== 渠道商 Tab ===== */
const BrokersTab = ({ createOpen, onOpenChange }: { createOpen: boolean; onOpenChange: (v: boolean) => void }) => {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState('')
  const [keyword, setKeyword] = useState('')
  const [approveBroker, setApproveBroker] = useState<Broker | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ partner_name: '', broker_type: 'individual', contact_name: '', contact_phone: '', contact_email: '', country: 'TH', base_rate: '' })
  const [approveForm, setApproveForm] = useState<any>({ level: 'silver', base_rate: '' })

  // 渠道商列表：按筛选/页码缓存（缓存优先渲染 + 后台刷新）
  const brokersQ = useCachedQuery<{ items: Broker[]; total: number }>({
    queryKey: ['brokers', String(page), status, level],
    cacheKey: `brokers:${page}:${status}:${level}`,
    queryFn: async () => {
      const res = await brokerApi.list({ page, pageSize: 10, status: status || undefined, level: level || undefined })
      const payload = res.data?.data ?? res.data
      return { items: payload?.items ?? [], total: payload?.total ?? 0 }
    },
  })
  const items = brokersQ.data?.items ?? []
  const total = brokersQ.data?.total ?? 0
  const loading = brokersQ.isPending && !brokersQ.data
  const refresh = () => { void brokersQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (brokersQ.isError) message.error((brokersQ.error as any)?.response?.data?.message || t('distribution.errFetchBrokers'))
  }, [brokersQ.isError, brokersQ.error])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))
  const setApproveField = (k: string) => (e: any) => setApproveForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.partner_name) {
      message.error(t('distribution.errPartnerName'))
      return
    }
    setSubmitting(true)
    try {
      await brokerApi.create({
        partner_name: form.partner_name,
        broker_type: form.broker_type,
        contact_name: form.contact_name || undefined,
        contact_phone: form.contact_phone || undefined,
        contact_email: form.contact_email || undefined,
        country: form.country || 'TH',
        base_rate: form.base_rate ? Number(form.base_rate) : 0,
      })
      message.success(t('distribution.msgRegistered'))
      onOpenChange(false)
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('distribution.errRegisterFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async () => {
    if (!approveBroker) return
    setSubmitting(true)
    try {
      await brokerApi.approve(approveBroker.id, {
        level: approveForm.level,
        base_rate: approveForm.base_rate ? Number(approveForm.base_rate) : 0,
      })
      message.success(t('distribution.msgApproved'))
      setApproveBroker(null)
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('distribution.errApproveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleSuspend = async (b: Broker) => {
    try {
      await brokerApi.suspend(b.id)
      message.success(t('distribution.msgSuspended'))
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('distribution.errSuspendFailed'))
    }
  }

  const openApprove = (b: Broker) => {
    setApproveForm({ level: b.level || 'silver', base_rate: b.base_rate != null ? String(b.base_rate) : '' })
    setApproveBroker(b)
  }

  // 状态分布仅基于当前页数据统计，避免引入额外接口调用
  const statusCounts = useMemo(() => ({
    pending: items.filter((b) => b.status === 'pending').length,
    active: items.filter((b) => b.status === 'active').length,
    suspended: items.filter((b) => b.status === 'suspended').length,
  }), [items])

  const kw = keyword.trim().toLowerCase()
  const visibleItems = kw
    ? items.filter((b) =>
        (b.partner_name || '').toLowerCase().includes(kw) ||
        (b.contact_name || '').toLowerCase().includes(kw) ||
        (b.invite_code || '').toLowerCase().includes(kw))
    : items

  const statCards = [
    {
      label: t('distribution.statTotal'),
      value: String(total),
      iconBg: 'rgba(20,184,166,0.1)',
      iconColor: 'var(--rent-primary)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      ),
    },
    {
      label: t('distribution.statPending'),
      value: String(statusCounts.pending),
      iconBg: 'rgba(217,119,6,0.12)',
      iconColor: 'var(--state-warning)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      label: t('distribution.statActive'),
      value: String(statusCounts.active),
      iconBg: 'rgba(22,163,74,0.1)',
      iconColor: 'var(--state-success)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      label: t('distribution.statSuspended'),
      value: String(statusCounts.suspended),
      iconBg: 'rgba(220,38,38,0.1)',
      iconColor: 'var(--state-error)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="10" y1="15" x2="10" y2="9" /><line x1="14" y1="15" x2="14" y2="9" />
        </svg>
      ),
    },
  ]

  return (
    <>
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {statCards.map((c) => (
          <div className="rent-stat-card" key={c.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{c.label}</div>
                <div className="rent-stat-card__value rent-num">{c.value}</div>
              </div>
              <div className="rent-stat-card__icon" style={{ background: c.iconBg, color: c.iconColor }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rent-filter-bar">
        <div className="rent-filter-bar__search">
          <div className="rent-search" style={{ width: '100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder={t('distribution.searchPlaceholder')} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
        </div>
        <select className="rent-form-select rent-filter-select" style={{ width: 'auto', minWidth: 120 }} aria-label={t('distribution.ariaLevel')} value={level} onChange={(e) => { setLevel(e.target.value); setPage(1) }}>
          <option value="">{t('distribution.optAllLevels')}</option>
          {Object.keys(BROKER_LEVEL_KEYS).map((k) => <option key={k} value={k}>{t(BROKER_LEVEL_KEYS[k])}</option>)}
        </select>
        <select className="rent-form-select rent-filter-select" style={{ width: 'auto', minWidth: 130 }} aria-label={t('distribution.ariaStatus')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t('distribution.optAllStatus')}</option>
          {Object.keys(BROKER_STATUS).map((k) => <option key={k} value={k}>{t(BROKER_STATUS[k].labelKey)}</option>)}
        </select>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('distribution.listTitle')}</h3><span className="rent-badge rent-badge--neutral">{t('distribution.totalCount', { count: total })}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('distribution.emptyBrokers')}</div>
          ) : visibleItems.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('distribution.emptyNoMatch')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('distribution.thName')}</th><th>{t('distribution.thType')}</th><th>{t('distribution.thLevel')}</th><th>{t('common.status')}</th><th>{t('distribution.thInviteCode')}</th><th>{t('distribution.thRegion')}</th><th style={{ textAlign: 'right' }}>{t('distribution.thRate')}</th><th>{t('common.action')}</th></tr></thead>
                <tbody>
                  {visibleItems.map((b) => {
                    const st = BROKER_STATUS[b.status || 'pending'] || BROKER_STATUS.pending
                    return (
                      <tr key={b.id}>
                        <td>{b.partner_name}</td>
                        <td>{b.broker_type && BROKER_TYPE_KEYS[b.broker_type] ? t(BROKER_TYPE_KEYS[b.broker_type]) : '—'}</td>
                        <td>{b.level && BROKER_LEVEL_KEYS[b.level] ? t(BROKER_LEVEL_KEYS[b.level]) : '—'}</td>
                        <td><span className={`rent-badge ${st.badge}`}>{t(st.labelKey)}</span></td>
                        <td><span className="rent-mono">{b.invite_code || '—'}</span></td>
                        <td>{b.country || '—'}</td>
                        <td className="rent-num">{b.base_rate ?? 0}</td>
                        <td>
                          <div className="rent-flex rent-gap-2">
                            {b.status === 'pending' && (
                              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openApprove(b)}>{t('distribution.btnApprove')}</button>
                            )}
                            {(b.status === 'active' || b.status === 'terminated') && (
                              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleSuspend(b)}>{t('distribution.btnSuspend')}</button>
                            )}
                            <span className="rent-text-muted rent-text-sm">#{shortId(b.id)}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="rent-pagination" style={{ marginTop: 14, padding: '0 22px 16px' }}>
            <span className="rent-pagination__info">
              {t('distribution.pageInfo', { total })}{kw ? t('distribution.pageMatched', { count: visibleItems.length }) : ''}
            </span>
            <button className="rent-pagination__btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>{t('distribution.ariaPrev')}</button>
            <span className="rent-pagination__info">{page}</span>
            <button className="rent-pagination__btn" onClick={() => setPage(page + 1)} disabled={page * 10 >= total}>{t('distribution.ariaNext')}</button>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => onOpenChange(false)}>
          <div className="rent-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('distribution.registerBroker')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('distribution.labelPartnerName')}</label><input className="rent-form-input" value={form.partner_name} onChange={setField('partner_name')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelType')}</label>
                  <select className="rent-form-select" value={form.broker_type} onChange={setField('broker_type')}>
                    {Object.keys(BROKER_TYPE_KEYS).map((k) => <option key={k} value={k}>{t(BROKER_TYPE_KEYS[k])}</option>)}
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelCountry')}</label><input className="rent-form-input" value={form.country} onChange={setField('country')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelContact')}</label><input className="rent-form-input" value={form.contact_name} onChange={setField('contact_name')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelPhone')}</label><input className="rent-form-input" value={form.contact_phone} onChange={setField('contact_phone')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelEmail')}</label><input className="rent-form-input" value={form.contact_email} onChange={setField('contact_email')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelDefaultRate')}</label><input className="rent-form-input" type="number" value={form.base_rate} onChange={setField('base_rate')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('distribution.registering') : t('distribution.btnRegister')}</button>
            </div>
          </div>
        </div>
      )}

      {approveBroker && (
        <div className="rent-modal-backdrop" onClick={() => setApproveBroker(null)}>
          <div className="rent-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('distribution.approveTitle', { name: approveBroker.partner_name })}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelLevel')}</label>
                  <select className="rent-form-select" value={approveForm.level} onChange={setApproveField('level')}>
                    {Object.keys(BROKER_LEVEL_KEYS).map((k) => <option key={k} value={k}>{t(BROKER_LEVEL_KEYS[k])}</option>)}
                  </select>
                </div>
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelRate')}</label><input className="rent-form-input" type="number" value={approveForm.base_rate} onChange={setApproveField('base_rate')} /></div>
              </div>
              <div className="rent-form-hint">{t('distribution.hintApprove')}</div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setApproveBroker(null)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleApprove} disabled={submitting}>{submitting ? t('distribution.approving') : t('distribution.btnConfirmApprove')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 转介绍记录 Tab ===== */
const ReferralsTab = () => {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<any>({ invite_code: '', referred_name: '', referred_phone: '' })

  // 转介绍记录：缓存优先渲染 + 后台刷新
  const referralsQ = useCachedQuery<Referral[]>({
    queryKey: ['my-referrals'],
    cacheKey: 'my-referrals',
    queryFn: async () => {
      const res = await brokerApi.myReferrals()
      return res.data ?? []
    },
  })
  const items = referralsQ.data ?? []
  const loading = referralsQ.isPending && !referralsQ.data
  const refresh = () => { void referralsQ.refetch({ cancelRefetch: false }) }

  useEffect(() => {
    if (referralsQ.isError) message.error((referralsQ.error as any)?.response?.data?.message || t('distribution.errFetchReferrals'))
  }, [referralsQ.isError, referralsQ.error])

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.invite_code) {
      message.error(t('distribution.errInviteCode'))
      return
    }
    setSubmitting(true)
    try {
      await brokerApi.createReferral({
        invite_code: form.invite_code,
        referred_name: form.referred_name || undefined,
        referred_phone: form.referred_phone || undefined,
        source: 'link',
      })
      message.success(t('distribution.msgReferralCreated'))
      setCreateOpen(false)
      setForm({ invite_code: '', referred_name: '', referred_phone: '' })
      refresh()
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('distribution.errRecordFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="rent-filter-bar">
        <span className="rent-text-muted">{t('distribution.referralsHint')}</span>
        <div style={{ flex: 1 }} />
        <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setCreateOpen(true)}>{t('distribution.btnRecordReferral')}</button>
      </div>

      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('distribution.listTitleReferrals')}</h3><span className="rent-badge rent-badge--neutral">{t('distribution.itemsCount', { count: items.length })}</span></div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          {loading ? (
            <div className="rent-empty rent-text-muted">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rent-empty rent-text-muted">{t('distribution.emptyReferrals')}</div>
          ) : (
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead><tr><th>{t('distribution.thInviteCode')}</th><th>{t('distribution.thReferred')}</th><th>{t('distribution.thPhone')}</th><th>{t('distribution.thChannel')}</th><th>{t('common.status')}</th><th>{t('distribution.thDate')}</th></tr></thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td><span className="rent-mono">{r.invite_code || '—'}</span></td>
                      <td>{r.referred_name || '—'}</td>
                      <td>{r.referred_phone || '—'}</td>
                      <td>{r.source || '—'}</td>
                      <td><span className="rent-badge rent-badge--info">{r.status || 'referred'}</span></td>
                      <td className="rent-table__mono">{r.created_at ? String(r.created_at).slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="rent-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="rent-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="rent-modal__header"><h3 className="rent-card__title">{t('distribution.modalRecordReferral')}</h3></div>
            <div className="rent-modal__body">
              <div className="rent-form-row">
                <div className="rent-form-group" style={{ flex: 1 }}><label className="rent-form-label">{t('distribution.labelInviteCode')}</label><input className="rent-form-input" value={form.invite_code} onChange={setField('invite_code')} /></div>
              </div>
              <div className="rent-form-row">
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelReferred')}</label><input className="rent-form-input" value={form.referred_name} onChange={setField('referred_name')} /></div>
                <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelPhone')}</label><input className="rent-form-input" value={form.referred_phone} onChange={setField('referred_phone')} /></div>
              </div>
            </div>
            <div className="rent-modal__footer">
              <button className="rent-btn rent-btn--secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
              <button className="rent-btn rent-btn--primary" onClick={handleCreate} disabled={submitting}>{submitting ? t('distribution.recording') : t('distribution.btnRecord')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== 联合单分成 Tab ===== */
const SplitTab = () => {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string>('')
  const [form, setForm] = useState<any>({ deal_id: '', commission_total: '', currency: 'THB', participants: [{ role: 'agent', rate: '100', kind: 'user_id', subject: '' }] })

  // 成交下拉：与托管页共用缓存（键一致）
  const dealsQ = useCachedQuery<any[]>({
    queryKey: ['property-deals', 'options'],
    cacheKey: 'property-deals:options',
    queryFn: async () => {
      const res = await propertyDealApi.list({ page: 1, pageSize: 100 })
      const payload = res.data?.data ?? res.data
      return payload?.items ?? []
    },
  })
  const deals = dealsQ.data ?? []

  const setField = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const updateParticipant = (idx: number, k: string, v: string) => {
    setForm((f: any) => ({
      ...f,
      participants: f.participants.map((p: any, i: number) => (i === idx ? { ...p, [k]: v } : p)),
    }))
  }

  const addParticipant = () => setForm((f: any) => ({ ...f, participants: [...f.participants, { role: 'agent', rate: '0', kind: 'user_id', subject: '' }] }))
  const removeParticipant = (idx: number) => setForm((f: any) => ({ ...f, participants: f.participants.filter((_: any, i: number) => i !== idx) }))

  const buildPayload = () => {
    return form.participants.map((p: any) => {
      const row: any = { role: p.role, rate: Number(p.rate || 0) }
      if (p.subject) {
        if (p.kind === 'employee_id') row.employee_id = p.subject
        else if (p.kind === 'partner_id') row.partner_id = p.subject
        else row.user_id = p.subject
      }
      return row
    })
  }

  const handleSubmit = async () => {
    if (!form.deal_id || !form.commission_total) {
      message.error(t('distribution.errDealRequired'))
      return
    }
    setSubmitting(true)
    try {
      const res = await brokerApi.createSplitDeal({
        deal_id: form.deal_id,
        commission_total: Number(form.commission_total),
        currency: form.currency || 'THB',
        participants: buildPayload(),
      })
      const payload = res.data ?? {}
      const splits = payload.splits ?? []
      const sum = splits.reduce((acc: number, s: any) => acc + Number(s.rate || 0), 0)
      if (sum > 100) message.warning(t('distribution.warnRateOver100'))
      setResult(JSON.stringify(payload, null, 2))
      message.success(t('distribution.msgSplitCreated'))
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('distribution.errSplitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rent-card">
      <div className="rent-card__header"><h3 className="rent-card__title">{t('distribution.splitTitle')}</h3></div>
      <div className="rent-card__body">
        <div className="rent-form-row">
          <div className="rent-form-group" style={{ flex: 1 }}>
            <label className="rent-form-label">{t('distribution.labelDeal')}</label>
            <select className="rent-form-select" value={form.deal_id} onChange={setField('deal_id')}>
              <option value="">{t('distribution.optSelectDeal')}</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{t('distribution.dealOption', { id: shortId(d.id), currency: d.currency || '-', amount: Number(d.sale_price || 0).toLocaleString() })}</option>)}
            </select>
          </div>
        </div>
        <div className="rent-form-row">
          <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelCommissionTotal')}</label><input className="rent-form-input" type="number" value={form.commission_total} onChange={setField('commission_total')} /></div>
          <div className="rent-form-group"><label className="rent-form-label">{t('distribution.labelCurrency')}</label><input className="rent-form-input" value={form.currency} onChange={setField('currency')} /></div>
        </div>

        <label className="rent-form-label">{t('distribution.labelParticipants')}</label>
        {form.participants.map((p: any, idx: number) => (
          <div className="rent-form-row" key={idx} style={{ marginBottom: 8 }}>
            <select className="rent-form-select" style={{ width: 120, minWidth: 120 }} aria-label={t('distribution.ariaRole')} value={p.role} onChange={(e) => updateParticipant(idx, 'role', e.target.value)}>
              <option value="agent">{t('distribution.roleAgent')}</option>
              <option value="employee">{t('distribution.roleEmployee')}</option>
              <option value="broker">{t('distribution.roleBroker')}</option>
              <option value="referral">{t('distribution.roleReferral')}</option>
            </select>
            <select className="rent-form-select" style={{ width: 130, minWidth: 130 }} aria-label={t('distribution.ariaKind')} value={p.kind} onChange={(e) => updateParticipant(idx, 'kind', e.target.value)}>
              <option value="user_id">{t('distribution.kindUserId')}</option>
              <option value="employee_id">{t('distribution.kindEmployeeId')}</option>
              <option value="partner_id">{t('distribution.kindPartnerId')}</option>
            </select>
            <input className="rent-form-input" style={{ flex: 1 }} placeholder={t('distribution.placeholderSubject')} value={p.subject} onChange={(e) => updateParticipant(idx, 'subject', e.target.value)} />
            <input className="rent-form-input" style={{ width: 90, minWidth: 90 }} type="number" placeholder="rate%" value={p.rate} onChange={(e) => updateParticipant(idx, 'rate', e.target.value)} />
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => removeParticipant(idx)}>{t('distribution.btnRemove')}</button>
          </div>
        ))}
        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={addParticipant}>{t('distribution.btnAddParticipant')}</button>

        <div className="rent-flex rent-gap-2" style={{ marginTop: 16 }}>
          <button className="rent-btn rent-btn--primary" onClick={handleSubmit} disabled={submitting}>{submitting ? t('common.submitting') : t('distribution.btnSubmitSplit')}</button>
        </div>

        {result && (
          <div className="rent-card" style={{ marginTop: 16 }}>
            <div className="rent-card__header"><h3 className="rent-card__title">{t('distribution.resultTitle')}</h3></div>
            <div className="rent-card__body"><pre className="rent-text-sm" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{result}</pre></div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Distribution