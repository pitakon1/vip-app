import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { leasesApi, propertiesApi, dashboardApi } from '@/services/api'
import { MAX_PAGE_SIZE } from '@/lib/api'
import { fmtMoney } from '@/utils/format'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

interface LeaseItem {
  id: string
  property_id?: string
  tenant_id?: string
  start_date?: string
  end_date?: string
  monthly_rent?: number
  currency?: string
  deposit_amount?: number
  status?: string
  [key: string]: any
}

// 后端 LeaseStatus：active / expired / terminated / pending
const STATUS_META: Record<string, { text: string; badge: string }> = {
  active: { text: 'lease.stActive', badge: 'badge--success' },
  pending: { text: 'lease.stPending', badge: 'badge--info' },
  expired: { text: 'lease.stExpired', badge: 'badge--error' },
  terminated: { text: 'lease.stTerminated', badge: 'badge--neutral' }
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'common.all' },
  { key: 'active', label: 'lease.stActive' },
  { key: 'expiring', label: 'lease.filterExpiring' },
  { key: 'expired', label: 'lease.stExpired' },
  { key: 'terminated', label: 'lease.stTerminated' }
]

const PAGE_SIZE = 100
const EXPIRE_DAYS = 30

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-')

const daysLeft = (end?: string) =>
  end ? Math.ceil((new Date(end).getTime() - Date.now()) / 86400000) : 0

