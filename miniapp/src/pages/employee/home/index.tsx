import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi, dashboardApi, viewingsApi } from '@/services/api'
import './index.scss'

interface FollowUpLease {
  lease_id: string
  property_title?: string
  monthly_rent?: number
  currency?: string
  end_date?: string
  days_to_expire?: number
}

interface Summary {
  expiring_leases?: number
  upcoming_payments?: number
  monthly_revenue?: number
  [key: string]: any
}

interface ViewingItem {
  id: string
  property_id?: string
  property_title?: string | null
  property_address?: string | null
  scheduled_at?: string | null
  visitor_name?: string | null
  status?: string | null
}

const pick = (res: any, key?: string): any => {
  const d = res?.data ?? res
  if (key) return d?.[key]
  return d
}

const fmtMoney = (v: number | undefined, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '฿', EUR: '€', USD: '$' }
  return `${sym[currency || 'THB'] || '¥'}${Number(v || 0).toLocaleString()}`
}

// 带看状态标签
const V_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待确认', cls: 'emp-tag--info' },
  confirmed: { label: '已确认', cls: 'emp-tag--success' },
  completed: { label: '已完成', cls: 'emp-tag--success' },
  cancelled: { label: '已取消', cls: 'emp-tag--muted' },
  no_show: { label: '爽约', cls: 'emp-tag--error' },
}

const getVStatus = (status?: string | null) =>
  V_STATUS[status ?? ''] ?? { label: status || '-', cls: 'emp-tag--muted' }

