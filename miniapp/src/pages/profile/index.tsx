import { useState } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import BottomNav from '@/components/BottomNav'
import useAuthStore from '@/stores/auth'
import { authApi, companyApi, leasesApi, ownerApi, propertyDealApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import type { IconKey } from '@/utils/icons'
import type { User } from '@/types'
import './index.scss'

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

// 租客端「我的服务」宫格：顺序对齐原型 tenant-mini-profile.html
// url 缺省表示后端无接口或页面不在小程序原型范围内（如「我的收藏」「预约记录」「浏览足迹」），点击提示未开放
const TENANT_SERVICE_GRID: Array<{ key: string; label: string; url?: string; icon: IconKey }> = [
  { key: 'favorites', label: '我的收藏', icon: 'heart' },
  { key: 'history', label: '浏览足迹', icon: 'trend' },
  { key: 'viewings', label: '预约记录', icon: 'calendar' },
  { key: 'payments', label: '交租', url: '/pages/tenant/payments/index', icon: 'card' },
  { key: 'maintenance', label: '报修', url: '/pages/tenant/maintenance/index', icon: 'edit' },
  { key: 'chat', label: '联系客服', url: '/pages/chat/list/index', icon: 'megaphone' }
]

// 租客端「常用功能」
const TENANT_MENU: RowEntry[] = [
  {
    key: 'payments',
    label: '付款记录',
    desc: '查看租金账单与缴费历史',
    url: '/pages/tenant/payments/index',
    icon: 'card'
  },
  {
    key: 'documents',
    label: '我的文档',
    desc: '租约合同 · 缴费凭证',
    url: '/pages/tenant/documents/index',
    icon: 'doc'
  },
  {
    key: 'services',
    label: '预约服务',
    desc: '清洁 · 维修 · 代缴服务',
    url: '/pages/tenant/services/index',
    icon: 'clipboard'
  }
]

// 管理端 / 业主端「账户设置」：后端无修改密码、绑定手机、绑定邮箱接口
const ACCOUNT_ROWS: RowEntry[] = [
  { key: 'password', label: '修改密码', icon: 'gear' },
  { key: 'phone', label: '绑定手机', icon: 'user' },
  { key: 'email', label: '绑定邮箱', icon: 'doc' }
]

// 管理端 / 业主端「系统设置」：后端无语言、时区、主题、通知配置接口
const SYSTEM_ROWS: RowEntry[] = [
  { key: 'language', label: '语言', icon: 'clipboard' },
  { key: 'timezone', label: '时区', icon: 'calendar' },
  { key: 'theme', label: '主题', icon: 'star' },
  { key: 'notification', label: '通知设置', icon: 'megaphone' }
]

// 管理端「业务设置」：后端无提醒天数、自动催缴配置接口
const BUSINESS_ROWS: RowEntry[] = [
  { key: 'rent-reminder', label: '租金提醒天数', icon: 'calendar' },
  { key: 'lease-reminder', label: '合同到期提醒', icon: 'doc' },
  { key: 'auto-dunning', label: '自动催缴', icon: 'money' },
  { key: 'commission', label: '佣金设置', icon: 'chart', url: '/pages/admin/commission-rules/index' }
]

// 业主端「常用功能」：对齐 owner-mini-settings.html（前 4 项；「我的房源」动态跳转单独处理）
const OWNER_MENU_ROWS: RowEntry[] = [
  { key: 'income', label: '收益报表', desc: '租金到账 · 年度收益汇总', url: '/pages/owner/income/index', icon: 'money' },
  { key: 'services', label: '物业服务', desc: '保洁 · 维修 · 代管工单', url: '/pages/owner/services/index', icon: 'clipboard' },
  { key: 'documents', label: '租房文档', desc: '托管合同 · 产权证明', url: '/pages/owner/documents/index', icon: 'doc' },
  { key: 'marketing', label: '委托中心', desc: '委托出租 · 委托出售进度', url: '/pages/owner/marketing/index', icon: 'trend' }
]

// 业主端「设置」：对齐 owner-mini-settings.html；右侧值均来自真实数据/用户信息
const OWNER_SETTING_ROWS: Array<RowEntry & { badge?: boolean }> = [
  { key: 'account', label: '账号与安全', icon: 'user' },
  { key: 'language', label: '语言设置', value: '简体中文', icon: 'clipboard' },
  { key: 'notification', label: '通知提醒', badge: true, icon: 'megaphone' },
  { key: 'help', label: '帮助中心', icon: 'calendar' },
  { key: 'about', label: '关于我们', icon: 'star' }
]

// 员工 / 代理端：常用入口（客户 / 业绩已在底部导航，不再重复；通讯录移至「我的」）
const STAFF_ROWS: RowEntry[] = [
  { key: 'contacts', label: '通讯录', desc: '同事与部门通讯录', url: '/pages/employee/contacts/index', icon: 'user' },
  { key: 'attendance', label: '考勤打卡', desc: '上下班 GPS 定位打卡', url: '/pages/attendance/index', icon: 'calendar' },
  { key: 'manageProperties', label: '房源管理', desc: '我的房源与上下架管理', url: '/pages/employee/properties/index', icon: 'home' }
]

// 角色文案（与原型顶部身份标签一致）
const ROLE_TEXT: Record<string, string> = {
  admin: '系统管理员',
  owner: '业主',
  tenant: '租客',
  agent: '经纪人',
  employee: '员工'
}

// 租约状态文案与徽章样式
const LEASE_STATUS: Record<string, { text: string; badge: string }> = {
  active: { text: '生效中', badge: 'badge--success' },
  pending: { text: '待生效', badge: 'badge--warning' },
  expired: { text: '已到期', badge: 'badge--neutral' },
  terminated: { text: '已终止', badge: 'badge--error' }
}

// 购房订单状态文案与徽章样式
const DEAL_STATUS: Record<string, { text: string; badge: string }> = {
  drafted: { text: '草拟中', badge: 'badge--neutral' },
  escrow_pending: { text: '定金托管中', badge: 'badge--warning' },
  signed: { text: '已签约', badge: 'badge--info' },
  transferring: { text: '过户中', badge: 'badge--warning' },
  completed: { text: '已完成', badge: 'badge--success' },
  failed: { text: '已失败', badge: 'badge--error' },
  cancelled: { text: '已取消', badge: 'badge--neutral' }
}

function pickList<T>(res: any): T[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const formatMoney = (v: any, currency?: string) => {
  const cur =
    currency === 'USD'
      ? '$'
      : currency === 'CNY'
        ? '¥'
        : currency === 'MYR' || currency === 'RM'
          ? 'RM '
          : '฿'
  return `${cur}${Number(v || 0).toLocaleString()}`
}

const formatDay = (x?: string) => (x ? String(x).slice(0, 10) : '—')

const formatMonthDay = (x?: string) => (x ? String(x).slice(5, 10) : '—')

const leaseProgress = (lease: any) => {
  const start = new Date(lease?.start_date || lease?.startDate || '').getTime()
  const end = new Date(lease?.end_date || lease?.endDate || '').getTime()
  if (!start || !end || end <= start) return 0
  const ratio = (Date.now() - start) / (end - start)
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
}

const leaseDaysLeft = (lease: any) => {
  const end = new Date(lease?.end_date || lease?.endDate || '').getTime()
  if (!end) return null
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000))
}

