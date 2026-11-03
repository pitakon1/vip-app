import type { NotifyRow, PaymentChannel } from './types'

// 权限矩阵数据
export const PERMISSION_MATRIX = [
  { name: 'settings.permViewProperties', admin: true, owner: true, tenant: true, employee: true },
  { name: 'settings.permEditProperties', admin: true, owner: true, tenant: false, employee: true },
  { name: 'settings.permViewContracts', admin: true, owner: true, tenant: true, employee: true },
  { name: 'settings.permManagePayments', admin: true, owner: true, tenant: false, employee: true },
  { name: 'settings.permManageEmployees', admin: true, owner: false, tenant: false, employee: false },
  { name: 'settings.title', admin: true, owner: false, tenant: false, employee: false },
]

// 通知行配置
export const NOTIFICATION_ROWS: NotifyRow[] = [
  { key: 'rent', title: 'settings.notifRentTitle', desc: 'settings.notifRentDesc', channels: { email: true, sms: true, push: false }, enabled: true },
  { key: 'lease', title: 'settings.notifLeaseTitle', desc: 'settings.notifLeaseDesc', channels: { email: true, sms: false, push: true }, enabled: true },
  { key: 'register', title: 'settings.notifRegisterTitle', desc: 'settings.notifRegisterDesc', channels: { email: true, sms: false, push: true }, enabled: true },
  { key: 'payment', title: 'settings.notifPaymentTitle', desc: 'settings.notifPaymentDesc', channels: { email: true, sms: true, push: false }, enabled: true },
  { key: 'maintenance', title: 'settings.notifMaintenanceTitle', desc: 'settings.notifMaintenanceDesc', channels: { email: true, sms: true, push: true }, enabled: true },
  { key: 'system', title: 'settings.notifSystemTitle', desc: 'settings.notifSystemDesc', channels: { email: true, sms: false, push: true }, enabled: false },
]

// 支付渠道「兜底初始值」：仅结构与字段名，**不放示例账号/密钥**。
// 这些值会真正落库并展示给租客，写死示例号等于把伪造数据当真实配置。
// 页面加载时以 GET /company/settings 的真实配置覆盖。
export const PAYMENT_CHANNELS: PaymentChannel[] = [
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
export const CURRENCY_OPTIONS = ['THB (฿) — 泰铢', 'USD — 美元', 'CNY — 人民币', 'SGD — 新加坡元']
export const TIMEZONE_OPTIONS = ['Asia/Bangkok (UTC+7)', 'Asia/Singapore (UTC+8)', 'Asia/Shanghai (UTC+8)', 'UTC — 协调世界时']

export const SETTINGS_TABS = [
  { key: 'company', label: 'settings.tabCompany' },
  { key: 'payment', label: 'settings.tabPayment' },
  { key: 'notification', label: 'settings.tabNotification' },
  { key: 'permission', label: 'settings.tabPermission' },
  { key: 'backup', label: 'settings.tabBackup' },
]
