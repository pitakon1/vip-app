import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { leadsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface LeadItem {
  id: string
  name?: string
  phone?: string
  email?: string
  stage?: string
  source?: string
  budget_min?: number
  budget_max?: number
  budget_currency?: string
  interested_projects?: any
  updated_at?: string
  created_at?: string
  [key: string]: any
}

// 后端 LeadStage 枚举（inquiring / viewing_scheduled / negotiating / pending_contract / closed）
const STAGE_META: Record<string, { text: string; badge: string; avatar: string }> = {
  inquiring: { text: '咨询中', badge: 'badge--info', avatar: 'crm-avatar--info' },
  viewing_scheduled: { text: '看房中', badge: 'badge--primary', avatar: 'crm-avatar--primary' },
  negotiating: { text: '谈判中', badge: 'badge--warning', avatar: 'crm-avatar--warning' },
  pending_contract: { text: '待签约', badge: 'badge--warning', avatar: 'crm-avatar--warning' },
  closed: { text: '已成交', badge: 'badge--success', avatar: 'crm-avatar--success' }
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'inquiring', label: '咨询中' },
  { key: 'viewing_scheduled', label: '看房中' },
  { key: 'negotiating', label: '谈判中' },
  { key: 'pending_contract', label: '待签约' },
  { key: 'closed', label: '已成交' }
]

const PAGE_SIZE = 100

const fmtDate = (v?: string) => (v ? String(v).slice(5, 10) : '-')

export default function EmployeeCrmPage() {
  const [leads, setLeads] = useState<LeadItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('')

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const res: any = await leadsApi.list({ page: 1, page_size: PAGE_SIZE })
      const d = res?.data ?? res
      const items: LeadItem[] = Array.isArray(d) ? d : d?.items || []
      setLeads(items)
      setTotal(Number(d?.total ?? items.length))
    } catch (error) {
      console.error('[EmployeeCrm] 获取客户失败', error)
      Taro.showToast({ title: '加载客户失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchLeads()
  })

  const handleSearch = () => setQuery(keyword.trim())

  // 阶段筛选（客户端，因接口一次拉全量）
  const visible = useMemo(() => {
    const kw = query.toLowerCase()
    return leads.filter((l) => {
      if (stage && l.stage !== stage) return false
      if (!kw) return true
      return [l.name, l.phone, l.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
  }, [leads, stage, query])

  // 统计：按已加载线索实时计算
  const stats = useMemo(() => {
    const now = new Date()
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return {
      total: total || leads.length,
      intent: leads.filter((l) => l.stage === 'inquiring').length,
      closed: leads.filter((l) => l.stage === 'closed').length,
      newThisMonth: leads.filter((l) => String(l.created_at || '').startsWith(monthPrefix)).length
    }
  }, [leads, total])

  const callPhone = (phone?: string) => {
    if (!phone) return
    Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {})
  }

  return (
    <View className='crm-page'>
      {/* 搜索栏 */}
      <View className='crm-search'>
        <Input
          className='crm-search__input'
          value={keyword}
          placeholder='搜索客户姓名/电话'
          confirmType='search'
          onInput={(e: any) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='crm-search__btn' onClick={handleSearch}>
          <Text className='crm-search__btn-text'>搜索</Text>
        </View>
      </View>

      {/* 阶段筛选 */}
      <ScrollView scrollX className='crm-chips'>
        {FILTERS.map((f) => (
          <View
            key={f.key || 'all'}
            className={`crm-chip ${stage === f.key ? 'crm-chip--active' : ''}`}
            onClick={() => setStage(f.key)}
          >
            <Text className='crm-chip__text'>{f.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 统计 */}
      <View className='crm-stats'>
        <View className='crm-stat crm-stat--primary'>
          <Text className='crm-stat__value'>{stats.total}</Text>
          <Text className='crm-stat__label'>总客户</Text>
        </View>
        <View className='crm-stat crm-stat--info'>
          <Text className='crm-stat__value'>{stats.intent}</Text>
          <Text className='crm-stat__label'>意向</Text>
        </View>
        <View className='crm-stat crm-stat--success'>
          <Text className='crm-stat__value'>{stats.closed}</Text>
          <Text className='crm-stat__label'>已成交</Text>
        </View>
        <View className='crm-stat crm-stat--warning'>
          <Text className='crm-stat__value'>{stats.newThisMonth}</Text>
          <Text className='crm-stat__label'>本月新增</Text>
        </View>
      </View>

      <View className='crm-section-head'>
        <Text className='crm-section-head__title'>客户列表</Text>
        <Text className='crm-section-head__count'>共 {visible.length} 位</Text>
      </View>

      <ScrollView scrollY className='crm-list'>
        {loading && visible.length === 0 && (
          <View className='crm-state'>
            <Text className='crm-state__text'>加载中...</Text>
          </View>
        )}
        {!loading && visible.length === 0 && (
          <View className='crm-state'>
            <View className='icon-svg' style={iconStyle('user', 72)} />
            <Text className='crm-state__text'>暂无客户</Text>
            <Text className='crm-state__desc'>
              {query || stage ? '换个筛选条件试试' : '分配给你的客户线索会展示在这里'}
            </Text>
          </View>
        )}

        {visible.map((l) => {
          const meta = STAGE_META[l.stage || ''] || {
            text: l.stage || '未知',
            badge: 'badge--neutral',
            avatar: ''
          }
          const budget =
            l.budget_min || l.budget_max
              ? `预算 ${fmtMoney(l.budget_min || l.budget_max, l.budget_currency)}`
              : ''
          return (
            <View key={l.id} className='crm-card'>
              <View className='crm-card__left'>
                <View className={`crm-avatar ${meta.avatar}`}>
                  <Text className='crm-avatar__text'>{(l.name || '客').slice(0, 1)}</Text>
                </View>
              </View>

              <View className='crm-card__body'>
                <View className='crm-card__top'>
                  <Text className='crm-card__name'>{l.name || '未命名客户'}</Text>
                  <Text className={`badge ${meta.badge}`}>{meta.text}</Text>
                </View>

                {!!l.phone && (
                  <View className='crm-card__phone' onClick={() => callPhone(l.phone)}>
                    <View className='icon-svg icon-svg--sm' style={iconStyle('user', 26)} />
                    <Text className='crm-card__phone-text'>{l.phone}</Text>
                  </View>
                )}

                <View className='crm-card__tags'>
                  {!!budget && <Text className='crm-tag'>{budget}</Text>}
                  {!!l.source && <Text className='crm-tag'>来源 {l.source}</Text>}
                </View>

                <View className='crm-card__foot'>
                  <View className='icon-svg icon-svg--sm' style={iconStyle('calendar', 26)} />
                  <Text className='crm-card__foot-text'>
                    跟进 {fmtDate(l.updated_at || l.created_at)}
                  </Text>
                </View>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* 底部导航：客户 */}
      <BottomNav role='employee' active='crm' />
    </View>
  )
}

const fmtMoney = (v: number | undefined, currency?: string) => {
  const sym: Record<string, string> = { CNY: '¥', THB: '', EUR: '€', USD: '$' }
  return `${sym[currency || 'THB'] || ''}${Number(v || 0).toLocaleString()}`
}