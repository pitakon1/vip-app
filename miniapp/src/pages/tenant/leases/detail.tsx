import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { leasesApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import { useI18n } from '@/i18n'
import './detail.scss'

const fmtDate = (x?: string) => (x ? String(x).slice(0, 10) : '—')

// 租约状态（与「我的」页一致）
const buildLeaseStatus = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, { text: string; cls: string }> => ({
  active: { text: t('lease.stActive'), cls: 'success' },
  pending: { text: t('lease.stPending'), cls: 'warning' },
  expired: { text: t('lease.stExpired'), cls: 'neutral' },
  terminated: { text: t('lease.stTerminated'), cls: 'error' }
})

const buildDepositStatus = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, string> => ({
  held: t('tenantLease.depHeld'),
  refunded: t('tenantLease.depRefunded'),
  forfeited: t('tenantLease.depForfeited')
})

const leaseTitle = (l: any, t: (k: string, p?: Record<string, string | number>) => string) =>
  l?.property_name ||
  l?.room_number ||
  l?.address ||
  `${t('lease.leaseFallback')} #${String(l?.id ?? '').slice(0, 8)}`

const leaseProgress = (l: any) => {
  const start = new Date(l?.start_date || l?.startDate || '').getTime()
  const end = new Date(l?.end_date || l?.endDate || '').getTime()
  if (!start || !end || end <= start) return 0
  const ratio = (Date.now() - start) / (end - start)
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
}

export default function TenantLeaseDetailPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const router = useRouter()
  const leaseId = String(router.params?.lease_id ?? '')
  const LEASE_STATUS = buildLeaseStatus(t)
  const DEPOSIT_STATUS = buildDepositStatus(t)

  const { data: lease, loading, refresh } = useSwrCache<any>({
    key: `tenant:lease-detail:${leaseId}`,
    fetcher: async () => {
      const res: any = await leasesApi.get(leaseId)
      return res?.data ?? res ?? null
    },
  })

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('tenantLease.detailTitle') })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  if (!loading && !lease) {
    return (
      <View className='tenant-lease-detail-page'>
        <View className='page-container'>
          <View className='empty-tip'>
            <Text>{t('tenantLease.notFound')}</Text>
          </View>
        </View>
      </View>
    )
  }
  if (!lease) {
    return <View className='tenant-lease-detail-page' />
  }

  const meta = LEASE_STATUS[String(lease?.status ?? '')] ?? LEASE_STATUS.pending
  const startTs = lease?.start_date ? new Date(lease.start_date).getTime() : 0
  const endTs = lease?.end_date ? new Date(lease.end_date).getTime() : 0
  const totalDays = startTs && endTs > startTs ? Math.round((endTs - startTs) / 86400000) : 0
  const passedDays = startTs
    ? Math.max(0, Math.min(Math.round((Date.now() - startTs) / 86400000), totalDays || 0))
    : 0
  const remainDays = endTs ? Math.max(0, Math.round((endTs - Date.now()) / 86400000)) : 0

  return (
    <View className='tenant-lease-detail-page'>
      <View className='page-container'>
        {/* 租期卡 */}
        <View className='card'>
          <View className='lease-head'>
            <Text className='lease-title'>{leaseTitle(lease, t)}</Text>
            <View className={`lease-badge lease-badge--${meta.cls}`}>
              <Text>{meta.text}</Text>
            </View>
          </View>
          <Text className='lease-meta'>{t('lease.monthlyRentLabel')} {money(Number(lease?.monthly_rent || 0), lease?.currency)}</Text>
          <View className='lease-track'>
            <View className='lease-bar' style={{ width: `${leaseProgress(lease)}%` }} />
          </View>
          <View className='lease-foot'>
            <Text className='lease-foot__text'>
              {fmtDate(lease?.start_date)} {t('pub.to')} {fmtDate(lease?.end_date)}
            </Text>
            {remainDays > 0 && <Text className='lease-foot__remain'>{t('lease.remainDays', { n: remainDays })}</Text>}
          </View>
          {totalDays > 0 && (
            <Text className='lease-sub'>
              {t('lease.elapsedDays', { passed: passedDays, total: totalDays })}
            </Text>
          )}
        </View>

        {/* 明细卡 */}
        <View className='card'>
          <Text className='section-label'>{t('tenantLease.breakdown')}</Text>
          <View className='detail-row'>
            <Text className='detail-label'>{t('lease.monthlyRentLabel')}</Text>
            <Text className='detail-value'>
              {money(Number(lease?.monthly_rent || 0), lease?.currency)}
            </Text>
          </View>
          <View className='detail-row'>
            <Text className='detail-label'>{t('pub.deposit')}</Text>
            <Text className='detail-value'>
              {money(Number(lease?.deposit_amount || 0), lease?.currency)}
              {lease?.deposit_status
                ? ` · ${DEPOSIT_STATUS[lease.deposit_status] ?? lease.deposit_status}`
                : ''}
            </Text>
          </View>
          <View className='detail-row'>
            <Text className='detail-label'>{t('tenantLease.startDate')}</Text>
            <Text className='detail-value'>{fmtDate(lease?.start_date)}</Text>
          </View>
          <View className='detail-row'>
            <Text className='detail-label'>{t('tenantLease.endDate')}</Text>
            <Text className='detail-value'>{fmtDate(lease?.end_date)}</Text>
          </View>
          {lease?.contract_url && (
            <View
              className='detail-row'
              onClick={() => Taro.navigateTo({ url: lease.contract_url })}
            >
              <Text className='detail-label'>{t('tenantLease.eContract')}</Text>
              <Text className='detail-value detail-value--link'>{t('tenantLease.viewContract')}</Text>
            </View>
          )}
          {lease?.special_terms && (
            <View className='detail-row detail-row--wrap'>
              <Text className='detail-label'>{t('tenantLease.specialTerms')}</Text>
              <Text className='detail-value detail-value--wrap'>{lease.special_terms}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}
