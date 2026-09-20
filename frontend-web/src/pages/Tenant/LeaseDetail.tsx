import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'

/**
 * 租约详情（/tenant/leases/:id）
 * 由「我的租约」列表行进入；自拉 /leases/{id} 展示租期、租金与押金明细。
 */

const fmtDate = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '—')

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

const depositLabel = (status?: string) =>
  ({ held: '托管中', refunded: '已退还', forfeited: '已没收' })[status || ''] || undefined

const TenantLeaseDetail = () => {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const uid = useAuthStore((s) => s.user)?.id ?? 'anon'

  const leaseStatus = (status?: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      active: { text: t('tenantMy.leaseActive'), cls: 'rent-badge--success' },
      pending: { text: t('tenantMy.leasePending'), cls: 'rent-badge--warning' },
      expired: { text: t('tenantMy.leaseExpired'), cls: 'rent-badge--neutral' },
      terminated: { text: t('tenantMy.leaseTerminated'), cls: 'rent-badge--error' },
    }
    return map[status || ''] || map.pending
  }

  const q = useCachedQuery<any>({
    queryKey: ['tenant-lease', uid, id],
    cacheKey: `tenant-lease:${uid}:${id}`,
    queryFn: async () => {
      try {
        const res: any = await api.get(`/leases/${id}`)
        return res.data?.data ?? res.data ?? null
      } catch {
        return null
      }
    },
  })
  const lease = q.data ?? null
  const loading = q.isPending && !q.data

  if (loading) {
    return <div className="rent-card"><div className="rent-empty">{t('common.loading')}</div></div>
  }
  if (!lease) {
    return <div className="rent-card"><div className="rent-empty">{t('tenantMy.leaseNotFound')}</div></div>
  }

  const meta = leaseStatus(lease.status)
  const startTs = lease.start_date ? dayjs(lease.start_date) : null
  const endTs = lease.end_date ? dayjs(lease.end_date) : null
  const totalDays = startTs && endTs && endTs.isAfter(startTs) ? endTs.diff(startTs, 'day') : 0
  const passedDays = startTs ? Math.max(0, Math.min(dayjs().diff(startTs, 'day'), totalDays || 0)) : 0
  const remainDays = endTs ? Math.max(0, endTs.diff(dayjs(), 'day')) : 0

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: t('property.monthlyRent'),
      value: formatMoney(Number(lease.monthly_rent || 0), lease.currency),
    },
    {
      label: t('tenantMy.deposit'),
      value: `${formatMoney(Number(lease.deposit_amount || 0), lease.currency)}${lease.deposit_status ? ` · ${depositLabel(lease.deposit_status) ?? lease.deposit_status}` : ''}`,
    },
    { label: t('tenantMy.leaseStart'), value: fmtDate(lease.start_date) },
    { label: t('tenantMy.leaseEnd'), value: fmtDate(lease.end_date) },
  ]
  if (lease.contract_url) {
    rows.push({
      label: t('tenantMy.contract'),
      value: <span style={{ color: 'var(--rent-primary)' }}>{t('tenantMy.viewContract')}</span>,
    })
  }
  if (lease.special_terms) {
    rows.push({ label: t('tenantMy.specialTerms'), value: lease.special_terms })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 租期卡 */}
      <div className="rent-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 className="rent-card__title" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {leaseTitle(lease)}
          </h3>
          <span className={`rent-badge ${meta.cls}`}>{meta.text}</span>
        </div>
        <div className="rent-text-sm rent-text-muted" style={{ marginTop: 10 }}>
          {t('property.monthlyRent')} {formatMoney(Number(lease.monthly_rent || 0), lease.currency)}
        </div>
        <div className="rent-progress" style={{ marginTop: 12 }}>
          <div className="rent-progress__bar" style={{ width: `${leaseProgress(lease)}%` }}></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <span className="rent-text-sm rent-text-muted">
            {fmtDate(lease.start_date)} 至 {fmtDate(lease.end_date)}
          </span>
          {remainDays > 0 && (
            <span className="rent-text-sm" style={{ color: 'var(--rent-primary)', fontWeight: 600 }}>
              {t('tenantRemind.expireIn')} {remainDays} {t('tenantRemind.days')}
            </span>
          )}
        </div>
        {totalDays > 0 && (
          <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
            {t('tenantRemind.elapsed')} {passedDays} / {t('tenantMy.totalDays')} {totalDays} {t('tenantRemind.days')}
          </div>
        )}
      </div>

      {/* 明细卡 */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.leaseDetail')}</h3>
        </div>
        <div className="rent-card__body rent-my__settings">
          {rows.map((r) => (
            <div key={r.label} className="rent-my__row">
              <span className="rent-text-sm">{r.label}</span>
              <span className="rent-text-sm" style={{ textAlign: 'right', color: 'var(--rent-ink)' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TenantLeaseDetail