const addDays = (base: string, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function AdminLeasesPage() {
  const { t } = useI18n()
  const [list, setList] = useState<LeaseItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  // 房源 id → 展示名（后端 /leases 不返回房源名，需另行取）
  const [propMap, setPropMap] = useState<Record<string, string>>({})
  // 租约 id → 租客名（仅 /dashboard/expiring-leases 附带）
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({})

  const fetchLeases = async () => {
    setLoading(true)
    try {
      const res: any = await leasesApi.list({ page: 1, page_size: PAGE_SIZE })
      const d = res?.data ?? res
      const items: LeaseItem[] = Array.isArray(d) ? d : d?.items || []
      setList(items)
      setTotal(Number(d?.total ?? items.length))
    } catch (error) {
      console.error('[AdminLeases] 获取合同失败', error)
      Taro.showToast({ title: t('lease.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 房源名称映射（列表接口不含房源名，用房源列表补齐）
  // ⚠️ 技术债：同上，贴住后端硬顶（100）。房源超过 100 套时，
  // 超出部分租约的房源名会回退成「未命名房源」。正确解法是让租约列表
  // 直接带上房源名，或后端提供轻量的 id→房源名 映射接口。
  const fetchProps = async () => {
    try {
      const res: any = await propertiesApi.list({ page: 1, page_size: MAX_PAGE_SIZE })
      const d = res?.data ?? res
      const items: any[] = Array.isArray(d) ? d : d?.items || []
      const map: Record<string, string> = {}
      items.forEach((p) => {
        map[String(p.id)] = p.room_number || p.address || t('lease.unnamedProperty')
      })
      setPropMap(map)
    } catch (error) {
      console.error('[AdminLeases] 获取房源映射失败', error)
    }
  }

  // 即将到期租约（接口附带租客名，用于补齐姓名展示）
  const fetchExpiring = async () => {
    try {
      const res: any = await dashboardApi.expiringLeases()
      const d = res?.data ?? res
      const items: any[] = d?.items || (Array.isArray(d) ? d : [])
      const map: Record<string, string> = {}
      items.forEach((l) => {
        if (l.id && l.tenant_name) map[String(l.id)] = l.tenant_name
      })
      setTenantMap(map)
    } catch (error) {
      console.error('[AdminLeases] 获取临期租约失败', error)
    }
  }

  useDidShow(() => {
    fetchLeases()
    fetchProps()
    fetchExpiring()
  })

  const handleSearch = () => setQuery(keyword.trim())

  // 到期分组：生效中且 30 天内到期
  const isExpiring = (l: LeaseItem) =>
    l.status === 'active' && daysLeft(l.end_date) >= 0 && daysLeft(l.end_date) <= EXPIRE_DAYS

  const visible = useMemo(() => {
    const kw = query.toLowerCase()
    return list.filter((l) => {
      if (filter === 'expiring' && !isExpiring(l)) return false
      if (filter && filter !== 'expiring' && l.status !== filter) return false
      if (!kw) return true
      // 搜索：合同 id 片段 / 租客名 / 房源名
      const hay = [
        String(l.id),
        tenantMap[String(l.id)],
        propMap[String(l.property_id || '')]
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(kw)
    })
  }, [list, filter, query, tenantMap, propMap])

  const stats = useMemo(
    () => ({
      total: total || list.length,
      active: list.filter((l) => l.status === 'active').length,
      expiring: list.filter(isExpiring).length,
      expired: list.filter((l) => l.status === 'expired').length
    }),
    [list, total]
  )

  const openDetail = (l: LeaseItem) => {
    if (!l.property_id) return
    Taro.navigateTo({ url: `/pages/admin/property-detail/index?id=${l.property_id}` })
  }

  // 续约：沿用租期，新租约从原到期日次日起顺延一年（后端 LeaseRenew 需起止日期）
  const renew = (l: LeaseItem) => {
    const start = l.end_date ? addDays(l.end_date, 1) : addDays(new Date().toISOString(), 0)
    const end = addDays(start, 365)
    Taro.showModal({
      title: t('lease.renew'),
      content: t('lease.renewConfirm', {
        start,
        end,
        rent: fmtMoney(l.monthly_rent, l.currency)
      }),
      success: async (r) => {
        if (!r.confirm) return
        try {
          await leasesApi.renew(l.id, {
            start_date: start,
            end_date: end,
            monthly_rent: l.monthly_rent
          })
          Taro.showToast({ title: t('lease.renewed'), icon: 'none' })
          fetchLeases()
        } catch (error) {
          console.error('[AdminLeases] 续约失败', error)
          Taro.showToast({ title: t('lease.renewFailed'), icon: 'none' })
        }
      }
    })
  }

  return (
    <View className='ale-page'>
      {/* 搜索栏 */}
      <View className='ale-search'>
        <Input
          className='ale-search__input'
          value={keyword}
          placeholder={t('lease.searchPlaceholder')}
          confirmType='search'
          onInput={(e: any) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='ale-search__btn' onClick={handleSearch}>
          <Text className='ale-search__btn-text'>{t('common.search')}</Text>
        </View>
      </View>

      {/* 状态筛选 */}
      <ScrollView scrollX className='ale-chips'>
        {FILTERS.map((f) => (
          <View
            key={f.key || 'all'}
            className={`ale-chip ${filter === f.key ? 'ale-chip--active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            <Text className='ale-chip__text'>{t(f.label)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 统计 */}
      <View className='ale-stats'>
        <View className='ale-stat ale-stat--primary'>
          <Text className='ale-stat__value'>{stats.total}</Text>
          <Text className='ale-stat__label'>{t('lease.statTotal')}</Text>
        </View>
        <View className='ale-stat ale-stat--success'>
          <Text className='ale-stat__value'>{stats.active}</Text>
          <Text className='ale-stat__label'>{t('lease.stActive')}</Text>
        </View>
        <View className='ale-stat ale-stat--warning'>
          <Text className='ale-stat__value'>{stats.expiring}</Text>
          <Text className='ale-stat__label'>{t('lease.filterExpiring')}</Text>
        </View>
        <View className='ale-stat ale-stat--error'>
          <Text className='ale-stat__value'>{stats.expired}</Text>
          <Text className='ale-stat__label'>{t('lease.stExpired')}</Text>
        </View>
      </View>

      <View className='ale-section-head'>
        <Text className='ale-section-head__title'>{t('lease.listTitle')}</Text>
        <Text className='ale-section-head__count'>{t('lease.countUnit', { n: visible.length })}</Text>
      </View>

      <ScrollView scrollY className='ale-list'>
        {loading && visible.length === 0 && (
          <StateBlock loading text={t('pub.loading')} />
        )}
        {!loading && visible.length === 0 && (
          <View className='ale-state'>
            <View className='icon-svg' style={iconStyle('doc', 72)} />
            <Text className='ale-state__text'>{t('lease.empty')}</Text>
            <Text className='ale-state__desc'>
              {query || filter ? t('lease.emptyFiltered') : t('lease.emptyNone')}
            </Text>
          </View>
        )}

        {visible.map((l) => {
          const meta = STATUS_META[l.status || ''] || {
            text: l.status || '-',
            badge: 'badge--neutral'
          }
          const expiring = isExpiring(l)
          const left = daysLeft(l.end_date)
          return (
            <View key={l.id} className='ale-card'>
              <View className='ale-card__top'>
                <Text className='ale-card__no'>
                  {t('lease.contractNo', { no: String(l.id).slice(0, 8).toUpperCase() })}
                </Text>
                <Text
                  className={`badge ${expiring ? 'badge--warning' : meta.badge}`}
                >
                  {expiring ? t('lease.expiringIn', { n: left }) : t(meta.text)}
                </Text>
              </View>

              <Text className='ale-card__tenant'>
                {tenantMap[String(l.id)] ||
                  t('lease.tenantWithId', { id: String(l.tenant_id || '').slice(0, 8) })}
              </Text>

              <View className='ale-card__row'>
                <View className='icon-svg icon-svg--sm' style={iconStyle('home', 26)} />
                <Text className='ale-card__row-text'>
                  {propMap[String(l.property_id || '')] || t('lease.unknownProperty')}
                </Text>
              </View>

              <View className='ale-card__row'>
                <View className='icon-svg icon-svg--sm' style={iconStyle('calendar', 26)} />
                <Text className='ale-card__row-text'>
                  {fmtDate(l.start_date)} ~ {fmtDate(l.end_date)}
                </Text>
              </View>

              <View className='ale-card__divider' />

              <View className='ale-card__foot'>
                <View className='ale-card__rent'>
                  <Text className='ale-card__rent-label'>{t('lease.monthlyRent')}</Text>
                  <Text className='ale-card__rent-value'>
                    {fmtMoney(l.monthly_rent, l.currency)}
                  </Text>
                </View>
                <View className='ale-card__actions'>
                  <View className='ale-btn ale-btn--ghost' onClick={() => openDetail(l)}>
                    <Text className='ale-btn__text ale-btn__text--ghost'>{t('lease.viewDetail')}</Text>
                  </View>
                  <View
                    className={`ale-btn ale-btn--primary ${l.status === 'terminated' ? 'ale-btn--disabled' : ''}`}
                    onClick={() => {
                      if (l.status === 'terminated') return
                      renew(l)
                    }}
                  >
                    <Text className='ale-btn__text ale-btn__text--primary'>{t('lease.renew')}</Text>
                  </View>
                </View>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* 底部导航：合同页继承首页高亮（与原型一致） */}
      <BottomNav role='admin' active='dashboard' />
    </View>
  )
}