import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'

/**
 * 我的租约（/tenant/leases）
 * 由「我的 - 常用功能 - 我的租约」进入；自拉本人全部租约，点击行进入租约详情。
 */

const leaseTitle = (l: any) =>
  l?.property_name ||
  l?.room_number ||
  l?.address ||
  `租约 #${String(l?.id ?? '').slice(0, 8)}`

const leaseProgress = (l: any) => {
  if (!l?.start_date || !l?.end_date) return 0
  const total = dayjs(l.end_date).diff(dayjs(l.start_date), 'day')
  const passed = dayjs().diff(dayjs(l.start_date), 'day')
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((passed / total) * 100)))
}

const TenantLeases = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'

  const leaseStatus = (status?: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      active: { text: t('tenantMy.leaseActive'), cls: 'rent-badge--success' },
      pending: { text: t('tenantMy.leasePending'), cls: 'rent-badge--warning' },
      expired: { text: t('tenantMy.leaseExpired'), cls: 'rent-badge--neutral' },
      terminated: { text: t('tenantMy.leaseTerminated'), cls: 'rent-badge--error' },
    }
    return map[status || ''] || map.pending
  }

  const q = useCachedQuery<any[]>({
    queryKey: ['tenant-leases', 'mine', uid],
    cacheKey: `tenant-leases:mine:${uid}`,
    queryFn: async () => {
      try {
        const res: any = await api.get('/leases')
        const payload = res.data?.data ?? res.data
        return payload?.items ?? []
      } catch {
        return []
      }
    },
  })
  const leases = q.data ?? []
  const loading = q.isPending && !q.data

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('menu.myLeases')}</h3>
      </div>
      <div className="rent-card__body" style={{ padding: '8px 16px' }}>
        {loading && leases.length === 0 ? (
          <div className="rent-empty" style={{ padding: '24px 0' }}>{t('common.loading')}</div>
        ) : leases.length === 0 ? (
          <div className="rent-empty" style={{ padding: '24px 0' }}>
            {t('tenantMy.leaseEmpty')}
            <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>{t('tenantMy.leaseEmptySub')}</div>
          </div>
        ) : (
          leases.map((l, idx) => {
            const meta = leaseStatus(l.status)
            const remain = l.end_date
              ? Math.max(0, dayjs(l.end_date).diff(dayjs(), 'day'))
              : null
            return (
              <div
                key={l.id}
                className="rent-my__row"
                style={{
                  padding: '14px 0',
                  borderBottom: idx < leases.length - 1 ? '1px solid var(--rent-border)' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/tenant/leases/${l.id}`)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="rent-text-sm rent-text-bold" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {leaseTitle(l)}
                    </span>
                    <span className={`rent-badge ${meta.cls}`}>{meta.text}</span>
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>
                    {t('property.monthlyRent')} {formatMoney(Number(l.monthly_rent || 0), l.currency)}
                    {remain !== null && remain > 0 ? ` · ${t('tenantRemind.expireIn')} ${remain} ${t('tenantRemind.days')}` : ''}
                  </div>
                  <div className="rent-progress" style={{ marginTop: 8 }}>
                    <div className="rent-progress__bar" style={{ width: `${leaseProgress(l)}%` }}></div>
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
                    {dayjs(l.start_date || l.startDate).format('YYYY-MM-DD')} 至 {dayjs(l.end_date || l.endDate).format('YYYY-MM-DD')}
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--rent-ink-3)', flexShrink: 0, marginLeft: 12 }}><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TenantLeases