const pad = (n: number) => String(n).padStart(2, '0')
const toTime = (iso?: string | null) => {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '--:--' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const isToday = (iso?: string | null) => {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

// 快捷工作台宫格
const QUICK_ACTIONS = [
  { label: '房源搜索', icon: '搜', url: '/pages/employee/search/index' },
  { label: '房源管理', icon: '房', url: '/pages/employee/properties/index' },
  { label: '客户跟进', icon: '客', url: '/pages/employee/leads/index' },
  { label: '我的业绩', icon: '绩', url: '/pages/employee/performance/index' },
  { label: '电子合同', icon: '签', url: '/pages/contracts/index' },
  { label: '预约带看', icon: '看', url: '/pages/tenant/viewings/index' },
  { label: '考勤打卡', icon: '卡', url: '/pages/attendance/index' },
  { label: '通讯录', icon: '联', url: '/pages/employee/contacts/index' }
]

export default function EmployeeHomePage() {
  const user = useAuthStore((state) => state.user)
  const isAgent = user?.role === 'agent'
  const pageTitle = isAgent ? '经纪工作台' : '员工工作台'
  const [followUp, setFollowUp] = useState<FollowUpLease[]>([])
  const [summary, setSummary] = useState<Summary>({})
  const [viewings, setViewings] = useState<ViewingItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [wb, sum, vw] = await Promise.all([
        employeesApi.workbench().catch(() => ({ data: {} })),
        dashboardApi.summary().catch(() => ({ data: {} })),
        viewingsApi.list({ pageSize: 50 }).catch(() => ({ data: { items: [] } }))
      ])
      const wbD = pick(wb, 'follow_up_leases')
      setFollowUp(Array.isArray(wbD) ? wbD : [])
      const sumD = pick(sum)
      setSummary(Object.keys(sumD).length ? sumD : {})
      const vwRes: any = vw
      const vwRaw = vwRes?.data ?? vwRes
      const vwItems = Array.isArray(vwRaw) ? vwRaw : vwRaw?.items ?? vwRaw?.data ?? []
      setViewings(Array.isArray(vwItems) ? vwItems : [])
    } catch (error) {
      console.error('[EmployeeHome] 加载失败', error)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchAll()
  })

  const openDetail = () => {
    Taro.showToast({ title: '请在 Web 管理后台处理', icon: 'none' })
  }

  // 今日日程：当天带看按时间升序
  const todayList = viewings
    .filter((v) => isToday(v.scheduled_at))
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))

  const urgentCount = followUp.filter((f) => Number(f.days_to_expire ?? 0) <= 15).length

  const now = new Date()
  const todayLabel = `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}`

  return (
    <View className='emp-home'>
      {/* 顶部欢迎区 */}
      <View className='emp-hero'>
        <View className='emp-hero__greeting'>
          <Text className='emp-hero__hi'>你好，{user?.name || '同事'}</Text>
          <Text className='emp-hero__meta'>
            {pageTitle} · {todayLabel}
          </Text>
        </View>
        <View className='emp-hero__avatar'>
          <Text className='emp-hero__avatar-text'>
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      <View className='emp-content'>
        {/* 关键指标条（单条，替代多层数据卡） */}
        <View className='emp-kpi'>
          <View className='emp-kpi__item'>
            <Text className='emp-kpi__num emp-kpi__num--primary'>{todayList.length}</Text>
            <Text className='emp-kpi__label'>今日带看</Text>
          </View>
          <View className='emp-kpi__divider' />
          <View className='emp-kpi__item'>
            <Text className='emp-kpi__num emp-kpi__num--warning'>
              {summary.upcoming_payments ?? '-'}
            </Text>
            <Text className='emp-kpi__label'>待收款</Text>
          </View>
          <View className='emp-kpi__divider' />
          <View className='emp-kpi__item'>
            <Text className='emp-kpi__num emp-kpi__num--error'>
              {summary.expiring_leases ?? '-'}
            </Text>
            <Text className='emp-kpi__label'>即将到期</Text>
          </View>
        </View>

        {/* 快捷工作台宫格 */}
        <View className='emp-quick'>
          {QUICK_ACTIONS.map((a) => (
            <View
              key={a.label}
              className='emp-quick__item'
              hoverClass='emp-quick__item--hover'
              onClick={() => Taro.navigateTo({ url: a.url })}
            >
              <View className='emp-quick__icon'>
                <Text className='emp-quick__icon-text'>{a.icon}</Text>
              </View>
              <Text className='emp-quick__label'>{a.label}</Text>
            </View>
          ))}
        </View>

        {/* 今日日程：直接展示，不依赖快捷入口 */}
        <View className='emp-section'>
          <View className='emp-section__head'>
            <View className='emp-section__title-row'>
              <View className='emp-section__icon'>
                <Text className='emp-section__icon-text'>📅</Text>
              </View>
              <Text className='emp-section__title'>今日日程</Text>
              <View className='emp-badge emp-badge--info'>
                <Text>{todayList.length} 场</Text>
              </View>
            </View>
            <Text
              className='emp-section__more'
              onClick={() => Taro.navigateTo({ url: '/pages/tenant/viewings/index' })}
            >
              预约带看 ›
            </Text>
          </View>

          <View className='emp-schedule'>
            {loading && todayList.length === 0 ? (
              <View className='emp-state emp-state--loading'>
                <View className='emp-state__spinner' />
                <Text className='emp-state__title'>正在加载</Text>
              </View>
            ) : todayList.length === 0 ? (
              <View className='emp-state'>
                <Text className='emp-state__icon'>·</Text>
                <Text className='emp-state__title'>今天暂无带看安排</Text>
                <Text className='emp-state__desc'>新的预约将自动出现在这里</Text>
              </View>
            ) : (
              <View className='emp-schedule__list'>
                {todayList.map((item) => {
                  const st = getVStatus(item.status)
                  return (
                    <View key={item.id} className='emp-schedule__item'>
                      <View className='emp-schedule__time'>
                        <Text className='emp-schedule__time-text'>{toTime(item.scheduled_at)}</Text>
                        <View className='emp-schedule__line' />
                      </View>
                      <View className='emp-schedule__card'>
                        <View className='emp-schedule__card-top'>
                          <View className={`emp-tag ${st.cls}`}>
                            <Text>{st.label}</Text>
                          </View>
                          <Text className='emp-schedule__visitor'>
                            {item.visitor_name || '待定客户'}
                          </Text>
                        </View>
                        <Text className='emp-schedule__prop'>
                          {item.property_title || item.property_address || '房源'}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        </View>

        {/* 临期跟进 */}
        <View className='emp-section'>
          <View className='emp-section__head'>
            <View className='emp-section__title-row'>
              <View className='emp-section__icon emp-section__icon--warn'>
                <Text className='emp-section__icon-text'>!</Text>
              </View>
              <Text className='emp-section__title'>租约临期跟进</Text>
            </View>
            <View className={`emp-badge ${urgentCount > 0 ? 'emp-badge--error' : 'emp-badge--ok'}`}>
              <Text>{followUp.length} 份 · 紧急 {urgentCount}</Text>
            </View>
          </View>

          {loading && followUp.length === 0 ? (
            <View className='emp-state emp-state--loading'>
              <View className='emp-state__spinner' />
              <Text className='emp-state__title'>正在加载</Text>
            </View>
          ) : followUp.length === 0 ? (
            <View className='emp-state'>
              <Text className='emp-state__icon'>✓</Text>
              <Text className='emp-state__title'>暂无临期租约</Text>
              <Text className='emp-state__desc'>近期到期的租约将在此展示</Text>
            </View>
          ) : (
            <View className='emp-follow-list'>
              {followUp.map((fl: any) => {
                const days = Number(fl.days_to_expire ?? 0)
                const urgent = days <= 15
                const expired = days < 0
                return (
                  <View
                    key={fl.lease_id}
                    className={`emp-follow-card ${urgent ? 'emp-follow-card--urgent' : ''}`}
                    onClick={openDetail}
                  >
                    <View className='emp-follow-card__top'>
                      <Text className='emp-follow-card__title'>
                        {fl.property_title || '未命名房源'}
                      </Text>
                      <View
                        className={`emp-tag ${
                          expired ? 'emp-tag--error' : urgent ? 'emp-tag--warning' : 'emp-tag--info'
                        }`}
                      >
                        <Text>{expired ? '已到期' : `${days} 天后到期`}</Text>
                      </View>
                    </View>
                    <View className='emp-follow-card__meta'>
                      <View className='emp-follow-card__meta-item'>
                        <Text className='emp-follow-card__meta-label'>月租</Text>
                        <Text className='emp-follow-card__meta-value'>
                          {fmtMoney(fl.monthly_rent, fl.currency)}
                        </Text>
                      </View>
                      <View className='emp-follow-card__meta-item'>
                        <Text className='emp-follow-card__meta-label'>到期日</Text>
                        <Text className='emp-follow-card__meta-value'>
                          {fl.end_date ? String(fl.end_date).slice(0, 10) : '-'}
                        </Text>
                      </View>
                    </View>
                    <View className='emp-follow-card__action'>
                      <Text className='emp-follow-card__action-text'>
                        {urgent ? '立即跟进续约 →' : '跟踪详情 →'}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}