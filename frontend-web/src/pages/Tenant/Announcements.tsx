import { useTranslation } from 'react-i18next'
import { Card, Empty, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import { announcementsApi } from '@/services/api'
import DataState from '@/components/DataState'

/**
 * 小区公告（/tenant/announcements）
 * 数据来自 GET /announcements/mine（租客生效租约所在楼盘 + 平台公告）；
 * 内容由物业/员工后台 POST /announcements 发布，属自建数据。
 */

const { Title, Text, Paragraph } = Typography

const TenantAnnouncements = () => {
  const { t } = useTranslation()
  const uid = useAuthStore((s) => s.user?.id) ?? 'anon'

  const q = useCachedQuery<any[]>({
    queryKey: ['tenant-announcements', uid],
    cacheKey: `tenant-announcements:${uid}`,
    queryFn: async () => {
      const res = await announcementsApi.mine()
      const payload = res.data?.data ?? res.data
      return payload?.items ?? (Array.isArray(payload) ? payload : [])
    },
  })

  const items = q.data ?? []

  const catLabel = (cat?: string) => {
    if (cat === 'maintenance') return t('tenantAnn.catMaintenance')
    if (cat === 'event') return t('tenantAnn.catEvent')
    if (cat === 'rule') return t('tenantAnn.catRule')
    return t('tenantAnn.catNotice')
  }
  const catColor = (cat?: string) => {
    if (cat === 'maintenance') return 'gold'
    if (cat === 'event') return 'green'
    if (cat === 'rule') return 'default'
    return 'blue'
  }

  return (
    <div className="rent-page" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <Title level={4} style={{ marginTop: 0 }}>{t('tenantAnn.title')}</Title>
      {q.isError && !q.data ? (
        <DataState
          error={t('tenantAnn.loadFail')}
          retryText={t('common.retry')}
          onRetry={() => { void q.refetch() }}
        />
      ) : q.isPending && !q.data ? (
        <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
      ) : items.length === 0 ? (
        <Card>
          <Empty description={t('tenantAnn.empty')} />
          <div className="rent-text-sm rent-text-muted" style={{ textAlign: 'center' }}>
            {t('tenantAnn.emptySub')}
          </div>
        </Card>
      ) : (
        items.map((a) => (
          <Card key={a.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Tag color={catColor(a.category)}>{catLabel(a.category)}</Tag>
              {a.is_pinned ? <Tag color="red">{t('tenantAnn.pinned')}</Tag> : null}
              <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 'auto' }}>
                {a.scope === 'platform' ? t('tenantAnn.scopePlatform') : a.project_name || ''}
              </span>
            </div>
            <div className="rent-text-bold" style={{ fontSize: 15, marginBottom: 6 }}>{a.title}</div>
            <Paragraph style={{ marginBottom: 8, color: 'var(--rent-text-secondary)' }}>
              {a.content}
            </Paragraph>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {`${a.published_at ? dayjs(a.published_at).format('YYYY-MM-DD') : '—'}${a.publisher_name ? ` · ${a.publisher_name}` : ''}`}
            </Text>
          </Card>
        ))
      )}
    </div>
  )
}

export default TenantAnnouncements
