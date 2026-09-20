import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'

/**
 * 交易订单详情（/tenant/deals/:id）
 * 由「我的交易订单」列表行进入；自拉 /property-deals/{id} 展示金额、状态与关键节点。
 */

const fmtDate = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '—')

const TenantDealDetail = () => {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const uid = useAuthStore((s) => s.user)?.id ?? 'anon'

  const dealStatus = (status?: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      drafted: { text: t('tenantMy.dealDrafted'), cls: 'rent-badge--neutral' },
      escrow_pending: { text: t('tenantMy.dealEscrow'), cls: 'rent-badge--warning' },
      signed: { text: t('tenantMy.dealSigned'), cls: 'rent-badge--primary' },
      transferring: { text: t('tenantMy.dealTransferring'), cls: 'rent-badge--warning' },
      completed: { text: t('tenantMy.dealCompleted'), cls: 'rent-badge--success' },
      failed: { text: t('tenantMy.dealFailed'), cls: 'rent-badge--error' },
      cancelled: { text: t('tenantMy.dealCancelled'), cls: 'rent-badge--neutral' },
    }
    return map[status || ''] || map.drafted
  }

  const q = useCachedQuery<any>({
    queryKey: ['tenant-deal', uid, id],
    cacheKey: `tenant-deal:${uid}:${id}`,
    queryFn: async () => {
      try {
        const res: any = await api.get(`/property-deals/${id}`)
        return res.data?.data ?? res.data ?? null
      } catch {
        return null
      }
    },
  })
  const deal = q.data ?? null
  const loading = q.isPending && !q.data

  if (loading) {
    return <div className="rent-card"><div className="rent-empty">{t('common.loading')}</div></div>
  }
  if (!deal) {
    return <div className="rent-card"><div className="rent-empty">{t('tenantMy.dealNotFound')}</div></div>
  }

  const meta = dealStatus(deal.status)
  const title = deal.listing_title || deal.property_name || `${t('tenantMy.orderNo')} ${String(deal.id || '').slice(0, 8)}`

  // 关键节点（按时间先后）
  const timeline: Array<{ label: string; value: string }> = (
    [
      { label: t('tenantMy.nodeCreated'), value: deal.created_at ?? '' },
      { label: t('tenantMy.nodeSigned'), value: deal.signed_at ?? '' },
      { label: t('tenantMy.nodeTransfer'), value: deal.transfer_date ?? '' },
    ] as Array<{ label: string; value: string }>
  ).filter((x) => !!x.value)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 金额卡 */}
      <div className="rent-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <h3 className="rent-card__title" style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>{title}</h3>
          <span className={`rent-badge ${meta.cls}`} style={{ flexShrink: 0 }}>{meta.text}</span>
        </div>
        <div className="rent-text-bold" style={{ fontSize: 28, marginTop: 14, fontVariantNumeric: 'tabular-nums' }}>
          {deal.sale_price ? formatMoney(Number(deal.sale_price), deal.currency) : '—'}
        </div>
        {deal.notes && <div className="rent-text-sm rent-text-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>{deal.notes}</div>}
      </div>

      {/* 关键节点卡 */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('tenantMy.timeline')}</h3>
        </div>
        <div className="rent-card__body rent-my__settings">
          {timeline.map((node) => (
            <div key={node.label} className="rent-my__row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--rent-primary)', display: 'inline-block' }}></span>
                <span className="rent-text-sm">{node.label}</span>
              </span>
              <span className="rent-text-sm" style={{ fontWeight: 600 }}>{fmtDate(node.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TenantDealDetail
