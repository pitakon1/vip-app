import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { leadsApi, employeesApi } from '@/services/api'
import { MAX_PAGE_SIZE } from '@/lib/api'
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
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
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
  assigned_to?: string
  updated_at?: string
  created_at?: string
  [key: string]: any
}

// 后端 LeadStage 枚举（inquiring / viewing_scheduled / negotiating / pending_contract / closed）
const STAGE_META: Record<string, { text: string; badge: string; avatar: string }> = {
  inquiring: { text: 'crm.admStageInquiring', badge: 'badge--info', avatar: 'crm-avatar--info' },
  viewing_scheduled: { text: 'crm.admStageViewing', badge: 'badge--primary', avatar: 'crm-avatar--primary' },
  negotiating: { text: 'crm.admStageNegotiating', badge: 'badge--warning', avatar: 'crm-avatar--warning' },
  pending_contract: { text: 'crm.stagePending', badge: 'badge--warning', avatar: 'crm-avatar--warning' },
  closed: { text: 'crm.stageClosed', badge: 'badge--success', avatar: 'crm-avatar--success' }
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'crm.filterAll' },
  { key: 'inquiring', label: 'crm.filterInquiring' },
  { key: 'viewing_scheduled', label: 'crm.admStageViewing' },
  { key: 'negotiating', label: 'crm.admStageNegotiating' },
  { key: 'pending_contract', label: 'crm.stagePending' },
  { key: 'closed', label: 'crm.stageClosed' }
]

