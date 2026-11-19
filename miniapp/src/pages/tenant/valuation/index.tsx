import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { leasesApi, propertiesApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import StateBlock from '@/components/StateBlock'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 房屋估价（/pages/tenant/valuation/index）。
 * 取生效租约房源 → GET /properties/{id}/value-estimate，
 * 展示估算区间、单价与数据口径，并标注「估算参考，非评估报告」。
 */

const pickList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const money = (v?: number | null) =>
  v == null ? '—' : `฿${Number(v).toLocaleString()}`

export default function TenantValuationPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'

  const { data, loading, error, refresh } = useSwrCache<{ property: any; estimate: any }>({
    key: `tenant:valuation:${uid}`,
    fetcher: async () => {
      const leases = pickList(await leasesApi.mine())
      const active = leases.find((l: any) => String(l?.status) === 'active')
      if (!active?.property_id) return { property: null, estimate: null }
      const [estRes, propRes] = await Promise.all([
        propertiesApi.valueEstimate(active.property_id),
        propertiesApi.get(active.property_id),
      ])
      return {
        property: (propRes as any)?.data ?? propRes,
        estimate: (estRes as any)?.data ?? estRes,
      }
    },
  })

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('value.title') })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  const property = data?.property
  const est = data?.estimate

  const basisText = (() => {
    if (!est?.basis) return ''
    if (est.basis === 'project_avg_price') return t('value.basisProject')
    if (est.basis === 'sale_listing_median')
      return t('value.basisSale').replace('{n}', String(est.sample_count ?? 0))
    return t('value.basisRent')
  })()

  return (
    <View className='tenant-valuation-page'>
      <ShellHeader title={t('value.title')} />
      <View className='page-container'>
        {loading && !data && <StateBlock loading text={t('common.loading')} />}
        {!loading && error && !data && (
          <StateBlock
            error
            text={t('value.loadFail')}
            retryText={t('common.tapRetry')}
            onRetry={() => refresh(true)}
          />
        )}
        {!loading && !error && data && !property && (
          <View className='card'>
            <StateBlock empty text={t('value.noHome')} icon='home' />
            <Text className='valuation-empty-sub'>{t('value.noHomeSub')}</Text>
          </View>
        )}
        {property && (
          <>
            <View className='valuation-hero'>
              <Text className='valuation-hero__label'>{t('value.rangeLabel')}</Text>
              <Text className='valuation-hero__value'>
                {est?.available ? `${money(est.low)} – ${money(est.high)}` : '—'}
              </Text>
              <Text className='valuation-hero__sub'>
                {property.room_number || property.address || t('value.untitled')}
              </Text>
              {est?.available && (
                <Text className='valuation-hero__sub'>
                  {`${est.size_sqm ?? '—'} ㎡ · ${money(est.unit_price)}/㎡`}
                </Text>
              )}
            </View>

            {est?.available ? (
              <View className='card'>
                <View className='valuation-row'>
                  <Text className='valuation-row__label'>{t('value.estimateLabel')}</Text>
                  <Text className='valuation-row__value'>{money(est.estimate)}</Text>
                </View>
                <View className='valuation-row'>
                  <Text className='valuation-row__label'>{t('value.sizeLabel')}</Text>
                  <Text className='valuation-row__value'>{`${est.size_sqm ?? '—'} ㎡`}</Text>
                </View>
                <View className='valuation-row'>
                  <Text className='valuation-row__label'>{t('value.unitLabel')}</Text>
                  <Text className='valuation-row__value'>{`${money(est.unit_price)}/㎡`}</Text>
                </View>
                <View className='valuation-row'>
                  <Text className='valuation-row__label'>{t('value.basisLabel')}</Text>
                  <Text className='valuation-row__value'>{basisText}</Text>
                </View>
                <View className='valuation-row valuation-row--last'>
                  <Text className='valuation-row__label'>{t('value.asOf')}</Text>
                  <Text className='valuation-row__value'>{est.as_of ?? '—'}</Text>
                </View>
              </View>
            ) : (
              <View className='card'>
                <Text className='valuation-empty-sub'>
                  {est?.reason === 'missing_area' ? t('value.missingArea') : t('value.noSample')}
                </Text>
              </View>
            )}

            <Text className='valuation-disclaimer'>{t('value.disclaimer')}</Text>
          </>
        )}
      </View>
    </View>
  )
}
