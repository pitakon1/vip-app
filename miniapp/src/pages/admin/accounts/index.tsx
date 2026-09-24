import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { employeesApi, adminUsersApi } from '@/services/api'
import { fmtMoney } from '@/utils/format'
import useAuthStore from '@/stores/auth'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
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

/** 状态筛选（文案走 i18n：acc.filter.*；空 key 表示全部） */
const FILTERS: { key: string; i18nKey: string }[] = [
  { key: '', i18nKey: 'all' },
  { key: 'active', i18nKey: 'active' },
  { key: 'inactive', i18nKey: 'inactive' },
  { key: 'probation', i18nKey: 'probation' }
]

const PAGE_SIZE = 100

/** 可分配的员工账号角色（与 Web 账号管理的角色口径一致，此处只列员工侧角色） */
const ROLE_KEYS = ['employee', 'agent', 'admin']

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-')

const withinDays = (date?: string, days = PROBATION_DAYS) => {
  if (!date) return false
  const t = new Date(date).getTime()
  return !Number.isNaN(t) && Date.now() - t <= days * 86400000
}

const monthPrefixOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export default function AdminEmployeesPage() {
  const { t } = useI18n()
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
      title: t('acc.deleteAccount'),
      content: t('acc.deleteConfirmShort', { name: e.full_name || t('acc.unnamed') })
    })
    if (!res.confirm) return
    try {
      await adminUsersApi.deleteUser(e.user_id)
      Taro.showToast({ title: t('acc.deleted'), icon: 'success' })
      fetchEmployees()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('acc.deleteFailed'), icon: 'none' })
    }
  }

  /**
   * 修改账号角色（PATCH /admin/users/{id}）。
   * 此前小程序端只能建号/删号，账号角色定死不可改。
   * 先按邮箱回查账号拿到当前角色，再让管理员在动作面板里选择新角色。
   */
  const changeRole = async (e: EmployeeItem) => {
    if (!e.user_id) {
      Taro.showToast({ title: t('acc.noBoundAccount'), icon: 'none' })
      return
    }
    let current = ''
    try {
      const res: any = await adminUsersApi.list({
        keyword: e.email || e.full_name || '',
        page_size: 10
      })
      const d = res?.data ?? res
      const items: any[] = Array.isArray(d) ? d : d?.items || []
      const hit = items.find((u) => String(u.id) === String(e.user_id)) ?? items[0]
      current = hit?.role || ''
    } catch (error) {
      console.error('[AdminEmployees] 回查账号角色失败', error)
    }

    const sheet = await Taro.showActionSheet({
      itemList: ROLE_KEYS.map((key) =>
        key === current ? `${t(`perm.role.${key}`)}${t('acc.currentRole')}` : t(`perm.role.${key}`)
      )
    }).catch(() => null)
    if (!sheet) return
    const picked = ROLE_KEYS[sheet.tapIndex]
    if (!picked || picked === current) return

    try {
      await adminUsersApi.update(e.user_id, { role: picked })
      Taro.showToast({ title: t('acc.roleChangedTo', { role: t(`perm.role.${picked}`) }), icon: 'success' })
      fetchEmployees()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('acc.roleChangeFailed'), icon: 'none' })
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
      Taro.showToast({ title: t('acc.loadFailed'), icon: 'none' })
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
          <Text className='ac-stat-card__label'>{t('acc.totalStaff')}</Text>
          <Text className='badge badge--primary ac-stat-card__badge'>{t('acc.allStaff')}</Text>
        </View>
        <View className='ac-stat-card'>
          <Text className='ac-stat-card__value'>{stats.active}</Text>
          <Text className='ac-stat-card__label'>{t('acc.filter.active')}</Text>
          <Text className='badge badge--success ac-stat-card__badge'>
            {stats.total ? Math.round((stats.active / stats.total) * 100) : 0}%
          </Text>
        </View>
      </View>
      <View className='ac-stats-row'>
        <View className='ac-stat-card'>
          <Text className='ac-stat-card__value'>{stats.inactive}</Text>
          <Text className='ac-stat-card__label'>{t('acc.filter.inactive')}</Text>
          <Text className='badge badge--neutral ac-stat-card__badge'>{t('acc.leftPost')}</Text>
        </View>
        <View className='ac-stat-card'>
          <Text className='ac-stat-card__value'>{stats.newThisMonth}</Text>
          <Text className='ac-stat-card__label'>{t('acc.newThisMonth')}</Text>
          <Text className='badge badge--info ac-stat-card__badge'>+{stats.newThisMonth}</Text>
        </View>
      </View>

      {/* 搜索栏 */}
      <View className='ac-search'>
        <Input
          className='ac-search__input'
          value={keyword}
          placeholder={t('acc.searchPlaceholder')}
          confirmType='search'
          onInput={(e: any) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='ac-search__btn' onClick={handleSearch}>
          <Text className='ac-search__btn-text'>{t('acc.search')}</Text>
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
            <Text className='ac-chip__text'>{t(`acc.filter.${f.i18nKey}`)}</Text>
          </View>
        ))}
      </ScrollView>

      <View className='ac-section-head'>
        <Text className='ac-section-head__title'>{t('acc.listTitle')}</Text>
        <Text className='ac-section-head__count'>{t('acc.countPeople', { n: visible.length })}</Text>
      </View>

      <ScrollView scrollY className='ac-list'>
        {loading && visible.length === 0 && (
          <StateBlock loading text={t('acc.loading')} />
        )}
        {!loading && visible.length === 0 && (
          <View className='ac-state'>
            <View className='icon-svg' style={iconStyle('user', 72)} />
            <Text className='ac-state__text'>{t('acc.empty')}</Text>
            <Text className='ac-state__desc'>
              {query || filter ? t('acc.tryOtherFilter') : t('acc.emptySearch')}
            </Text>
          </View>
        )}

        {visible.map((e, index) => {
          const inactive = e.is_active === false || e.status === 'inactive'
          const probation = isProbation(e)
          const badge = inactive
            ? { text: t('acc.filter.inactive'), cls: 'badge--neutral' }
            : probation
            ? { text: t('acc.filter.probation'), cls: 'badge--warning' }
            : { text: t('acc.filter.active'), cls: 'badge--success' }
          const tone = AVATAR_TONES[index % AVATAR_TONES.length]
          const perf = perfMap[String(e.id)] || perfMap[String(e.user_id || '')] || null
          const percent = perf ? Math.round((perf.amount / maxPerf) * 100) : 0
          return (
            <View key={e.id} className={`ac-card ${inactive ? 'ac-card--dim' : ''}`}>
              <View className='ac-card__avatar-row'>
                <View className={`ac-avatar ac-avatar--${tone}`}>
                  <Text className='ac-avatar__text'>{(e.full_name || t('acc.unnamed')).slice(0, 1)}</Text>
                </View>
                <View className='ac-card__head'>
                  <Text className='ac-card__name'>{e.full_name || t('acc.unnamed')}</Text>
                  <Text className='ac-card__code'>
                    {t('acc.codePrefix')} {e.employee_no || e.employee_code || '-'}
                  </Text>
                </View>
                <Text className={`badge ${badge.cls}`}>{badge.text}</Text>
              </View>

              <Text className='ac-card__position'>
                {[e.position, e.department].filter(Boolean).join(' · ') || t('acc.noPosition')}
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
                    {t('acc.totalCommission')}
                    {perf ? t('acc.dealCount', { n: perf.deals }) : ''}
                  </Text>
                  <Text className='ac-card__perf-value'>
                    {perf ? fmtMoney(perf.amount, 'THB') : t('acc.noPerf')}
                  </Text>
                </View>
                <View className='ac-progress'>
                  <View className='ac-progress__fill' style={{ width: `${percent}%` }} />
                </View>
                <Text className='ac-card__perf-tip'>
                  {perf ? t('acc.maxShare', { n: percent }) : t('acc.joinedAt', { date: fmtDate(e.hire_date) })}
                </Text>
              </View>

              {!!e.user_id && (
                <View className='ac-card__actions'>
                  <View className='ac-act ac-act--role' onClick={() => changeRole(e)}>
                    {t('acc.changeRole')}
                  </View>
                  {String(e.user_id) !== String(currentUserId) && (
                    <View className='ac-act ac-act--del' onClick={() => remove(e)}>{t('acc.deleteAccount')}</View>
                  )}
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