export default function AdminCrmPage() {
  const { t } = useI18n()
  const [leads, setLeads] = useState<LeadItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('')
  // 员工 id → 姓名（用于「负责人」展示）
  const [agentMap, setAgentMap] = useState<Record<string, string>>({})

  // 新建/编辑线索表单
  const [showSheet, setShowSheet] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{
    name: string
    phone: string
    source: string
    stage: string
    notes: string
  }>({ name: '', phone: '', source: '', stage: 'inquiring', notes: '' })
  const setFormField = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  const openNew = () => {
    setEditingId(null)
    setForm({ name: '', phone: '', source: '', stage: 'inquiring', notes: '' })
    setShowSheet(true)
  }

  const openEdit = (l: LeadItem) => {
    setEditingId(l.id)
    setForm({
      name: l.name || '',
      phone: l.phone || '',
      source: l.source || '',
      stage: l.stage || 'inquiring',
      notes: (l.notes as string) || ''
    })
    setShowSheet(true)
  }

  const closeSheet = () => setShowSheet(false)

  const submit = async () => {
    if (!form.name.trim()) return Taro.showToast({ title: t('crm.nameRequired'), icon: 'none' })
    const payload: Record<string, unknown> = { name: form.name.trim(), stage: form.stage }
    if (form.phone) payload.phone = form.phone
    if (form.source) payload.source = form.source
    if (form.notes) payload.notes = form.notes
    try {
      if (editingId) await leadsApi.update(editingId, payload)
      else await leadsApi.create(payload)
      Taro.showToast({ title: t('common.saved'), icon: 'success' })
      closeSheet()
      fetchLeads()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('common.saveFailed'), icon: 'none' })
    }
  }

  const remove = async (l: LeadItem) => {
    const res = await Taro.showModal({
      title: t('crm.deleteConfirmTitle'),
      content: t('crm.deleteConfirmContent', { name: l.name || t('crm.leadFallback') })
    })
    if (!res.confirm) return
    try {
      await leadsApi.delete(l.id)
      Taro.showToast({ title: t('common.deleted'), icon: 'success' })
      fetchLeads()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('common.deleteFailed'), icon: 'none' })
    }
  }

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const res: any = await leadsApi.list({ page: 1, page_size: PAGE_SIZE })
      const d = res?.data ?? res
      const items: LeadItem[] = Array.isArray(d) ? d : d?.items || []
      setLeads(items)
      setTotal(Number(d?.total ?? items.length))
    } catch (error) {
      console.error('[AdminCrm] 获取线索失败', error)
      Taro.showToast({ title: t('crm.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 员工列表（admin）→ 建 用户id→姓名 映射，补齐线索「负责人」
  // ⚠️ 技术债：这里拿分页接口当全量接口用，只能贴住后端硬顶（100）。
  // 员工超过 100 人时，超出部分线索的负责人姓名会映射不到而显示为空。
  // 正确解法是后端提供一个轻量的 id→姓名 映射接口（只返回 user_id + full_name）。
  const fetchAgents = async () => {
    try {
      const res: any = await employeesApi.list({ page: 1, page_size: MAX_PAGE_SIZE })
      const d = res?.data ?? res
      const items: any[] = Array.isArray(d) ? d : d?.items || []
      const map: Record<string, string> = {}
      items.forEach((e) => {
        if (e.user_id && e.full_name) map[String(e.user_id)] = e.full_name
      })
      setAgentMap(map)
    } catch (error) {
      console.error('[AdminCrm] 获取员工映射失败', error)
    }
  }

  useDidShow(() => {
    fetchLeads()
    fetchAgents()
  })

  const handleSearch = () => setQuery(keyword.trim())

  // 阶段筛选（客户端，因接口一次拉全量；后端仅支持 stage 参数）
  const visible = useMemo(() => filterLeads(leads, stage, query), [leads, stage, query])

  // 统计：按已加载线索实时计算（接口不提供分阶段计数）
  const stats = useMemo(() => computeLeadStats(leads, total), [leads, total])

  return (
    <View className='crm-page'>
      {/* 搜索栏 */}
      <View className='crm-search'>
        <Input
          className='crm-search__input'
          value={keyword}
          placeholder={t('crm.searchPlaceholder')}
          confirmType='search'
          onInput={(e: any) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='crm-search__btn' onClick={handleSearch}>
          <Text className='crm-search__btn-text'>{t('crm.search')}</Text>
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
            <Text className='crm-chip__text'>{t(f.label)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 统计 */}
      <View className='crm-stats'>
        <View className='crm-stat crm-stat--primary'>
          <Text className='crm-stat__value'>{stats.total}</Text>
          <Text className='crm-stat__label'>{t('crm.statTotal')}</Text>
        </View>
        <View className='crm-stat crm-stat--info'>
          <Text className='crm-stat__value'>{stats.intent}</Text>
          <Text className='crm-stat__label'>{t('crm.statIntent')}</Text>
        </View>
        <View className='crm-stat crm-stat--success'>
          <Text className='crm-stat__value'>{stats.closed}</Text>
          <Text className='crm-stat__label'>{t('crm.stageClosed')}</Text>
        </View>
        <View className='crm-stat crm-stat--warning'>
          <Text className='crm-stat__value'>{stats.newThisMonth}</Text>
          <Text className='crm-stat__label'>{t('crm.statNewThisMonth')}</Text>
        </View>
      </View>

      <View className='crm-section-head'>
        <Text className='crm-section-head__title'>{t('crm.listTitle')}</Text>
        <View className='crm-section-head__right'>
          <Text className='crm-section-head__count'>{t('crm.countUnit', { n: visible.length })}</Text>
          <View className='crm-addbox' onClick={openNew}>
            <Text className='crm-addbox__text'>{t('crm.newLead')}</Text>
          </View>
        </View>
      </View>

      <ScrollView scrollY className='crm-list'>
        {loading && visible.length === 0 && (
          <StateBlock loading text={t('pub.loading')} />
        )}
        {!loading && visible.length === 0 && (
          <View className='crm-state'>
            <View className='icon-svg' style={iconStyle('user', 72)} />
            <Text className='crm-state__text'>{t('crm.empty')}</Text>
            <Text className='crm-state__desc'>
              {query || stage ? t('crm.emptyFiltered') : t('crm.emptyNone')}
            </Text>
          </View>
        )}

        {visible.map((l) => {
          const meta = STAGE_META[l.stage || ''] || {
            text: l.stage || t('crm.unknown'),
            badge: 'badge--neutral',
            avatar: ''
          }
          // 预算展示（后端为预算区间 + 币种）
          const budget =
            l.budget_min || l.budget_max
              ? `${fmtMoney(l.budget_min, l.budget_currency)}-${fmtMoney(l.budget_max, l.budget_currency)}`
              : ''
          const projects = Array.isArray(l.interested_projects)
            ? l.interested_projects.filter(Boolean).slice(0, 2)
            : []
          return (
            <View key={l.id} className='crm-card'>
              <View className='crm-card__left'>
                <View className={`crm-avatar ${meta.avatar}`}>
                  <Text className='crm-avatar__text'>{(l.name || t('crm.anonName')).slice(0, 1)}</Text>
                </View>
              </View>

              <View className='crm-card__body'>
                <View className='crm-card__top'>
                  <Text className='crm-card__name'>{l.name || t('crm.unnamed')}</Text>
                  <Text className={`badge ${meta.badge}`}>{t(meta.text)}</Text>
                </View>

                {!!l.phone && (
                  <View className='crm-card__phone' onClick={() => callPhone(l.phone)}>
                    <View className='icon-svg icon-svg--sm' style={iconStyle('user', 26)} />
                    <Text className='crm-card__phone-text'>{l.phone}</Text>
                  </View>
                )}

                <View className='crm-card__tags'>
                  {!!budget && <Text className='crm-tag'>{t('crm.budget')} {budget}</Text>}
                  {!!l.source && <Text className='crm-tag'>{t('crm.source')} {l.source}</Text>}
                  {projects.map((p: any, i: number) => (
                    <Text key={`${l.id}-p-${i}`} className='crm-tag'>
                      {typeof p === 'string' ? p : p?.name || t('crm.projectFallback')}
                    </Text>
                  ))}
                </View>

                <View className='crm-card__foot'>
                  <View className='icon-svg icon-svg--sm' style={iconStyle('calendar', 26)} />
                  <Text className='crm-card__foot-text'>
                    {t('crm.followUp')} {fmtDate(l.updated_at || l.created_at)} · {t('crm.owner')}{' '}
                    {agentMap[String(l.assigned_to || '')] || t('crm.unassigned')}
                  </Text>
                </View>

                <View className='crm-card__actions'>
                  <View className='crm-act' onClick={() => chatCustomer(l)}>{t('crm.sendMsg')}</View>
                  <View className='crm-act' onClick={() => openEdit(l)}>{t('crm.edit')}</View>
                  <View className='crm-act crm-act--del' onClick={() => remove(l)}>{t('crm.delete')}</View>
                </View>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* 新建/编辑线索弹层 */}
      {showSheet && (
        <>
          <View className='crm-mask' onClick={closeSheet} />
          <View className='crm-sheet'>
            <Text className='crm-sheet__title'>{editingId ? t('crm.editLead') : t('crm.newLeadTitle')}</Text>

            <View className='crm-field'>
              <Text className='crm-field__label crm-field__label--req'>{t('crm.nameLabel')}</Text>
              <Input
                className='crm-field__input'
                value={form.name}
                placeholder={t('crm.namePlaceholder')}
                onInput={(e) => setFormField('name', e.detail.value)}
              />
            </View>

            <View className='crm-field'>
              <Text className='crm-field__label'>{t('crm.phoneLabel')}</Text>
              <Input
                className='crm-field__input'
                type='text'
                value={form.phone}
                placeholder={t('crm.phonePlaceholder')}
                onInput={(e) => setFormField('phone', e.detail.value)}
              />
            </View>

            <View className='crm-field'>
              <Text className='crm-field__label'>{t('crm.source')}</Text>
              <Input
                className='crm-field__input'
                value={form.source}
                placeholder={t('crm.sourcePlaceholder')}
                onInput={(e) => setFormField('source', e.detail.value)}
              />
            </View>

            <View className='crm-field'>
              <Text className='crm-field__label crm-field__label--req'>{t('crm.stageLabel')}</Text>
              <View
                className='crm-field__select'
                onClick={() =>
                  Taro.showActionSheet({ itemList: Object.keys(STAGE_META).map((k) => t(STAGE_META[k].text)) })
                    .then((r) => {
                      const key = Object.keys(STAGE_META)[r.tapIndex]
                      if (key) setFormField('stage', key)
                    })
                    .catch(() => {})
                }
              >
                <Text>{t(STAGE_META[form.stage]?.text || form.stage)}</Text>
                <Text className='crm-field__tag'>▾</Text>
              </View>
            </View>

            <View className='crm-field'>
              <Text className='crm-field__label'>{t('crm.notesLabel')}</Text>
              <Input
                className='crm-field__input'
                value={form.notes}
                placeholder={t('crm.notesPlaceholder')}
                onInput={(e) => setFormField('notes', e.detail.value)}
              />
            </View>

            <View className='crm-submit' onClick={submit}>{t('crm.save')}</View>
          </View>
        </>
      )}

      {/* 底部导航：客户 */}
      <BottomNav role='admin' active='crm' />
    </View>
  )
}