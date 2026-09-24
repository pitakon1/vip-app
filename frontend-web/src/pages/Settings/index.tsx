import { useEffect, useRef, useState } from 'react'
import { message, Empty } from 'antd'
import { companyApi, backupApi } from '@/services/api'
import { useTranslation } from 'react-i18next'
import type { CompanyInfo } from '@/types'
import brandLogo from '@/assets/haofang-logo.jpg'
import './settings.css'

interface CompanyFormState {
  name: string
  regNo: string
  address: string
  phone: string
  email: string
  website: string
  wechat: string
  whatsapp: string
  facebook: string
  instagram: string
  currency: string
  timezone: string
}

// 权限矩阵数据
const PERMISSION_MATRIX = [
  { name: 'settings.permViewProperties', admin: true, owner: true, tenant: true, employee: true },
  { name: 'settings.permEditProperties', admin: true, owner: true, tenant: false, employee: true },
  { name: 'settings.permViewContracts', admin: true, owner: true, tenant: true, employee: true },
  { name: 'settings.permManagePayments', admin: true, owner: true, tenant: false, employee: true },
  { name: 'settings.permManageEmployees', admin: true, owner: false, tenant: false, employee: false },
  { name: 'settings.title', admin: true, owner: false, tenant: false, employee: false },
]

// 通知行配置
const NOTIFICATION_ROWS = [
  { key: 'rent', title: 'settings.notifRentTitle', desc: 'settings.notifRentDesc', channels: { email: true, sms: true, push: false }, enabled: true },
  { key: 'lease', title: 'settings.notifLeaseTitle', desc: 'settings.notifLeaseDesc', channels: { email: true, sms: false, push: true }, enabled: true },
  { key: 'register', title: 'settings.notifRegisterTitle', desc: 'settings.notifRegisterDesc', channels: { email: true, sms: false, push: true }, enabled: true },
  { key: 'payment', title: 'settings.notifPaymentTitle', desc: 'settings.notifPaymentDesc', channels: { email: true, sms: true, push: false }, enabled: true },
  { key: 'maintenance', title: 'settings.notifMaintenanceTitle', desc: 'settings.notifMaintenanceDesc', channels: { email: true, sms: true, push: true }, enabled: true },
  { key: 'system', title: 'settings.notifSystemTitle', desc: 'settings.notifSystemDesc', channels: { email: true, sms: false, push: true }, enabled: false },
]

// 支付渠道配置
interface PaymentField {
  label: string
  value: string
  mono: boolean
  password?: boolean
  hint?: string
}
interface PaymentChannel {
  key: string
  name: string
  desc: string
  enabled: boolean
  icon: string
  fields: PaymentField[]
  cards?: { name: string; checked: boolean }[]
}
// 支付渠道「兜底初始值」：仅结构与字段名，**不放示例账号/密钥**。
// 这些值会真正落库并展示给租客，写死示例号等于把伪造数据当真实配置。
// 页面加载时以 GET /company/settings 的真实配置覆盖。
const PAYMENT_CHANNELS: PaymentChannel[] = [
  {
    key: 'bank',
    name: 'settings.chBankName',
    desc: 'settings.chBankDesc',
    enabled: true,
    icon: '<path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>',
    fields: [
      { label: 'settings.chBankField1', value: '', mono: true },
      { label: 'settings.chBankField2', value: '', mono: true },
      { label: 'settings.chBankField3', value: '', mono: true },
      { label: 'settings.chBankField4', value: '', mono: false },
    ],
  },
  {
    key: 'card',
    name: 'settings.chCardName',
    desc: 'settings.chCardDesc',
    enabled: true,
    icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    fields: [
      { label: 'settings.chCardField1', value: '', mono: true },
    ],
    cards: [
      { name: 'Visa', checked: true },
      { name: 'Mastercard', checked: true },
      { name: 'American Express', checked: false },
    ],
  },
  {
    key: 'alipay',
    name: 'settings.chAlipayName',
    desc: 'settings.chAlipayDesc',
    enabled: false,
    icon: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    fields: [
      { label: 'settings.chAlipayField1', value: '', mono: true },
      { label: 'API Key', value: '', mono: true, password: true, hint: 'settings.chApiKeyHint' },
    ],
  },
  {
    key: 'wechat',
    name: 'settings.chWechatName',
    desc: 'settings.chWechatDesc',
    enabled: false,
    icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    fields: [
      { label: 'settings.chWechatField1', value: '', mono: true },
      { label: 'API Key', value: '', mono: true, password: true, hint: 'settings.chApiKeyHint' },
    ],
  },
  {
    key: 'wise',
    name: 'Wise',
    desc: 'settings.chWiseDesc',
    enabled: false,
    icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    fields: [
      { label: 'Wise Business ID', value: '', mono: true },
    ],
  },
]

