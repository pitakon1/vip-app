import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { leasesApi, propertiesApi, dashboardApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
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
  active: { text: '生效中', badge: 'badge--success' },
  pending: { text: '待生效', badge: 'badge--info' },
  expired: { text: '已到期', badge: 'badge--error' },
  terminated: { text: '已终止', badge: 'badge--neutral' }
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'active', label: '生效中' },
  { key: 'expiring', label: '即将到期' },
  { key: 'expired', label: '已到期' },
  { key: 'terminated', label: '已终止' }
]

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  THB: '฿',
  EUR: '€',
  USD: '$'
}

const PAGE_SIZE = 100
const EXPIRE_DAYS = 30

const fmtMoney = (v?: number, currency?: string) =>
  `${CURRENCY_SYMBOL[currency || 'THB'] || ''}${Number(v || 0).toLocaleString()}`

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-')

const daysLeft = (end?: string) =>
  end ? Math.ceil((new Date(end).getTime() - Date.now()) / 86400000) : 0

const addDays = (base: string, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function AdminLeasesPage() {
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
      Taro.showToast({ title: '加载合同失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 房源名称映射（列表接口不含房源名，用房源列表补齐）
  const fetchProps = async () => {
    try {
      const res: any = await propertiesApi.list({ page: 1, page_size: 200 })
      const d = res?.data ?? res
      const items: any[] = Array.isArray(d) ? d : d?.items || []
      const map: Record<string, string> = {}
      items.forEach((p) => {
        map[String(p.id)] = p.room_number || p.address || '未命名房源'
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
      title: '续约',
      content: `新租期：${start} ~ ${end}，月租 ${fmtMoney(l.monthly_rent, l.currency)}`,
      success: async (r) => {
        if (!r.confirm) return
        try {
          await leasesApi.renew(l.id, {
            start_date: start,
            end_date: end,
            monthly_rent: l.monthly_rent
          })
          Taro.showToast({ title: '续约成功', icon: 'none' })
          fetchLeases()
        } catch (error) {
          console.error('[AdminLeases] 续约失败', error)
          Taro.showToast({ title: '续约失败', icon: 'none' })
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
          placeholder='搜索合同编号/租客姓名'
          confirmType='search'
          onInput={(e: any) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='ale-search__btn' onClick={handleSearch}>
          <Text className='ale-search__btn-text'>搜索</Text>
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
            <Text className='ale-chip__text'>{f.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 统计 */}
      <View className='ale-stats'>
        <View className='ale-stat ale-stat--primary'>
          <Text className='ale-stat__value'>{stats.total}</Text>
          <Text className='ale-stat__label'>总合同</Text>
        </View>
        <View className='ale-stat ale-stat--success'>
          <Text className='ale-stat__value'>{stats.active}</Text>
          <Text className='ale-stat__label'>生效中</Text>
        </View>
        <View className='ale-stat ale-stat--warning'>
          <Text className='ale-stat__value'>{stats.expiring}</Text>
          <Text className='ale-stat__label'>即将到期</Text>
        </View>
        <View className='ale-stat ale-stat--error'>
          <Text className='ale-stat__value'>{stats.expired}</Text>
          <Text className='ale-stat__label'>已到期</Text>
        </View>
      </View>

      <View className='ale-section-head'>
        <Text className='ale-section-head__title'>合同列表</Text>
        <Text className='ale-section-head__count'>共 {visible.length} 份</Text>
      </View>

      <ScrollView scrollY className='ale-list'>
        {loading && visible.length === 0 && (
          <View className='ale-state'>
            <Text className='ale-state__text'>加载中...</Text>
          </View>
        )}
        {!loading && visible.length === 0 && (
          <View className='ale-state'>
            <View className='icon-svg' style={iconStyle('doc', 72)} />
            <Text className='ale-state__text'>暂无合同</Text>
            <Text className='ale-state__desc'>
              {query || filter ? '换个筛选条件试试' : '还没有生成租约合同'}
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
                <Text className='ale-card__no'>合同 #{String(l.id).slice(0, 8).toUpperCase()}</Text>
                <Text
                  className={`badge ${expiring ? 'badge--warning' : meta.badge}`}
                >
                  {expiring ? `即将到期 · ${left}天` : meta.text}
                </Text>
              </View>

              <Text className='ale-card__tenant'>
                {tenantMap[String(l.id)] || `租客 ${String(l.tenant_id || '').slice(0, 8)}`}
              </Text>

              <View className='ale-card__row'>
                <View className='icon-svg icon-svg--sm' style={iconStyle('home', 26)} />
                <Text className='ale-card__row-text'>
                  {propMap[String(l.property_id || '')] || '未知房源'}
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
                  <Text className='ale-card__rent-label'>月租</Text>
                  <Text className='ale-card__rent-value'>
                    {fmtMoney(l.monthly_rent, l.currency)}
                  </Text>
                </View>
                <View className='ale-card__actions'>
                  <View className='ale-btn ale-btn--ghost' onClick={() => openDetail(l)}>
                    <Text className='ale-btn__text ale-btn__text--ghost'>查看详情</Text>
                  </View>
                  <View
                    className={`ale-btn ale-btn--primary ${l.status === 'terminated' ? 'ale-btn--disabled' : ''}`}
                    onClick={() => {
                      if (l.status === 'terminated') return
                      renew(l)
                    }}
                  >
                    <Text className='ale-btn__text ale-btn__text--primary'>续约</Text>
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