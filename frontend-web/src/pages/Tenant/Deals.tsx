import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'

/**
 * 我的交易订单（/tenant/deals）
 * 由「我的 - 常用功能 - 我的交易订单」进入；自拉本人订单清单（含买房与租房交易），点击行进入订单详情。
 */

const TenantDeals = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [deals, setDeals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [dRes, lRes] = await Promise.all([
        api.get('/property-deals', { params: { page: 1, page_size: 50 } }),
        api.get('/sale-listings', { params: { page: 1, page_size: 50 } }).catch(() => ({ data: { items: [] } })),
      ])
      const titles: Record<string, string> = {}
      const lPayload = lRes.data?.data ?? lRes.data
      ;(lPayload?.items ?? []).forEach((r: any) => {
        if (r?.id) titles[String(r.id)] = r.title ?? ''
      })
      const dPayload = dRes.data?.data ?? dRes.data
      setDeals(
        (dPayload?.items ?? (Array.isArray(dPayload) ? dPayload : [])).map((r: any) => ({
          ...r,
          listing_title: titles[String(r.sale_listing_id ?? '')] ?? '',
        })),
      )
    } catch {
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('tenantMy.myDeals')}</h3>
      </div>
      <div className="rent-card__body" style={{ padding: '8px 16px' }}>
        {loading && deals.length === 0 ? (
          <div className="rent-empty" style={{ padding: '24px 0' }}>{t('common.loading')}</div>
        ) : deals.length === 0 ? (
          <div className="rent-empty" style={{ padding: '24px 0' }}>
            {t('tenantMy.noOrders')}
            <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>{t('tenantMy.dealEmptySub')}</div>
          </div>
        ) : (
          deals.map((d, idx) => {
            const meta = dealStatus(d.status)
            return (
              <div
                key={d.id}
                className="rent-my__row"
                style={{
                  padding: '14px 0',
                  borderBottom: idx < deals.length - 1 ? '1px solid var(--rent-border)' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/tenant/deals/${d.id}`)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.listing_title || `${t('tenantMy.orderNo')} ${String(d.id || '').slice(0, 8)}`}
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>
                    {d.sale_price ? `${formatMoney(Number(d.sale_price), d.currency)} · ` : ''}
                    {d.created_at ? dayjs(d.created_at).format('YYYY-MM-DD') : '—'}
                  </div>
                </div>
                <span className={`rent-badge ${meta.cls}`} style={{ flexShrink: 0, marginLeft: 12 }}>{meta.text}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--rent-ink-3)', flexShrink: 0, marginLeft: 8 }}><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TenantDeals
