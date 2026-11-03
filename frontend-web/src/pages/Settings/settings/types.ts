export interface CompanyFormState {
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

export interface PaymentField {
  label: string
  value: string
  mono: boolean
  password?: boolean
  hint?: string
}

export interface PaymentChannel {
  key: string
  name: string
  desc: string
  enabled: boolean
  icon: string
  fields: PaymentField[]
  cards?: { name: string; checked: boolean }[]
}

export interface NotifyRow {
  key: string
  title: string
  desc: string
  channels: { email: boolean; sms: boolean; push: boolean }
  enabled: boolean
}

export interface BackupJob {
  id: string
  created_at?: string
  type?: string
  status?: string
  file_path?: string
  size_bytes?: number
  error?: string | null
  [key: string]: any
}
