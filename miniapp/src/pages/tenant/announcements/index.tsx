import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { announcementsApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import StateBlock from '@/components/StateBlock'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 小区公告（/pages/tenant/announcements/index）。
 * 数据来自 GET /announcements/mine：租客生效租约所在楼盘 + 平台公告，
 * 由物业/员工后台通过 POST /announcements 发布。
 */

const pickList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const fmtDate = (x?: string) => (x ? String(x).slice(0, 10) : '—')

export default function TenantAnnouncementsPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'

  const { data, loading, error, refresh } = useSwrCache<any[]>({
    key: `tenant:announcements:${uid}`,
    fetcher: async () => pickList(await announcementsApi.mine()),
  })
  const items = data ?? []

  const catText = (cat?: string) => {
    if (cat === 'maintenance') return t('ann.cat.maintenance')
    if (cat === 'event') return t('ann.cat.event')
    if (cat === 'rule') return t('ann.cat.rule')
    return t('ann.cat.notice')
  }

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('ann.title') })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  return (
    <View className='tenant-announcements-page'>
      <ShellHeader title={t('ann.title')} />
      <View className='page-container'>
        {loading && items.length === 0 && <StateBlock loading text={t('common.loading')} />}
        {!loading && error && items.length === 0 && (
          <StateBlock
            error
            text={t('ann.loadFailed')}
            retryText={t('common.tapRetry')}
            onRetry={() => refresh(true)}
          />
        )}
        {!loading && !error && items.length === 0 && (
          <StateBlock empty text={t('ann.empty')} icon='megaphone' />
        )}
        {items.map((a) => (
          <View key={a?.id} className='ann-card'>
            <View className='ann-card__head'>
              <Text className={`ann-chip ann-chip--${a?.category ?? 'notice'}`}>{catText(a?.category)}</Text>
              {a?.is_pinned && <Text className='ann-chip ann-chip--pinned'>{t('ann.pinned')}</Text>}
              <Text className='ann-card__scope'>
                {a?.scope === 'platform' ? t('ann.scopePlatform') : a?.project_name || ''}
              </Text>
            </View>
            <Text className='ann-card__title'>{a?.title}</Text>
            <Text className='ann-card__content'>{a?.content}</Text>
            <Text className='ann-card__meta'>
              {`${fmtDate(a?.published_at)}${a?.publisher_name ? ` · ${a.publisher_name}` : ''}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
