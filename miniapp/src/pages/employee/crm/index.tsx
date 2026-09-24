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
import { useI18n } from '@/i18n'
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
  inquiring: { text: 'crm.empStageInquiring', badge: 'badge--info', avatar: 'crm-avatar--info' },
  viewing_scheduled: { text: 'crm.empStageViewing', badge: 'badge--primary', avatar: 'crm-avatar--primary' },
  negotiating: { text: 'crm.empStageNegotiating', badge: 'badge--warning', avatar: 'crm-avatar--warning' },
  pending_contract: { text: 'crm.stagePending', badge: 'badge--warning', avatar: 'crm-avatar--warning' },
  closed: { text: 'crm.stageClosed', badge: 'badge--success', avatar: 'crm-avatar--success' }
}

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'crm.filterAll' },
  { key: 'inquiring', label: 'crm.empStageInquiring' },
  { key: 'viewing_scheduled', label: 'crm.empStageViewing' },
  { key: 'negotiating', label: 'crm.empStageNegotiating' },
  { key: 'pending_contract', label: 'crm.stagePending' },
  { key: 'closed', label: 'crm.stageClosed' }
]

export default function EmployeeCrmPage() {
  const { t } = useI18n()
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
      Taro.showToast({ title: t('crm.loadFailed'), icon: 'none' })
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
      Taro.showToast({ title: t('crm.nameRequired'), icon: 'none' })
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
      Taro.showToast({ title: t('crm.statusUpdated'), icon: 'success' })
      setEditOpen(false)
      fetchLeads()
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('crm.updateFailed'), icon: 'none' })
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
        <Text className='crm-section-head__count'>{t('crm.countUnit', { n: visible.length })}</Text>
      </View>

      <ScrollView scrollY className='crm-list'>
        {loading && visible.length === 0 && (
          <View className='crm-state'>
            <Text className='crm-state__text'>{t('pub.loading')}</Text>
          </View>
        )}
        {!loading && visible.length === 0 && (
          <View className='crm-state'>
            <View className='icon-svg' style={iconStyle('user', 72)} />
            <Text className='crm-state__text'>{t('crm.empty')}</Text>
            <Text className='crm-state__desc'>
              {query || stage ? t('crm.emptyFiltered') : t('crm.empEmptyDesc')}
            </Text>
          </View>
        )}

        {visible.map((l) => {
          const meta = STAGE_META[l.stage || ''] || {
            text: l.stage || t('crm.unknown'),
            badge: 'badge--neutral',
            avatar: ''
          }
          const budget =
            l.budget_min || l.budget_max
              ? `${t('crm.budget')} ${fmtMoney(l.budget_min || l.budget_max, l.budget_currency)}`
              : ''
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
                  {!!budget && <Text className='crm-tag'>{budget}</Text>}
                  {!!l.source && <Text className='crm-tag'>{t('crm.source')} {l.source}</Text>}
                </View>

                <View className='crm-card__foot'>
                  <View className='icon-svg icon-svg--sm' style={iconStyle('calendar', 26)} />
                  <Text className='crm-card__foot-text'>
                     {t('crm.followUp')} {fmtDate(l.updated_at || l.created_at)}
                  </Text>
                  <View className='crm-card__edit' onClick={() => openEdit(l)}>
                    <Text className='crm-card__edit-text'>{t('crm.editStatus')}</Text>
                  </View>
                  <View className='crm-card__edit crm-card__edit--ghost' onClick={() => chatCustomer(l)}>
                    <Text className='crm-card__edit-text'>{t('crm.sendMsg')}</Text>
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
            <Text className='modal-sheet__title'>{t('crm.editStatusTitle')}</Text>
            <View className='form-field'>
              <Text className='form-field__label'>{t('crm.nameLabelStar')}</Text>
              <Input
                className='form-field__input'
                value={editName}
                onInput={(e) => setEditName(e.detail.value)}
                placeholder={t('crm.namePlaceholderReq')}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('crm.phoneLabel')}</Text>
              <Input
                className='form-field__input'
                value={editPhone}
                onInput={(e) => setEditPhone(e.detail.value)}
                placeholder={t('crm.phonePlaceholderReq')}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('crm.source')}</Text>
              <Input
                className='form-field__input'
                value={editSource}
                onInput={(e) => setEditSource(e.detail.value)}
                placeholder={t('crm.empSourcePlaceholder')}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('crm.statusLabel')}</Text>
              <View className='crm-edit-chips'>
                {FILTERS.filter((f) => f.key).map((f) => (
                  <View
                    key={f.key}
                    className={`crm-edit-chip ${editStage === f.key ? 'crm-edit-chip--active' : ''}`}
                    onClick={() => setEditStage(f.key)}
                  >
                    <Text className='crm-edit-chip__text'>{t(f.label)}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('crm.notesLabel')}</Text>
              <Textarea
                className='form-field__input form-field__textarea'
                value={editNotes}
                onInput={(e) => setEditNotes(e.detail.value)}
                placeholder={t('crm.empNotesPlaceholder')}
              />
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn modal-btn--ghost' onClick={() => setEditOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button className='modal-btn modal-btn--primary' disabled={saving} onClick={submitEdit}>
                {saving ? t('common.saving') : t('crm.save')}
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