// 结算货币 / 时区可选项（与后端存储的字符串一致，直接读写）
const CURRENCY_OPTIONS = ['THB (฿) — 泰铢', 'USD — 美元', 'CNY — 人民币', 'SGD — 新加坡元']
const TIMEZONE_OPTIONS = ['Asia/Bangkok (UTC+7)', 'Asia/Singapore (UTC+8)', 'Asia/Shanghai (UTC+8)', 'UTC — 协调世界时']

const Settings = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('company')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 公司信息表单 state（原生 input）：初始留空，页面加载时从 GET /company/info 取真实值。
  // 此前这里写死了示例公司名/注册号/地址等，请求失败时会被当成真实信息展示甚至保存进库。
  const [companyForm, setCompanyForm] = useState<CompanyFormState>({
    name: '',
    regNo: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    wechat: '',
    whatsapp: '',
    facebook: '',
    instagram: '',
    currency: '',
    timezone: '',
  })
  // 公司资料真实更新时间（页面右上角「最后更新」）
  const [updatedAt, setUpdatedAt] = useState('')

  // 通知行状态（加载时以 GET /company/settings 的真实配置覆盖）
  const [notifyRows, setNotifyRows] = useState(NOTIFICATION_ROWS)

  // 支付渠道状态
  const [channels, setChannels] = useState<PaymentChannel[]>(PAYMENT_CHANNELS)

  // 公司 Logo（真实落库：/company/info 的 logo_url；为空表示未设置）
  const [logoUrl, setLogoUrl] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  // 社媒字典原样保留（backend 侧 line 等键不在表单里，保存时需合并回去，避免被覆盖丢失）
  const [socialRaw, setSocialRaw] = useState<Record<string, string>>({})

  // v1.8 数据备份状态
  const [backupJobs, setBackupJobs] = useState<any[]>([])
  const [backupLoading] = useState(false)
  const [backupRunning, setBackupRunning] = useState(false)

  const fetchBackupJobs = async () => {
    try {
      const res = await backupApi.jobs()
      setBackupJobs(res.data || [])
    } catch {
      // 静默处理，地址未配置时保持空列表
    }
  }

  useEffect(() => {
    fetchBackupJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBackupRun = async () => {
    setBackupRunning(true)
    try {
      const res = await backupApi.run()
      const job = res.data
      message.success(
        job && job.status === 'success'
          ? t('settings.msgBackupDone')
          : job && job.status === 'running'
            ? t('settings.msgBackupStarted')
            : t('settings.msgBackupFinished'),
      )
      fetchBackupJobs()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('settings.errBackupFailed'))
    } finally {
      setBackupRunning(false)
    }
  }

  const fetchCompanyInfo = async () => {
    setLoading(true)
    try {
      const res = await companyApi.info()
      const payload = res.data?.data ?? res.data
      setLogoUrl(payload?.logo_url || '')
      const soc = payload?.social_media
      if (soc && typeof soc === 'object') setSocialRaw(soc)
      setCompanyForm((prev) => ({
        ...prev,
        name: payload?.name || prev.name,
        address: payload?.address || prev.address,
        phone: payload?.phone || prev.phone,
        email: payload?.email || prev.email,
        website: payload?.website || '',
        wechat: soc?.wechat || '',
        whatsapp: soc?.whatsapp || '',
        facebook: soc?.facebook || '',
        instagram: soc?.instagram || '',
        // 注册号/结算货币/时区此前是前端写死示例值，改为读后端真实配置
        regNo: payload?.reg_no || '',
        currency: payload?.currency || '',
        timezone: payload?.timezone || '',
      }))
      setUpdatedAt(payload?.updated_at || '')
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('settings.errFetchCompany'))
    } finally {
      setLoading(false)
    }
  }

  // 系统配置（通知规则 / 支付渠道）：读后端真实配置，缺省由后端给默认值
  const fetchSettings = async () => {
    try {
      const res = await companyApi.settings()
      const payload = res.data?.data ?? res.data
      if (Array.isArray(payload?.notify_rows) && payload.notify_rows.length) {
        setNotifyRows(payload.notify_rows)
      }
      if (Array.isArray(payload?.payment_channels) && payload.payment_channels.length) {
        setChannels(payload.payment_channels)
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('settings.errFetchSettings'))
    }
  }

  useEffect(() => {
    fetchCompanyInfo()
    fetchSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCompanySave = async () => {
    try {
      setSaving(true)
      const values: CompanyInfo = {
        name: companyForm.name,
        address: companyForm.address,
        phone: companyForm.phone,
        email: companyForm.email,
        website: companyForm.website,
        // 社媒统一走 social_media（后端 PUT 只认这个字段），并合并表单未覆盖的键
        social_media: {
          ...socialRaw,
          wechat: companyForm.wechat,
          whatsapp: companyForm.whatsapp,
          facebook: companyForm.facebook,
          instagram: companyForm.instagram,
        },
        // 注册号/结算货币/时区此前没提交（后端也没字段），改完保存不上，现一并写库
        reg_no: companyForm.regNo,
        currency: companyForm.currency,
        timezone: companyForm.timezone,
      }
      const res = await companyApi.update(values)
      // 用后端返回值回填，顺便刷新「最后更新」时间
      const payload = res.data?.data ?? res.data
      if (payload?.updated_at) setUpdatedAt(payload.updated_at)
      message.success(t('settings.msgCompanySaved'))
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('settings.errSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleCompanyReset = () => {
    fetchCompanyInfo()
  }

  // 上传公司 Logo（真实落盘 /uploads/company 并写入 companyprofile.logo_url）
  const handleLogoUpload = async (file?: File | null) => {
    if (!file) return
    setLogoUploading(true)
    try {
      const res = await companyApi.uploadLogo(file)
      const payload = res.data?.data ?? res.data
      setLogoUrl(payload?.logo_url || '')
      message.success(t('settings.msgLogoUploaded'))
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('settings.errLogoUpload'))
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const handleLogoRemove = async () => {
    setLogoUploading(true)
    try {
      await companyApi.removeLogo()
      setLogoUrl('')
      message.success(t('settings.msgLogoRemoved'))
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('settings.errLogoRemove'))
    } finally {
      setLogoUploading(false)
    }
  }

  // 保存通知规则（此前只是 setTimeout 假成功，改了不落库、刷新即回退）
  const handleNotifySave = async () => {
    setSaving(true)
    try {
      await companyApi.updateSettings({ notify_rows: notifyRows })
      message.success(t('settings.msgNotifySaved'))
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('settings.errSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  // 通知设置重置：丢弃本次改动，重新拉取后端已保存的配置
  const handleNotifyReset = async () => {
    await fetchSettings()
    message.success(t('settings.msgNotifyRestored'))
  }

  // 保存支付渠道（同上，改为落库）
  const handleChannelSave = async () => {
    setSaving(true)
    try {
      await companyApi.updateSettings({ payment_channels: channels })
      message.success(t('settings.msgChannelSaved'))
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.response?.data?.message || t('settings.errSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  // 渠道配置重置：丢弃本次改动，重新拉取后端已保存的配置
  const handleChannelReset = async () => {
    await fetchSettings()
    message.success(t('settings.msgChannelRestored'))
  }

  const toggleChannel = (key: string) => {
    setChannels((cs) =>
      cs.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c)),
    )
  }

  // 渠道字段输入：此前用 defaultValue（非受控），输入根本不会进 state，
  // 保存时提交的是旧值——改成受控
  const updateChannelField = (chKey: string, index: number, value: string) => {
    setChannels((cs) =>
      cs.map((c) =>
        c.key === chKey
          ? { ...c, fields: c.fields.map((f, i) => (i === index ? { ...f, value } : f)) }
          : c,
      ),
    )
  }

  const toggleChannelCard = (chKey: string, name: string) => {
    setChannels((cs) =>
      cs.map((c) =>
        c.key === chKey && c.cards
          ? { ...c, cards: c.cards.map((card) => (card.name === name ? { ...card, checked: !card.checked } : card)) }
          : c,
      ),
    )
  }

  const toggleNotify = (key: string, field: 'enabled' | 'email' | 'sms' | 'push') => {
    setNotifyRows((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r
        if (field === 'enabled') return { ...r, enabled: !r.enabled }
        return {
          ...r,
          channels: { ...r.channels, [field]: !r.channels[field] },
        }
      }),
    )
  }

  const tabs = [
    { key: 'company', label: 'settings.tabCompany' },
    { key: 'payment', label: 'settings.tabPayment' },
    { key: 'notification', label: 'settings.tabNotification' },
    { key: 'permission', label: 'settings.tabPermission' },
    { key: 'backup', label: 'settings.tabBackup' },
  ]

  return (
    <div className="rent-main">
      {/* Page header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('settings.title')}</h2>
          <p className="rent-page-header__subtitle">{t('settings.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <span className="rent-badge rent-badge--neutral">
            {t('settings.lastUpdated', { date: updatedAt ? updatedAt.slice(0, 10) : '—' })}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="rent-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.key}
            className="rent-tab"
            data-active={activeTab === tab.key ? 'true' : 'false'}
            onClick={() => setActiveTab(tab.key)}
          >
            {t(tab.label)}
          </div>
        ))}
      </div>

      {/* ===== Tab 1: 公司信息 ===== */}
      {activeTab === 'company' && (
        <div className="rent-tab-panel" data-active="true">
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('settings.tabCompany')}</h3>
            <span className="rent-badge rent-badge--neutral">{t('settings.basicInfo')}</span>
          </div>
          <div className="rent-card__body">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('settings.companyName')}</label>
              <input
                className="rent-form-input"
                type="text"
                value={companyForm.name}
                disabled={loading}
                onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('settings.companyRegNo')}</label>
              <input
                className="rent-form-input"
                type="text"
                value={companyForm.regNo}
                disabled={loading}
                onChange={(e) => setCompanyForm((p) => ({ ...p, regNo: e.target.value }))}
              />
              <div className="rent-form-hint">{t('settings.regNoHint')}</div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('settings.companyAddress')}</label>
              <textarea
                className="rent-form-textarea"
                rows={2}
                value={companyForm.address}
                disabled={loading}
                onChange={(e) => setCompanyForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="rent-form-row">
              <div className="rent-form-group">
                <label className="rent-form-label">{t('settings.contactPhone')}</label>
                <input
                  className="rent-form-input"
                  type="text"
                  value={companyForm.phone}
                  disabled={loading}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('settings.contactEmail')}</label>
                <input
                  className="rent-form-input"
                  type="email"
                  value={companyForm.email}
                  disabled={loading}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="rent-form-row">
              <div className="rent-form-group">
                <label className="rent-form-label">{t('settings.currency')}</label>
                <select
                  className="rent-form-select"
                  value={companyForm.currency}
                  disabled={loading}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, currency: e.target.value }))}
                >
                  {!CURRENCY_OPTIONS.includes(companyForm.currency) && (
                    <option value="">{t('settings.notSet')}</option>
                  )}
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">{t('settings.timezone')}</label>
                <select
                  className="rent-form-select"
                  value={companyForm.timezone}
                  disabled={loading}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, timezone: e.target.value }))}
                >
                  {!TIMEZONE_OPTIONS.includes(companyForm.timezone) && (
                    <option value="">{t('settings.notSet')}</option>
                  )}
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rent-form-group" style={{ marginBottom: 0 }}>
              <label className="rent-form-label">{t('settings.companyLogo')}</label>
              <div className="rent-logo-preview">
                {logoUrl ? (
                  <>
                    <img className="rent-logo-preview__box" src={logoUrl} alt="logo" />
                    <div>
                      <div className="rent-text-sm rent-text-bold">{logoUrl.split('/').pop()}</div>
                      <div className="rent-caption">{t('settings.logoSaved')}</div>
                    </div>
                    <button
                      className="rent-btn rent-btn--ghost rent-btn--sm"
                      style={{ marginLeft: 8 }}
                      type="button"
                      onClick={handleLogoRemove}
                      disabled={logoUploading}
                    >
                      {t('settings.remove')}
                    </button>
                  </>
                ) : (
                  <>
                    <img className="rent-logo-preview__box" src={brandLogo} alt="logo" />
                    <div>
                      <div className="rent-text-sm rent-text-bold">{t('settings.logoNotSet')}</div>
                      <div className="rent-caption">{t('settings.logoDefaultHint')}</div>
                    </div>
                  </>
                )}
              </div>
              <label
                className="rent-upload"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleLogoUpload(e.dataTransfer.files?.[0])
                }}
              >
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                />
                <div className="rent-upload__icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                </div>
                <div className="rent-text-sm rent-text-bold" style={{ color: 'var(--rent-ink)' }}>
                  {logoUploading ? t('settings.uploading') : t('settings.uploadHint')}
                </div>
                <div className="rent-caption" style={{ marginTop: 4 }}>{t('settings.uploadSpec')}</div>
              </label>
            </div>
          </div>
          <div className="rent-card__footer rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="rent-btn rent-btn--secondary" type="button" onClick={handleCompanyReset} disabled={loading}>{t('settings.reset')}</button>
            <button className="rent-btn rent-btn--primary" type="button" onClick={handleCompanySave} disabled={saving || loading}>
              {saving ? t('settings.saving') : t('settings.saveChanges')}
            </button>
          </div>
        </div>
        </div>
      )}

      {/* ===== Tab 2: 支付渠道 ===== */}
      {activeTab === 'payment' && (
        <div className="rent-tab-panel" data-active="true">
          <p className="rent-body rent-mb-4">{t('settings.paymentIntro')}</p>
          <div className="rent-grid rent-grid--2" style={{ alignItems: 'start' }}>
            {channels.map((ch) => (
              <div key={ch.key} className="rent-channel-card" data-enabled={ch.enabled ? 'true' : 'false'}>
                <div className="rent-channel-card__header">
                  <div className="rent-channel-card__head-left">
                    <div className="rent-channel-card__icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ch.icon }} />
                    </div>
                    <div>
                      <div className="rent-channel-card__name">{t(ch.name)}</div>
                      <div className="rent-channel-card__desc">{t(ch.desc)}</div>
                    </div>
                  </div>
                  <label className="rent-switch">
                    <input
                      type="checkbox"
                      checked={ch.enabled}
                      onChange={() => toggleChannel(ch.key)}
                    />
                    <span className="rent-switch__track"></span>
                    <span className="rent-switch__thumb"></span>
                  </label>
                </div>
                <div className="rent-channel-card__body">
                  {ch.fields.map((f, i) => (
                    <div key={i} className="rent-form-group" style={{ marginBottom: i === ch.fields.length - 1 && !ch.cards ? 0 : 20 }}>
                      <label className="rent-form-label">{t(f.label)}</label>
                      <input
                        className={`rent-form-input${f.mono ? ' rent-table__mono' : ''}`}
                        type={f.password ? 'password' : 'text'}
                        value={f.value}
                        onChange={(e) => updateChannelField(ch.key, i, e.target.value)}
                      />
                      {f.hint && <div className="rent-form-hint">{t(f.hint)}</div>}
                    </div>
                  ))}
                  {ch.cards && (
                    <div className="rent-form-group" style={{ marginBottom: 0 }}>
                      <label className="rent-form-label">{t('settings.supportedCards')}</label>
                      <div className="rent-flex rent-gap-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        {ch.cards.map((card) => (
                          <label key={card.name} className="rent-check">
                            <input
                              type="checkbox"
                              checked={card.checked}
                              onChange={() => toggleChannelCard(ch.key, card.name)}
                            /> {card.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="rent-settings-savebar">
            <button className="rent-btn rent-btn--secondary" type="button" onClick={handleChannelReset}>{t('settings.restoreDefault')}</button>
            <button className="rent-btn rent-btn--primary" type="button" onClick={handleChannelSave} disabled={saving}>
              {saving ? t('settings.saving') : t('settings.saveChannelConfig')}
            </button>
          </div>
        </div>
      )}

      {/* ===== Tab 3: 通知设置 ===== */}
      {activeTab === 'notification' && (
        <div className="rent-tab-panel" data-active="true">
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('settings.notifyRules')}</h3>
            <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
              <span className="rent-text-sm rent-text-muted">{t('settings.channelsLabel')}</span>
              <span className="rent-badge rent-badge--primary">{t('settings.email')}</span>
              <span className="rent-badge rent-badge--primary">{t('settings.sms')}</span>
              <span className="rent-badge rent-badge--primary">{t('settings.push')}</span>
            </div>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            {notifyRows.map((row) => (
              <div key={row.key} className="rent-notify-row">
                <div className="rent-notify-row__info">
                  <div className="rent-notify-row__title">{t(row.title)}</div>
                  <div className="rent-notify-row__desc">{t(row.desc)}</div>
                </div>
                <div className="rent-notify-row__channels">
                  <label className="rent-check">
                    <input type="checkbox" checked={row.channels.email} onChange={() => toggleNotify(row.key, 'email')} /> {t('settings.email')}
                  </label>
                  <label className="rent-check">
                    <input type="checkbox" checked={row.channels.sms} onChange={() => toggleNotify(row.key, 'sms')} /> {t('settings.sms')}
                  </label>
                  <label className="rent-check">
                    <input type="checkbox" checked={row.channels.push} onChange={() => toggleNotify(row.key, 'push')} /> {t('settings.push')}
                  </label>
                </div>
                <div className="rent-notify-row__toggle">
                  <label className="rent-switch">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={() => toggleNotify(row.key, 'enabled')}
                    />
                    <span className="rent-switch__track"></span>
                    <span className="rent-switch__thumb"></span>
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="rent-card__footer rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="rent-btn rent-btn--secondary" type="button" onClick={handleNotifyReset}>{t('settings.reset')}</button>
            <button className="rent-btn rent-btn--primary" type="button" onClick={handleNotifySave} disabled={saving}>
              {saving ? t('settings.saving') : t('settings.saveNotifySettings')}
            </button>
          </div>
        </div>
        </div>
      )}

      {/* ===== Tab 4: 权限管理 ===== */}
      {activeTab === 'permission' && (
        <div className="rent-tab-panel" data-active="true">
          <p className="rent-body rent-mb-4">{t('settings.permissionIntro')}</p>
          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('settings.permMatrixTitle')}</h3>
              <span className="rent-badge rent-badge--neutral">{t('settings.presetPermissions')}</span>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th style={{ width: '34%' }}>{t('settings.thPermission')}</th>
                      <th className="rent-perm-cell">{t('settings.roleAdmin')}</th>
                      <th className="rent-perm-cell">{t('settings.roleOwner')}</th>
                      <th className="rent-perm-cell">{t('settings.roleTenant')}</th>
                      <th className="rent-perm-cell">{t('settings.roleEmployee')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_MATRIX.map((perm) => (
                      <tr key={perm.name}>
                        <td>{t(perm.name)}</td>
                        <td className="rent-perm-cell">
                          <span className="rent-perm-icon">
                            {perm.admin ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--state-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            )}
                          </span>
                        </td>
                        <td className="rent-perm-cell">
                          <span className="rent-perm-icon">
                            {perm.owner ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--state-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            )}
                          </span>
                        </td>
                        <td className="rent-perm-cell">
                          <span className="rent-perm-icon">
                            {perm.tenant ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--state-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            )}
                          </span>
                        </td>
                        <td className="rent-perm-cell">
                          <span className="rent-perm-icon">
                            {perm.employee ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--state-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rent-card__footer rent-flex rent-gap-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                <span className="rent-perm-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--state-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
                <span className="rent-text-sm rent-text-muted">{t('settings.allowed')}</span>
              </span>
              <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                <span className="rent-perm-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </span>
                <span className="rent-text-sm rent-text-muted">{t('settings.denied')}</span>
              </span>
              <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 'auto' }}>{t('settings.permFooterHint')}</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== Tab 5: 数据备份 ===== */}
      {activeTab === 'backup' && (
        <div className="rent-tab-panel" data-active="true">
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{t('settings.backupTitle')}</h3>
            <span className="rent-badge rent-badge--primary">v1.8</span>
          </div>
          <div className="rent-card__body">
            <p className="rent-body rent-mb-4">
              {t('settings.backupIntroA')}
              <span className="rent-table__mono"> .json.gz </span>
              {t('settings.backupIntroB')}
            </p>
            <div className="rent-flex rent-gap-4" style={{ alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
              <button className="rent-btn rent-btn--primary" type="button" onClick={handleBackupRun} disabled={backupRunning}>
                {backupRunning ? t('settings.backupRunning') : t('settings.runBackupNow')}
              </button>
              <span className="rent-text-sm rent-text-muted">{t('settings.autoBackupPolicy')}</span>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={fetchBackupJobs} disabled={backupLoading} style={{ marginLeft: 'auto' }}>{t('settings.refresh')}</button>
            </div>
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>{t('settings.thTime')}</th>
                    <th>{t('settings.thType')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('settings.thFile')}</th>
                    <th>{t('settings.thSize')}</th>
                    <th>{t('settings.thRemark')}</th>
                  </tr>
                </thead>
                <tbody>
                  {backupJobs.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="rent-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.emptyBackups')} />
                        </div>
                      </td>
                    </tr>
                  )}
                  {backupJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="rent-table__mono">{job.created_at ? new Date(job.created_at).toLocaleString() : '-'}</td>
                      <td>{job.type === 'daily' ? t('settings.backupTypeDaily') : job.type === 'manual' ? t('settings.backupTypeManual') : job.type}</td>
                      <td>
                        <span className="rent-badge" data-success={job.status === 'success' ? 'true' : undefined} data-danger={job.status === 'failed' ? 'true' : undefined}>
                          {job.status === 'success' ? t('settings.statusSuccess') : job.status === 'failed' ? t('settings.statusFailed') : job.status}
                        </span>
                      </td>
                      <td className="rent-table__mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.file_path || '-'}</td>
                      <td className="rent-table__mono">{job.size_bytes ? `${(job.size_bytes / 1024 / 1024).toFixed(2)} MB` : '-'}</td>
                      <td className="rent-text-muted">{job.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  )
}

export default Settings
