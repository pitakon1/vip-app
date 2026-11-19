import { useTranslation } from 'react-i18next'
import { Card, Descriptions, Empty, Spin, Alert, Typography } from 'antd'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import api from '@/lib/api'
import { propertiesApi } from '@/services/api'
import DataState from '@/components/DataState'

/**
 * 房屋估价（/tenant/value-estimate）
 * 取当前生效租约房源 → GET /properties/{id}/value-estimate，
 * 展示估算区间、单价与数据口径；明确标注「估算参考，非评估报告」。
 */

const { Title, Text } = Typography

const money = (v?: number | null) =>
  v == null ? '—' : `฿${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const pickList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const TenantValueEstimate = () => {
  const { t } = useTranslation()
  const uid = useAuthStore((s) => s.user?.id) ?? 'anon'

  const q = useCachedQuery<{ property: any | null; estimate: any | null }>({
    queryKey: ['tenant-value-estimate', uid],
    cacheKey: `tenant-value-estimate:${uid}`,
    queryFn: async () => {
      const leases = await api.get('/leases/me')
      const active = pickList(leases.data?.data ?? leases.data).find(
        (l: any) => String(l?.status) === 'active',
      )
      if (!active?.property_id) return { property: null, estimate: null }
      const [estRes, propRes] = await Promise.all([
        propertiesApi.valueEstimate(active.property_id),
        propertiesApi.get(active.property_id),
      ])
      return {
        property: propRes.data?.data ?? propRes.data,
        estimate: estRes.data?.data ?? estRes.data,
      }
    },
  })

  const property = q.data?.property
  const est = q.data?.estimate

  const basisText = (() => {
    if (!est?.basis) return ''
    if (est.basis === 'project_avg_price') return t('tenantValue.basisProject')
    if (est.basis === 'sale_listing_median')
      return t('tenantValue.basisSale').replace('{n}', String(est.sample_count ?? 0))
    return t('tenantValue.basisRent')
  })()

  return (
    <div className="rent-page" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <Title level={4} style={{ marginTop: 0 }}>{t('tenantValue.title')}</Title>

      {q.isError && !q.data ? (
        <DataState
          error={t('tenantValue.loadFail')}
          retryText={t('common.retry')}
          onRetry={() => { void q.refetch() }}
        />
      ) : q.isPending && !q.data ? (
        <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
      ) : !property ? (
        <Card>
          <Empty description={t('tenantValue.noHome')} />
          <div style={{ textAlign: 'center' }} className="rent-text-sm rent-text-muted">
            {t('tenantValue.noHomeSub')}
          </div>
        </Card>
      ) : (
        <>
          <Card
            style={{
              background: 'var(--rent-primary)',
              border: 'none',
              marginBottom: 16,
            }}
            styles={{ body: { padding: 24 } }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 13 }}>
              {t('tenantValue.rangeLabel')}
            </Text>
            <div style={{ color: '#fff', fontSize: 30, fontWeight: 700, margin: '6px 0' }}>
              {est?.available ? `${money(est.low)} – ${money(est.high)}` : '—'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13 }}>
              {property.room_number || property.address || t('tenantValue.untitled')}
              {est?.available ? ` · ${est.size_sqm ?? '—'} ㎡ · ${money(est.unit_price)}/㎡` : ''}
            </div>
          </Card>

          {est?.available ? (
            <Card>
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label={t('tenantValue.estimateLabel')}>
                  {money(est.estimate)}
                </Descriptions.Item>
                <Descriptions.Item label={t('tenantValue.sizeLabel')}>
                  {est.size_sqm ?? '—'} ㎡
                </Descriptions.Item>
                <Descriptions.Item label={t('tenantValue.unitLabel')}>
                  {money(est.unit_price)}/㎡
                </Descriptions.Item>
                <Descriptions.Item label={t('tenantValue.basisLabel')}>
                  {basisText}
                </Descriptions.Item>
                <Descriptions.Item label={t('tenantValue.asOf')}>
                  {est.as_of ?? '—'}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          ) : (
            <Alert
              type="warning"
              showIcon
              message={
                est?.reason === 'missing_area'
                  ? t('tenantValue.missingArea')
                  : t('tenantValue.noSample')
              }
            />
          )}

          <div className="rent-text-sm rent-text-muted" style={{ marginTop: 16, lineHeight: 1.7 }}>
            {t('tenantValue.disclaimer')}
          </div>
        </>
      )}
    </div>
  )
}

export default TenantValueEstimate
