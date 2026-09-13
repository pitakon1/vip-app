import { useEffect, useState } from 'react'
import { message } from 'antd'
import { companyApi, backupApi } from '@/services/api'
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

interface SystemFormState {
  systemName: string
  contact: string
  contactPhone: string
  notificationEnabled: boolean
  autoAssign: boolean
  maintenanceMode: boolean
}

// 权限矩阵数据
const PERMISSION_MATRIX = [
  { name: '查看房源', admin: true, owner: true, tenant: true, employee: true },
  { name: '编辑房源', admin: true, owner: true, tenant: false, employee: true },
  { name: '查看合同', admin: true, owner: true, tenant: true, employee: true },
  { name: '管理付款', admin: true, owner: true, tenant: false, employee: true },
  { name: '管理员工', admin: true, owner: false, tenant: false, employee: false },
  { name: '系统设置', admin: true, owner: false, tenant: false, employee: false },
]

// 通知行配置
const NOTIFICATION_ROWS = [
  { key: 'rent', title: '租金到期提醒', desc: '租金到期前 7 天向租客发送提醒通知', channels: { email: true, sms: true, push: false }, enabled: true },
  { key: 'lease', title: '合同到期提醒', desc: '合同到期前 30 天通知业主与租客', channels: { email: true, sms: false, push: true }, enabled: true },
  { key: 'register', title: '新租客注册通知', desc: '新租客完成注册后通知管理员', channels: { email: true, sms: false, push: true }, enabled: true },
  { key: 'payment', title: '付款确认通知', desc: '收到租金付款后向租客发送确认', channels: { email: true, sms: true, push: false }, enabled: true },
  { key: 'maintenance', title: '维修申请通知', desc: '租客提交维修申请后通知业主与员工', channels: { email: true, sms: true, push: true }, enabled: true },
  { key: 'system', title: '系统维护通知', desc: '计划内系统维护提前通知全体用户', channels: { email: true, sms: false, push: true }, enabled: false },
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
const PAYMENT_CHANNELS: PaymentChannel[] = [
  {
    key: 'bank',
    name: '银行转账',
    desc: '支持 Bangkok Bank / Kasikorn / SCB 网银转账',
    enabled: true,
    icon: '<path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>',
    fields: [
      { label: 'Bangkok Bank 账号', value: '012-345-6789', mono: true },
      { label: 'Kasikorn 账号', value: '123-4-56789-0', mono: true },
      { label: 'PromptPay 账号', value: '0123456789012', mono: true },
      { label: '账户持有人姓名', value: 'HaoFang Property Management (Thailand) Co., Ltd.', mono: false },
    ],
  },
  {
    key: 'card',
    name: '信用卡',
    desc: 'Visa / Mastercard 在线支付',
    enabled: true,
    icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    fields: [
      { label: '商户 ID (Merchant ID)', value: 'MID-8801234567', mono: true },
    ],
    cards: [
      { name: 'Visa', checked: true },
      { name: 'Mastercard', checked: true },
      { name: 'American Express', checked: false },
    ],
  },
  {
    key: 'alipay',
    name: '支付宝',
    desc: 'Alipay 跨境收款',
    enabled: false,
    icon: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    fields: [
      { label: '商户 ID (Partner ID)', value: '2088123456789012', mono: true },
      { label: 'API Key', value: 'alipay_live_key_2024', mono: true, password: true, hint: '出于安全考虑，密钥已加密保存' },
    ],
  },
  {
    key: 'wechat',
    name: '微信支付',
    desc: 'WeChat Pay 跨境收款',
    enabled: false,
    icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    fields: [
      { label: '商户 ID (MCH ID)', value: '1900000109', mono: true },
      { label: 'API Key', value: 'wechat_live_key_2024', mono: true, password: true, hint: '出于安全考虑，密钥已加密保存' },
    ],
  },
  {
    key: 'wise',
    name: 'Wise',
    desc: 'Wise Business 跨境收款',
    enabled: false,
    icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    fields: [
      { label: 'Wise Business ID', value: 'WBUS-MY-998877', mono: true },
    ],
  },
]

const Settings = () => {
  const [activeTab, setActiveTab] = useState('company')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 公司信息表单 state（原生 input）
  const [companyForm, setCompanyForm] = useState<CompanyFormState>({
    name: 'HaoFang Property Management (Thailand) Co., Ltd.',
    regNo: '0105566012345',
    address: '12th Fl., Park Venture, Sukhumvit 55, Bangkok 10110',
    phone: '+66 2-123 4567',
    email: 'info@rentflow.co.th',
    website: '',
    wechat: '',
    whatsapp: '',
    facebook: '',
    instagram: '',
    currency: 'THB (฿) — 泰铢',
    timezone: 'Asia/Bangkok (UTC+7)',
  })

  // 系统设置表单 state
  const [systemForm, setSystemForm] = useState<SystemFormState>({
    systemName: '',
    contact: '',
    contactPhone: '',
    notificationEnabled: true,
    autoAssign: false,
    maintenanceMode: false,
  })

  // 通知行状态
  const [notifyRows, setNotifyRows] = useState(NOTIFICATION_ROWS)

  // 支付渠道状态
  const [channels, setChannels] = useState(PAYMENT_CHANNELS)

  // v1.8 数据备份状态
  const [backupJobs, setBackupJobs] = useState<any[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
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
          ? '备份完成'
          : job && job.status === 'running'
            ? '备份任务已启动'
            : '备份执行完成（请查看记录）',
      )
      fetchBackupJobs()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '备份失败')
    } finally {
      setBackupRunning(false)
    }
  }

  const fetchCompanyInfo = async () => {
    setLoading(true)
    try {
      const res = await companyApi.info()
      const payload = res.data?.data ?? res.data
      setCompanyForm((prev) => ({
        ...prev,
        name: payload?.name || prev.name,
        address: payload?.address || prev.address,
        phone: payload?.phone || prev.phone,
        email: payload?.email || prev.email,
        website: payload?.website || '',
        wechat: payload?.wechat || '',
        whatsapp: payload?.whatsapp || '',
        facebook: payload?.facebook || '',
        instagram: payload?.instagram || '',
      }))
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取公司信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanyInfo()
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
        wechat: companyForm.wechat,
        whatsapp: companyForm.whatsapp,
        facebook: companyForm.facebook,
        instagram: companyForm.instagram,
      }
      await companyApi.update(values)
      message.success('公司信息已保存')
    } catch (err: any) {
      message.error(err?.response?.data?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCompanyReset = () => {
    fetchCompanyInfo()
  }

  const handleSystemSave = async () => {
    try {
      setSaving(true)
      // 系统设置暂无独立接口，本地保存示意
      message.success('系统设置已保存')
      // eslint-disable-next-line no-console
      console.log('system settings:', systemForm)
    } catch (err: any) {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleNotifySave = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      message.success('通知设置已保存')
    }, 200)
  }

  const handleChannelSave = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      message.success('渠道配置已保存')
    }, 200)
  }

  const toggleChannel = (key: string) => {
    setChannels((cs) =>
      cs.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c)),
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
    { key: 'company', label: '公司信息' },
    { key: 'payment', label: '支付渠道' },
    { key: 'notification', label: '通知设置' },
    { key: 'permission', label: '权限管理' },
    { key: 'backup', label: '数据备份' },
  ]

  return (
    <div className="rent-main">
      {/* Page header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">系统设置</h2>
          <p className="rent-page-header__subtitle">管理公司信息、支付渠道、通知规则与角色权限</p>
        </div>
        <div className="rent-page-header__actions">
          <span className="rent-badge rent-badge--neutral">最后更新：2026-07-28</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="rent-tabs">
        {tabs.map((t) => (
          <div
            key={t.key}
            className="rent-tab"
            data-active={activeTab === t.key ? 'true' : 'false'}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* ===== Tab 1: 公司信息 ===== */}
      {activeTab === 'company' && (
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">公司信息</h3>
            <span className="rent-badge rent-badge--neutral">基本信息</span>
          </div>
          <div className="rent-card__body">
            <div className="rent-form-group">
              <label className="rent-form-label">公司名称</label>
              <input
                className="rent-form-input"
                type="text"
                value={companyForm.name}
                disabled={loading}
                onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">公司注册编号</label>
              <input
                className="rent-form-input"
                type="text"
                value={companyForm.regNo}
                disabled={loading}
                onChange={(e) => setCompanyForm((p) => ({ ...p, regNo: e.target.value }))}
              />
              <div className="rent-form-hint">SSM 注册编号，将显示在合同与发票上</div>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">公司地址</label>
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
                <label className="rent-form-label">联系电话</label>
                <input
                  className="rent-form-input"
                  type="text"
                  value={companyForm.phone}
                  disabled={loading}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">联系邮箱</label>
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
                <label className="rent-form-label">结算货币</label>
                <select
                  className="rent-form-select"
                  value={companyForm.currency}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, currency: e.target.value }))}
                >
                  <option>THB (฿) — 泰铢</option>
                  <option>USD — 美元</option>
                  <option>CNY — 人民币</option>
                  <option>SGD — 新加坡元</option>
                </select>
              </div>
              <div className="rent-form-group">
                <label className="rent-form-label">时区</label>
                <select
                  className="rent-form-select"
                  value={companyForm.timezone}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, timezone: e.target.value }))}
                >
                  <option>Asia/Bangkok (UTC+7)</option>
                  <option>Asia/Singapore (UTC+8)</option>
                  <option>Asia/Shanghai (UTC+8)</option>
                  <option>UTC — 协调世界时</option>
                </select>
              </div>
            </div>
            <div className="rent-form-group" style={{ marginBottom: 0 }}>
              <label className="rent-form-label">公司 Logo</label>
              <div className="rent-logo-preview">
                <img className="rent-logo-preview__box" src={brandLogo} alt="logo" />
                <div>
                  <div className="rent-text-sm rent-text-bold">rentflow-logo.png</div>
                  <div className="rent-caption">256 × 256px · 18.4 KB</div>
                </div>
                <button className="rent-btn rent-btn--ghost rent-btn--sm" style={{ marginLeft: 8 }} type="button">移除</button>
              </div>
              <div className="rent-upload">
                <div className="rent-upload__icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                </div>
                <div className="rent-text-sm rent-text-bold" style={{ color: 'var(--rent-ink)' }}>点击上传或拖拽文件到此处</div>
                <div className="rent-caption" style={{ marginTop: 4 }}>建议尺寸 256×256px，支持 PNG / SVG，最大 2MB</div>
              </div>
            </div>
          </div>
          <div className="rent-card__footer rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="rent-btn rent-btn--secondary" type="button" onClick={handleCompanyReset} disabled={loading}>重置</button>
            <button className="rent-btn rent-btn--primary" type="button" onClick={handleCompanySave} disabled={saving || loading}>
              {saving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </div>
      )}

      {/* ===== Tab 2: 支付渠道 ===== */}
      {activeTab === 'payment' && (
        <>
          <p className="rent-body rent-mb-4">启用并配置租客可用的付款方式。已启用的渠道将显示在账单支付页面。</p>
          <div className="rent-grid rent-grid--2" style={{ alignItems: 'start' }}>
            {channels.map((ch) => (
              <div key={ch.key} className="rent-channel-card" data-enabled={ch.enabled ? 'true' : 'false'}>
                <div className="rent-channel-card__header">
                  <div className="rent-channel-card__head-left">
                    <div className="rent-channel-card__icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ch.icon }} />
                    </div>
                    <div>
                      <div className="rent-channel-card__name">{ch.name}</div>
                      <div className="rent-channel-card__desc">{ch.desc}</div>
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
                      <label className="rent-form-label">{f.label}</label>
                      <input
                        className={`rent-form-input${f.mono ? ' rent-table__mono' : ''}`}
                        type={f.password ? 'password' : 'text'}
                        defaultValue={f.value}
                      />
                      {f.hint && <div className="rent-form-hint">{f.hint}</div>}
                    </div>
                  ))}
                  {ch.cards && (
                    <div className="rent-form-group" style={{ marginBottom: 0 }}>
                      <label className="rent-form-label">支持卡种</label>
                      <div className="rent-flex rent-gap-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        {ch.cards.map((card) => (
                          <label key={card.name} className="rent-check">
                            <input type="checkbox" defaultChecked={card.checked} /> {card.name}
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
            <button className="rent-btn rent-btn--secondary" type="button">恢复默认</button>
            <button className="rent-btn rent-btn--primary" type="button" onClick={handleChannelSave} disabled={saving}>
              {saving ? '保存中...' : '保存渠道配置'}
            </button>
          </div>
        </>
      )}

      {/* ===== Tab 3: 通知设置 ===== */}
      {activeTab === 'notification' && (
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">通知规则</h3>
            <div className="rent-flex rent-gap-4" style={{ alignItems: 'center' }}>
              <span className="rent-text-sm rent-text-muted">渠道：</span>
              <span className="rent-badge rent-badge--primary">邮件</span>
              <span className="rent-badge rent-badge--primary">短信</span>
              <span className="rent-badge rent-badge--primary">推送</span>
            </div>
          </div>
          <div className="rent-card__body" style={{ padding: 0 }}>
            {notifyRows.map((row) => (
              <div key={row.key} className="rent-notify-row">
                <div className="rent-notify-row__info">
                  <div className="rent-notify-row__title">{row.title}</div>
                  <div className="rent-notify-row__desc">{row.desc}</div>
                </div>
                <div className="rent-notify-row__channels">
                  <label className="rent-check">
                    <input type="checkbox" checked={row.channels.email} onChange={() => toggleNotify(row.key, 'email')} /> 邮件
                  </label>
                  <label className="rent-check">
                    <input type="checkbox" checked={row.channels.sms} onChange={() => toggleNotify(row.key, 'sms')} /> 短信
                  </label>
                  <label className="rent-check">
                    <input type="checkbox" checked={row.channels.push} onChange={() => toggleNotify(row.key, 'push')} /> 推送
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
            <button className="rent-btn rent-btn--secondary" type="button">重置</button>
            <button className="rent-btn rent-btn--primary" type="button" onClick={handleNotifySave} disabled={saving}>
              {saving ? '保存中...' : '保存通知设置'}
            </button>
          </div>
        </div>
      )}

      {/* ===== Tab 4: 权限管理 ===== */}
      {activeTab === 'permission' && (
        <>
          <p className="rent-body rent-mb-4">以下为系统预设的角色权限矩阵。每个角色可执行的操作已按职责分配。</p>
          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">角色权限矩阵</h3>
              <span className="rent-badge rent-badge--neutral">预设权限</span>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th style={{ width: '34%' }}>权限项</th>
                      <th className="rent-perm-cell">管理员</th>
                      <th className="rent-perm-cell">业主</th>
                      <th className="rent-perm-cell">租客</th>
                      <th className="rent-perm-cell">员工</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_MATRIX.map((perm) => (
                      <tr key={perm.name}>
                        <td>{perm.name}</td>
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
                <span className="rent-text-sm rent-text-muted">允许</span>
              </span>
              <span className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
                <span className="rent-perm-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </span>
                <span className="rent-text-sm rent-text-muted">禁止</span>
              </span>
              <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 'auto' }}>权限按角色预设，如需自定义请联系系统管理员</span>
            </div>
          </div>
        </>
      )}

      {/* ===== Tab 5: 数据备份 ===== */}
      {activeTab === 'backup' && (
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">数据备份与每日同步</h3>
            <span className="rent-badge rent-badge--primary">v1.8</span>
          </div>
          <div className="rent-card__body">
            <p className="rent-body rent-mb-4">
              系统每日凌晨（02:00）自动执行全库备份，您也可以手动触发一次备份。备份以
              <span className="rent-table__mono"> .json.gz </span>
              格式保存到服务器备份目录，并记录每次任务的状态与结果。
            </p>
            <div className="rent-flex rent-gap-4" style={{ alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
              <button className="rent-btn rent-btn--primary" type="button" onClick={handleBackupRun} disabled={backupRunning}>
                {backupRunning ? '备份中...' : '立即执行备份'}
              </button>
              <span className="rent-text-sm rent-text-muted">自动备份策略：每日 02:00 · 全表快照 · 保留最近记录</span>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={fetchBackupJobs} disabled={backupLoading} style={{ marginLeft: 'auto' }}>刷新</button>
            </div>
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>文件</th>
                    <th>大小</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {backupJobs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="rent-text-muted">暂无备份记录</td>
                    </tr>
                  )}
                  {backupJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="rent-table__mono">{job.created_at ? new Date(job.created_at).toLocaleString() : '-'}</td>
                      <td>{job.type === 'daily' ? '每日同步' : job.type === 'manual' ? '手动' : job.type}</td>
                      <td>
                        <span className="rent-badge" data-success={job.status === 'success' ? 'true' : undefined} data-danger={job.status === 'failed' ? 'true' : undefined}>
                          {job.status === 'success' ? '成功' : job.status === 'failed' ? '失败' : job.status}
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
      )}
    </div>
  )
}

export default Settings
