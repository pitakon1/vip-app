import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { leadsApi } from '@/services/api'
import './index.scss'

interface Lead {
  id: string
  name?: string
  phone?: string
  email?: string
  line_id?: string
  wechat_id?: string
  notes?: string
  budget_min?: number
  budget_max?: number
  budget_currency?: string
  stage?: string
  created_at?: string
  [key: string]: any
}

// 阶段映射（对齐后端 LeadStage 枚举）
const STAGE_META: Record<string, { label: string; cls: string }> = {
  inquiring: { label: '新线索', cls: 'l-badge--info' },
  viewing_scheduled: { label: '已预约带看', cls: 'l-badge--info' },
  negotiating: { label: '洽谈中', cls: 'l-badge--warning' },
  pending_contract: { label: '待签约', cls: 'l-badge--primary' },
  closed: { label: '已成交', cls: 'l-badge--success' }
}

const STAGE_CHOICES: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'inquiring', label: '新线索' },
  { key: 'viewing_scheduled', label: '已预约带看' },
  { key: 'negotiating', label: '洽谈中' },
  { key: 'pending_contract', label: '待签约' },
  { key: 'closed', label: '已成交' }
]

const getStage = (s?: string) =>
  STAGE_META[s ?? ''] ?? { label: s || '未知', cls: 'l-badge--neutral' }

function pickList(res: any): Lead[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const fmtTime = (iso?: string) => {
  if (!iso) return '-'
  const t = String(iso).replace('T', ' ').slice(0, 16)
  return t
}

export default function EmployeeLeadsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [stageKey, setStageKey] = useState('')

  const fetchLeads = async (stage = stageKey) => {
    setLoading(true)
    setError(false)
    try {
      const res: any = await leadsApi.list({
        page: 1,
        page_size: 200,
        stage: stage || undefined
      })
      setLeads(pickList(res))
    } catch (err) {
      console.error('[Leads] 获取线索失败', err)
      setError(true)
      Taro.showToast({ title: '加载线索失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchLeads()
  })

  const onFilter = (key: string) => {
    setStageKey(key)
    fetchLeads(key)
  }

  const onCardTap = (lead: Lead) => {
    Taro.showActionSheet({
      itemList: ['查看详情', '变更阶段'],
      success: async (r) => {
        if (r.tapIndex === 0) {
          const sym: Record<string, string> = { CNY: '¥', THB: '฿', USD: '$' }
          const cur = sym[lead.budget_currency || 'THB'] || '฿'
          Taro.showModal({
            title: lead.name || '未命名客户',
            content: `联系方式 ${getContact(lead)}\n预算 ${cur}${Number(
              lead.budget_min || 0
            ).toLocaleString()} - ${cur}${Number(lead.budget_max || 0).toLocaleString()}\n需求：${
              lead.notes || '暂无补充'
            }`,
            showCancel: false,
            confirmText: '知道了'
          })
        } else {
          changeStage(lead)
        }
      }
    })
  }

  const changeStage = (lead: Lead) => {
    const options = STAGE_CHOICES.filter((s) => s.key && s.key !== lead.stage).map(
      (s) => s.label
    )
    if (!options.length) {
      Taro.showToast({ title: '当前已是最终阶段', icon: 'none' })
      return
    }
    Taro.showActionSheet({
      itemList: options,
      success: async (r) => {
        const picked = STAGE_CHOICES.find((s) => s.label === options[r.tapIndex])
        if (!picked) return
        try {
          await leadsApi.updateStatus(lead.id, { stage: picked.key })
          Taro.showToast({ title: '阶段已更新', icon: 'success' })
          fetchLeads()
        } catch (err: any) {
          Taro.showToast({ title: err?.message || '更新失败', icon: 'none' })
        }
      }
    })
  }

  const getContact = (lead: Lead) =>
    lead.phone || lead.line_id || lead.wechat_id || lead.email || '未提供'

  return (
    <View className='l-page'>
      <View className='page-container'>
        {/* 阶段筛选 */}
        <ScrollView scrollX className='l-caps'>
          {STAGE_CHOICES.map((c) => (
            <View
              key={c.key}
              className={`l-caps__item ${stageKey === c.key ? 'l-caps__item--active' : ''}`}
              onClick={() => onFilter(c.key)}
            >
              <Text>{c.label}</Text>
            </View>
          ))}
        </ScrollView>

        <ScrollView scrollY className='l-scroll'>
          {loading && leads.length === 0 ? (
            <View className='l-state l-state--loading'>
              <View className='l-state__spinner' />
              <Text className='l-state__title'>正在加载线索</Text>
            </View>
          ) : error ? (
            <View className='l-state'>
              <Text className='l-state__icon'>!</Text>
              <Text className='l-state__title'>加载失败</Text>
              <View className='l-retry' onClick={() => fetchLeads()}>
                <Text className='l-retry__text'>点击重试</Text>
              </View>
            </View>
          ) : leads.length === 0 ? (
            <View className='l-state'>
              <Text className='l-state__icon'>客</Text>
              <Text className='l-state__title'>暂无客户线索</Text>
              <Text className='l-state__desc'>新的咨询会自动汇总到这里</Text>
            </View>
          ) : (
            <View className='l-results'>
              {leads.map((lead) => {
                const st = getStage(lead.stage)
                return (
                  <View
                    key={lead.id}
                    className='l-card'
                    hoverClass='l-card--hover'
                    onClick={() => onCardTap(lead)}
                  >
                    <View className='l-card__top'>
                      <Text className='l-card__name'>{lead.name || '未命名客户'}</Text>
                      <View className={`l-badge ${st.cls}`}>
                        <Text>{st.label}</Text>
                      </View>
                    </View>
                    <Text className='l-card__contact'>{getContact(lead)}</Text>
                    <Text className='l-card__note'>{lead.notes || '暂无需求备注'}</Text>
                    <Text className='l-card__time'>创建于 {fmtTime(lead.created_at)}</Text>
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )
}