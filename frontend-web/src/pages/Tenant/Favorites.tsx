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
 * 我的收藏（/tenant/favorites）
 * 由「我的 - 常用功能 - 我的收藏」进入；与 App / 小程序同口径：
 * 收藏的是房源（property），列表接口附带公开上架单 id 用于跳转公开详情页。
 * 上架单已下架/保鲜过期时后端 listing_id 为空，此时只展示房源信息并提示不可跳转，
 * 不再拼一个必然 404/403 的详情链接。
 */

interface FavoriteItem {
  id: string
  property_id: string
  listing_id: string | null
  title: string | null
  room_number: string | null
  address: string | null
  monthly_rent: number | null
  currency: string | null
  photo: unknown
  status: string | null
}

const TenantFavorites = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryKey = ['tenant-favorites', uid]

  const q = useCachedQuery<FavoriteItem[]>({
    queryKey,
    cacheKey: `tenant-favorites:${uid}`,
    queryFn: async () => {
      const res = await api.get('/favorites', { params: { page: 1, page_size: DETAIL_PAGE_SIZE } })
      const payload = res.data?.data ?? res.data
      return payload?.items ?? (Array.isArray(payload) ? payload : [])
    },
  })
  const items = q.data ?? []
  const loading = q.isPending && !q.data

  const unfavorite = async (item: FavoriteItem) => {
    try {
      await api.delete(`/favorites/${item.property_id}`)
      queryClient.setQueryData<FavoriteItem[]>(queryKey, (prev) =>
        (prev ?? []).filter((it) => it.property_id !== item.property_id),
      )
      // 房源列表/门户卡片的心形状态共用这些缓存，取消后一起失效
      void queryClient.invalidateQueries({ queryKey: ['public-listings-fav'] })
      void queryClient.invalidateQueries({ queryKey: ['tenant-home-fav'] })
      message.success(t('tenantMy.unfavorited'))
    } catch {
      message.error(t('browse.favFailed'))
    }
  }

  const open = (item: FavoriteItem) => {
    if (item.listing_id) {
      navigate(`/listing/${item.listing_id}`)
      return
    }
    message.info(t('tenantMy.favoritesDelisted'))
  }

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('tenantMy.favorites')}</h3>
        {items.length > 0 && (
          <span className="rent-text-sm rent-text-muted">
            {t('tenantMy.favoritesCount', { count: items.length })}
          </span>
        )}
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
          <>
            <DataState
              empty
              emptyTitle={t('tenantMy.favoritesEmpty')}
              emptySub={t('tenantMy.favoritesEmptySub')}
            />
            <div style={{ textAlign: 'center', paddingBottom: 16 }}>
              <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => navigate('/tenant/listings')}>
                {t('tenantMy.favoritesBrowse')}
              </button>
            </div>
          </>
        ) : (
          items.map((item, idx) => {
            const cover = photoUrl(item.photo)
            const price = item.monthly_rent != null
              ? `${formatMoney(Number(item.monthly_rent), item.currency || 'THB')}${t('tenantMy.favoritesPerMonth')}`
              : '—'
            return (
              <div
                key={item.id}
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
                      <img src={cover} alt={item.title ?? ''} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: 'var(--rent-ink-3)' }}>
                        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title || t('tenantMy.favoritesNoTitle')}
                    </div>
                    <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.address || '—'}
                    </div>
                    <div className="rent-text-sm rent-text-bold" style={{ marginTop: 6, color: 'var(--rent-primary)' }}>
                      {price}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="rent-btn rent-btn--ghost rent-btn--sm"
                  style={{ flexShrink: 0, marginLeft: 8 }}
                  onClick={() => { void unfavorite(item) }}
                  aria-label={t('tenantMy.favoritesRemove')}
                  title={t('tenantMy.favoritesRemove')}
                >
                  {t('tenantMy.favoritesRemove')}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TenantFavorites
