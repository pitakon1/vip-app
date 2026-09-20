import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { leasesApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import './index.scss'

const fmtDate = (x?: string) => (x ? String(x).slice(0, 10) : '—')

// 租约状态（与「我的」页一致）
const LEASE_STATUS: Record<string, { text: string; cls: string }> = {
  active: { text: '生效中', cls: 'success' },
  pending: { text: '待生效', cls: 'warning' },
  expired: { text: '已到期', cls: 'neutral' },
  terminated: { text: '已终止', cls: 'error' }
}

const leaseTitle = (l: any) =>
  l?.property_name ||
  l?.room_number ||
  l?.address ||
  `租约 #${String(l?.id ?? '').slice(0, 8)}`

const leaseProgress = (l: any) => {
  const start = new Date(l?.start_date || l?.startDate || '').getTime()
  const end = new Date(l?.end_date || l?.endDate || '').getTime()
  if (!start || !end || end <= start) return 0
  const ratio = (Date.now() - start) / (end - start)
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
}

const leaseRemainDays = (l: any) => {
  const end = new Date(l?.end_date || l?.endDate || '').getTime()
  if (!end) return 0
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000))
}

export default function TenantLeasesPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'

  const { data, loading, refresh } = useSwrCache<any[]>({
    key: `tenant:leases:${uid}`,
    fetcher: async () => {
      const res: any = await leasesApi.mine()
      const payload = res?.data ?? res
      return Array.isArray(payload) ? payload : payload?.items ?? []
    },
  })
  const leases = data ?? []

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: '我的租约' })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  return (
    <View className='tenant-leases-page'>
      <View className='page-container'>
        <View className='card card--list'>
          {loading && leases.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && leases.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无租约，签约后在这里查看租期进度与租金</Text>
            </View>
          )}
          {leases.map((lease, idx) => {
            const meta = LEASE_STATUS[String(lease?.status ?? '')] ?? LEASE_STATUS.pending
            const remain = leaseRemainDays(lease)
            return (
              <View
                key={lease?.id ?? idx}
                className='lease-row'
                onClick={() =>
                  Taro.navigateTo({
                    url: `/pages/tenant/leases/detail?lease_id=${lease?.id}`
                  })
                }
              >
                <View className='lease-row__head'>
                  <Text className='lease-row__title'>{leaseTitle(lease)}</Text>
                  <View className={`lease-row__badge lease-row__badge--${meta.cls}`}>
                    <Text>{meta.text}</Text>
                  </View>
                </View>
                <Text className='lease-row__meta'>
                  月租金 {money(Number(lease?.monthly_rent || 0), lease?.currency)}
                  {remain > 0 ? ` · 剩余 ${remain} 天` : ''}
                </Text>
                <View className='lease-row__track'>
                  <View className='lease-row__bar' style={{ width: `${leaseProgress(lease)}%` }} />
                </View>
                <Text className='lease-row__range'>
                  {fmtDate(lease?.start_date || lease?.startDate)} 至{' '}
                  {fmtDate(lease?.end_date || lease?.endDate)}
                </Text>
                <View className='chevron' />
              </View>
            )
          })}
        </View>
      </View>
    </View>
  )
}
