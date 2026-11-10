import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { leadsApi, employeesApi } from '@/services/api'
import { MAX_PAGE_SIZE } from '@/lib/api'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import {
  PAGE_SIZE,
  computeLeadStats,
  fmtDate,
  fmtMoney,
  callPhone,
  chatCustomer
} from '@/lib/crmShared'
import StateBlock from '@/components/StateBlock'
import StatusTop from '@/components/StatusTop'
import { useI18n } from '@/i18n'
import './index.scss'
import { errorText } from '@/lib/errorText'

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
  // 统计基准：不带 stage/keyword 的首屏数据（筛选不能影响总客户数）
  const [allLeads, setAllLeads] = useState<LeadItem[]>([])
  const [stageTotals, setStageTotals] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [listTotal, setListTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
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
      Taro.showToast({ title:errorText(e, t('common.saveFailed')), icon: 'none' })
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
      Taro.showToast({ title:errorText(e, t('common.deleteFailed')), icon: 'none' })
    }
  }

  /**
   * 阶段/关键词交给服务端筛选，并按服务端 total 分页加载：
   * 原来只取第 1 页再本地过滤，超过一页的线索搜不到、统计也偏小。
   */
  const fetchLeads = async (
    over: { stage?: string; query?: string } = {},
    nextPage = 1,
    append = false
  ) => {
    if (append && loadingMore) return
    if (append) setLoadingMore(true)
    else setLoading(true)
    setLoadError(false)
    try {
      const st = over.stage ?? stage
      const kw = over.query ?? query
      const params: Record<string, unknown> = { page: nextPage, page_size: PAGE_SIZE }
      if (st) params.stage = st
      if (kw) params.keyword = kw
      const results = await Promise.allSettled([
        append ? Promise.resolve(null) : leadsApi.list({ page: 1, page_size: PAGE_SIZE }),
        leadsApi.list(params)
      ])
      if (!append && results[0].status === 'fulfilled') {
        const d: any = (results[0].value as any)?.data ?? results[0].value
        setAllLeads(Array.isArray(d) ? d : d?.items || [])
        setTotal(Number(d?.total ?? 0))
      }
      if (results[1].status !== 'fulfilled') throw results[1].reason
      const d: any = (results[1].value as any)?.data ?? results[1].value
      const items: LeadItem[] = Array.isArray(d) ? d : d?.items || []
      const srvTotal = Number(d?.total)
      setListTotal(Number.isFinite(srvTotal) ? srvTotal : items.length)
      if (append) {
        // 分页期间若有新增记录，简单追加会出现重复 key
        setLeads((prev) => {
          const seen = new Set(prev.map((l) => l.id))
          return [...prev, ...items.filter((l) => !seen.has(l.id))]
        })
      } else {
        setLeads(items)
      }
      setPage(nextPage)
      setHasMore(
        Number.isFinite(srvTotal) ? nextPage * PAGE_SIZE < srvTotal : items.length >= PAGE_SIZE
      )
      const sc = d?.stage_counts
      if (sc && typeof sc === 'object') setStageTotals(sc)
    } catch (error) {
      console.error('[AdminCrm] 获取线索失败', error)
      setLoadError(true)
      if (!append) Taro.showToast({ title: t('crm.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
      setLoadingMore(false)
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

  useReachBottom(() => {
    if (hasMore && !loading && !loadingMore) fetchLeads({}, page + 1, true)
  })

  const handleSearch = () => {
    const kw = keyword.trim()
    setQuery(kw)
    fetchLeads({ query: kw })
  }

  const changeStage = (key: string) => {
    setStage(key)
    fetchLeads({ stage: key })
  }

  // 列表已由服务端按 stage/keyword 筛选，这里直接展示
  const visible = leads

  // 统计：总客户数与阶段计数取服务端口径，本月新增按首屏数据估算
  const stats = useMemo(() => {
    const base = computeLeadStats(allLeads, total)
    if (!Object.keys(stageTotals).length) return base
    return {
      ...base,
      intent: Number(stageTotals.inquiring || 0),
      closed: Number(stageTotals.closed || 0)
    }
  }, [allLeads, total, stageTotals])

  return (
    <View className='crm-page'>
      <StatusTop />
      <View className='crm-body'>
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
            onClick={() => changeStage(f.key)}
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
          <Text className='crm-section-head__count'>{t('crm.countUnit', { n: listTotal })}</Text>
          <View className='crm-addbox' onClick={openNew}>
            <Text className='crm-addbox__text'>{t('crm.newLead')}</Text>
          </View>
        </View>
      </View>

      <ScrollView scrollY className='crm-list'>
        {loading && visible.length === 0 && (
          <StateBlock loading text={t('pub.loading')} />
        )}
        {!loading && loadError && visible.length > 0 && (
          <View className='inline-error-bar' onClick={() => fetchLeads()}>
            <Text className='inline-error-bar__text'>{t('crm.loadFailed')}</Text>
            <Text className='inline-error-bar__retry'>{t('acc.retry')}</Text>
          </View>
        )}
        {!loading && loadError && leads.length === 0 && (
          <StateBlock
            error
            text={t('crm.loadFailed')}
            retryText={t('acc.retry')}
            onRetry={fetchLeads}
          />
        )}
        {!loading && !loadError && visible.length === 0 && (
          <StateBlock
            empty
            filtered={Boolean(keyword || stage)}
            icon='user'
            text={keyword || stage ? t('crm.emptyFiltered') : t('crm.emptyNone')}
          />
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
                    {t('crm.followUp', { date: fmtDate(l.updated_at || l.created_at) })} · {t('crm.owner')}{' '}
                    {agentMap[String(l.assigned_to || '')] || t('crm.unassigned')}
                  </Text>
                </View>

                <View className='crm-card__actions'>
                  <View className='crm-act crm-act--ghost' onClick={() => callPhone(l.phone)}>
                    <Text>{t('pub.call')}</Text>
                  </View>
                  <View className='crm-act crm-act--ghost' onClick={() => chatCustomer(l)}>
                    <Text>{t('crm.sendMsg')}</Text>
                  </View>
                  <View className='crm-act' onClick={() => openEdit(l)}>{t('crm.edit')}</View>
                  <View className='crm-act crm-act--del' onClick={() => remove(l)}>{t('crm.delete')}</View>
                </View>
              </View>
            </View>
          )
        })}
        {loadingMore && <StateBlock loading text={t('pub.loading')} />}
      </ScrollView>
      </View>

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