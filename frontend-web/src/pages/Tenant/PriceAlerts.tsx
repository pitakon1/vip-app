import { DETAIL_PAGE_SIZE } from '@/lib/pagination'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'
import { queryClient, useCachedQuery } from '@/lib/queryCache'
import { photoUrl } from '@/lib/publicLabels'
import DataState from '@/components/DataState'

/**
 * 降价提醒（/tenant/price-alerts）
 * 由「我的 - 常用功能 - 降价提醒」进入；与 App / 小程序同口径：
 * 数据来自 /price-alerts（订阅价 vs 当前挂牌价），可逐条取消订阅。
 */

interface AlertItem {
  id?: string
  property_id?: string
  listing_id?: string | null
  title?: string | null
  room_number?: string | null
  address?: string | null
  subscribed_price?: number | null
  current_price?: number | null
  currency?: string | null
  photo?: unknown
  notified_at?: string | null
}

const TenantPriceAlerts = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryKey = ['tenant-price-alerts', uid]

  const q = useCachedQuery<AlertItem[]>({
    queryKey,
    cacheKey: `tenant-price-alerts:${uid}`,
    queryFn: async () => {
      const res = await api.get('/price-alerts', { params: { page: 1, page_size: DETAIL_PAGE_SIZE } })
      const payload = res.data?.data ?? res.data
      return payload?.items ?? (Array.isArray(payload) ? payload : [])
    },
  })
  const items = q.data ?? []
  const loading = q.isPending && !q.data

  const unsubscribe = async (item: AlertItem) => {
    if (!item.property_id) return
    try {
      await api.delete(`/price-alerts/${item.property_id}`)
      queryClient.setQueryData<AlertItem[]>(queryKey, (prev) =>
        (prev ?? []).filter((it) => it.property_id !== item.property_id),
      )
      message.success(t('tenantMy.alertUnsubscribed'))
    } catch {
      message.error(t('tenantMy.alertUnsubFailed'))
    }
  }

  const open = (item: AlertItem) => {
    if (item.listing_id) {
      navigate(`/listing/${item.listing_id}`)
      return
    }
    message.info(t('tenantMy.favoritesDelisted'))
  }

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('tenantMy.priceAlerts')}</h3>
      </div>
      <div className="rent-card__body" style={{ padding: '8px 16px' }}>
        {q.isError && !q.data ? (
          <DataState
            error={t('common.loadFailed')}
            retryText={t('common.retry')}
            onRetry={() => { void q.refetch() }}
          />
        ) : loading && items.length === 0 ? (
          <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
        ) : items.length === 0 ? (
          <DataState
            empty
            emptyTitle={t('tenantMy.priceAlertsEmpty')}
            emptySub={t('tenantMy.priceAlertsEmptySub')}
          />
        ) : (
          items.map((item, idx) => {
            const cover = photoUrl(item.photo)
            const subscribed = Number(item.subscribed_price ?? 0)
            const current = Number(item.current_price ?? subscribed)
            const diff = subscribed - current
            const title = item.title || item.room_number || t('tenantMy.favoritesNoTitle')
            return (
              <div
                key={item.id ?? idx}
                className="rent-my__row"
                style={{
                  padding: '14px 0',
                  borderBottom: idx < items.length - 1 ? '1px solid var(--rent-border)' : 'none',
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => open(item)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(item) }}
                >
                  <div
                    style={{
                      width: 64, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                      background: 'var(--rent-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {cover ? (
                      <img src={cover} alt={title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: 'var(--rent-ink-3)' }}>
                        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {title}
                    </div>
                    <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.address || '—'}
                    </div>
                    <div className="rent-text-sm rent-text-bold" style={{ marginTop: 6, color: 'var(--rent-primary)' }}>
                      {current > 0 ? `${formatMoney(current, item.currency || 'THB')}${t('tenantMy.favoritesPerMonth')}` : '—'}
                      {subscribed > 0 && subscribed !== current ? (
                        <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                          {t('tenantMy.alertSubscribedPrice', { price: formatMoney(subscribed, item.currency || 'THB') })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="rent-btn rent-btn--ghost rent-btn--sm"
                  style={{ flexShrink: 0, marginLeft: 8 }}
                  onClick={() => { void unsubscribe(item) }}
                >
                  {t('tenantMy.alertRemove')}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TenantPriceAlerts
