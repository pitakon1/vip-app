import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView, Button, Textarea } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { leadsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import {
  PAGE_SIZE,
  computeLeadStats,
  filterLeads,
  fmtDate,
  fmtMoney,
  callPhone,
  chatCustomer
} from '@/lib/crmShared'
import './index.scss'

interface LeadItem {
  id: string
  name?: string
  phone?: string
  email?: string
  stage?: string
  source?: string
  notes?: string
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
  const visible = useMemo(() => filterLeads(leads, stage, query), [leads, stage, query])

  // 统计：按已加载线索实时计算
  const stats = useMemo(() => computeLeadStats(leads, total), [leads, total])

  // 编辑客户状态弹窗
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editSource, setEditSource] = useState('')
  const [editStage, setEditStage] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const openEdit = (l: LeadItem) => {
    setEditingId(l.id)
    setEditName(l.name || '')
    setEditPhone(l.phone || '')
    setEditSource(l.source || '')
    setEditStage(l.stage || '')
    setEditNotes(l.notes || '')
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!editName.trim()) {
      Taro.showToast({ title: '请填写客户姓名', icon: 'none' })
      return
    }
    if (!editingId) return
    setSaving(true)
    try {
      await leadsApi.update(editingId, {
        name: editName.trim(),
        phone: editPhone.trim(),
        source: editSource.trim(),
        stage: editStage,
        notes: editNotes.trim()
      })
      Taro.showToast({ title: '已更新客户状态', icon: 'success' })
      setEditOpen(false)
      fetchLeads()
    } catch (error: any) {
      Taro.showToast({ title: error?.message || '更新失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
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
                  <View className='crm-card__edit' onClick={() => openEdit(l)}>
                    <Text className='crm-card__edit-text'>编辑状态</Text>
                  </View>
                  <View className='crm-card__edit crm-card__edit--ghost' onClick={() => chatCustomer(l)}>
                    <Text className='crm-card__edit-text'>发消息</Text>
                  </View>
                </View>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* 编辑客户状态弹层 */}
      {editOpen && (
        <View className='modal-mask' onClick={() => setEditOpen(false)}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>编辑客户状态</Text>
            <View className='form-field'>
              <Text className='form-field__label'>姓名 *</Text>
              <Input
                className='form-field__input'
                value={editName}
                onInput={(e) => setEditName(e.detail.value)}
                placeholder='请输入客户姓名'
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>电话</Text>
              <Input
                className='form-field__input'
                value={editPhone}
                onInput={(e) => setEditPhone(e.detail.value)}
                placeholder='请输入联系电话'
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>来源</Text>
              <Input
                className='form-field__input'
                value={editSource}
                onInput={(e) => setEditSource(e.detail.value)}
                placeholder='如 线上咨询 / 朋友介绍'
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>客户状态</Text>
              <View className='crm-edit-chips'>
                {FILTERS.filter((f) => f.key).map((f) => (
                  <View
                    key={f.key}
                    className={`crm-edit-chip ${editStage === f.key ? 'crm-edit-chip--active' : ''}`}
                    onClick={() => setEditStage(f.key)}
                  >
                    <Text className='crm-edit-chip__text'>{f.label}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>备注</Text>
              <Textarea
                className='form-field__input form-field__textarea'
                value={editNotes}
                onInput={(e) => setEditNotes(e.detail.value)}
                placeholder='需求备注（可选）'
              />
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn modal-btn--ghost' onClick={() => setEditOpen(false)}>
                取消
              </Button>
              <Button className='modal-btn modal-btn--primary' disabled={saving} onClick={submitEdit}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* 底部导航：客户 */}
      <BottomNav role='employee' active='crm' />
    </View>
  )
}