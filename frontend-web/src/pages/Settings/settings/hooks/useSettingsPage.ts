import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { companyApi, backupApi } from '@/services/api'
import type { CompanyInfo } from '@/types'
import { errorText } from '@/lib/errorText'
import { NOTIFICATION_ROWS, PAYMENT_CHANNELS } from '../constants'
import type { BackupJob, CompanyFormState, NotifyRow, PaymentChannel } from '../types'

/** 设置页全部状态与读写：公司资料 / Logo / 通知规则 / 支付渠道 / 数据备份 */
export const useSettingsPage = () => {
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
  const [notifyRows, setNotifyRows] = useState<NotifyRow[]>(NOTIFICATION_ROWS)

  // 支付渠道状态
  const [channels, setChannels] = useState<PaymentChannel[]>(PAYMENT_CHANNELS)

  // 公司 Logo（真实落库：/company/info 的 logo_url；为空表示未设置）
  const [logoUrl, setLogoUrl] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  // 社媒字典原样保留（backend 侧 line 等键不在表单里，保存时需合并回去，避免被覆盖丢失）
  const [socialRaw, setSocialRaw] = useState<Record<string, string>>({})

  // v1.8 数据备份状态
  const [backupJobs, setBackupJobs] = useState<BackupJob[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupRunning, setBackupRunning] = useState(false)

  const fetchBackupJobs = async () => {
    setBackupLoading(true)
    try {
      const res = await backupApi.jobs()
      setBackupJobs(res.data || [])
    } catch {
      setBackupJobs([])
    } finally {
      setBackupLoading(false)
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
    } catch (err) {
      message.error(errorText(err, t('settings.errBackupFailed')))
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
    } catch (err) {
      message.error(errorText(err, t('settings.errFetchCompany')))
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
    } catch (err) {
      message.error(errorText(err, t('settings.errFetchSettings')))
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
    } catch (err) {
      message.error(errorText(err, t('settings.errSaveFailed')))
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
    } catch (err) {
      message.error(errorText(err, t('settings.errLogoUpload')))
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
    } catch (err) {
      message.error(errorText(err, t('settings.errLogoRemove')))
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
    } catch (err) {
      message.error(errorText(err, t('settings.errSaveFailed')))
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
    } catch (err) {
      message.error(errorText(err, t('settings.errSaveFailed')))
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

  return {
    activeTab,
    setActiveTab,
    loading,
    saving,
    companyForm,
    setCompanyForm,
    updatedAt,
    notifyRows,
    channels,
    logoUrl,
    logoUploading,
    logoInputRef,
    backupJobs,
    backupLoading,
    backupRunning,
    fetchBackupJobs,
    handleBackupRun,
    handleCompanySave,
    handleCompanyReset,
    handleLogoUpload,
    handleLogoRemove,
    handleNotifySave,
    handleNotifyReset,
    handleChannelSave,
    handleChannelReset,
    toggleChannel,
    updateChannelField,
    toggleChannelCard,
    toggleNotify,
  }
}
