import { useState } from 'react'
import { View, Text, Button, Input, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import BottomNav from '@/components/BottomNav'
import StatusTop from '@/components/StatusTop'
import useAuthStore from '@/stores/auth'
import { authApi, chatApi, companyApi } from '@/services/api'
import { unwrapUploadResult, resolveMediaUrl } from '@/lib/api'
import { clearCacheSync } from '@/utils/cache'
import { iconStyle } from '@/utils/icons'
import type { IconKey } from '@/utils/icons'
import { useI18n, LANG_LABELS } from '@/i18n'
import type { User } from '@/types'
import './index.scss'
import { errorText } from '@/lib/errorText'

/** 一行列表入口：图标 + 文案 +（可选真实值）+ 箭头 */
interface RowEntry {
  key: string
  label: string
  icon: IconKey
  /** 副标题（仅「常用功能」这类带说明的行使用） */
  desc?: string
  /** 右侧真实值，来自接口；无后端字段时留空，不渲染 */
  value?: string
  /** 跳转目标；缺省表示后端无接口，仅按原型对齐结构 */
  url?: string
}

// C 端「我的」只保留个人内容：收藏、浏览足迹、降价提醒、我的订单（对齐贝壳首屏宫格）。
// 账单/报修/合同/租约/房产/收益/委托/小区事务全部收敛到「我家」Tab，禁止同一功能两处出现。
const C_GRID: Array<{ key: string; label: string; url: string; icon: IconKey }> = [
  { key: 'favorites', label: 'nav.favorites', url: '/pages/tenant/favorites/index', icon: 'heart' },
  { key: 'viewings', label: 'nav.myViewings', url: '/pages/tenant/viewings/index', icon: 'calendar' },
  { key: 'history', label: 'nav.history', url: '/pages/tenant/history/index', icon: 'calendar' },
  { key: 'priceAlerts', label: 'nav.priceAlerts', url: '/pages/tenant/price-alerts/index', icon: 'megaphone' },
  { key: 'orders', label: 'myHome.svcOrders', url: '/pages/tenant/deals/index', icon: 'doc' }
]

// 管理端 / 业主端「账户设置」：改密走 POST /auth/me/password；绑定手机/邮箱暂无接口
const ACCOUNT_ROWS: RowEntry[] = [
  { key: 'password', label: 'nav.changePassword', icon: 'gear' },
  { key: 'phone', label: 'profile.bindPhone', icon: 'user' },
  { key: 'email', label: 'profile.bindEmail', icon: 'doc' }
]

// 管理端 / 业主端「系统设置」：后端无语言、时区、主题、通知配置接口
const SYSTEM_ROWS: RowEntry[] = [
  { key: 'language', label: 'profile.language', icon: 'clipboard' },
  { key: 'timezone', label: 'profile.timezone', icon: 'calendar' },
  { key: 'theme', label: 'profile.theme', icon: 'star' },
  { key: 'notification', label: 'profile.notifySettings', icon: 'megaphone' }
]

// 管理端「业务设置」：后端无提醒天数、自动催缴配置接口
const BUSINESS_ROWS: RowEntry[] = [
  { key: 'rent-reminder', label: 'profile.rentReminderDays', icon: 'calendar' },
  { key: 'lease-reminder', label: 'profile.leaseReminder', icon: 'doc' },
  { key: 'auto-dunning', label: 'profile.autoDunning', icon: 'money' },
  { key: 'commission', label: 'profile.commissionSettings', icon: 'chart', url: '/pages/admin/commission-rules/index' }
]

// 业主端「设置」：对齐 owner-mini-settings.html；右侧值均来自真实数据/用户信息
// 末尾四项对齐贝壳设置页，均为真实能力（非占位）：权限设置 / 清理缓存 / 检查更新 / 举报与投诉
const OWNER_SETTING_ROWS: Array<RowEntry & { badge?: boolean }> = [
  { key: 'password', label: 'nav.changePassword', icon: 'gear' },
  { key: 'account', label: 'profile.account', icon: 'user' },
  { key: 'identity', label: 'profile.identity', icon: 'user' },
  { key: 'language', label: 'profile.language', value: '', icon: 'clipboard' },
  { key: 'notification', label: 'profile.notify', badge: true, icon: 'megaphone' },
  { key: 'permissions', label: 'profile.permissions', icon: 'gear' },
  { key: 'clearCache', label: 'profile.clearCache', icon: 'trash' },
  { key: 'checkUpdate', label: 'profile.checkUpdate', icon: 'download' }
]

// 员工 / 管理端复用 C 端「设置」中已接入真实能力的四项（实名认证 / 权限设置 / 清理缓存 / 检查更新）
const SECURITY_ROWS: RowEntry[] = OWNER_SETTING_ROWS.filter((row) =>
  ['identity', 'permissions', 'clearCache', 'checkUpdate'].includes(row.key)
)

// 帮助与客服（对齐贝壳设置页客服组：在线客服 / 电话客服 / 举报 / 评分 / 帮助中心）
const OWNER_SUPPORT_ROWS: RowEntry[] = [
  { key: 'onlineSupport', label: 'profile.onlineSupport', icon: 'headsetDark' },
  { key: 'contactSupport', label: 'profile.contactSupport', icon: 'headsetDark' },
  { key: 'report', label: 'profile.report', icon: 'flag' },
  { key: 'rate', label: 'profile.rate', icon: 'star' },
  { key: 'help', label: 'profile.help', icon: 'calendar' }
]

// 关于（对齐贝壳设置页「关于我们 / 版权信息 / 用户隐私规则」组）
const OWNER_ABOUT_ROWS: RowEntry[] = [
  { key: 'about', label: 'profile.about', icon: 'star', url: '/pages/about/index' },
  // 「关于我们 / 版权信息」均进同一个详情页（页脚即版权与注册号）
  { key: 'copyright', label: 'profile.copyrightInfo', icon: 'clipboard', url: '/pages/about/index' },
  { key: 'privacyRules', label: 'profile.privacyRules', icon: 'doc' }
]

// 员工 / 代理端：常用入口（客户 / 业绩已在底部导航，不再重复；通讯录移至「我的」）
const STAFF_ROWS: RowEntry[] = [
  { key: 'contacts', label: 'nav.contacts', desc: 'profile.contactsDesc', url: '/pages/employee/contacts/index', icon: 'user' },
  { key: 'attendance', label: 'nav.attendance', desc: 'profile.attendanceDesc', url: '/pages/attendance/index', icon: 'calendar' },
  { key: 'manageProperties', label: 'nav.properties', desc: 'profile.staffPropertiesDesc', url: '/pages/employee/properties/index', icon: 'home' },
  { key: 'contracts', label: 'lease.contract', desc: 'contract.entryManageDesc', url: '/pages/admin/contracts/index', icon: 'doc' }
]

// 角色文案（与原型顶部身份标签一致）
const ROLE_TEXT: Record<string, string> = {
  admin: 'perm.role.admin',
  owner: 'perm.role.owner',
  tenant: 'perm.role.tenant',
  agent: 'perm.role.agent',
  employee: 'perm.role.employee'
}

/** 手机号脱敏：保留前 3 位与后 4 位 */
const maskPhone = (phone?: string) =>
  phone && phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone || ''

/** 邮箱脱敏：保留首字符与域名 */
const maskEmail = (email?: string) => {
  if (!email || !email.includes('@')) return email || ''
  const [name, domain] = email.split('@')
  return `${name.slice(0, 1)}***@${domain}`
}

export default function ProfilePage() {
  const { t, lang } = useI18n()
  const user = useAuthStore((state) => state.user)
  const login = useAuthStore((state) => state.login)
  const logout = useAuthStore((state) => state.logout)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  const [appVersion, setAppVersion] = useState('')
  // 公司公开资料（/company/info）：客服电话与官网，供「联系客服 / 用户隐私规则」使用
  const [company, setCompany] = useState<{ phone?: string; website?: string }>({})
  // 管理端「业务设置」真实值（租金/合同提醒天数、自动催缴）
  const [business, setBusiness] = useState<{
    rent_reminder_days?: number
    lease_reminder_days?: number
    auto_dunning?: boolean
  }>({})

  useDidShow(() => {
    loadFromStorage()
    // 已登录时拉取最新用户信息
    if (useAuthStore.getState().token) {
      refreshUser()
      const currentRole = useAuthStore.getState().user?.role
      if (currentRole === 'tenant') {
        // 租客同样需要公司公开资料（联系客服电话 / 隐私规则外链 / 关于我们版本号）
        loadAppInfo()
      }
      if (currentRole === 'admin') {
        loadAppInfo()
        loadBusiness()
      }
      if (currentRole === 'owner') {
        loadAppInfo()
      }
    }
  })

  // 版本号取自后端公开接口，避免写死演示版本
  const loadAppInfo = async () => {
    try {
      const res: any = await companyApi.info()
      const info = res?.data ?? res
      setAppVersion(info?.version || '')
      setCompany({ phone: info?.phone || '', website: info?.website || '' })
    } catch (error) {
      console.warn('[Profile] 获取版本信息失败', error)
    }
  }

  // 管理端「业务设置」的真实值（此前三项只有标签、没有值，点击提示「暂未开放」）
  const loadBusiness = async () => {
    try {
      const res: any = await companyApi.settings()
      const biz = (res?.data ?? res)?.business
      if (biz) setBusiness(biz)
    } catch (error) {
      console.warn('[Profile] 获取业务设置失败', error)
    }
  }

  const refreshUser = async () => {
    try {
      const res = await authApi.me()
      const latest = ((res as any)?.data ?? res) as User | undefined
      const currentToken = useAuthStore.getState().token
      if (latest && currentToken) {
        login(currentToken, latest)
      }
    } catch (error) {
      // 静默失败，使用本地缓存的用户信息
      console.warn('[Profile] 获取用户信息失败', error)
    }
  }

  const handleLogout = () => {
    Taro.showModal({
      title: t('profile.tip'),
      content: t('profile.logoutConfirm'),
      success: (res) => {
        if (res.confirm) {
          // 清除本地 token 与用户信息
          logout()
          Taro.removeStorageSync('token')
          Taro.removeStorageSync('user')
          Taro.showToast({ title: t('profile.loggedOut'), icon: 'success' })
          setTimeout(() => {
            Taro.redirectTo({ url: '/pages/login/index' })
          }, 500)
        }
      }
    })
  }

  const handleNavigate = (url: string) => {
    Taro.navigateTo({ url })
  }

  /** 右上角客服入口：未登录引导登录，已登录进入「与平台客服」的 IM 会话 */
  const openSupport = async () => {
    if (!user) {
      Taro.navigateTo({ url: '/pages/login/index' })
      return
    }
    try {
      const res: any = await chatApi.support()
      const conv = Array.isArray(res) ? res[0] : res?.data
      if (!conv?.id) {
        Taro.showToast({ title: t('profile.supportUnavailable'), icon: 'none' })
        return
      }
      Taro.navigateTo({ url: `/pages/chat/detail/index?id=${conv.id}` })
    } catch {
      Taro.showToast({ title: t('profile.supportUnavailable'), icon: 'none' })
    }
  }

  /** 无后端接口的入口：只做结构对齐，点击明确提示未开放，不伪造成功 */
  const handleTodo = (label: string) => {
    Taro.showToast({ title: t('profile.comingSoon', { name: label }), icon: 'none' })
  }

  /** 已登录头像：点击选图并上传；未登录引导登录 */
  const pickAndUploadAvatar = () => {
    if (!user) {
      Taro.navigateTo({ url: '/pages/login/index' })
      return
    }
    Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const filePath = res.tempFilePaths?.[0]
        if (!filePath) return
        try {
          const up: any = await authApi.uploadAvatar(filePath)
          const latest = unwrapUploadResult<any>(up) ?? up
          const token = useAuthStore.getState().token
          if (latest && token) useAuthStore.getState().login(token, latest)
          Taro.setStorageSync('user', latest)
          loadFromStorage()
          showToast(t('profile.avatarUpdated'))
        } catch (e: any) {
          showToast(errorText(e, t('profile.avatarUploadFailed')))
        }
      },
    })
  }

  const showToast = (msg: string) => {
    Taro.showToast({ title: msg, icon: 'none' })
  }

  // ===== 编辑资料 =====
  const [editVisible, setEditVisible] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editSendingCode, setEditSendingCode] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  // 内联校验错误：靠近对应字段展示，而非仅顶部 toast
  const [editErr, setEditErr] = useState('')

  const openEdit = () => {
    setEditName(user?.full_name || '')
    setEditPhone(user?.phone || '')
    setEditEmail(user?.email || '')
    setEditCode('')
    setEditErr('')
    setEditVisible(true)
  }

  // 修改手机号必须先向新手机号发送验证码（后端 PATCH /auth/me 校验 code，否则 400）
  const sendEditCode = async () => {
    if (!editPhone.trim()) {
      setEditErr(t('profile.newPhoneRequired'))
      return
    }
    setEditSendingCode(true)
    try {
      await authApi.requestOtp({ recipient: editPhone.trim(), channel: 'sms' })
      Taro.showToast({ title: t('settings.codeSent'), icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: errorText(e, t('settings.codeSendFailed')), icon: 'none' })
    } finally {
      setEditSendingCode(false)
    }
  }

  const saveEdit = async () => {
    setEditErr('')
    if (!editName.trim()) {
      setEditErr(t('settings.nameRequired'))
      return
    }
    const phoneChanged = editPhone !== (user?.phone || '')
    if (phoneChanged && !editCode.trim()) {
      setEditErr(t('settings.codeRequired'))
      return
    }
    setEditSaving(true)
    try {
      const payload: Record<string, string> = { full_name: editName.trim() }
      if (phoneChanged) {
        payload.phone = editPhone.trim()
        payload.code = editCode.trim()
      }
      if (editEmail !== (user?.email || '')) payload.email = editEmail.trim()
      const res: any = await authApi.updateMe(payload)
      // 用返回的最新用户刷新本地状态（含认证 store 与缓存）
      const latest = res?.data ?? res
      const token = useAuthStore.getState().token
      if (latest && token) useAuthStore.getState().login(token, latest)
      Taro.setStorageSync('user', latest)
      loadFromStorage()
      setEditVisible(false)
      showToast(t('settings.saved'))
    } catch (e: any) {
      showToast(errorText(e, t('settings.saveFailed')))
    } finally {
      setEditSaving(false)
    }
  }

  // ===== 修改密码 =====
  const [pwdVisible, setPwdVisible] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdErr, setPwdErr] = useState('')

  const openPwd = () => {
    setOldPwd('')
    setNewPwd('')
    setConfirmPwd('')
    setPwdVisible(true)
  }

  const savePwd = async () => {
    setPwdErr('')
    if (!oldPwd || !newPwd) {
      setPwdErr(t('settings.pwdIncomplete'))
      return
    }
    if (newPwd.length < 6) {
      setPwdErr(t('settings.pwdTooShort'))
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdErr(t('settings.pwdMismatch'))
      return
    }
    setPwdSaving(true)
    try {
      await authApi.changePassword({ old_password: oldPwd, new_password: newPwd })
      setPwdVisible(false)
      // 改密后所有旧令牌失效
      logout()
      Taro.removeStorageSync('token')
      Taro.removeStorageSync('user')
      showToast(t('settings.pwdChanged'))
      setTimeout(() => Taro.redirectTo({ url: '/pages/login/index' }), 800)
    } catch (e: any) {
      showToast(errorText(e, t('settings.pwdChangeFailed')))
    } finally {
      setPwdSaving(false)
    }
  }

  // ===== 时区 / 通知设置 =====
  const [prefVisible, setPrefVisible] = useState(false)
  const [prefTimezone, setPrefTimezone] = useState('Asia/Bangkok')
  const [prefEmail, setPrefEmail] = useState(true)
  const [prefPush, setPrefPush] = useState(true)
  const [prefSaving, setPrefSaving] = useState(false)

  const openPrefs = async () => {
    setPrefVisible(true)
    try {
      const res: any = await authApi.preferences()
      const p = res?.data ?? res
      setPrefTimezone(p?.timezone || 'Asia/Bangkok')
      setPrefEmail(p?.notify_email !== false)
      setPrefPush(p?.notify_push !== false)
    } catch (e) {
      console.warn('[Profile] 读取偏好失败', e)
    }
  }

  const savePrefs = async () => {
    setPrefSaving(true)
    try {
      await authApi.updatePreferences({
        timezone: prefTimezone.trim() || undefined,
        notify_email: prefEmail,
        notify_push: prefPush
      })
      setPrefVisible(false)
      showToast(t('settings.saved'))
    } catch (e: any) {
      showToast(errorText(e, t('settings.saveFailed')))
    } finally {
      setPrefSaving(false)
    }
  }

  /** 检查更新：走微信小程序原生更新机制（非微信端无该能力，给明确提示而非假成功） */
  const handleCheckUpdate = () => {
    const um: any = typeof Taro.getUpdateManager === 'function' ? Taro.getUpdateManager() : null
    if (!um) {
      Taro.showToast({ title: t('profile.updateUnsupported'), icon: 'none' })
      return
    }
    um.onCheckForUpdate((res: any) => {
      if (!res?.hasUpdate) Taro.showToast({ title: t('profile.updateLatest'), icon: 'success' })
    })
    um.onUpdateReady(() => {
      Taro.showModal({
        title: t('profile.updateFound'),
        content: t('profile.updateReadyBody'),
        confirmText: t('profile.restartNow'),
        cancelText: t('common.cancel'),
        success: (r) => {
          if (r.confirm) um.applyUpdate()
        }
      })
    })
  }

  /** 联系客服：先弹「营业时间 + 呼叫/取消」确认层，确认后真实拨号（电话取自 /company/info） */
  const handleContactSupport = () => {
    const phone = (company.phone || '').trim()
    if (phone.replace(/\D/g, '').length === 0) {
      Taro.showToast({ title: t('profile.phoneUnset'), icon: 'none' })
      return
    }
    Taro.showModal({
      title: t('profile.supportHours'),
      content: phone,
      confirmText: t('profile.call'),
      cancelText: t('common.cancel'),
      success: (r) => {
        if (r.confirm) {
          Taro.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') }).catch(() => undefined)
        }
      }
    })
  }

  /** 去评分：微信小程序无评分能力，给明确提示而非假成功 */
  const handleRate = () => {
    Taro.showModal({
      title: t('profile.rate'),
      content: t('profile.rateUnavailable'),
      showCancel: false,
      confirmText: t('profile.gotIt')
    })
  }

  /** 用户隐私规则：小程序无法打开外链，复制官网隐私地址供用户在浏览器查看（不伪造条款正文） */
  const handlePrivacyRules = () => {
    const base = (company.website || '').trim().replace(/\/+$/, '')
    if (!base) {
      Taro.showToast({ title: t('profile.privacyUrlUnset'), icon: 'none' })
      return
    }
    const url = /^https?:\/\//i.test(base) ? `${base}/privacy` : `https://${base}/privacy`
    Taro.setClipboardData({ data: url })
      .then(() => Taro.showToast({ title: t('profile.privacyCopied'), icon: 'none' }))
      .catch(() => undefined)
  }

  /** 设置/账户行统一点击：已接入的账户·设置项走后端接口，未接入的仍提示未开放 */
  const handleRowPress = (entry: RowEntry) => {
    if (entry.url) {
      handleNavigate(entry.url)
      return
    }
    switch (entry.key) {
      case 'help':
        Taro.navigateTo({ url: '/pages/help/index' })
        return
      case 'password':
        openPwd()
        return
      case 'phone':
      case 'email':
      case 'account':
        openEdit()
        return
      case 'identity':
        // 实名认证：证件上传 + 人工审核（状态回显 / 驳回原因 / 重新提交）
        Taro.navigateTo({ url: '/pages/tenant/identity/index' })
        return
      case 'timezone':
      case 'notification':
      case 'notify':
        openPrefs()
        return
      case 'language':
        // 语言选择：即时生效（与 App SettingsLanguageScreen 一致，仅本地切换）
        Taro.navigateTo({ url: '/pages/language/index' })
        return
      case 'permissions':
        // 逐项权限页：实时读 getSetting 真实授权状态，点击行再打开小程序设置
        Taro.navigateTo({ url: '/pages/permissions/index' })
        return
      case 'clearCache':
        // 只清页面数据缓存，不触碰登录态与用户偏好
        clearCacheSync()
        Taro.showToast({ title: t('profile.cacheCleared'), icon: 'success' })
        return
      case 'checkUpdate':
        handleCheckUpdate()
        return
      case 'onlineSupport':
        // 在线客服：进入与平台客服的 IM 会话
        void openSupport()
        return
      case 'contactSupport':
        handleContactSupport()
        return
      case 'rate':
        handleRate()
        return
      case 'privacyRules':
        handlePrivacyRules()
        return
      case 'report':
        // 复用在线客服会话：违规房源与不良信息在此提交
        openSupport()
        return
      case 'rent-reminder':
      case 'lease-reminder':
        editBusinessDays(
          entry.key === 'rent-reminder' ? 'rent_reminder_days' : 'lease_reminder_days'
        )
        return
      case 'auto-dunning':
        editAutoDunning()
        return
      default:
        handleTodo(t(entry.label))
    }
  }

  // 管理端「业务设置」：直接编辑并落库到 /company/settings（此前三项点击只提示「暂未开放」）
  const saveBusiness = async (patch: Record<string, any>) => {
    try {
      await companyApi.updateSettings({
        business: {
          rent_reminder_days: business.rent_reminder_days ?? 7,
          lease_reminder_days: business.lease_reminder_days ?? 30,
          auto_dunning: business.auto_dunning ?? true,
          ...patch
        }
      })
      setBusiness((b) => ({ ...b, ...patch }))
      Taro.showToast({ title: t('settings.saved'), icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title: errorText(error, t('settings.saveFailed')), icon: 'none' })
    }
  }

  // 提醒天数用预设档位选择：Taro.showModal 不支持 editable / placeholderText / res.content
  // （那是微信原生扩展字段，Taro 3.6 类型里没有，跨端也没有输入框，
  // 会退化成「点了没反应/永远提示格式错误」），改用与「自动催缴」一致的 ActionSheet。
  const editBusinessDays = (key: 'rent_reminder_days' | 'lease_reminder_days') => {
    const options =
      key === 'rent_reminder_days' ? [3, 7, 14, 30, 60, 90] : [30, 60, 90, 180, 365]
    Taro.showActionSheet({ itemList: options.map((d) => t('profile.daysAgo', { n: d })) })
      .then((res) => saveBusiness({ [key]: options[res.tapIndex] }))
      .catch(() => {
        /* 用户取消 */
      })
  }

  const editAutoDunning = () => {
    Taro.showActionSheet({ itemList: [t('common.on'), t('common.off')] })
      .then((res) => saveBusiness({ auto_dunning: res.tapIndex === 0 }))
      .catch(() => {
        /* 用户取消 */
      })
  }

  // 业务设置行右侧的真实值（读 /company/settings.business）
  const businessValue = (key: string): string | undefined => {
    if (key === 'rent-reminder') return t('profile.daysAgo', { n: business.rent_reminder_days ?? 7 })
    if (key === 'lease-reminder') return t('profile.daysAgo', { n: business.lease_reminder_days ?? 30 })
    if (key === 'auto-dunning') return business.auto_dunning === false ? t('profile.statusOff') : t('profile.statusOn')
    return undefined
  }

  // 设置行（与 App 客户账号「我的」一致：图标盒 + 文案 + 真实值 + 箭头，箭头始终展示）
  const renderSettingRow = (entry: RowEntry & { badge?: boolean }) => (
    <View
      key={entry.key}
      className='list-row'
      onClick={() => handleRowPress(entry)}
    >
      <View className='list-row__icon'>
        <View className='icon-svg' style={iconStyle(entry.icon, 32)} />
      </View>
      <View className='list-row__body'>
        <Text className='list-row__label'>{t(entry.label)}</Text>
      </View>
      {entry.badge ? (
        <View className='badge badge--success'>
          <View className='bg-dot' />
          <Text>{t('profile.statusOn')}</Text>
        </View>
      ) : (
        !!entry.value && <Text className='list-row__value'>{entry.value}</Text>
      )}
      <View className='chevron' />
    </View>
  )

  const role = user?.role
  const isTenant = role === 'tenant'
  const isAdmin = role === 'admin'
  const isOwner = role === 'owner'
  const isStaff = role === 'agent' || role === 'employee'
  /** C 端（业主/租客，含未登录兜底）：与员工/管理端分开，统一「我的」页面结构 */
  const isC = !isAdmin && !isStaff
  /**
   * 常用功能宫格：登录用户完整展示（不按角色/资产状态裁剪）；
   * 游客只保留关注 / 历史 / 降价提醒（点击任一入口先引导登录）。
   */
  const cGrid = C_GRID.filter((e) =>
    user ? true : ['favorites', 'history', 'priceAlerts'].includes(e.key)
  )
  /** 租客 / 管理端 / 业主端 / 员工端 / 访客皆有「我的」页，底部导航对齐原型 */
  const hasBottomNav = !user || isTenant || isAdmin || isOwner || isStaff

  const phoneValue = user?.phone ? maskPhone(user.phone) : t('profile.unbound')
  const emailValue = user?.email ? maskEmail(user.email) : t('profile.unbound')

  /** 通用列表行（图标 + 文案 + 值/说明 + 箭头） */
  const renderRow = (entry: RowEntry) => (
    <View
      key={entry.key}
      className='list-row'
      onClick={() => handleRowPress(entry)}
    >
      <View className='list-row__icon'>
        <View className='icon-svg' style={iconStyle(entry.icon, 32)} />
      </View>
      <View className='list-row__body'>
        <Text className='list-row__label'>{t(entry.label)}</Text>
        {entry.desc && <Text className='list-row__desc'>{t(entry.desc)}</Text>}
      </View>
      {!!entry.value && <Text className='list-row__value'>{entry.value}</Text>}
      <View className='chevron' />
    </View>
  )

  /** 管理端 / 业主端：账户设置 + 系统设置 */
  const renderAccountSections = () => (
    <>
      <View className='panel panel--list'>
        <Text className='panel__caption'>{t('profile.sectionAccount')}</Text>
        {ACCOUNT_ROWS.map((entry) => {
          const value =
            entry.key === 'phone' ? phoneValue : entry.key === 'email' ? emailValue : ''
          return renderRow({ ...entry, value })
        })}
      </View>

      <View className='panel panel--list'>
        <Text className='panel__caption'>{t('profile.sectionSystem')}</Text>
        {SYSTEM_ROWS.map((entry) =>
          renderRow({
            ...entry,
            value:
              entry.key === 'language'
                ? LANG_LABELS[lang] || ''
                : entry.key === 'timezone'
                  ? prefTimezone || entry.value
                  : entry.value
          })
        )}
      </View>
    </>
  )

  /** 管理端 / 员工端：隐私与安全 + 帮助与客服（与 C 端同一组入口） */
  const renderSecuritySections = () => (
    <>
      <View className='panel panel--list'>
        <Text className='panel__caption'>{t('profile.sectionSecurity')}</Text>
        {SECURITY_ROWS.map(renderSettingRow)}
      </View>

      <View className='panel panel--list'>
        <Text className='panel__caption'>{t('profile.sectionHelp')}</Text>
        {OWNER_SUPPORT_ROWS.map(renderRow)}
      </View>
    </>
  )

  /** 管理端 / 员工端：关于（与 C 端一致：关于我们 / 版权信息 / 用户隐私规则） */
  const renderAboutSection = () => (
    <View className='panel panel--list'>
      <Text className='panel__caption'>{t('profile.sectionAbout')}</Text>
      {OWNER_ABOUT_ROWS.map((entry) =>
        renderSettingRow({
          ...entry,
          value:
            entry.key === 'about'
              ? appVersion
                ? `HaoFang.World v${appVersion}`
                : ''
              : undefined
        })
      )}
    </View>
  )

  return (
    <View className={`profile-page${hasBottomNav ? ' profile-page--nav' : ''}`}>
      <StatusTop />
      {/* 顶部操作条：右上角客服入口（对齐贝壳导航栏右上角客服，未登录引导登录） */}
      <View className='profile-topbar'>
        <View className='profile-topbar__support' onClick={openSupport}>
          <View className='icon-svg' style={iconStyle('headsetDark', 44)} />
        </View>
      </View>

      {/* ===== C 端（业主/租客）统一「我的」：实底用户卡 + 资产 + 统一宫格 + 统一设置 ===== */}
      {isC && (
        <>
          {/* 统一用户卡：与 App 客户账号「我的」同一套样式（白卡 + 品牌色头像 + 角色胶囊 + 掩码手机号） */}
          {!user ? (
            /* 未登录：平铺在页面背景上，左侧「登录/注册」大字 + 右侧灰色默认头像，整行点击进登录页 */
            <View className='guest-card' onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
              <Text className='guest-card__title'>{t('pub.loginRegister')}</Text>
              <View className='avatar avatar--guest'>
                <View className='icon-svg' style={iconStyle('user', 56)} />
              </View>
            </View>
          ) : (
            <View className='profile-card'>
              <View className='avatar avatar--lg' onClick={pickAndUploadAvatar}>
                {user?.avatar_url ? (
                  <Image className='avatar-img' src={resolveMediaUrl(user.avatar_url) || ''} mode='aspectFill' />
                ) : (
                  <Text className='avatar-text'>{user?.full_name?.charAt(0) || 'U'}</Text>
                )}
                <View className='avatar__badge'>
                  <View className='icon-svg' style={iconStyle('edit', 20)} />
                </View>
              </View>
              <View className='profile-card__body'>
                <Text className='profile-card__name'>{user?.full_name || t('profile.userFallback')}</Text>
                <View className='profile-card__meta-row'>
                  <View className='role-tag'>
                    <Text>{ROLE_TEXT[role || ''] ? t(ROLE_TEXT[role || '']) : t('profile.userFallback')}</Text>
                  </View>
                  <Text className='profile-card__meta'>
                    {user?.phone ? maskPhone(user.phone) : user?.email || '-'}
                  </Text>
                </View>
              </View>
            </View>
          )}
          {/* 常用功能：统一宫格保留胶囊卡片外壳（业主入口 + 租客入口按能力过滤，可并存） */}
          {cGrid.length > 0 && (
            <>
              <View className='section-title'>
                <Text>{t('profile.commonFuncs')}</Text>
              </View>
              <View className='panel panel--grid'>
                <View className='service-grid'>
                  {cGrid.map((entry) => (
                    <View
                      key={entry.key}
                      className='service-grid__item'
                      onClick={() => {
                        // 访客：宫格任一入口都导向登录（对齐 App：未登录点击先登录，而非 toast）
                        if (!user) {
                          Taro.navigateTo({ url: '/pages/login/index' })
                          return
                        }
                        // 业主/租客功能一致：登录后无条件进入对应页面，不再做能力门槛
                        if (entry.url) handleNavigate(entry.url)
                      }}
                    >
                      <View className='service-grid__icon'>
                        <View className='icon-svg' style={iconStyle(entry.icon, 40)} />
                      </View>
                      <Text className='service-grid__label'>{t(entry.label)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* 设置（业主/租客统一：卡片内标题 + 标准设置行，与 App 一致）；访客态不显示设置/语言/退出登录 */}
          {user && (
            <>
              <View className='panel panel--list'>
                <Text className='panel__caption'>{t('profile.settings')}</Text>
                {OWNER_SETTING_ROWS.map((entry) => {
                  const value =
                    entry.key === 'account'
                      ? user?.phone
                        ? maskPhone(user.phone)
                        : ''
                      : entry.key === 'language'
                        ? LANG_LABELS[lang] || ''
                        : entry.value
                  return renderSettingRow({ ...entry, value })
                })}
              </View>

              <View className='panel panel--list'>
                <Text className='panel__caption'>{t('profile.sectionHelp')}</Text>
                {OWNER_SUPPORT_ROWS.map(renderRow)}
              </View>

              <View className='panel panel--list'>
                <Text className='panel__caption'>{t('profile.sectionAbout')}</Text>
                {OWNER_ABOUT_ROWS.map((entry) =>
                  renderSettingRow({
                    ...entry,
                    value:
                      entry.key === 'about'
                        ? appVersion
                          ? `HaoFang.World v${appVersion}`
                          : ''
                        : undefined
                  })
                )}
              </View>
            </>
          )}
        </>
      )}

      {isAdmin && (
        <>
          {/* 用户卡：与 C 端「我的」同一套样式（白卡 + 品牌色头像 + 角色胶囊 + 掩码手机号） */}
          <View className='profile-card'>
            <View className='avatar avatar--lg' onClick={pickAndUploadAvatar}>
              {user?.avatar_url ? (
                <Image className='avatar-img' src={resolveMediaUrl(user.avatar_url) || ''} mode='aspectFill' />
              ) : (
                <Text className='avatar-text'>{user?.full_name?.charAt(0) || 'U'}</Text>
              )}
              <View className='avatar__badge'>
                <View className='icon-svg' style={iconStyle('edit', 20)} />
              </View>
            </View>
            <View className='profile-card__body'>
              <Text className='profile-card__name'>{user?.full_name || t('perm.role.admin')}</Text>
              <View className='profile-card__meta-row'>
                <View className='role-tag'>
                  <Text>{ROLE_TEXT[role || ''] ? t(ROLE_TEXT[role || '']) : t('perm.role.admin')}</Text>
                </View>
                <Text className='profile-card__meta'>
                  {user?.phone ? maskPhone(user.phone) : user?.email || '-'}
                </Text>
              </View>
            </View>
            <View className='profile-card__edit' onClick={openEdit}>
              <View className='icon-svg' style={iconStyle('edit', 28)} />
              <Text>{t('profile.edit')}</Text>
            </View>
          </View>

          {renderAccountSections()}

          <View className='panel panel--list'>
            <Text className='panel__caption'>{t('profile.quickEntries')}</Text>
            {renderRow({
              key: 'manageProperties',
              label: 'nav.properties',
              desc: 'profile.adminPropertiesDesc',
              icon: 'home',
              url: '/pages/admin/properties/index'
            })}
            {renderRow({
              key: 'contracts',
              label: 'lease.contract',
              desc: 'contract.entryManageDesc',
              icon: 'doc',
              url: '/pages/admin/contracts/index'
            })}
          </View>

          <View className='panel panel--list'>
            <Text className='panel__caption'>{t('profile.businessSettings')}</Text>
            {BUSINESS_ROWS.map((entry) => renderRow({ ...entry, value: businessValue(entry.key) }))}
          </View>

          <View className='panel panel--list'>
            <Text className='panel__caption'>{t('acc.sectionSystem')}</Text>
            {[
              {
                key: 'accounts',
                label: t('acc.title'),
                desc: t('acc.manageDesc'),
                url: '/pages/admin/accounts/index',
                icon: 'user' as IconKey
              },
              {
                key: 'permissions',
                label: t('perm.entry'),
                desc: t('perm.entryDesc'),
                url: '/pages/admin/permissions/index',
                icon: 'gear' as IconKey
              },
              {
                key: 'departments',
                label: t('dept.title'),
                desc: t('dept.subtitle'),
                url: '/pages/admin/departments/index',
                icon: 'briefcase' as IconKey
              },
              {
                key: 'dataScopes',
                label: t('scope.title'),
                desc: t('scope.subtitle'),
                url: '/pages/admin/data-scopes/index',
                icon: 'grid' as IconKey
              },
              {
                key: 'options',
                label: t('dict.title'),
                desc: t('dict.subtitle'),
                url: '/pages/admin/options/index',
                icon: 'cube' as IconKey
              }
            ].map(renderRow)}
          </View>

          {renderSecuritySections()}
          {renderAboutSection()}
        </>
      )}

      {isStaff && (
        <>
          {/* 用户卡：与 C 端「我的」同一套样式（白卡 + 品牌色头像 + 角色胶囊 + 掩码手机号） */}
          <View className='profile-card'>
            <View className='avatar avatar--lg' onClick={pickAndUploadAvatar}>
              {user?.avatar_url ? (
                <Image className='avatar-img' src={resolveMediaUrl(user.avatar_url) || ''} mode='aspectFill' />
              ) : (
                <Text className='avatar-text'>{user?.full_name?.charAt(0) || 'U'}</Text>
              )}
              <View className='avatar__badge'>
                <View className='icon-svg' style={iconStyle('edit', 20)} />
              </View>
            </View>
            <View className='profile-card__body'>
              <Text className='profile-card__name'>{user?.full_name || t('profile.userFallback')}</Text>
              <View className='profile-card__meta-row'>
                <View className='role-tag'>
                  <Text>
                    {ROLE_TEXT[role || ''] ? t(ROLE_TEXT[role || '']) : t('perm.role.employee')}
                  </Text>
                </View>
                <Text className='profile-card__meta'>
                  {user?.phone ? maskPhone(user.phone) : user?.email || '-'}
                </Text>
              </View>
            </View>
            <View className='profile-card__edit' onClick={openEdit}>
              <View className='icon-svg' style={iconStyle('edit', 28)} />
              <Text>{t('profile.edit')}</Text>
            </View>
          </View>

          {/* 常用功能：与 C 端统一宫格（区块标题外置 + 白卡 4 列，圆形浅品牌底图标） */}
          <View className='section-title'>
            <Text>{t('profile.commonFuncs')}</Text>
          </View>
          <View className='panel panel--grid'>
            <View className='service-grid'>
              {STAFF_ROWS.map((entry) => (
                <View
                  key={entry.key}
                  className='service-grid__item'
                  onClick={() => entry.url && handleNavigate(entry.url)}
                >
                  <View className='service-grid__icon'>
                    <View className='icon-svg' style={iconStyle(entry.icon, 40)} />
                  </View>
                  <Text className='service-grid__label'>{t(entry.label)}</Text>
                </View>
              ))}
            </View>
          </View>

          {renderAccountSections()}
          {renderSecuritySections()}
          {renderAboutSection()}
        </>
      )}

      {user && (
        <View className='logout-wrapper'>
          <Button className='logout-btn' onClick={handleLogout}>
            {t('profile.logout')}
          </Button>
        </View>
      )}

      {isC && (user
        ? <BottomNav role={isOwner ? 'owner' : 'tenant'} active='profile' />
        : <BottomNav role='guest' active='profile' />
      )}
      {isAdmin && <BottomNav role='admin' active='settings' />}
      {isStaff && <BottomNav role='employee' active='settings' />}

      {/* 编辑资料弹层 */}
      {editVisible && (
        <View className='modal-mask' onClick={() => setEditVisible(false)}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>{t('profile.edit')}</Text>
            <View className='form-field'>
              <Text className='form-field__label'>{t('settings.profileName')}</Text>
              <Input
                className={`form-field__input${editErr ? ' form-field__input--error' : ''}`}
                value={editName}
                onInput={(e) => setEditName(e.detail.value)}
                placeholder={t('settings.profileNamePh')}
              />
              {editErr && <Text className='form-field__error'>{editErr}</Text>}
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('settings.profilePhone')}</Text>
              <View className='form-field__row'>
                <Input
                  className='form-field__input form-field__input--flex'
                  value={editPhone}
                  onInput={(e) => setEditPhone(e.detail.value)}
                  placeholder={t('settings.profilePhonePh')}
                />
                <Button
                  className='form-field__code-btn'
                  disabled={editSendingCode}
                  onClick={sendEditCode}
                >
                  {editSendingCode ? t('settings.codeSending') : t('settings.sendCode')}
                </Button>
              </View>
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('settings.profileCode')}</Text>
              <Input
                className='form-field__input'
                value={editCode}
                onInput={(e) => setEditCode(e.detail.value)}
                placeholder={t('settings.profileCodePh')}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('settings.profileEmail')}</Text>
              <Input
                className='form-field__input'
                value={editEmail}
                onInput={(e) => setEditEmail(e.detail.value)}
                placeholder={t('settings.profileEmailPh')}
              />
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn modal-btn--ghost' onClick={() => setEditVisible(false)}>
                {t('common.cancel')}
              </Button>
              <Button className='modal-btn modal-btn--primary' disabled={editSaving} onClick={saveEdit}>
                {editSaving ? t('common.saving') : t('common.save')}
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* 修改密码弹层 */}
      {pwdVisible && (
        <View className='modal-mask' onClick={() => setPwdVisible(false)}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>{t('nav.changePassword')}</Text>
            <View className='form-field'>
              <Text className='form-field__label'>{t('settings.currentPassword')}</Text>
              <Input
                className='form-field__input'
                password
                value={oldPwd}
                onInput={(e) => setOldPwd(e.detail.value)}
                placeholder={t('settings.currentPasswordPh')}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('settings.newPassword')}</Text>
              <Input
                className='form-field__input'
                password
                value={newPwd}
                onInput={(e) => setNewPwd(e.detail.value)}
                placeholder={t('settings.newPasswordPh')}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('settings.confirmPassword')}</Text>
              <Input
                className={`form-field__input${pwdErr ? ' form-field__input--error' : ''}`}
                password
                value={confirmPwd}
                onInput={(e) => setConfirmPwd(e.detail.value)}
                placeholder={t('settings.confirmPasswordPh')}
              />
              {pwdErr && <Text className='form-field__error'>{pwdErr}</Text>}
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn modal-btn--ghost' onClick={() => setPwdVisible(false)}>
                {t('common.cancel')}
              </Button>
              <Button className='modal-btn modal-btn--primary' disabled={pwdSaving} onClick={savePwd}>
                {pwdSaving ? t('settings.pwdSubmitting') : t('settings.pwdSubmit')}
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* 时区 / 通知设置弹层 */}
      {prefVisible && (
        <View className='modal-mask' onClick={() => setPrefVisible(false)}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>{t('profile.notifySettings')}</Text>
            <View className='form-field'>
              <Text className='form-field__label'>{t('settings.timezone')}</Text>
              <Input
                className='form-field__input'
                value={prefTimezone}
                onInput={(e) => setPrefTimezone(e.detail.value)}
                placeholder={t('settings.timezonePlaceholder')}
              />
            </View>
            <View className='toggle-row' onClick={() => setPrefEmail(!prefEmail)}>
              <Text className='toggle-row__label'>{t('settings.emailNotify')}</Text>
              <Text className={prefEmail ? 'toggle-row__val--on' : 'toggle-row__val--off'}>
                {prefEmail ? `✓ ${t('common.on')}` : t('common.off')}
              </Text>
            </View>
            <View className='toggle-row' onClick={() => setPrefPush(!prefPush)}>
              <Text className='toggle-row__label'>{t('settings.pushNotify')}</Text>
              <Text className={prefPush ? 'toggle-row__val--on' : 'toggle-row__val--off'}>
                {prefPush ? `✓ ${t('common.on')}` : t('common.off')}
              </Text>
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn modal-btn--ghost' onClick={() => setPrefVisible(false)}>
                {t('common.cancel')}
              </Button>
              <Button className='modal-btn modal-btn--primary' disabled={prefSaving} onClick={savePrefs}>
                {prefSaving ? t('common.saving') : t('common.save')}
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}