const leaseDaysPassed = (lease: any) => {
  const start = new Date(lease?.start_date || lease?.startDate || '').getTime()
  if (!start) return null
  return Math.max(0, Math.floor((Date.now() - start) / 86400000))
}

const leaseTotalDays = (lease: any) => {
  const start = new Date(lease?.start_date || lease?.startDate || '').getTime()
  const end = new Date(lease?.end_date || lease?.endDate || '').getTime()
  if (!start || !end || end <= start) return null
  return Math.round((end - start) / 86400000)
}

const leaseTitle = (lease: any) =>
  lease?.property?.room_number ||
  lease?.property_name ||
  lease?.propertyName ||
  lease?.room_number ||
  lease?.address ||
  `租约 #${String(lease?.id ?? '').slice(0, 8)}`

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
  const user = useAuthStore((state) => state.user)
  const login = useAuthStore((state) => state.login)
  const logout = useAuthStore((state) => state.logout)
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  const [lease, setLease] = useState<any>(null)
  const [deals, setDeals] = useState<any[]>([])
  const [appVersion, setAppVersion] = useState('')
  // 业主「我的」：指标条（真实接口，失败静默降级）
  const [ownerProps, setOwnerProps] = useState<any[]>([])
  const [ownerPropsOk, setOwnerPropsOk] = useState(false)
  const [ownerAnnual, setOwnerAnnual] = useState<any>(null)

  useDidShow(() => {
    loadFromStorage()
    // 已登录时拉取最新用户信息
    if (useAuthStore.getState().token) {
      refreshUser()
      const currentRole = useAuthStore.getState().user?.role
      if (currentRole === 'tenant') {
        loadTenantData()
      }
      if (currentRole === 'admin') {
        loadAppInfo()
      }
      if (currentRole === 'owner') {
        loadAppInfo()
        loadOwnerData()
      }
    }
  })

  const loadTenantData = async () => {
    try {
      const [leaseRes, dealRes] = await Promise.all([
        leasesApi.mine().catch(() => null),
        propertyDealApi.list().catch(() => null)
      ])
      const leases = pickList<any>(leaseRes)
      setLease(leases.find((l) => l?.status === 'active') || leases[0] || null)
      setDeals(pickList<any>(dealRes))
    } catch (error) {
      console.warn('[Profile] 获取租约/购房订单失败', error)
    }
  }

  // 版本号取自后端公开接口，避免写死演示版本
  const loadAppInfo = async () => {
    try {
      const res: any = await companyApi.info()
      const info = res?.data ?? res
      setAppVersion(info?.version || '')
    } catch (error) {
      console.warn('[Profile] 获取版本信息失败', error)
    }
  }

  // 业主「我的」：名下房源 / 本月实收，各自独立容错，失败静默降级
  const loadOwnerData = async () => {
    try {
      const propRes: any = await ownerApi.properties()
      setOwnerProps(pickList(propRes))
      setOwnerPropsOk(true)
    } catch (error) {
      console.warn('[Profile] 获取名下房源失败', error)
    }
    try {
      const annRes: any = await ownerApi.annualFinancialSummary(new Date().getFullYear())
      setOwnerAnnual(annRes?.data ?? annRes ?? null)
    } catch (error) {
      console.warn('[Profile] 获取年度财务汇总失败', error)
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
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地 token 与用户信息
          logout()
          Taro.removeStorageSync('token')
          Taro.removeStorageSync('user')
          Taro.showToast({ title: '已退出登录', icon: 'success' })
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

  /** 无后端接口的入口：只做结构对齐，点击明确提示未开放，不伪造成功 */
  const handleTodo = (label: string) => {
    Taro.showToast({ title: `「${label}」暂未开放`, icon: 'none' })
  }

  const showToast = (msg: string) => {
    Taro.showToast({ title: msg, icon: 'none' })
  }

  // ===== 编辑资料 =====
  const [editVisible, setEditVisible] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const openEdit = () => {
    setEditName((user as any)?.full_name || (user as any)?.name || '')
    setEditPhone(user?.phone || '')
    setEditEmail(user?.email || '')
    setEditVisible(true)
  }

  const saveEdit = async () => {
    if (!editName.trim()) {
      showToast('请填写姓名')
      return
    }
    setEditSaving(true)
    try {
      const payload: Record<string, string> = { full_name: editName.trim() }
      if (editPhone !== (user?.phone || '')) payload.phone = editPhone.trim()
      if (editEmail !== (user?.email || '')) payload.email = editEmail.trim()
      const res: any = await authApi.updateMe(payload)
      // 用返回的最新用户刷新本地状态（含认证 store 与缓存）
      const latest = res?.data ?? res
      const token = useAuthStore.getState().token
      if (latest && token) useAuthStore.getState().login(token, latest)
      Taro.setStorageSync('user', latest)
      loadFromStorage()
      setEditVisible(false)
      showToast('已保存')
    } catch (e: any) {
      showToast(e?.message || '保存失败')
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

  const openPwd = () => {
    setOldPwd('')
    setNewPwd('')
    setConfirmPwd('')
    setPwdVisible(true)
  }

  const savePwd = async () => {
    if (!oldPwd || !newPwd) {
      showToast('请填写完整')
      return
    }
    if (newPwd.length < 6) {
      showToast('新密码至少 6 位')
      return
    }
    if (newPwd !== confirmPwd) {
      showToast('两次输入的新密码不一致')
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
      showToast('已修改，请重新登录')
      setTimeout(() => Taro.redirectTo({ url: '/pages/login/index' }), 800)
    } catch (e: any) {
      showToast(e?.message || '修改失败')
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
      showToast('已保存')
    } catch (e: any) {
      showToast(e?.message || '保存失败')
    } finally {
      setPrefSaving(false)
    }
  }

  /** 设置/账户行统一点击：已接入的账户·设置项走后端接口，未接入的仍提示未开放 */
  const handleRowPress = (entry: RowEntry) => {
    if (entry.url) {
      handleNavigate(entry.url)
      return
    }
    switch (entry.key) {
      case 'password':
        openPwd()
        return
      case 'phone':
      case 'email':
      case 'account':
        openEdit()
        return
      case 'timezone':
      case 'notification':
      case 'language':
      case 'notify':
        openPrefs()
        return
      default:
        handleTodo(entry.label)
    }
  }

  // 业主「我的房源」：进入需带房源 id；名下无房源时降级到业主首页（该页有房源卡片列表）
  const handleOwnerPropsPress = () => {
    const firstId = ownerProps[0]?.id
    if (!firstId) {
      handleNavigate('/pages/owner/home/index')
      return
    }
    handleNavigate(`/pages/owner/property-detail/index?id=${firstId}`)
  }

  // 业主「设置」行：有值时不显示箭头；通知提醒用成功徽章（对齐 owner-mini-settings.html）
  const renderSettingRow = (entry: RowEntry & { badge?: boolean }) => (
    <View
      key={entry.key}
      className='list-row'
      onClick={() => handleRowPress(entry)}
    >
      <View className='list-row__icon icon-svg' style={iconStyle(entry.icon, 34)} />
      <View className='list-row__body'>
        <Text className='list-row__label'>{entry.label}</Text>
      </View>
      {entry.badge ? (
        <View className='badge badge--success'>
          <View className='bg-dot' />
          <Text>已开启</Text>
        </View>
      ) : (
        !!entry.value && <Text className='list-row__value'>{entry.value}</Text>
      )}
      {!entry.value && !entry.badge && <View className='chevron' />}
    </View>
  )

  const role = user?.role
  const isTenant = role === 'tenant'
  const isAdmin = role === 'admin'
  const isOwner = role === 'owner'
  const isStaff = role === 'agent' || role === 'employee'
  /** 租客 / 管理端 / 业主端 / 员工端皆有「我的」页，底部导航对齐原型 */
  const hasBottomNav = isTenant || isAdmin || isOwner || isStaff

  const phoneValue = user?.phone ? maskPhone(user.phone) : '未绑定'
  const emailValue = user?.email ? maskEmail(user.email) : '未绑定'

  // 业主「我的」派生数据（在租口径与业主账单/收益页一致：status ∈ rented/active）
  const ownerPropCount = ownerPropsOk ? ownerProps.length : null
  const ownerRentedCount = ownerPropsOk
    ? ownerProps.filter((p: any) =>
        ['rented', 'active'].includes(String(p?.status || ''))
      ).length
    : null
  // 本月实收：年度汇总里匹配当月 bucket，无匹配时取最近一个月桶
  const ownerBuckets: any[] = Array.isArray(ownerAnnual?.by_month) ? ownerAnnual.by_month : []
  const ownerMonthReceived = (() => {
    if (!ownerBuckets.length) return null
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const bucket =
      ownerBuckets.find((b: any) => {
        const m = String(b?.month ?? '')
        return (
          m === `${now.getFullYear()}-${mm}` ||
          m === mm ||
          Number(b?.month) === now.getMonth() + 1
        )
      }) ?? ownerBuckets[ownerBuckets.length - 1]
    return Number(bucket?.received ?? 0)
  })()
  const ownerCurrency = ownerAnnual?.currency || ownerProps[0]?.currency || 'THB'

  /** 通用列表行（图标 + 文案 + 值/说明 + 箭头） */
  const renderRow = (entry: RowEntry) => (
    <View
      key={entry.key}
      className='list-row'
      onClick={() => handleRowPress(entry)}
    >
      <View className='list-row__icon icon-svg' style={iconStyle(entry.icon, 34)} />
      <View className='list-row__body'>
        <Text className='list-row__label'>{entry.label}</Text>
        {entry.desc && <Text className='list-row__desc'>{entry.desc}</Text>}
      </View>
      {!!entry.value && <Text className='list-row__value'>{entry.value}</Text>}
      <View className='chevron' />
    </View>
  )

  /** 管理端 / 业主端：账户设置 + 系统设置 */
  const renderAccountSections = () => (
    <>
      <View className='section-title'>
        <Text>账户设置</Text>
      </View>
      <View className='panel panel--list'>
        {ACCOUNT_ROWS.map((entry) => {
          const value =
            entry.key === 'phone' ? phoneValue : entry.key === 'email' ? emailValue : ''
          return renderRow({ ...entry, value })
        })}
      </View>

      <View className='section-title'>
        <Text>系统设置</Text>
      </View>
      <View className='panel panel--list'>{SYSTEM_ROWS.map(renderRow)}</View>
    </>
  )

  /** 管理端 / 业主端：关于 + 「关于小程序」卡片 */
  const renderAboutSection = () => (
    <>
      <View className='section-title'>
        <Text>关于</Text>
      </View>
      <View className='panel panel--list'>
        {renderRow({
          key: 'version',
          label: '版本信息',
          icon: 'gear',
          value: appVersion ? `v${appVersion}` : ''
        })}
        {renderRow({ key: 'terms', label: '用户协议', icon: 'doc' })}
        {renderRow({ key: 'privacy', label: '隐私政策', icon: 'check' })}
      </View>

      {/* 原型底部另有一块「关于小程序」卡片，此处按原型保留 */}
      <View className='panel panel--list'>
        <Text className='panel__caption'>关于小程序</Text>
        {appVersion && (
          <View className='about-row'>
            <Text className='about-row__label'>版本</Text>
            <Text className='about-row__value'>v{appVersion}</Text>
          </View>
        )}
        <View className='about-row' onClick={() => handleTodo('服务协议')}>
          <Text className='about-row__label'>服务协议</Text>
          <View className='chevron' />
        </View>
        <View className='about-row' onClick={() => handleTodo('隐私政策')}>
          <Text className='about-row__label'>隐私政策</Text>
          <View className='chevron' />
        </View>
      </View>
    </>
  )

  return (
    <View className={`profile-page${hasBottomNav ? ' profile-page--nav' : ''}`}>
      {isTenant && (
        <>
          {/* 用户卡：渐变主色，底部一条当前租约 */}
          <View className='role-card'>
            <View className='role-card__top'>
              <View className='avatar'>
                <Text className='avatar-text'>{user?.name?.charAt(0) || 'U'}</Text>
              </View>
              <View className='role-card__info'>
                <Text className='role-card__name'>{user?.name || '用户'}</Text>
                {user?.email && <Text className='role-card__sub'>{user.email}</Text>}
              </View>
            </View>
            {lease && (
              <View className='role-card__strip'>
                <Text className='role-card__strip-label'>当前租约</Text>
                <Text className='role-card__strip-name'>{leaseTitle(lease)}</Text>
                <View className={`badge role-card__badge ${LEASE_STATUS[lease?.status]?.badge || 'badge--neutral'}`}>
                  <View className='bg-dot' />
                  <Text>{LEASE_STATUS[lease?.status]?.text || lease?.status || '—'}</Text>
                </View>
              </View>
            )}
          </View>

          <View className='section-title'>
            <Text>我的租约</Text>
          </View>
          <View className='panel'>
            {!lease ? (
              <View className='empty-state'>
                <Text>暂无生效租约</Text>
              </View>
            ) : (
              <View className='lease-card'>
                <View className='lease-card__head'>
                  <Text className='lease-card__title'>{leaseTitle(lease)}</Text>
                  <View className={`badge ${LEASE_STATUS[lease?.status]?.badge || 'badge--neutral'}`}>
                    <View className='bg-dot' />
                    <Text>{LEASE_STATUS[lease?.status]?.text || lease?.status || '—'}</Text>
                  </View>
                </View>
                {/* 原型含「房东」，后端 /leases/me 未返回业主姓名，故不渲染该段 */}
                <Text className='lease-card__meta'>
                  月租金 {formatMoney(lease?.monthly_rent ?? lease?.monthlyRent, lease?.currency)}
                </Text>
                <View className='progress'>
                  <View className='progress__bar' style={{ width: `${leaseProgress(lease)}%` }} />
                </View>
                <View className='lease-card__foot'>
                  <Text className='lease-card__range'>
                    {formatDay(lease?.start_date || lease?.startDate)} 至{' '}
                    {formatDay(lease?.end_date || lease?.endDate)}
                  </Text>
                  {leaseDaysLeft(lease) !== null && (
                    <Text className='lease-card__left'>剩余 {leaseDaysLeft(lease)} 天</Text>
                  )}
                </View>
                <View className='lease-card__sub'>
                  <Text>到期 {formatDay(lease?.end_date || lease?.endDate)}</Text>
                  <Text>
                    已过 {leaseDaysPassed(lease) ?? '—'} 天 / 共 {leaseTotalDays(lease) ?? '—'} 天
                  </Text>
                </View>
              </View>
            )}
          </View>

          <View className='section-title'>
            <Text>我的购房订单</Text>
          </View>
          <View className='panel panel--list'>
            {deals.length === 0 ? (
              <View className='empty-state'>
                <Text>暂无购房订单</Text>
              </View>
            ) : (
              deals.map((deal) => {
                const status = DEAL_STATUS[deal?.status] || {
                  text: deal?.status || '—',
                  badge: 'badge--neutral'
                }
                return (
                  <View key={deal?.id} className='list-row'>
                    <View className='list-row__icon icon-svg' style={iconStyle('home', 34)} />
                    <View className='list-row__body'>
                      <Text className='list-row__label'>
                        {deal?.property_name ||
                          deal?.propertyName ||
                          deal?.sale_listing?.title ||
                          `成交单 #${String(deal?.id ?? '').slice(0, 8)}`}
                      </Text>
                      <Text className='list-row__desc'>
                        售价 {formatMoney(deal?.sale_price ?? deal?.salePrice, deal?.currency)} ·{' '}
                        {formatMonthDay(deal?.created_at || deal?.createdAt)}
                      </Text>
                    </View>
                    <View className={`badge ${status.badge}`}>
                      <Text>{status.text}</Text>
                    </View>
                    <View className='chevron' />
                  </View>
                )
              })
            )}
          </View>

          <View className='section-title'>
            <Text>我的服务</Text>
          </View>
          <View className='panel panel--grid'>
            <View className='service-grid'>
              {TENANT_SERVICE_GRID.map((entry) => (
                <View
                  key={entry.key}
                  className='service-grid__item'
                  onClick={() => (entry.url ? handleNavigate(entry.url) : handleTodo(entry.label))}
                >
                  <View className='service-grid__icon icon-svg' style={iconStyle(entry.icon, 36)} />
                  <Text className='service-grid__label'>{entry.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className='section-title'>
            <Text>常用功能</Text>
          </View>
          <View className='panel panel--list'>{TENANT_MENU.map(renderRow)}</View>
        </>
      )}

      {isAdmin && (
        <>
          {/* 资料卡 */}
          <View className='profile-card'>
            <View className='avatar avatar--lg'>
              <Text className='avatar-text'>{user?.name?.charAt(0) || 'U'}</Text>
            </View>
            <View className='profile-card__body'>
              <Text className='profile-card__name'>{user?.name || '管理员'}</Text>
              <View className='badge badge--primary'>
                <Text>{ROLE_TEXT[role || ''] || '管理员'}</Text>
              </View>
            </View>
            <View className='profile-card__edit' onClick={openEdit}>
              <View className='icon-svg' style={iconStyle('edit', 28)} />
              <Text>编辑资料</Text>
            </View>
          </View>

          {renderAccountSections()}

          <View className='section-title'>
            <Text>业务设置</Text>
          </View>
          <View className='panel panel--list'>{BUSINESS_ROWS.map(renderRow)}</View>

          <View className='section-title'>
            <Text>员工管理</Text>
          </View>
          <View className='panel panel--list'>
            {renderRow({
              key: 'employees',
              label: '员工管理',
              desc: '管理员工账号、角色与权限',
              url: '/pages/admin/accounts/index',
              icon: 'user'
            })}
          </View>

          {renderAboutSection()}
        </>
      )}

      {isOwner && (
        <>
          {/* 用户卡：品牌青绿实底 + 三指标（对齐 owner-mini-settings.html） */}
          <View className='owner-hero'>
            <View className='owner-hero__top'>
              <View className='avatar'>
                <Text className='avatar-text'>{user?.name?.charAt(0) || 'U'}</Text>
              </View>
              <View className='owner-hero__info'>
                <View className='owner-hero__name-row'>
                  <Text className='owner-hero__name'>{user?.name || '业主'}</Text>
                  <View className='owner-hero__badge'>
                    <Text>{ROLE_TEXT[role || ''] || '业主'}</Text>
                  </View>
                </View>
                {user?.email && <Text className='owner-hero__email'>{user.email}</Text>}
              </View>
            </View>
            <View className='owner-hero__stats'>
              <View className='owner-hero__stat'>
                <Text className='owner-hero__stat-label'>名下有房源</Text>
                <Text className='owner-hero__stat-value'>
                  {ownerPropCount === null ? '-' : `${ownerPropCount} 套`}
                </Text>
              </View>
              <View className='owner-hero__stat'>
                <Text className='owner-hero__stat-label'>其中在租</Text>
                <Text className='owner-hero__stat-value'>
                  {ownerRentedCount === null ? '-' : `${ownerRentedCount} 套`}
                </Text>
              </View>
              <View className='owner-hero__stat owner-hero__stat--right'>
                <Text className='owner-hero__stat-label'>本月实收</Text>
                <Text className='owner-hero__stat-value'>
                  {ownerMonthReceived === null
                    ? '-'
                    : formatMoney(ownerMonthReceived, ownerCurrency)}
                </Text>
              </View>
            </View>
          </View>

          <View className='section-title'>
            <Text>常用功能</Text>
          </View>
          <View className='panel panel--list'>
            {OWNER_MENU_ROWS.map(renderRow)}
            {/* 我的房源：进入需带房源 id；名下无房源时降级到业主首页 */}
            <View className='list-row' onClick={handleOwnerPropsPress}>
              <View className='list-row__icon icon-svg' style={iconStyle('home', 34)} />
              <View className='list-row__body'>
                <Text className='list-row__label'>我的房源</Text>
                <Text className='list-row__desc'>
                  {ownerPropCount === null
                    ? '房源信息加载中'
                    : `${ownerPropCount} 套房源 · ${ownerRentedCount} 套在租`}
                </Text>
              </View>
              <View className='chevron' />
            </View>
          </View>

          <View className='section-title'>
            <Text>设置</Text>
          </View>
          <View className='panel panel--list'>
            {OWNER_SETTING_ROWS.map((entry) => {
              const value =
                entry.key === 'account'
                  ? user?.phone
                    ? maskPhone(user.phone)
                    : ''
                  : entry.key === 'about'
                    ? appVersion
                      ? `HaoFang.World v${appVersion}`
                      : ''
                    : entry.value
              return renderSettingRow({ ...entry, value })
            })}
          </View>
        </>
      )}

      {isStaff && (
        <>
          {/* 员工 / 经纪端个人卡（对齐管理员端：编辑资料入口） */}
          <View className='profile-card'>
            <View className='avatar avatar--lg'>
              <Text className='avatar-text'>{user?.name?.charAt(0) || 'U'}</Text>
            </View>
            <View className='profile-card__body'>
              <Text className='profile-card__name'>{user?.name || '用户'}</Text>
              <View className='badge badge--primary'>
                <Text>{ROLE_TEXT[role || ''] || '员工'}</Text>
              </View>
            </View>
            <View className='profile-card__edit' onClick={openEdit}>
              <View className='icon-svg' style={iconStyle('edit', 28)} />
              <Text>编辑资料</Text>
            </View>
          </View>

          <View className='section-title'>
            <Text>常用入口</Text>
          </View>
          <View className='panel panel--list'>{STAFF_ROWS.map(renderRow)}</View>

          {renderAccountSections()}
          {renderAboutSection()}
        </>
      )}

      <View className='logout-wrapper'>
        <Button className='logout-btn' onClick={handleLogout}>
          退出登录
        </Button>
      </View>

      {isTenant && <BottomNav role='tenant' active='profile' />}
      {isAdmin && <BottomNav role='admin' active='settings' />}
      {isOwner && <BottomNav role='owner' active='settings' />}
      {isStaff && <BottomNav role='employee' active='settings' />}

      {/* 编辑资料弹层 */}
      {editVisible && (
        <View className='modal-mask' onClick={() => setEditVisible(false)}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>编辑资料</Text>
            <View className='form-field'>
              <Text className='form-field__label'>姓名</Text>
              <Input
                className='form-field__input'
                value={editName}
                onInput={(e) => setEditName(e.detail.value)}
                placeholder='请输入姓名'
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>手机号</Text>
              <Input
                className='form-field__input'
                value={editPhone}
                onInput={(e) => setEditPhone(e.detail.value)}
                placeholder='请输入手机号'
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>邮箱</Text>
              <Input
                className='form-field__input'
                value={editEmail}
                onInput={(e) => setEditEmail(e.detail.value)}
                placeholder='请输入邮箱'
              />
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn modal-btn--ghost' onClick={() => setEditVisible(false)}>
                取消
              </Button>
              <Button className='modal-btn modal-btn--primary' disabled={editSaving} onClick={saveEdit}>
                {editSaving ? '保存中...' : '保存'}
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* 修改密码弹层 */}
      {pwdVisible && (
        <View className='modal-mask' onClick={() => setPwdVisible(false)}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>修改密码</Text>
            <View className='form-field'>
              <Text className='form-field__label'>当前密码</Text>
              <Input
                className='form-field__input'
                password
                value={oldPwd}
                onInput={(e) => setOldPwd(e.detail.value)}
                placeholder='请输入当前密码'
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>新密码</Text>
              <Input
                className='form-field__input'
                password
                value={newPwd}
                onInput={(e) => setNewPwd(e.detail.value)}
                placeholder='至少 6 位'
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>确认新密码</Text>
              <Input
                className='form-field__input'
                password
                value={confirmPwd}
                onInput={(e) => setConfirmPwd(e.detail.value)}
                placeholder='再次输入新密码'
              />
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn modal-btn--ghost' onClick={() => setPwdVisible(false)}>
                取消
              </Button>
              <Button className='modal-btn modal-btn--primary' disabled={pwdSaving} onClick={savePwd}>
                {pwdSaving ? '提交中...' : '确认修改'}
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* 时区 / 通知设置弹层 */}
      {prefVisible && (
        <View className='modal-mask' onClick={() => setPrefVisible(false)}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>通知设置</Text>
            <View className='form-field'>
              <Text className='form-field__label'>时区</Text>
              <Input
                className='form-field__input'
                value={prefTimezone}
                onInput={(e) => setPrefTimezone(e.detail.value)}
                placeholder='如 Asia/Bangkok'
              />
            </View>
            <View className='toggle-row' onClick={() => setPrefEmail(!prefEmail)}>
              <Text className='toggle-row__label'>邮件通知</Text>
              <Text className={prefEmail ? 'toggle-row__val--on' : 'toggle-row__val--off'}>
                {prefEmail ? '✓ 开启' : '关闭'}
              </Text>
            </View>
            <View className='toggle-row' onClick={() => setPrefPush(!prefPush)}>
              <Text className='toggle-row__label'>推送通知</Text>
              <Text className={prefPush ? 'toggle-row__val--on' : 'toggle-row__val--off'}>
                {prefPush ? '✓ 开启' : '关闭'}
              </Text>
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn modal-btn--ghost' onClick={() => setPrefVisible(false)}>
                取消
              </Button>
              <Button className='modal-btn modal-btn--primary' disabled={prefSaving} onClick={savePrefs}>
                {prefSaving ? '保存中...' : '保存'}
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}