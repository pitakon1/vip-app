import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message, Modal } from 'antd'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { queryClient, useCachedQuery } from '@/lib/queryCache'
import { viewingsApi } from '@/services/api'
import DataState from '@/components/DataState'

/**
 * 我的看房（/tenant/viewings）
 * 由「我的 - 常用功能 - 我的看房」进入；数据来自 GET /viewings/mine。
 * 待确认 / 已确认的预约可由本人取消（POST /viewings/{id}/cancel，后端只认 requester）。
 */

interface ViewingItem {
  id: string
  property_id?: string | null
  /** 公开上架单 id；详情页 /listing/:id 只认它，property_id 会造成 404 */
  listing_id?: string | null
  property_title?: string | null
  property_address?: string | null
  scheduled_at?: string | null
  status?: string | null
}

const CANCELLABLE = ['pending', 'confirmed']

const TenantViewings = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryKey = ['tenant-viewings', uid]
  const [busyId, setBusyId] = useState<string | null>(null)

  const q = useCachedQuery<ViewingItem[]>({
    queryKey,
    cacheKey: `tenant-viewings:${uid}`,
    queryFn: async () => {
      const res = await viewingsApi.mine()
      const payload = res.data?.data ?? res.data
      return payload?.items ?? (Array.isArray(payload) ? payload : [])
    },
  })
  const items = q.data ?? []
  const loading = q.isPending && !q.data

  const statusMeta = (status?: string | null) => {
    const map: Record<string, { text: string; cls: string }> = {
      pending: { text: t('tenantViewing.pending'), cls: 'rent-badge--warning' },
      confirmed: { text: t('tenantViewing.confirmed'), cls: 'rent-badge--primary' },
      completed: { text: t('tenantViewing.completed'), cls: 'rent-badge--success' },
      cancelled: { text: t('tenantViewing.cancelled'), cls: 'rent-badge--neutral' },
      no_show: { text: t('tenantViewing.noShow'), cls: 'rent-badge--error' },
    }
    return map[status || ''] ?? { text: status || '—', cls: 'rent-badge--neutral' }
  }

  const cancel = (v: ViewingItem) => {
    Modal.confirm({
      title: t('tenantViewing.cancel'),
      content: t('tenantViewing.cancelConfirm'),
      okText: t('tenantViewing.cancel'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setBusyId(v.id)
        try {
          await viewingsApi.cancel(v.id)
          message.success(t('tenantViewing.cancelOk'))
          await q.refetch()
        } catch (e: any) {
          const code = e?.response?.status
          message.error(code === 409 ? t('tenantViewing.cancelDenied') : t('tenantViewing.cancelFail'))
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('tenantViewing.title')}</h3>
      </div>
      <div className="rent-card__body" style={{ padding: '8px 16px' }}>
        {q.isError && !q.data ? (
          <DataState
            error={t('tenantViewing.loadFailed')}
            retryText={t('common.retry')}
            onRetry={() => { void q.refetch() }}
          />
        ) : loading && items.length === 0 ? (
          <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
        ) : items.length === 0 ? (
          <DataState
            empty
            emptyTitle={t('tenantViewing.empty')}
            emptySub={t('tenantViewing.emptySub')}
          />
        ) : (
          items.map((v, idx) => {
            const meta = statusMeta(v.status)
            const cancellable = CANCELLABLE.includes(String(v.status ?? ''))
            return (
              <div
                key={v.id}
                className="rent-my__row"
                style={{
                  padding: '14px 0',
                  borderBottom: idx < items.length - 1 ? '1px solid var(--rent-border)' : 'none',
                  cursor: v.listing_id ? 'pointer' : undefined,
                }}
                onClick={() => {
                  if (v.listing_id) navigate(`/listing/${v.listing_id}`)
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.property_title || t('tenantViewing.untitled')}
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 4 }}>
                    {v.scheduled_at ? dayjs(v.scheduled_at).format('YYYY-MM-DD HH:mm') : '—'}
                    {v.property_address ? ` · ${v.property_address}` : ''}
                  </div>
                </div>
                <span className={`rent-badge ${meta.cls}`} style={{ flexShrink: 0, marginLeft: 12 }}>{meta.text}</span>
                {cancellable ? (
                  <button
                    type="button"
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    style={{ flexShrink: 0, marginLeft: 8 }}
                    disabled={busyId === v.id}
                    onClick={(e) => { e.stopPropagation(); cancel(v) }}
                  >
                    {busyId === v.id ? t('tenantViewing.cancelling') : t('tenantViewing.cancel')}
                  </button>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TenantViewings
