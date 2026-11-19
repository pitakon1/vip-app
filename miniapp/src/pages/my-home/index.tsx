/**
 * C 端「我家」Tab（业主 / 租客 / 未登录访客统一）。
 *
 * 信息结构与 App `screens/tenant/MyHomeScreen.tsx` 完全对齐（贝壳「我家」）：
 *   1. 房产卡（多套可切换；未绑定为空态插画卡）
 *   2. 一排等大四列功能宫格
 *   3. 分组行卡（分区标题 + 结构一致的行）
 * 文档中心 / 房屋档案 / 资料下载不进本页；合同只以「待签署」待办行出现。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi, leasesApi, paymentsApi, propertyBindingsApi, chatApi } from '@/services/api'
import { resolveMediaUrl } from '@/lib/api'
import { isUnpaid } from '@/utils/payment'
import { fmtDate } from '@/utils/format'
import { iconStyle, type IconKey } from '@/utils/icons'
import { useI18n } from '@/i18n'
import BottomNav, { type NavRole } from '@/components/BottomNav'
import StatusTop from '@/components/StatusTop'
import './index.scss'

interface GridItem {
  key: string
  label: string
  icon: IconKey
  path?: string
  action?: 'binding'
  badge?: number
}

interface RowItem {
  key: string
  label: string
  meta?: string
  icon: IconKey
  path?: string
  action?: 'binding' | 'manager'
  tone?: 'default' | 'warn'
}

interface RowSection {
  key: string
  title: string
  rows: RowItem[]
}

const isActiveLease = (lease: any) => {
  const status = String(lease?.status ?? '').toLowerCase()
  if (status && status !== 'active') return false
  const end = new Date(lease?.end_date || lease?.endDate || '').getTime()
  return Number.isNaN(end) ? true : end > Date.now()
}

const propTitle = (property: any, fallback: string) =>
  property?.name ||
  (property?.project_name
    ? `${property.project_name}·${property.room_number ?? ''}`
    : property?.room_number || property?.address || fallback)

const propAddress = (property: any) =>
  [property?.district, property?.city, property?.address].filter(Boolean).join(' · ')

const propCover = (property: any): string => {
  const raw =
    property?.cover_image ||
    property?.cover_url ||
    property?.photos?.[0] ||
    property?.images?.[0] ||
    ''
  const value = typeof raw === 'string' ? raw : raw?.url
  return resolveMediaUrl(value) || ''
}

export default function MyHomePage() {
  const { t } = useI18n()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage)
  const role = useAuthStore((s) => s.user?.role)

  const navRole: NavRole = !token ? 'guest' : role === 'owner' ? 'owner' : 'tenant'

  const [properties, setProperties] = useState<any[]>([])
  const [lease, setLease] = useState<any>(null)
  const [binding, setBinding] = useState<any>(null)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) {
      setProperties([])
      setLease(null)
      setBinding(null)
      setUnpaidCount(0)
      return
    }
    const [propsRes, leaseRes, bindRes, payRes] = await Promise.allSettled([
      ownerApi.properties(),
      leasesApi.mine(),
      propertyBindingsApi.mine(),
      paymentsApi.mine()
    ])
    if (propsRes.status === 'fulfilled') {
      const payload: any = propsRes.value
      const list = Array.isArray(payload) ? payload : payload?.items ?? []
      setProperties(Array.isArray(list) ? list : [])
    } else {
      setProperties([])
    }
    if (leaseRes.status === 'fulfilled') {
      const payload: any = leaseRes.value
      const list = Array.isArray(payload) ? payload : payload?.items ?? []
      setLease((Array.isArray(list) ? list : []).find(isActiveLease) ?? null)
    } else {
      setLease(null)
    }
    if (bindRes.status === 'fulfilled') {
      const payload: any = bindRes.value
      const list = Array.isArray(payload) ? payload : payload?.items ?? []
      const sorted = [...(Array.isArray(list) ? list : [])].sort(
        (a, b) => new Date(b?.created_at ?? 0).getTime() - new Date(a?.created_at ?? 0).getTime()
      )
      setBinding(sorted[0] ?? null)
    } else {
      setBinding(null)
    }
    if (payRes.status === 'fulfilled') {
      const payload: any = payRes.value
      const list = Array.isArray(payload) ? payload : payload?.items ?? []
      setUnpaidCount((Array.isArray(list) ? list : []).filter(isUnpaid).length)
    } else {
      setUnpaidCount(0)
    }
  }, [token])

  const refresh = useCallback(async () => {
    await load()
    setLoading(false)
  }, [load])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDidShow(() => {
    loadFromStorage()
    void refresh()
  })

  usePullDownRefresh(async () => {
    await refresh()
    Taro.stopPullDownRefresh()
  })

  const go = useCallback(
    (path?: string, action?: 'binding' | 'manager') => {
      if (!token) {
        Taro.navigateTo({ url: '/pages/login/index' })
        return
      }
      if (action === 'binding') {
        Taro.navigateTo({ url: '/pages/owner/properties/index?add=1' })
        return
      }
      if (action === 'manager') {
        // 专属管家：后端 /chat/support 幂等返回与平台客服（管理员）的会话，
        // 直接进入真实聊天页，不再落到帮助中心静态页。
        chatApi
          .support()
          .then((res: any) => {
            const conv = res?.data ?? res
            const id = conv?.id ?? conv?.conversation_id
            if (!id) throw new Error('missing conversation')
            Taro.navigateTo({ url: `/pages/chat/detail/index?id=${id}` })
          })
          .catch(() => {
            Taro.showToast({ title: t('myHome.managerError'), icon: 'none' })
          })
        return
      }
      if (path) Taro.navigateTo({ url: path })
    },
    [token, t]
  )

  const bindingStatus = String(binding?.status ?? '').toLowerCase()
  const hasPendingBinding = bindingStatus === 'pending' || bindingStatus === 'reviewing'
  const hasRejectedBinding = bindingStatus === 'rejected'
  const mode: 'owner' | 'tenant' | 'empty' =
    properties.length > 0 ? 'owner' : lease ? 'tenant' : 'empty'

  const gridItems = useMemo<GridItem[]>(() => {
    if (mode === 'owner') {
      return [
        { key: 'income', label: t('myHome.gridIncome'), icon: 'chart', path: '/pages/owner/income/index' },
        { key: 'properties', label: t('myHome.gridProperties'), icon: 'home', path: '/pages/owner/properties/index' },
        { key: 'marketing', label: t('myHome.gridMarketing'), icon: 'megaphone', path: '/pages/owner/marketing/index' },
        { key: 'services', label: t('myHome.gridServices'), icon: 'sparkles', path: '/pages/svc/services/index' }
      ]
    }
    if (mode === 'tenant') {
      return [
        { key: 'bill', label: t('myHome.gridBill'), icon: 'card', path: '/pages/tenant/payments/index', badge: unpaidCount },
        { key: 'repair', label: t('myHome.gridRepair'), icon: 'edit', path: '/pages/tenant/maintenance/index' },
        { key: 'contract', label: t('myHome.gridContract'), icon: 'doc', path: '/pages/contract/index' },
        { key: 'lease', label: t('myHome.gridLease'), icon: 'tag', path: '/pages/tenant/leases/index' }
      ]
    }
    return [
      { key: 'search', label: t('myHome.gridSearch'), icon: 'search', path: '/pages/public/listings/index' },
      { key: 'new', label: t('myHome.gridNew'), icon: 'building', path: '/pages/tenant/category-new/index' },
      { key: 'community', label: t('myHome.gridCommunity'), icon: 'location', path: '/pages/public/communities/index' },
      { key: 'support', label: t('myHome.gridSupport'), icon: 'headset', path: '/pages/help/index' }
    ]
  }, [mode, t, unpaidCount])

  const sections = useMemo<RowSection[]>(() => {
    const todo: RowItem[] = []
    if (hasRejectedBinding) {
      todo.push({
        key: 'binding',
        label: t('myHome.bindingRejected'),
        meta: t('myHome.bindingRejectedMeta'),
        icon: 'bell',
        action: 'binding',
        tone: 'warn'
      })
    }
    if (hasPendingBinding) {
      todo.push({
        key: 'binding',
        label: t('myHome.bindingPending'),
        meta: t('myHome.bindingPendingMeta'),
        icon: 'clock',
        action: 'binding'
      })
    }
    if (unpaidCount > 0) {
      todo.push({
        key: 'bill',
        label: mode === 'owner' ? t('myHome.todoOwnerBill') : t('myHome.todoBill'),
        meta: `${unpaidCount} ${t('myHome.todoBillUnit')}`,
        icon: 'card',
        path: '/pages/tenant/payments/index',
        tone: 'warn'
      })
    }
    if (lease?.end_date) {
      const days = Math.round((new Date(lease.end_date).getTime() - Date.now()) / 86400000)
      if (days >= 0 && days <= 60) {
        todo.push({
          key: 'lease',
          label: t('myHome.todoLease'),
          meta: `${days} ${t('myHome.todoDayUnit')}`,
          icon: 'calendar',
          path: '/pages/tenant/leases/index',
          tone: 'warn'
        })
      }
    }

    const result: RowSection[] = []
    if (todo.length > 0) {
      result.push({ key: 'todo', title: t('myHome.todo'), rows: todo })
    }

    if (mode === 'owner') {
      result.push({
        key: 'services',
        title: t('myHome.services'),
        rows: [
          { key: 'income', label: t('myHome.svcIncome'), meta: t('myHome.viewDetail'), icon: 'chart', path: '/pages/owner/income/index' },
          { key: 'properties', label: t('myHome.svcProperties'), meta: t('myHome.svcPropertiesMeta'), icon: 'home', path: '/pages/owner/properties/index' },
          { key: 'marketing', label: t('myHome.svcMarketing'), meta: t('myHome.svcMarketingMeta'), icon: 'megaphone', path: '/pages/owner/marketing/index' },
          { key: 'orders', label: t('myHome.svcOrders'), meta: t('myHome.viewDetail'), icon: 'doc', path: '/pages/tenant/deals/index' }
        ]
      })
    } else if (mode === 'tenant') {
      result.push({
        key: 'services',
        title: t('myHome.services'),
        rows: [
          { key: 'bill', label: t('myHome.svcBill'), meta: t('myHome.viewDetail'), icon: 'card', path: '/pages/tenant/payments/index' },
          { key: 'lease', label: t('myHome.svcLease'), meta: t('myHome.viewDetail'), icon: 'tag', path: '/pages/tenant/leases/index' },
          { key: 'value', label: t('value.title'), meta: t('value.entryMeta'), icon: 'chart', path: '/pages/tenant/valuation/index' },
          { key: 'orders', label: t('myHome.svcOrders'), meta: t('myHome.viewDetail'), icon: 'doc', path: '/pages/tenant/deals/index' },
          { key: 'value', label: t('myHome.svcValue'), meta: t('myHome.svcValueMeta'), icon: 'sparkles', path: '/pages/svc/services/index' }
        ]
      })
    } else {
      result.push({
        key: 'guide',
        title: t('myHome.guide'),
        rows: [
          { key: 'claim', label: t('myHome.claim'), meta: t('myHome.claimMeta'), icon: 'home', action: 'binding' },
          { key: 'add', label: t('myHome.addProperty'), meta: t('myHome.addPropertyMeta'), icon: 'building', action: 'binding' },
          { key: 'help', label: t('myHome.help'), meta: t('myHome.helpMeta'), icon: 'headset', path: '/pages/help/index' }
        ]
      })
    }

    result.push({
      key: 'community',
      title: t('myHome.community'),
      rows: [
        { key: 'notice', label: t('myHome.notice'), meta: t('myHome.noticeMeta'), icon: 'megaphone', path: '/pages/tenant/announcements/index' },
        { key: 'manager', label: t('myHome.manager'), meta: t('myHome.managerMeta'), icon: 'user', action: 'manager' }
      ]
    })

    return result
  }, [mode, t, unpaidCount, lease, hasPendingBinding, hasRejectedBinding])

  const renderPropertyCard = () => {
    if (mode === 'empty' && !hasPendingBinding && !hasRejectedBinding) {
      return (
        <View className='mh-card mh-prop mh-prop--empty'>
          <View className='mh-empty'>
            <View className='mh-empty__art'>
              <View className='icon-svg' style={iconStyle('home', 56)} />
              <View className='mh-empty__dot' />
            </View>
            <View className='mh-empty__body'>
              <Text className='mh-empty__title'>{t('myHome.emptyTitle')}</Text>
              <Text className='mh-empty__desc'>{t('myHome.emptyDesc')}</Text>
            </View>
          </View>
          <View className='mh-empty__actions'>
            <View className='mh-btn mh-btn--primary' onClick={() => go(undefined, 'binding')}>
              <Text>{t('myHome.claim')}</Text>
            </View>
            <View className='mh-btn mh-btn--ghost' onClick={() => go(undefined, 'binding')}>
              <Text>{t('myHome.addProperty')}</Text>
            </View>
          </View>
        </View>
      )
    }

    if (mode === 'empty') {
      const rejected = hasRejectedBinding
      return (
        <View className='mh-card mh-prop' onClick={() => go(undefined, 'binding')}>
          <View className='mh-state'>
            <View className={`mh-state__icon${rejected ? ' mh-state__icon--warn' : ''}`}>
              <View className='icon-svg' style={iconStyle(rejected ? 'bell' : 'clock', 36)} />
            </View>
            <View className='mh-state__body'>
              <Text className='mh-state__title'>
                {rejected ? t('myHome.bindingRejected') : t('myHome.bindingPending')}
              </Text>
              <Text className='mh-state__desc'>
                {rejected
                  ? binding?.reject_reason || binding?.reason || t('myHome.bindingRejectedMeta')
                  : t('myHome.bindingPendingMeta')}
              </Text>
            </View>
            <Text className='mh-chevron'>›</Text>
          </View>
        </View>
      )
    }

    const isOwner = mode === 'owner'
    const activeProperty = properties[Math.min(activeIdx, Math.max(properties.length - 1, 0))]
    const cover = isOwner ? propCover(activeProperty) : ''
    const title = isOwner
      ? propTitle(activeProperty, t('listingFallback'))
      : lease?.property_name || lease?.room_number || lease?.address || t('nav.myLease')
    const meta = isOwner
      ? `${t('myHome.ownerMetaPrefix')} ${properties.length} ${t('myHome.ownerMetaUnit')}`
      : `${fmtDate(lease?.start_date || lease?.startDate)} - ${fmtDate(lease?.end_date || lease?.endDate)}`
    const address = isOwner ? propAddress(activeProperty) : lease?.address || ''

    return (
      <View
        className='mh-card mh-prop'
        onClick={() =>
          go(isOwner ? '/pages/owner/properties/index' : '/pages/tenant/leases/index')
        }
      >
        <View className='mh-prop__row'>
          {cover ? (
            <Image className='mh-prop__cover' src={cover} mode='aspectFill' />
          ) : (
            <View className='mh-prop__cover mh-prop__cover--fallback'>
              <View className='icon-svg' style={iconStyle(isOwner ? 'home' : 'tag', 48)} />
            </View>
          )}
          <View className='mh-prop__info'>
            <View className='mh-prop__badge-row'>
              <Text className='mh-prop__badge'>
                {isOwner ? t('myHome.ownerBadge') : t('myHome.tenantBadge')}
              </Text>
              {isOwner && properties.length > 1 ? (
                <Text
                  className='mh-prop__switch'
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveIdx((idx) => (idx + 1) % properties.length)
                  }}
                >
                  {t('myHome.switch')}
                </Text>
              ) : null}
            </View>
            <Text className='mh-prop__title'>{title}</Text>
            <Text className='mh-prop__meta'>{meta}</Text>
            {address ? <Text className='mh-prop__address'>{address}</Text> : null}
          </View>
          <Text className='mh-chevron'>›</Text>
        </View>
        {isOwner && properties.length > 1 ? (
          <View className='mh-dots'>
            {Array.from({ length: Math.min(properties.length, 5) }).map((_, idx) => {
              const dotIdx =
                properties.length <= 5
                  ? idx
                  : Math.round((activeIdx / (properties.length - 1)) * 4)
              return <View key={idx} className={`mh-dot${dotIdx === idx ? ' mh-dot--active' : ''}`} />
            })}
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View className='mh-page'>
      <StatusTop background='var(--bg)' />

      <View className='mh-head'>
        <Text className='mh-head__title'>{t('myHome.title')}</Text>
        <Text className='mh-head__sub'>
          {user?.full_name ? `${user.full_name}，` : ''}
          {t('myHome.subtitle')}
        </Text>
      </View>

      {loading ? (
        <View className='mh-loading'>{t('common.loading')}</View>
      ) : (
        <>
          {renderPropertyCard()}

          <View className='mh-card mh-grid'>
            {gridItems.map((item) => (
              <View key={item.key} className='mh-grid__item' onClick={() => go(item.path, item.action)}>
                <View className='mh-grid__icon'>
                  <View className='icon-svg' style={iconStyle(item.icon, 48)} />
                  {item.badge ? (
                    <Text className='mh-grid__badge'>{item.badge > 99 ? '99+' : item.badge}</Text>
                  ) : null}
                </View>
                <Text className='mh-grid__label'>{item.label}</Text>
              </View>
            ))}
          </View>

          {sections.map((section) => (
            <View key={section.key} className='mh-card mh-section'>
              <Text className='mh-section__title'>{section.title}</Text>
              {section.rows.map((row, idx) => (
                <View
                  key={row.key}
                  className={`mh-row${idx < section.rows.length - 1 ? ' mh-row--border' : ''}`}
                  onClick={() => go(row.path, row.action)}
                >
                  <View className='mh-row__icon'>
                    <View className='icon-svg' style={iconStyle(row.icon, 32)} />
                  </View>
                  <Text className='mh-row__label'>{row.label}</Text>
                  {row.meta ? (
                    <Text className={`mh-row__meta${row.tone === 'warn' ? ' mh-row__meta--warn' : ''}`}>
                      {row.meta}
                    </Text>
                  ) : null}
                  <Text className='mh-chevron'>›</Text>
                </View>
              ))}
            </View>
          ))}
        </>
      )}

      <BottomNav role={navRole} active='myhome' />
    </View>
  )
}
