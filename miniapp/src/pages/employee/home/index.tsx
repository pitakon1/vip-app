import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi, dashboardApi } from '@/services/api'
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
  total_properties?: number
  vacant?: number
  rented?: number
  expiring_leases?: number
  upcoming_payments?: number
  monthly_revenue?: number
  [key: string]: any
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

const QUICK_ACTIONS = [
  { key: 'listings', icon: '🏠', title: '房源中心', sub: '在租 · 空置 · 带看', url: '/pages/tenant/listings/index' },
  { key: 'performance', icon: '📈', title: '我的业绩', sub: '业绩排行 · 佣金统计', url: '/pages/employee/performance/index' },
  { key: 'viewings', icon: '👁️', title: '预约带看', sub: '确认 · 到访 · 流转', url: '/pages/tenant/viewings/index' },
  { key: 'contracts', icon: '📝', title: '电子合同', sub: '签约 · 归档 · 到期', url: '/pages/contracts/index' },
  { key: 'chat', icon: '💬', title: '客户沟通', sub: '即时消息 · 跟进', url: '/pages/chat/list/index' },
  { key: 'attendance', icon: '🕐', title: '考勤打卡', sub: '上下班 · 外出登记', url: '/pages/attendance/index' },
]

export default function EmployeeHomePage() {
  const user = useAuthStore((state) => state.user)
  const isAgent = user?.role === 'agent'
  const pageTitle = isAgent ? '经纪工作台' : '员工工作台'
  const [followUp, setFollowUp] = useState<FollowUpLease[]>([])
  const [summary, setSummary] = useState<Summary>({})
  const [loading, setLoading] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [wb, sum] = await Promise.all([
        employeesApi.workbench().catch(() => ({ data: {} })),
        dashboardApi.summary().catch(() => ({ data: {} }))
      ])
      const wbD = pick(wb, 'follow_up_leases')
      setFollowUp(Array.isArray(wbD) ? wbD : [])
      const sumD = pick(sum)
      setSummary(Object.keys(sumD).length ? sumD : {})
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

  const urgentCount = followUp.filter((f) => Number(f.days_to_expire ?? 0) <= 15).length

  return (
    <View className='emp-home'>
      {/* 顶部欢迎区 */}
      <View className='emp-hero'>
        <View className='emp-hero__greeting'>
          <Text className='emp-hero__hi'>你好，{user?.name || '同事'} 👋</Text>
          <Text className='emp-hero__role'>
            {isAgent ? '房产经纪人' : '员工'}
          </Text>
        </View>
        <View className='emp-hero__avatar'>
          <Text className='emp-hero__avatar-text'>
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      <View className='emp-content'>
        {/* 核心数据卡 */}
        <View className='emp-stats-primary'>
          <View className='emp-stat-big emp-stat-big--primary'>
            <View className='emp-stat-big__icon'>🏠</View>
            <View className='emp-stat-big__body'>
              <Text className='emp-stat-big__num'>{summary.total_properties ?? '-'}</Text>
              <Text className='emp-stat-big__label'>在管房源</Text>
            </View>
          </View>
          <View className='emp-stat-big emp-stat-big--success'>
            <View className='emp-stat-big__icon'>💰</View>
            <View className='emp-stat-big__body'>
              <Text className='emp-stat-big__num'>{fmtMoney(summary.monthly_revenue)}</Text>
              <Text className='emp-stat-big__label'>本月已收租金</Text>
            </View>
          </View>
        </View>

        {/* 次级数据 */}
        <View className='emp-stats-row'>
          <View className='emp-stat-mini'>
            <Text className='emp-stat-mini__num emp-stat-mini__num--warning'>
              {summary.expiring_leases ?? '-'}
            </Text>
            <Text className='emp-stat-mini__label'>即将到期</Text>
          </View>
          <View className='emp-stat-mini'>
            <Text className='emp-stat-mini__num emp-stat-mini__num--error'>
              {summary.upcoming_payments ?? '-'}
            </Text>
            <Text className='emp-stat-mini__label'>待收款</Text>
          </View>
          <View className='emp-stat-mini'>
            <Text className='emp-stat-mini__num emp-stat-mini__num--success'>
              {summary.rented ?? '-'}
            </Text>
            <Text className='emp-stat-mini__label'>已出租</Text>
          </View>
        </View>

        {/* 临期跟进 */}
        <View className='emp-section'>
          <View className='emp-section__head'>
            <Text className='emp-section__title'>租约临期跟进</Text>
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
              <View className='emp-state__icon'>📋</View>
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

        {/* 快捷入口 */}
        <View className='emp-section'>
          <View className='emp-section__head'>
            <Text className='emp-section__title'>快捷入口</Text>
          </View>
          <View className='emp-quick-grid'>
            {QUICK_ACTIONS.map((item) => (
              <View
                key={item.key}
                className='emp-quick-item'
                hoverClass='emp-quick-item--hover'
                onClick={() => Taro.navigateTo({ url: item.url })}
              >
                <View className='emp-quick-item__icon'>{item.icon}</View>
                <Text className='emp-quick-item__title'>{item.title}</Text>
                <Text className='emp-quick-item__sub'>{item.sub}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}
