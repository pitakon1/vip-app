import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import useAuthStore from '@/stores/auth'
import { viewingsApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import StateBlock from '@/components/StateBlock'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 我的看房（/viewings/mine）。
 * 由「我的 - 常用功能 - 我的看房」进入；待确认/已确认的预约可本人取消
 * （后端 POST /viewings/{id}/cancel 只认 requester_user_id）。
 */

const CANCELLABLE = ['pending', 'confirmed']

const pickList = (res: any): any[] => {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

const fmtTime = (x?: string) => (x ? String(x).slice(0, 16).replace('T', ' ') : '—')

const buildStatus = (t: (k: string) => string): Record<string, { text: string; cls: string }> => ({
  pending: { text: t('viewing.status.pending'), cls: 'warning' },
  confirmed: { text: t('viewing.status.confirmed'), cls: 'primary' },
  completed: { text: t('viewing.status.completed'), cls: 'success' },
  cancelled: { text: t('viewing.status.cancelled'), cls: 'neutral' },
  no_show: { text: t('viewing.status.no_show'), cls: 'error' }
})

export default function TenantViewingsPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const [busyId, setBusyId] = useState<string | null>(null)
  const STATUS = buildStatus(t)

  const { data, loading, error, refresh } = useSwrCache<any[]>({
    key: `tenant:viewings:${uid}`,
    fetcher: async () => pickList(await viewingsApi.mine()),
  })
  const items = data ?? []

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('viewing.listTitle') })
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  const cancel = async (id: string) => {
    const res = await Taro.showModal({
      title: t('viewing.cancel'),
      content: t('viewing.cancelConfirm'),
      confirmText: t('viewing.cancel'),
      cancelText: t('common.cancel'),
    })
    if (!res.confirm) return
    setBusyId(id)
    try {
      await viewingsApi.cancel(id)
      Taro.showToast({ title: t('viewing.cancelOk'), icon: 'success' })
      await refresh()
    } catch (e: any) {
      const code = e?.statusCode ?? e?.response?.status
      Taro.showToast({
        title: code === 409 ? t('viewing.cancelDenied') : t('viewing.cancelFail'),
        icon: 'none',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <View className='tenant-viewings-page'>
      <ShellHeader title={t('viewing.listTitle')} />
      <View className='page-container'>
        <View className='card card--list'>
          {loading && items.length === 0 && (
            <StateBlock loading text={t('common.loading')} />
          )}
          {!loading && error && items.length === 0 && (
            <StateBlock
              error
              text={t('viewing.loadFailed')}
              retryText={t('common.tapRetry')}
              onRetry={() => refresh(true)}
            />
          )}
          {!loading && !error && items.length === 0 && (
            <StateBlock empty text={t('viewing.empty')} icon='calendar' />
          )}
          {items.map((v, idx) => {
            const meta = STATUS[String(v?.status ?? '')] ?? STATUS.pending
            const cancellable = CANCELLABLE.includes(String(v?.status ?? ''))
            return (
              <View key={v?.id ?? idx} className='viewing-row'>
                <View
                  className='viewing-row__main'
                  onClick={() => {
                    if (v?.property_id) {
                      Taro.navigateTo({
                        url: `/pages/tenant/property-detail/index?id=${v.property_id}`,
                      })
                    }
                  }}
                >
                  <View className='viewing-row__left'>
                    <Text className='viewing-row__title'>
                      {v?.property_title || t('viewing.untitled')}
                    </Text>
                    <Text className='viewing-row__meta'>{fmtTime(v?.scheduled_at)}</Text>
                  </View>
                  <View className={`viewing-row__badge viewing-row__badge--${meta.cls}`}>
                    <Text>{meta.text}</Text>
                  </View>
                </View>
                {cancellable && (
                  <View
                    className='viewing-row__cancel'
                    onClick={() => busyId !== v?.id && cancel(String(v?.id))}
                  >
                    <Text>
                      {busyId === v?.id ? t('viewing.cancelling') : t('viewing.cancel')}
                    </Text>
                  </View>
                )}
              </View>
            )
          })}
        </View>
      </View>
    </View>
  )
}
