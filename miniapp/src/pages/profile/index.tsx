import { useState } from 'react'
import { View, Text, Button, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import BottomNav from '@/components/BottomNav'
import useAuthStore from '@/stores/auth'
import { authApi, companyApi, leasesApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
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

// C 端（业主+租客）统一「常用功能」宫格：全部入口放进同一个宫格，对所有用户完全一致；
// 业主 = 在平台上添加了房源，租客 = 在平台上租了房子；委托挂牌并入房源管理；点开无该能力的项时给出简洁解锁提示。
const C_GRID: Array<{ key: string; label: string; url: string; icon: IconKey; cap: 'owner' | 'tenant' | 'both'; need: string }> = [
  // 业主能力项（业主 = 在平台上添加了房源；委托挂牌并入房源管理内）
  { key: 'manageProperties', label: '房源管理', url: '/pages/owner/properties/index', icon: 'home', cap: 'owner', need: '添加房源后即可使用' },
  { key: 'incomeDetail', label: '收益明细', url: '/pages/owner/income/index', icon: 'chart', cap: 'owner', need: '房源出租产生收益后即可查看' },
  // 租客能力项（租客 = 在平台上租了房子）
  { key: 'myLeases', label: '我的租约', url: '/pages/tenant/leases/index', icon: 'doc', cap: 'tenant', need: '租入房源（在租）后即可查看' },
  { key: 'myDeals', label: '我的交易订单', url: '/pages/tenant/deals/index', icon: 'money', cap: 'tenant', need: '提交看房约谈或认购后即可查看' },
  { key: 'payments', label: '缴费中心', url: '/pages/tenant/payments/index', icon: 'card', cap: 'tenant', need: '租入房源（在租）后即可缴费' },
  { key: 'maintenance', label: '服务工单', url: '/pages/tenant/maintenance/index', icon: 'edit', cap: 'tenant', need: '购买增值服务后即可发起' },
  { key: 'services', label: '增值服务', url: '/pages/tenant/services/index', icon: 'clipboard', cap: 'tenant', need: '租入房源或添加房源后即可购买' },
  // 通用能力项（文档中心：租房文档 + 我的文档 合并）
  { key: 'documents', label: '文档中心', url: '/pages/tenant/documents/index', icon: 'doc', cap: 'both', need: '租入房源或添加房源后即可查看' }
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

function pickList<T>(res: any): T[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
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

  const [appVersion, setAppVersion] = useState('')

  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const { data: leaseList, refresh } = useSwrCache<any[]>({
    key: `profile:leases:${uid}`,
    fetcher: async () => {
      const res = await leasesApi.mine()
      return pickList<any>(res)
    },
  })
  const lease = leaseList?.find((l) => l?.status === 'active') || leaseList?.[0] || null

  useDidShow(() => {
    loadFromStorage()
    // 已登录时拉取最新用户信息
    if (useAuthStore.getState().token) {
      refreshUser()
      const currentRole = useAuthStore.getState().user?.role
      if (currentRole === 'tenant') {
        refresh()
      }
      if (currentRole === 'admin') {
        loadAppInfo()
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
    } catch (error) {
      console.warn('[Profile] 获取版本信息失败', error)
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
  // 内联校验错误：靠近对应字段展示，而非仅顶部 toast
  const [editErr, setEditErr] = useState('')

  const openEdit = () => {
    setEditName((user as any)?.full_name || (user as any)?.name || '')
    setEditPhone(user?.phone || '')
    setEditEmail(user?.email || '')
    setEditVisible(true)
  }

  const saveEdit = async () => {
    setEditErr('')
    if (!editName.trim()) {
      setEditErr('请填写姓名')
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
      setPwdErr('请填写完整')
      return
    }
    if (newPwd.length < 6) {
      setPwdErr('新密码至少 6 位')
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdErr('两次输入的新密码不一致')
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
  /** C 端（业主/租客，含未登录兜底）：与员工/管理端分开，统一「我的」页面结构 */
  const isC = !isAdmin && !isStaff
  /** 统一常用功能宫格：对所有人完全一致，不按角色隐藏；点开无能力的项给提示 */
  const cGrid = C_GRID
  /** 租客 / 管理端 / 业主端 / 员工端皆有「我的」页，底部导航对齐原型 */
  const hasBottomNav = isTenant || isAdmin || isOwner || isStaff

  const phoneValue = user?.phone ? maskPhone(user.phone) : '未绑定'
  const emailValue = user?.email ? maskEmail(user.email) : '未绑定'

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
      {/* ===== C 端（业主/租客）统一「我的」：实底用户卡 + 资产 + 统一宫格 + 统一设置 ===== */}
      {isC && (
        <>
          {/* 统一用户卡：底部按能力挂当前租约条（业主资产信息已并入「房源管理」） */}
          <View className='owner-hero'>
            <View className='owner-hero__top'>
              <View className='avatar'>
                <Text className='avatar-text'>{user?.name?.charAt(0) || 'U'}</Text>
              </View>
              <View className='owner-hero__info'>
                <View className='owner-hero__name-row'>
                  <Text className='owner-hero__name'>{user?.name || '用户'}</Text>
                  <View className='owner-hero__badge'>
                    <Text>{ROLE_TEXT[role || ''] || '用户'}</Text>
                  </View>
                </View>
                {user?.email && <Text className='owner-hero__email'>{user.email}</Text>}
              </View>
            </View>

            {/* 租客能力：当前租约条（点击进入「我的租约」列表） */}
            {isTenant && lease && (
              <View
                className='role-card__strip'
                onClick={() => handleNavigate('/pages/tenant/leases/index')}
              >
                <Text className='role-card__strip-label'>当前租约</Text>
                <Text className='role-card__strip-name'>{leaseTitle(lease)}</Text>
                <View className={`badge role-card__badge ${LEASE_STATUS[lease?.status]?.badge || 'badge--neutral'}`}>
                  <View className='bg-dot' />
                  <Text>{LEASE_STATUS[lease?.status]?.text || lease?.status || '—'}</Text>
                </View>
                <View className='chevron' />
              </View>
            )}
          </View>

          {/* 常用功能：统一宫格（业主入口 + 租客入口按能力过滤，可并存） */}
          {cGrid.length > 0 && (
            <>
              <View className='section-title'>
                <Text>常用功能</Text>
              </View>
              <View className='panel panel--grid'>
                <View className='service-grid'>
                  {cGrid.map((entry) => (
                    <View
                      key={entry.key}
                      className='service-grid__item'
                      onClick={() => {
                        const ok =
                          entry.cap === 'owner'
                            ? isOwner
                            : entry.cap === 'tenant'
                              ? isTenant
                              : isOwner || isTenant
                        ok
                          ? handleNavigate(entry.url)
                          : Taro.showToast({ title: entry.need, icon: 'none' })
                      }}
                    >
                      <View className='service-grid__icon icon-svg' style={iconStyle(entry.icon, 36)} />
                      <Text className='service-grid__label'>{entry.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* 设置（业主/租客统一） */}
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

      {isC && <BottomNav role={isOwner ? 'owner' : 'tenant'} active='profile' />}
      {isAdmin && <BottomNav role='admin' active='settings' />}
      {isStaff && <BottomNav role='employee' active='settings' />}

      {/* 编辑资料弹层 */}
      {editVisible && (
        <View className='modal-mask' onClick={() => setEditVisible(false)}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>编辑资料</Text>
            <View className='form-field'>
              <Text className='form-field__label'>姓名</Text>
              <Input
                className={`form-field__input${editErr ? ' form-field__input--error' : ''}`}
                value={editName}
                onInput={(e) => setEditName(e.detail.value)}
                placeholder='请输入姓名'
              />
              {editErr && <Text className='form-field__error'>{editErr}</Text>}
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
                className={`form-field__input${pwdErr ? ' form-field__input--error' : ''}`}
                password
                value={confirmPwd}
                onInput={(e) => setConfirmPwd(e.detail.value)}
                placeholder='再次输入新密码'
              />
              {pwdErr && <Text className='form-field__error'>{pwdErr}</Text>}
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