import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { employeesApi, adminUsersApi } from '@/services/api'
import { fmtMoney } from '@/utils/format'
import useAuthStore from '@/stores/auth'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface EmployeeItem {
  id: string
  user_id?: string
  full_name?: string
  email?: string
  employee_no?: string
  employee_code?: string
  department?: string
  position?: string
  phone?: string
  hire_date?: string
  is_active?: boolean
  status?: string
  [key: string]: any
}

// 后端 Employee 无「试用期」字段，按入职 90 天内口径标注
const PROBATION_DAYS = 90

const AVATAR_TONES = ['primary', 'info', 'success', 'warning', 'neutral']

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'active', label: '在职' },
  { key: 'inactive', label: '离职' },
  { key: 'probation', label: '试用期' }
]

const PAGE_SIZE = 100

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-')

const withinDays = (date?: string, days = PROBATION_DAYS) => {
  if (!date) return false
  const t = new Date(date).getTime()
  return !Number.isNaN(t) && Date.now() - t <= days * 86400000
}

const monthPrefixOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export default function AdminEmployeesPage() {
  const [list, setList] = useState<EmployeeItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  // 员工业绩（来源：/employees/leaderboard，按佣金结算累计核算）
  const [perfMap, setPerfMap] = useState<Record<string, { amount: number; deals: number }>>({})
  // 当前登录账号 id（禁止删除自己）
  const currentUserId = useAuthStore((s) => s.user)?.id ?? null

  const remove = async (e: EmployeeItem) => {
    if (!e.user_id) return
    const res = await Taro.showModal({
      title: '删除账号',
      content: `确定删除「${e.full_name || '该员工'}」的账号吗？该操作不可恢复。`
    })
    if (!res.confirm) return
    try {
      await adminUsersApi.deleteUser(e.user_id)
      Taro.showToast({ title: '已删除', icon: 'success' })
      fetchEmployees()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '删除失败', icon: 'none' })
    }
  }

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const res: any = await employeesApi.list({ page: 1, page_size: PAGE_SIZE })
      const d = res?.data ?? res
      const items: EmployeeItem[] = Array.isArray(d) ? d : d?.items || []
      setList(items)
      setTotal(Number(d?.total ?? items.length))
    } catch (error) {
      console.error('[AdminEmployees] 获取员工失败', error)
      Taro.showToast({ title: '加载员工失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchPerformance = async () => {
    try {
      const res: any = await employeesApi.leaderboard()
      const items: any[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
      const map: Record<string, { amount: number; deals: number }> = {}
      items.forEach((p) => {
        map[String(p.id)] = { amount: Number(p.performance || 0), deals: Number(p.deals || 0) }
      })
      setPerfMap(map)
    } catch (error) {
      console.error('[AdminEmployees] 获取员工业绩失败', error)
    }
  }

  useDidShow(() => {
    fetchEmployees()
    fetchPerformance()
  })

  const handleSearch = () => setQuery(keyword.trim())

  const isProbation = (e: EmployeeItem) =>
    e.is_active !== false && e.status !== 'inactive' && withinDays(e.hire_date)

  const visible = useMemo(() => {
    const kw = query.toLowerCase()
    return list.filter((e) => {
      if (filter === 'active' && (e.is_active === false || e.status === 'inactive')) return false
      if (filter === 'inactive' && !(e.is_active === false || e.status === 'inactive')) return false
      if (filter === 'probation' && !isProbation(e)) return false
      if (!kw) return true
      return [e.full_name, e.employee_no, e.employee_code, e.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
  }, [list, filter, query])

  const stats = useMemo(() => {
    const monthPrefix = monthPrefixOf(new Date())
    const inactive = list.filter((e) => e.is_active === false || e.status === 'inactive').length
    return {
      total: total || list.length,
      active: list.length - inactive,
      inactive,
      newThisMonth: list.filter((e) => String(e.hire_date || '').startsWith(monthPrefix)).length
    }
  }, [list, total])

  // 业绩条按团队最高值相对显示（后端无个人目标值）
  const maxPerf = useMemo(
    () => Math.max(1, ...Object.values(perfMap).map((p) => p.amount)),
    [perfMap]
  )

  const callPhone = (phone?: string) => {
    if (!phone) return
    Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {})
  }

  return (
    <View className='ac-page'>
      {/* 统计 2×2 */}
      <View className='ac-stats-row'>
        <View className='ac-stat-card'>
          <Text className='ac-stat-card__value'>{stats.total}</Text>
          <Text className='ac-stat-card__label'>总员工</Text>
          <Text className='badge badge--primary ac-stat-card__badge'>全员</Text>
        </View>
        <View className='ac-stat-card'>
          <Text className='ac-stat-card__value'>{stats.active}</Text>
          <Text className='ac-stat-card__label'>在职</Text>
          <Text className='badge badge--success ac-stat-card__badge'>
            {stats.total ? Math.round((stats.active / stats.total) * 100) : 0}%
          </Text>
        </View>
      </View>
      <View className='ac-stats-row'>
        <View className='ac-stat-card'>
          <Text className='ac-stat-card__value'>{stats.inactive}</Text>
          <Text className='ac-stat-card__label'>离职</Text>
          <Text className='badge badge--neutral ac-stat-card__badge'>已离岗</Text>
        </View>
        <View className='ac-stat-card'>
          <Text className='ac-stat-card__value'>{stats.newThisMonth}</Text>
          <Text className='ac-stat-card__label'>本月新入职</Text>
          <Text className='badge badge--info ac-stat-card__badge'>+{stats.newThisMonth}</Text>
        </View>
      </View>

      {/* 搜索栏 */}
      <View className='ac-search'>
        <Input
          className='ac-search__input'
          value={keyword}
          placeholder='搜索员工姓名/工号'
          confirmType='search'
          onInput={(e: any) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='ac-search__btn' onClick={handleSearch}>
          <Text className='ac-search__btn-text'>搜索</Text>
        </View>
      </View>

      {/* 筛选 */}
      <ScrollView scrollX className='ac-chips'>
        {FILTERS.map((f) => (
          <View
            key={f.key || 'all'}
            className={`ac-chip ${filter === f.key ? 'ac-chip--active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            <Text className='ac-chip__text'>{f.label}</Text>
          </View>
        ))}
      </ScrollView>

      <View className='ac-section-head'>
        <Text className='ac-section-head__title'>员工列表</Text>
        <Text className='ac-section-head__count'>共 {visible.length} 人</Text>
      </View>

      <ScrollView scrollY className='ac-list'>
        {loading && visible.length === 0 && (
          <View className='ac-state'>
            <Text className='ac-state__text'>加载中...</Text>
          </View>
        )}
        {!loading && visible.length === 0 && (
          <View className='ac-state'>
            <View className='icon-svg' style={iconStyle('user', 72)} />
            <Text className='ac-state__text'>暂无员工</Text>
            <Text className='ac-state__desc'>
              {query || filter ? '换个筛选条件试试' : '还没有员工档案'}
            </Text>
          </View>
        )}

        {visible.map((e, index) => {
          const inactive = e.is_active === false || e.status === 'inactive'
          const probation = isProbation(e)
          const badge = inactive
            ? { text: '离职', cls: 'badge--neutral' }
            : probation
            ? { text: '试用期', cls: 'badge--warning' }
            : { text: '在职', cls: 'badge--success' }
          const tone = AVATAR_TONES[index % AVATAR_TONES.length]
          const perf = perfMap[String(e.id)] || perfMap[String(e.user_id || '')] || null
          const percent = perf ? Math.round((perf.amount / maxPerf) * 100) : 0
          return (
            <View key={e.id} className={`ac-card ${inactive ? 'ac-card--dim' : ''}`}>
              <View className='ac-card__avatar-row'>
                <View className={`ac-avatar ac-avatar--${tone}`}>
                  <Text className='ac-avatar__text'>{(e.full_name || '员').slice(0, 1)}</Text>
                </View>
                <View className='ac-card__head'>
                  <Text className='ac-card__name'>{e.full_name || '未命名员工'}</Text>
                  <Text className='ac-card__code'>
                    工号 {e.employee_no || e.employee_code || '-'}
                  </Text>
                </View>
                <Text className={`badge ${badge.cls}`}>{badge.text}</Text>
              </View>

              <Text className='ac-card__position'>
                {[e.position, e.department].filter(Boolean).join(' · ') || '未设置职位/部门'}
              </Text>

              {!!e.phone && (
                <View className='ac-card__phone' onClick={() => callPhone(e.phone)}>
                  <View className='icon-svg icon-svg--sm' style={iconStyle('user', 26)} />
                  <Text className='ac-card__phone-text'>{e.phone}</Text>
                </View>
              )}

              <View className='ac-card__perf'>
                <View className='ac-card__perf-head'>
                  <Text className='ac-card__perf-label'>
                    累计佣金{perf ? ` · 成交 ${perf.deals} 单` : ''}
                  </Text>
                  <Text className='ac-card__perf-value'>
                    {perf ? fmtMoney(perf.amount, 'THB') : '暂无业绩'}
                  </Text>
                </View>
                <View className='ac-progress'>
                  <View className='ac-progress__fill' style={{ width: `${percent}%` }} />
                </View>
                <Text className='ac-card__perf-tip'>
                  {perf ? `占团队最高 ${percent}%` : `入职 ${fmtDate(e.hire_date)}`}
                </Text>
              </View>

              {!!e.user_id && String(e.user_id) !== String(currentUserId) && (
                <View className='ac-card__actions'>
                  <View className='ac-act ac-act--del' onClick={() => remove(e)}>删除账号</View>
                </View>
              )}
            </View>
          )
        })}
      </ScrollView>

      {/* 底部导航：员工管理继承首页高亮（与原型一致） */}
      <BottomNav role='admin' active='dashboard' />
    </View>
  )
}