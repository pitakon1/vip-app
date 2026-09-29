import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { partnerApi, adminUsersApi } from '@/services/api'
import { MAX_PAGE_SIZE } from '@/lib/api'
import { fmtMoney } from '@/utils/format'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

interface MemberItem {
  id?: string | number
  user_id?: string | number
  email?: string
  full_name?: string
  role?: string
  user_type?: string
  partner_id?: string | number
  phone?: string
  is_active?: boolean
  position?: string
  [key: string]: any
}

interface AgentPerf {
  user_id?: string | number
  employee_name?: string
  total_commission?: number
  total_revenue?: number
  deals?: number
  [key: string]: any
}

const btn = (loading: boolean, text: string, cls = '', onClick?: () => void) => (
  <View
    className={`pm-btn ${cls} ${loading ? 'pm-btn--disabled' : ''}`}
    onClick={() => {
      if (!loading && onClick) onClick()
    }}
  >
    <Text className='pm-btn__text'>{text}</Text>
  </View>
)

export default function PartnerMembersPage() {
  const { t } = useI18n()
  const [members, setMembers] = useState<MemberItem[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [perf, setPerf] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // 创建成员表单
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createForm, setCreateForm] = useState({
    email: '',
    full_name: '',
    password: '',
    phone: '',
    position: ''
  })

  // 拉入平台成员
  const [showPull, setShowPull] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullLabel, setPullLabel] = useState('')
  const [pullUserId, setPullUserId] = useState('')
  const [candidates, setCandidates] = useState<any[]>([])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [mRes, pRes, perfRes] = await Promise.all([
        partnerApi.members(),
        partnerApi.properties(),
        partnerApi.performance()
      ])
      const m = mRes as any
      const mm = m?.data ?? m
      setMembers(Array.isArray(mm) ? mm : [])
      const p = pRes as any
      const pp = p?.data ?? p
      setProperties(Array.isArray(pp) ? pp : [])
      const pf = perfRes as any
      setPerf(pf?.data ?? pf)
    } catch (error) {
      console.error('[PartnerMembers] 加载失败', error)
      Taro.showToast({ title: t('member.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const loadCandidates = async () => {
    try {
      const res: any = await adminUsersApi.list({
        user_type: 'platform',
        page: 1,
        page_size: MAX_PAGE_SIZE
      })
      const d = res?.data ?? res
      setCandidates(Array.isArray(d) ? d : d?.items || [])
    } catch (error) {
      console.error('[PartnerMembers] 加载平台成员候选失败', error)
    }
  }

  useDidShow(() => {
    fetchAll()
    loadCandidates()
  })

  // 绩效：summary 缺失时用 agents 汇总兜底
  const stats = useMemo(() => {
    const s = perf?.summary ?? {}
    const agents: AgentPerf[] = Array.isArray(perf?.agents) ? perf.agents : []
    const sum = agents.reduce(
      (acc, a) => ({
        commission: acc.commission + Number(a.total_commission || 0),
        revenue: acc.revenue + Number(a.total_revenue || 0),
        deals: acc.deals + Number(a.deals || 0)
      }),
      { commission: 0, revenue: 0, deals: 0 }
    )
    return {
      revenue: Number(s.revenue || 0) || sum.revenue,
      commission: Number(s.commission || 0) || sum.commission,
      deals: Number(s.deals || 0) || sum.deals,
      props: properties.length
    }
  }, [perf, properties])

  const visibleMembers = useMemo(
    () => members.filter((m) => m.is_active !== false),
    [members]
  )
  const inactiveCount = members.length - visibleMembers.length

  const openCreate = () => {
    setCreateForm({ email: '', full_name: '', password: '', phone: '', position: '' })
    setShowCreate((v) => !v)
    setShowPull(false)
  }

  const openPull = () => {
    setShowPull((v) => !v)
    setShowCreate(false)
    setPullLabel('')
    setPullUserId('')
  }

  const pickCandidate = async () => {
    const names = candidates.map((c) =>
      `${c.full_name || c.username || '-'} · ${c.email || ''}`
    )
    if (names.length === 0) {
      Taro.showToast({ title: t('member.pullInTitle'), icon: 'none' })
      return
    }
    const sheet = await Taro.showActionSheet({ itemList: names }).catch(() => null)
    if (!sheet) return
    const picked = candidates[sheet.tapIndex]
    setPullUserId(String(picked.id))
    setPullLabel(`${picked.full_name || picked.username || '-'} · ${picked.email || ''}`)
  }

  const setCreate = (key: keyof typeof createForm) => (e: any) =>
    setCreateForm((f) => ({ ...f, [key]: e.detail.value }))

  const createMember = async () => {
    if (saving) return
    if (!createForm.email.trim() || !createForm.full_name.trim() || !createForm.password.trim()) {
      Taro.showToast({ title: t('member.createRequired'), icon: 'none' })
      return
    }
    setSaving(true)
    try {
      await partnerApi.createMember({
        email: createForm.email.trim(),
        full_name: createForm.full_name.trim(),
        password: createForm.password.trim(),
        phone: createForm.phone.trim(),
        position: createForm.position.trim()
      })
      Taro.showToast({ title: t('member.created'), icon: 'success' })
      setShowCreate(false)
      fetchAll()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('member.createFailed'), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const pullIn = async () => {
    if (pulling || !pullUserId) {
      if (!pullUserId) Taro.showToast({ title: t('member.pullPick'), icon: 'none' })
      return
    }
    setPulling(true)
    try {
      await partnerApi.pullInMember(pullUserId)
      Taro.showToast({ title: t('member.pulled'), icon: 'success' })
      setShowPull(false)
      setPullUserId('')
      setPullLabel('')
      fetchAll()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('member.createFailed'), icon: 'none' })
    } finally {
      setPulling(false)
    }
  }

  const removeMember = async (m: MemberItem) => {
    const id = m.id ?? m.user_id
    if (id == null) return
    const res = await Taro.showModal({
      title: t('member.remove'),
      content: t('member.confirmRemove', { name: m.full_name || m.email || '-' })
    })
    if (!res.confirm) return
    try {
      await partnerApi.removeMember(String(id))
      Taro.showToast({ title: t('member.removed'), icon: 'success' })
      fetchAll()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('member.createFailed'), icon: 'none' })
    }
  }

  const callPhone = (phone?: string) => {
    if (!phone) return
    Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {})
  }

  const perfAgents: AgentPerf[] = useMemo(
    () => (Array.isArray(perf?.agents) ? perf.agents : []),
    [perf]
  )

  return (
    <View className='pm-page'>
      <ShellHeader title={t('nav.partnerMembers')} />

      {loading && members.length === 0 && perfAgents.length === 0 ? (
        <StateBlock loading text={t('acc.loading')} />
      ) : (
        <>
          {/* 公司概览 */}
          <View className='pm-toolbar'>
            <View
              className='pm-tool pm-tool--info'
              onClick={() => Taro.navigateTo({ url: '/pages/admin/partner-attendance/index' })}
            >
              {t('member.attEntry')}
            </View>
          </View>
          <View className='pm-stats-row'>
            <View className='pm-stat-card'>
              <Text className='pm-stat-card__value'>{stats.deals}</Text>
              <Text className='pm-stat-card__label'>{t('member.perfDeals')}</Text>
            </View>
            <View className='pm-stat-card'>
              <Text className='pm-stat-card__value'>{stats.props}</Text>
              <Text className='pm-stat-card__label'>{t('member.propsCount', { n: stats.props })}</Text>
            </View>
          </View>
          <View className='pm-stats-row'>
            <View className='pm-stat-card'>
              <Text className='pm-stat-card__value'>{fmtMoney(stats.revenue)}</Text>
              <Text className='pm-stat-card__label'>{t('member.perfRevenue')}</Text>
            </View>
            <View className='pm-stat-card'>
              <Text className='pm-stat-card__value'>{fmtMoney(stats.commission)}</Text>
              <Text className='pm-stat-card__label'>{t('member.perfCommission')}</Text>
            </View>
          </View>

          {/* 房源聚合 */}
          <View className='pm-section-head'>
            <Text className='pm-section-head__title'>{t('member.propsTitle')}</Text>
            <Text className='pm-section-head__count'>{t('member.propsCount', { n: properties.length })}</Text>
          </View>
          <View className='pm-props'>
            {properties.length === 0 ? (
              <View className='pm-empty-sm'>{t('member.propsEmpty')}</View>
            ) : (
              properties.map((p) => (
                <View key={p.id} className='pm-prop'>
                  <Text className='pm-prop__name'>{p.address || '-'}</Text>
                  <Text className='pm-prop__meta'>
                    {[p.property_type, p.bedrooms ? `${p.bedrooms}BR` : '', p.status].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* 成员绩效 */}
          {perfAgents.length > 0 && (
            <>
              <View className='pm-section-head'>
                <Text className='pm-section-head__title'>{t('member.agentsTitle')}</Text>
              </View>
              {perfAgents.map((a) => (
                <View key={String(a.user_id ?? a.employee_name)} className='pm-agent'>
                  <View className='pm-agent__row'>
                    <Text className='pm-agent__name'>{a.employee_name || '-'}</Text>
                    <Text className='pm-agent__comm'>{fmtMoney(a.total_commission)}</Text>
                  </View>
                  <Text className='pm-agent__meta'>
                    {t('member.perfRevenue')} {fmtMoney(a.total_revenue)} · {t('member.perfDeals')} {a.deals ?? 0}
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* 成员管理 */}
          <View className='pm-section-head'>
            <Text className='pm-section-head__title'>{t('member.listTitle')}</Text>
            <Text className='pm-section-head__count'>{t('member.countPeople', { n: members.length })}</Text>
          </View>

          <View className='pm-toolbar'>
            <View className='pm-tool pm-tool--primary' onClick={openCreate}>{t('member.addBtn')}</View>
            <View className='pm-tool pm-tool--info' onClick={openPull}>{t('member.pullIn')}</View>
          </View>

          {showCreate && (
            <View className='pm-form'>
              <Text className='pm-form__title'>{t('member.createTitle')}</Text>
              <View className='pm-form__row'>
                <Text className='pm-form__label'>{t('member.fullName')}</Text>
                <Input className='pm-form__input' value={createForm.full_name} placeholder={t('member.fullNamePlaceholder')} onInput={setCreate('full_name')} />
              </View>
              <View className='pm-form__row'>
                <Text className='pm-form__label'>{t('member.email')}</Text>
                <Input className='pm-form__input' value={createForm.email} placeholder={t('member.emailPlaceholder')} onInput={setCreate('email')} />
              </View>
              <View className='pm-form__row'>
                <Text className='pm-form__label'>{t('member.password')}</Text>
                <Input className='pm-form__input' value={createForm.password} placeholder={t('member.passwordPlaceholder')} onInput={setCreate('password')} />
              </View>
              <View className='pm-form__row'>
                <Text className='pm-form__label'>{t('member.phone')}</Text>
                <Input className='pm-form__input' type='number' value={createForm.phone} placeholder={t('member.phoneOptional')} onInput={setCreate('phone')} />
              </View>
              <View className='pm-form__row'>
                <Text className='pm-form__label'>{t('member.position')}</Text>
                <Input className='pm-form__input' value={createForm.position} placeholder={t('member.positionOptional')} onInput={setCreate('position')} />
              </View>
              <View className='pm-form__actions'>
                {btn(saving, t('acc.cancel'), 'pm-btn--ghost', () => setShowCreate(false))}
                {btn(saving, saving ? t('acc.saving') : t('acc.save'), 'pm-btn--primary', createMember)}
              </View>
            </View>
          )}

          {showPull && (
            <View className='pm-form'>
              <Text className='pm-form__title'>{t('member.pullInTitle')}</Text>
              <Text className='pm-form__desc'>{t('member.pullInDesc')}</Text>
              <View className='pm-form__row'>
                <Text className='pm-form__label'>{t('member.pullTarget')}</Text>
                <View className='pm-form__pick' onClick={pickCandidate}>
                  <Text className={pullLabel ? 'pm-form__pick-text' : 'pm-form__pick-placeholder'}>
                    {pullLabel || t('member.pullPick')}
                  </Text>
                </View>
              </View>
              <View className='pm-form__actions'>
                {btn(pulling, t('acc.cancel'), 'pm-btn--ghost', () => setShowPull(false))}
                {btn(pulling, pulling ? t('acc.saving') : t('member.pullIn'), 'pm-btn--primary', pullIn)}
              </View>
            </View>
          )}

          {inactiveCount > 0 && (
            <View className='pm-inactive-note'>
              {t('member.inactiveCount', { n: inactiveCount })}
            </View>
          )}

          <ScrollView scrollY className='pm-list'>
            {members.length === 0 && !loading && (
              <View className='pm-state'>
                <Text className='pm-state__text'>{t('member.empty')}</Text>
              </View>
            )}
            {members.map((m) => {
              const inactive = m.is_active === false
              return (
                <View key={String(m.id ?? m.user_id ?? m.email)} className={`pm-member ${inactive ? 'pm-member--dim' : ''}`}>
                  <View className='pm-member__head'>
                    <View className='pm-member__head-left'>
                      <Text className='pm-member__name'>{m.full_name || m.email || '-'}</Text>
                      <Text className='pm-member__role'>{t('perm.role.employee')}</Text>
                    </View>
                    <Text className={`badge ${inactive ? 'badge--neutral' : 'badge--success'}`}>
                      {inactive ? t('member.inactive') : t('member.active')}
                    </Text>
                  </View>
                  {!!m.email && <Text className='pm-member__line'>{m.email}</Text>}
                  <View className='pm-member__meta'>
                    {!!m.position && <Text className='pm-member__meta-item'>{m.position}</Text>}
                    {!!m.phone && (
                      <Text className='pm-member__meta-item pm-member__meta-item--link' onClick={() => callPhone(m.phone)}>
                        {m.phone}
                      </Text>
                    )}
                  </View>
                  <View className='pm-member__actions'>
                    <View className='pm-act pm-act--del' onClick={() => removeMember(m)}>{t('member.remove')}</View>
                  </View>
                </View>
              )
            })}
          </ScrollView>
        </>
      )}
    </View>
  )
}