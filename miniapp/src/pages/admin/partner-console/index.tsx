/**
 * 管理端 · 合作公司经营驾驶舱（role=partner_admin）
 *
 * 对齐 Web 端 pages/Partner/Console.tsx，接口以 backend/app/api/v1/partner_console.py 为准：
 * 仪表盘 / 佣金对账 / 审批与排班 / 线索与带看 / 成交与收款 / 公司运营 六个页签。
 * 所有请求都由后端按当前 partner_admin 的 partner_id 限定本公司范围，前端不传 partner_id。
 */
import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Picker, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  attendanceApi,
  partnerApi,
  type PartnerApproval,
  type PartnerAppeal,
  type PartnerAnnouncement,
  type PartnerClaim,
  type PartnerContract,
  type PartnerDashboard,
  type PartnerLead,
  type PartnerLease,
  type PartnerLeads,
  type PartnerMaterial,
  type PartnerPayment,
  type PartnerPayments,
  type PartnerRenewals,
  type PartnerSettlementRow,
  type PartnerSettlements,
  type PartnerShift,
  type PartnerTask,
  type PartnerTrip,
  type PartnerViewing
} from '@/services/api'
import { MAX_PAGE_SIZE } from '@/lib/api'
import { fmtDate, fmtMoney } from '@/utils/format'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import { errorText } from '@/lib/errorText'
import { guardRoles } from '@/lib/roleGuard'
import useAuthStore from '@/stores/auth'
import { useI18n } from '@/i18n'
import './index.scss'

type TabKey = 'dashboard' | 'settlements' | 'reviews' | 'leads' | 'business' | 'ops'

interface MemberItem {
  id?: string | number
  user_id?: string | number
  employee_id?: string | number
  email?: string
  full_name?: string
  is_active?: boolean
  [key: string]: any
}

const unwrap = <T,>(res: any): T =>
  (res && typeof res === 'object' && !Array.isArray(res) && 'data' in res ? res.data : res) as T

/** 统一「加载 / 失败 / 重载」：fetcher 由调用方按 deps 变化重建。 */
function useFetch<T>(fetcher: () => Promise<any>, deps: any[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetcher()
      .then((res) => {
        if (!cancelled) setData(unwrap<T>(res))
      })
      .catch((err) => {
        console.error('[PartnerConsole] 加载失败', err)
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [...deps, tick])

  return { data, loading, error, reload: () => setTick((v) => v + 1) }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const monthOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
const currentMonth = () => monthOf(new Date())

/** 月份 → 该月首末日（与后端 date 参数同口径） */
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${pad2(lastDay)}` }
}

const dt = (v?: string | null) => fmtDate(v, 'minute')
const day = (v?: string | null) => fmtDate(v, 'short')

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge--warning',
  processing: 'badge--info',
  approved: 'badge--success',
  paid: 'badge--success',
  completed: 'badge--success',
  succeeded: 'badge--success',
  signed: 'badge--success',
  confirmed: 'badge--info',
  active: 'badge--success',
  rejected: 'badge--error',
  cancelled: 'badge--error',
  no_show: 'badge--error',
  expired: 'badge--error',
  terminated: 'badge--error',
  failed: 'badge--error',
  voided: 'badge--neutral',
  refunded: 'badge--neutral',
  disputed: 'badge--warning',
  draft: 'badge--neutral',
  sent: 'badge--info',
  partially_signed: 'badge--info',
  pending_approval: 'badge--warning'
}

function useLabel() {
  const { t } = useI18n()
  return (prefix: string, value?: string | null) => {
    if (!value) return '—'
    const key = `pc.${prefix}.${value}`
    const label = t(key)
    return label === key ? value : label
  }
}

function StatusTag({ status }: { status?: string | null }) {
  const { t } = useI18n()
  if (!status) return null
  const key = `pc.status.${status}`
  const label = t(key)
  return (
    <Text className={`badge ${STATUS_BADGE[status] ?? 'badge--neutral'}`}>
      {label === key ? status : label}
    </Text>
  )
}

function Act({
  text,
  onClick,
  variant = ''
}: {
  text: string
  onClick: () => void
  variant?: string
}) {
  return (
    <View className={`pc-act ${variant}`} onClick={onClick}>
      <Text className='pc-act__text'>{text}</Text>
    </View>
  )
}

/** 页签内的二级胶囊页签 */
function SubTabs({
  tabs,
  value,
  onChange
}: {
  tabs: Array<{ key: string; label: string }>
  value: string
  onChange: (key: string) => void
}) {
  return (
    <ScrollView scrollX className='pc-subtabs' showScrollbar={false}>
      <View className='pc-subtabs__inner'>
        {tabs.map((item) => (
          <View
            key={item.key}
            className={`pc-subtab${value === item.key ? ' pc-subtab--active' : ''}`}
            onClick={() => onChange(item.key)}
          >
            <Text className='pc-subtab__text'>{item.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

/* ============================ A1 经营驾驶舱 ============================ */
function DashboardTab() {
  const { t } = useI18n()
  const [month, setMonth] = useState(currentMonth())
  const { data, loading, error, reload } = useFetch<PartnerDashboard>(
    () => partnerApi.dashboard({ month }),
    [month]
  )

  const s = data?.stats
  const monthly = data?.monthly ?? []
  const ranking = data?.agent_ranking ?? []
  const propRanking = data?.property_ranking ?? []
  const maxRevenue = Math.max(1, ...monthly.map((m) => Number(m.revenue || 0)))

  const stats = [
    { key: 'deals', label: t('pc.dashboard.deals'), value: String(s?.deals ?? 0) },
    { key: 'revenue', label: t('pc.dashboard.revenue'), value: fmtMoney(s?.revenue) },
    { key: 'receivable', label: t('pc.dashboard.receivable'), value: fmtMoney(s?.receivable) },
    { key: 'paid', label: t('pc.dashboard.paid'), value: fmtMoney(s?.paid) },
    { key: 'pending', label: t('pc.dashboard.pending'), value: fmtMoney(s?.pending) },
    { key: 'agents', label: t('pc.dashboard.activeAgents'), value: String(s?.active_agents ?? 0) },
    { key: 'properties', label: t('pc.dashboard.properties'), value: String(s?.properties ?? 0) }
  ]

  return (
    <View>
      <View className='pc-filter'>
        <Text className='pc-filter__label'>{t('pc.dashboard.month')}</Text>
        <Picker
          mode='date'
          fields='month'
          value={month}
          onChange={(e: any) => setMonth(e.detail.value)}
        >
          <View className='pc-filter__pick'>
            <Text className='pc-filter__pick-text'>{month}</Text>
          </View>
        </Picker>
        <View className='pc-link' onClick={reload}>
          {t('pc.refresh')}
        </View>
      </View>

      {loading && !data ? (
        <StateBlock loading text={t('acc.loading')} />
      ) : error && !data ? (
        <StateBlock
          error
          text={t('pc.loadFailed')}
          retryText={t('acc.retry')}
          onRetry={reload}
        />
      ) : (
        <>
          <View className='pc-stats'>
            {stats.map((item) => (
              <View className='pc-stat' key={item.key}>
                <Text className='pc-stat__value'>{item.value}</Text>
                <Text className='pc-stat__label'>{item.label}</Text>
              </View>
            ))}
          </View>

          <View className='pc-card'>
            <View className='pc-card__head'>
              <Text className='pc-card__title'>{t('pc.dashboard.trend')}</Text>
            </View>
            <View className='pc-chart'>
              {monthly.map((m) => (
                <View className='pc-chart__col' key={`${m.year}-${m.month}`}>
                  <View
                    className='pc-chart__bar'
                    style={{ height: `${Math.max(4, (Number(m.revenue || 0) / maxRevenue) * 140)}rpx` }}
                  />
                  <Text className='pc-chart__label'>
                    {m.month}
                    {t('pc.dashboard.monthUnit')}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View className='pc-card'>
            <View className='pc-card__head'>
              <Text className='pc-card__title'>{t('pc.dashboard.agentRanking')}</Text>
            </View>
            {ranking.length === 0 ? (
              <View className='pc-empty-sm'>{t('pc.dashboard.noRanking')}</View>
            ) : (
              ranking.map((a, i) => (
                <View className='pc-row pc-row--flat' key={a.employee_id}>
                  <View className='pc-row__head'>
                    <Text className='pc-row__title'>
                      {i + 1}. {a.employee_name || '—'}
                    </Text>
                    <Text className='pc-row__value'>{fmtMoney(a.commission)}</Text>
                  </View>
                  <Text className='pc-row__meta'>
                    {t('pc.col.revenue')} {fmtMoney(a.revenue)} · {t('pc.col.deals')} {a.deals ?? 0}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View className='pc-card'>
            <View className='pc-card__head'>
              <Text className='pc-card__title'>{t('pc.dashboard.propertyRanking')}</Text>
            </View>
            {propRanking.length === 0 ? (
              <View className='pc-empty-sm'>{t('pc.dashboard.noRanking')}</View>
            ) : (
              propRanking.map((p) => (
                <View className='pc-row pc-row--flat' key={p.user_id}>
                  <View className='pc-row__head'>
                    <Text className='pc-row__title'>{p.name || '—'}</Text>
                    <Text className='pc-row__value'>
                      {t('pc.col.count')} {p.count}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </View>
  )
}

/* ============================ A2 佣金对账 ============================ */
function SettlementsTab() {
  const { t } = useI18n()
  const label = useLabel()
  const [month, setMonth] = useState(currentMonth())
  const range = useMemo(() => monthRange(month), [month])
  const { data, loading, error, reload } = useFetch<PartnerSettlements>(
    () =>
      partnerApi.settlements({
        start: range.start,
        end: range.end,
        page: 1,
        page_size: MAX_PAGE_SIZE
      }),
    [range.start, range.end]
  )

  const rows: PartnerSettlementRow[] = data?.items ?? []
  const total = data?.total ?? 0
  const sum = data?.sum ?? { base: 0, amount: 0 }

  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    setMonth(monthOf(new Date(y, m - 1 + delta, 1)))
  }

  return (
    <View>
      <View className='pc-month'>
        <View className='pc-month__btn' onClick={() => shift(-1)}>
          <Text className='pc-month__btn-text'>{t('pc.prevMonth')}</Text>
        </View>
        <Text className='pc-month__text'>{month}</Text>
        <View className='pc-month__btn' onClick={() => shift(1)}>
          <Text className='pc-month__btn-text'>{t('pc.nextMonth')}</Text>
        </View>
      </View>

      <View className='pc-stats'>
        <View className='pc-stat'>
          <Text className='pc-stat__value'>{total}</Text>
          <Text className='pc-stat__label'>{t('pc.col.count')}</Text>
        </View>
        <View className='pc-stat'>
          <Text className='pc-stat__value'>{fmtMoney(sum.base)}</Text>
          <Text className='pc-stat__label'>{t('pc.settle.base')}</Text>
        </View>
        <View className='pc-stat'>
          <Text className='pc-stat__value'>{fmtMoney(sum.amount)}</Text>
          <Text className='pc-stat__label'>{t('pc.settle.amount')}</Text>
        </View>
      </View>

      {loading && rows.length === 0 ? (
        <StateBlock loading text={t('acc.loading')} />
      ) : error && rows.length === 0 ? (
        <StateBlock
          error
          text={t('pc.loadFailed')}
          retryText={t('acc.retry')}
          onRetry={reload}
        />
      ) : rows.length === 0 ? (
        <StateBlock empty icon='doc' text={t('pc.settle.empty')} />
      ) : (
        rows.map((r) => (
          <View className='pc-row' key={r.id}>
            <View className='pc-row__head'>
              <Text className='pc-row__title'>{r.employee_name || '—'}</Text>
              <StatusTag status={r.status} />
            </View>
            <Text className='pc-row__meta'>
              {label('deal', r.deal_type)} · {t('pc.col.base')} {fmtMoney(r.commission_base)}
            </Text>
            <View className='pc-row__head'>
              <Text className='pc-row__value'>{fmtMoney(r.commission_amount)}</Text>
              <Text className='pc-row__meta'>{day(r.settled_at || r.created_at)}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}

/* ============================ B 审批与排班 ============================ */
function ReviewsTab() {
  const { t } = useI18n()
  const [sub, setSub] = useState<'trips' | 'appeals' | 'shifts'>('trips')
  const trips = useFetch<PartnerTrip[]>(() => partnerApi.trips(), [])
  const appeals = useFetch<PartnerAppeal[]>(() => partnerApi.appeals(), [])
  const shifts = useFetch<PartnerShift[]>(() => partnerApi.shifts(), [])

  const review = async (kind: 'trips' | 'appeals', id: string, approved: boolean) => {
    const modal = await Taro.showModal({
      title: approved ? t('pc.review.approve') : t('pc.review.reject'),
      content: approved ? t('pc.review.confirmApprove') : t('pc.review.confirmReject')
    }).catch(() => null)
    if (!modal?.confirm) return
    try {
      if (kind === 'trips') await partnerApi.reviewTrip(id, approved)
      else await partnerApi.reviewAppeal(id, approved)
      Taro.showToast({ title: t('pc.review.done'), icon: 'success' })
      if (kind === 'trips') trips.reload()
      else appeals.reload()
    } catch (err) {
      Taro.showToast({ title: errorText(err, t('pc.actionFailed')), icon: 'none' })
    }
  }

  const tripRows = trips.data ?? []
  const appealRows = appeals.data ?? []
  const shiftRows = shifts.data ?? []

  return (
    <View>
      <SubTabs
        value={sub}
        onChange={(k) => setSub(k as typeof sub)}
        tabs={[
          { key: 'trips', label: `${t('pc.review.trips')} (${tripRows.length})` },
          { key: 'appeals', label: `${t('pc.review.appeals')} (${appealRows.length})` },
          { key: 'shifts', label: t('pc.review.shifts') }
        ]}
      />

      {sub === 'trips' &&
        (trips.loading && tripRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : trips.error && tripRows.length === 0 ? (
          <StateBlock
            error
            text={t('pc.loadFailed')}
            retryText={t('acc.retry')}
            onRetry={trips.reload}
          />
        ) : tripRows.length === 0 ? (
          <StateBlock empty icon='calendar' text={t('pc.review.emptyTrips')} />
        ) : (
          tripRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.employee_name || '—'}</Text>
                <StatusTag status={r.status} />
              </View>
              <Text className='pc-row__meta'>
                {day(r.trip_date)} · {r.from_location || '—'} → {r.to_location || '—'}
              </Text>
              {!!r.reason && <Text className='pc-row__line'>{r.reason}</Text>}
              {r.status === 'pending' && (
                <View className='pc-row__actions'>
                  <Act text={t('pc.review.reject')} variant='pc-act--danger' onClick={() => review('trips', r.id, false)} />
                  <Act text={t('pc.review.approve')} variant='pc-act--primary' onClick={() => review('trips', r.id, true)} />
                </View>
              )}
            </View>
          ))
        ))}

      {sub === 'appeals' &&
        (appeals.loading && appealRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : appeals.error && appealRows.length === 0 ? (
          <StateBlock
            error
            text={t('pc.loadFailed')}
            retryText={t('acc.retry')}
            onRetry={appeals.reload}
          />
        ) : appealRows.length === 0 ? (
          <StateBlock empty icon='calendar' text={t('pc.review.emptyAppeals')} />
        ) : (
          appealRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.employee_name || '—'}</Text>
                <StatusTag status={r.status} />
              </View>
              <Text className='pc-row__meta'>{day(r.date)}</Text>
              {!!r.reason && <Text className='pc-row__line'>{r.reason}</Text>}
              {r.status === 'pending' && (
                <View className='pc-row__actions'>
                  <Act text={t('pc.review.reject')} variant='pc-act--danger' onClick={() => review('appeals', r.id, false)} />
                  <Act text={t('pc.review.approve')} variant='pc-act--primary' onClick={() => review('appeals', r.id, true)} />
                </View>
              )}
            </View>
          ))
        ))}

      {sub === 'shifts' &&
        (shifts.loading && shiftRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : shifts.error && shiftRows.length === 0 ? (
          <StateBlock
            error
            text={t('pc.loadFailed')}
            retryText={t('acc.retry')}
            onRetry={shifts.reload}
          />
        ) : shiftRows.length === 0 ? (
          <StateBlock empty icon='calendar' text={t('pc.review.emptyShifts')} />
        ) : (
          shiftRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.employee_name || '—'}</Text>
                <Text className='pc-row__value'>
                  {r.start_time} - {r.end_time}
                </Text>
              </View>
              <Text className='pc-row__meta'>{day(r.date)}</Text>
              {!!r.note && <Text className='pc-row__line'>{r.note}</Text>}
            </View>
          ))
        ))}
    </View>
  )
}

/* ============================ D 线索与带看 ============================ */
function LeadsTab() {
  const { t } = useI18n()
  const label = useLabel()
  const [sub, setSub] = useState<'leads' | 'claims' | 'viewings'>('leads')
  const leads = useFetch<PartnerLeads>(
    () => partnerApi.leads({ page: 1, page_size: MAX_PAGE_SIZE }),
    []
  )
  const claims = useFetch<PartnerClaim[]>(() => partnerApi.claims(), [])
  const viewings = useFetch<PartnerViewing[]>(() => partnerApi.viewings(), [])
  const members = useFetch<MemberItem[]>(() => partnerApi.members(), [])
  // /partner/members 只返回 User，分配接口要的是 Employee.id；用考勤汇总的
  // employee_id（同 scope，partner_admin 有权限）按邮箱/姓名补映射，避免 404。
  const employees = useFetch<{ records?: any[] }>(() => attendanceApi.summary({}), [])

  const [assign, setAssign] = useState<{ type: 'lead' | 'viewing'; id: string } | null>(null)
  const [memberIndex, setMemberIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [claimForm, setClaimForm] = useState({ name: '', phone: '', email: '', days: '60' })

  const memberList = useMemo(
    () => (members.data ?? []).filter((m) => m.is_active !== false),
    [members.data]
  )
  const memberLabels = memberList.map((m) => m.full_name || m.email || String(m.id ?? ''))
  const pickedMember = memberList[memberIndex]

  const leadRows = leads.data?.items ?? []
  const claimRows = claims.data ?? []
  const viewingRows = viewings.data ?? []

  const openAssign = (type: 'lead' | 'viewing', id: string) => {
    setAssign({ type, id })
    setMemberIndex(0)
  }

  /** 成员 → 员工 ID（lead/viewing 分配接口按 Employee.id 校验） */
  const employeeIdOf = (m?: MemberItem): string => {
    if (!m) return ''
    if (m.employee_id) return String(m.employee_id)
    const records: any[] = employees.data?.records ?? []
    const email = String(m.email || '').toLowerCase()
    const name = String(m.full_name || '').trim()
    const byEmail = email
      ? records.find((r) => String(r.email || '').toLowerCase() === email)
      : undefined
    const matched =
      byEmail || (name ? records.find((r) => String(r.name || '').trim() === name) : undefined)
    return String(matched?.employee_id ?? m.id ?? m.user_id ?? '')
  }

  const doAssign = async () => {
    if (saving || !assign) return
    if (!pickedMember) {
      Taro.showToast({ title: t('pc.leads.pickMember'), icon: 'none' })
      return
    }
    const employeeId = employeeIdOf(pickedMember)
    if (!employeeId) return
    setSaving(true)
    try {
      if (assign.type === 'lead') await partnerApi.assignLead(assign.id, employeeId)
      else await partnerApi.assignViewing(assign.id, employeeId)
      Taro.showToast({
        title: assign.type === 'lead' ? t('pc.leads.assigned') : t('pc.leads.dispatched'),
        icon: 'success'
      })
      setAssign(null)
      if (assign.type === 'lead') leads.reload()
      else viewings.reload()
    } catch (err) {
      Taro.showToast({ title: errorText(err, t('pc.actionFailed')), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const submitClaim = async () => {
    if (saving) return
    if (!claimForm.name.trim()) {
      Taro.showToast({ title: t('pc.leads.nameRequired'), icon: 'none' })
      return
    }
    if (!claimForm.phone.trim() && !claimForm.email.trim()) {
      Taro.showToast({ title: t('pc.leads.contactRequired'), icon: 'none' })
      return
    }
    setSaving(true)
    try {
      const res = await partnerApi.claimLead({
        name: claimForm.name.trim(),
        phone: claimForm.phone.trim() || undefined,
        email: claimForm.email.trim() || undefined,
        days: Number(claimForm.days) || 60
      })
      Taro.showToast({
        title: res.duplicated
          ? t('pc.leads.claimDup')
          : t('pc.leads.claimOk', { date: day(res.expires_at) }),
        icon: 'none'
      })
      setClaimForm({ name: '', phone: '', email: '', days: '60' })
      claims.reload()
      leads.reload()
    } catch (err) {
      Taro.showToast({ title: errorText(err, t('pc.leads.claimFailed')), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const setViewingResult = async (id: string, status: 'completed' | 'no_show') => {
    try {
      await partnerApi.viewingResult(id, status)
      Taro.showToast({ title: t('pc.leads.resultOk'), icon: 'success' })
      viewings.reload()
    } catch (err) {
      Taro.showToast({ title: errorText(err, t('pc.actionFailed')), icon: 'none' })
    }
  }

  return (
    <View>
      <SubTabs
        value={sub}
        onChange={(k) => setSub(k as typeof sub)}
        tabs={[
          { key: 'leads', label: `${t('pc.leads.title')} (${leadRows.length})` },
          { key: 'claims', label: t('pc.leads.claims') },
          { key: 'viewings', label: `${t('pc.leads.viewings')} (${viewingRows.length})` }
        ]}
      />

      {assign && (
        <View className='pc-form'>
          <Text className='pc-form__title'>
            {assign.type === 'lead' ? t('pc.leads.assignTitle') : t('pc.leads.dispatchTitle')}
          </Text>
          <Picker
            mode='selector'
            range={memberLabels}
            value={memberIndex}
            onChange={(e: any) => setMemberIndex(Number(e.detail.value))}
          >
            <View className='pc-form__pick'>
              <Text className={pickedMember ? 'pc-form__pick-text' : 'pc-form__placeholder'}>
                {pickedMember ? memberLabels[memberIndex] : t('pc.leads.pickMember')}
              </Text>
            </View>
          </Picker>
          <View className='pc-form__actions'>
            <Act text={t('acc.cancel')} variant='pc-act--ghost' onClick={() => setAssign(null)} />
            <Act
              text={saving ? t('acc.saving') : t('common.confirm')}
              variant='pc-act--primary'
              onClick={doAssign}
            />
          </View>
        </View>
      )}

      {sub === 'leads' &&
        (leads.loading && leadRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : leads.error && leadRows.length === 0 ? (
          <StateBlock
            error
            text={t('pc.loadFailed')}
            retryText={t('acc.retry')}
            onRetry={leads.reload}
          />
        ) : leadRows.length === 0 ? (
          <StateBlock empty icon='user' text={t('pc.leads.empty')} />
        ) : (
          leadRows.map((r: PartnerLead) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.name}</Text>
                <Text className='badge badge--info'>{label('stage', r.stage)}</Text>
              </View>
              <Text className='pc-row__meta'>
                {r.phone || r.email || '—'} · {t('pc.leads.followUp')}{' '}
                {r.assignee_name || t('pc.leads.unassigned')}
              </Text>
              <View className='pc-row__head'>
                <Text className='pc-row__meta'>{dt(r.created_at)}</Text>
                <Act text={t('pc.leads.assign')} onClick={() => openAssign('lead', r.id)} />
              </View>
            </View>
          ))
        ))}

      {sub === 'claims' && (
        <>
          <View className='pc-form'>
            <Text className='pc-form__title'>{t('pc.leads.claimForm')}</Text>
            <View className='pc-form__row'>
              <Text className='pc-form__label'>{t('pc.leads.name')}</Text>
              <Input
                className='pc-form__input'
                value={claimForm.name}
                placeholder={t('pc.leads.namePlaceholder')}
                onInput={(e: any) => setClaimForm((f) => ({ ...f, name: e.detail.value }))}
              />
            </View>
            <View className='pc-form__row'>
              <Text className='pc-form__label'>{t('pc.leads.phone')}</Text>
              <Input
                className='pc-form__input'
                type='number'
                value={claimForm.phone}
                placeholder={t('pc.leads.phonePlaceholder')}
                onInput={(e: any) => setClaimForm((f) => ({ ...f, phone: e.detail.value }))}
              />
            </View>
            <View className='pc-form__row'>
              <Text className='pc-form__label'>{t('pc.leads.email')}</Text>
              <Input
                className='pc-form__input'
                value={claimForm.email}
                placeholder={t('pc.leads.emailPlaceholder')}
                onInput={(e: any) => setClaimForm((f) => ({ ...f, email: e.detail.value }))}
              />
            </View>
            <View className='pc-form__row'>
              <Text className='pc-form__label'>{t('pc.leads.days')}</Text>
              <Input
                className='pc-form__input'
                type='number'
                value={claimForm.days}
                placeholder='60'
                onInput={(e: any) => setClaimForm((f) => ({ ...f, days: e.detail.value }))}
              />
            </View>
            <View className='pc-form__actions'>
              <Act
                text={saving ? t('acc.saving') : t('pc.leads.submitClaim')}
                variant='pc-act--primary'
                onClick={submitClaim}
              />
            </View>
          </View>

          {claims.loading && claimRows.length === 0 ? (
            <StateBlock loading text={t('acc.loading')} />
          ) : claims.error && claimRows.length === 0 ? (
            <StateBlock
              error
              text={t('pc.loadFailed')}
              retryText={t('acc.retry')}
              onRetry={claims.reload}
            />
          ) : claimRows.length === 0 ? (
            <StateBlock empty icon='user' text={t('pc.leads.emptyClaims')} />
          ) : (
            claimRows.map((r) => (
              <View className='pc-row' key={r.id}>
                <View className='pc-row__head'>
                  <Text className='pc-row__title'>{r.fingerprint}</Text>
                  <StatusTag status={r.status} />
                </View>
                <Text className='pc-row__meta'>
                  {label('fingerprint', r.fingerprint_type)} · {t('pc.leads.protectUntil')}{' '}
                  {day(r.expires_at)}
                </Text>
              </View>
            ))
          )}
        </>
      )}

      {sub === 'viewings' &&
        (viewings.loading && viewingRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : viewings.error && viewingRows.length === 0 ? (
          <StateBlock
            error
            text={t('pc.loadFailed')}
            retryText={t('acc.retry')}
            onRetry={viewings.reload}
          />
        ) : viewingRows.length === 0 ? (
          <StateBlock empty icon='calendar' text={t('pc.leads.emptyViewings')} />
        ) : (
          viewingRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.property_address || '—'}</Text>
                <StatusTag status={r.status} />
              </View>
              <Text className='pc-row__meta'>
                {r.visitor_name || '—'} · {dt(r.scheduled_at)}
              </Text>
              <Text className='pc-row__meta'>
                {t('pc.col.employee')} {r.assignee_name || t('pc.leads.unassigned')}
              </Text>
              <View className='pc-row__actions'>
                <Act text={t('pc.leads.dispatch')} onClick={() => openAssign('viewing', r.id)} />
                {r.status !== 'completed' && r.status !== 'cancelled' && (
                  <>
                    <Act
                      text={t('pc.leads.noShow')}
                      variant='pc-act--danger'
                      onClick={() => setViewingResult(r.id, 'no_show')}
                    />
                    <Act
                      text={t('pc.leads.complete')}
                      variant='pc-act--primary'
                      onClick={() => setViewingResult(r.id, 'completed')}
                    />
                  </>
                )}
              </View>
            </View>
          ))
        ))}
    </View>
  )
}

/* ============================ E 成交与收款 ============================ */
function BusinessTab() {
  const { t } = useI18n()
  const label = useLabel()
  const [sub, setSub] = useState<'leases' | 'contracts' | 'renewals' | 'payments'>('leases')
  const [overdueOnly, setOverdueOnly] = useState(false)

  const leases = useFetch<{ total: number; items: PartnerLease[] }>(
    () => partnerApi.leases({ page: 1, page_size: MAX_PAGE_SIZE }),
    []
  )
  const contracts = useFetch<{ total: number; items: PartnerContract[] }>(
    () => partnerApi.contracts({ page: 1, page_size: MAX_PAGE_SIZE }),
    []
  )
  const renewals = useFetch<PartnerRenewals>(() => partnerApi.renewals(60), [])
  const payments = useFetch<PartnerPayments>(
    () => partnerApi.payments({ overdue: overdueOnly || undefined, page: 1, page_size: MAX_PAGE_SIZE }),
    [overdueOnly]
  )

  const leaseRows = leases.data?.items ?? []
  const contractRows = contracts.data?.items ?? []
  const payRows = payments.data?.items ?? []
  const buckets = (renewals.data?.buckets ?? []).filter((b) => (b.items ?? []).length > 0)
  const now = Date.now()

  const isOverdue = (p: PartnerPayment) =>
    !!p.due_date &&
    new Date(p.due_date).getTime() < now &&
    p.status !== 'succeeded' &&
    p.status !== 'refunded'

  return (
    <View>
      <SubTabs
        value={sub}
        onChange={(k) => setSub(k as typeof sub)}
        tabs={[
          { key: 'leases', label: `${t('pc.biz.leases')} (${leaseRows.length})` },
          { key: 'contracts', label: `${t('pc.biz.contracts')} (${contractRows.length})` },
          { key: 'renewals', label: `${t('pc.biz.renewals')} (${renewals.data?.total ?? 0})` },
          { key: 'payments', label: t('pc.biz.payments') }
        ]}
      />

      {sub === 'leases' &&
        (leases.loading && leaseRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : leases.error && leaseRows.length === 0 ? (
          <StateBlock error text={t('pc.loadFailed')} retryText={t('acc.retry')} onRetry={leases.reload} />
        ) : leaseRows.length === 0 ? (
          <StateBlock empty icon='doc' text={t('pc.biz.emptyLeases')} />
        ) : (
          leaseRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.lease_no || '—'}</Text>
                <StatusTag status={r.status} />
              </View>
              <Text className='pc-row__meta'>{r.property_address || '—'}</Text>
              <Text className='pc-row__meta'>
                {day(r.start_date)} ~ {day(r.end_date)} · {fmtMoney(r.monthly_rent)}
              </Text>
            </View>
          ))
        ))}

      {sub === 'contracts' &&
        (contracts.loading && contractRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : contracts.error && contractRows.length === 0 ? (
          <StateBlock error text={t('pc.loadFailed')} retryText={t('acc.retry')} onRetry={contracts.reload} />
        ) : contractRows.length === 0 ? (
          <StateBlock empty icon='doc' text={t('pc.biz.emptyContracts')} />
        ) : (
          contractRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.title || r.contract_no || '—'}</Text>
                <StatusTag status={r.status} />
              </View>
              <Text className='pc-row__meta'>
                {r.contract_no || '—'} · {label('kind', r.kind)}
              </Text>
              <Text className='pc-row__meta'>
                {t('pc.col.signedAt')} {dt(r.signed_at)}
              </Text>
            </View>
          ))
        ))}

      {sub === 'renewals' &&
        (renewals.loading && !renewals.data ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : renewals.error && !renewals.data ? (
          <StateBlock error text={t('pc.loadFailed')} retryText={t('acc.retry')} onRetry={renewals.reload} />
        ) : buckets.length === 0 ? (
          <StateBlock empty icon='calendar' text={t('pc.biz.emptyRenewals')} />
        ) : (
          buckets.map((b) => (
            <View className='pc-card' key={b.key}>
              <View className='pc-card__head'>
                <Text className='pc-card__title'>
                  {t(`pc.biz.bucket${b.key}`)}（{b.items.length}）
                </Text>
              </View>
              {b.items.map((item) => (
                <View className='pc-row pc-row--flat' key={item.lease_id}>
                  <View className='pc-row__head'>
                    <Text className='pc-row__title'>{item.lease_no || '—'}</Text>
                    <Text className='pc-row__value'>{fmtMoney(item.monthly_rent)}</Text>
                  </View>
                  <Text className='pc-row__meta'>
                    {t('pc.col.end')} {day(item.end_date)} · {t('pc.col.daysLeft')} {item.days_left}
                  </Text>
                </View>
              ))}
            </View>
          ))
        ))}

      {sub === 'payments' && (
        <>
          <View className='pc-filter'>
            <View
              className={`pc-chip${overdueOnly ? ' pc-chip--active' : ''}`}
              onClick={() => setOverdueOnly((v) => !v)}
            >
              <Text className='pc-chip__text'>{t('pc.biz.onlyOverdue')}</Text>
            </View>
            <Text className='pc-filter__label'>
              {t('pc.biz.outstanding', { v: fmtMoney(payments.data?.outstanding) })}
            </Text>
          </View>
          {payments.loading && payRows.length === 0 ? (
            <StateBlock loading text={t('acc.loading')} />
          ) : payments.error && payRows.length === 0 ? (
            <StateBlock error text={t('pc.loadFailed')} retryText={t('acc.retry')} onRetry={payments.reload} />
          ) : payRows.length === 0 ? (
            <StateBlock empty icon='doc' text={t('pc.biz.emptyPayments')} />
          ) : (
            payRows.map((r) => {
              const overdue = isOverdue(r)
              return (
                <View className={`pc-row${overdue ? ' pc-row--overdue' : ''}`} key={r.id}>
                  <View className='pc-row__head'>
                    <Text className='pc-row__title'>{r.receipt_no || '—'}</Text>
                    <StatusTag status={overdue ? 'expired' : r.status} />
                  </View>
                  <Text className='pc-row__meta'>
                    {label('payType', r.payment_type)} · {t('pc.col.due')} {fmtMoney(r.total_due, r.currency)}
                  </Text>
                  <Text className={`pc-row__meta${overdue ? ' pc-row__meta--danger' : ''}`}>
                    {t('pc.col.dueDate')} {dt(r.due_date)}
                  </Text>
                </View>
              )
            })
          )}
        </>
      )}
    </View>
  )
}

/* ============================ F 公司运营 ============================ */
function OpsTab() {
  const { t } = useI18n()
  const [sub, setSub] = useState<'announcements' | 'tasks' | 'approvals' | 'materials'>(
    'announcements'
  )
  const announcements = useFetch<PartnerAnnouncement[]>(() => partnerApi.announcements(), [])
  const tasks = useFetch<PartnerTask[]>(() => partnerApi.tasks(), [])
  const approvals = useFetch<PartnerApproval[]>(() => partnerApi.approvals(), [])
  const materials = useFetch<PartnerMaterial[]>(() => partnerApi.materials(), [])

  const annRows = announcements.data ?? []
  const taskRows = tasks.data ?? []
  const approvalRows = approvals.data ?? []
  const materialRows = materials.data ?? []

  const completeTask = async (id: string) => {
    try {
      await partnerApi.completeTask(id)
      Taro.showToast({ title: t('pc.ops.taskDone'), icon: 'success' })
      tasks.reload()
    } catch (err) {
      Taro.showToast({ title: errorText(err, t('pc.actionFailed')), icon: 'none' })
    }
  }

  const reviewApproval = async (id: string, approved: boolean) => {
    const modal = await Taro.showModal({
      title: approved ? t('pc.review.approve') : t('pc.review.reject'),
      content: approved ? t('pc.review.confirmApprove') : t('pc.review.confirmReject')
    }).catch(() => null)
    if (!modal?.confirm) return
    try {
      await partnerApi.reviewApproval(id, approved)
      Taro.showToast({
        title: approved ? t('pc.ops.approved') : t('pc.ops.rejected'),
        icon: 'success'
      })
      approvals.reload()
    } catch (err) {
      Taro.showToast({ title: errorText(err, t('pc.actionFailed')), icon: 'none' })
    }
  }

  const openMaterial = (url: string) => {
    if (!url) return
    Taro.setClipboardData({ data: url }).then(() => {
      Taro.showToast({ title: t('pc.ops.copied'), icon: 'none' })
    })
  }

  const scopeText = (scope: string) =>
    scope === 'platform' ? t('pc.ops.scopePlatform') : t('pc.ops.scopeCompany')

  return (
    <View>
      <SubTabs
        value={sub}
        onChange={(k) => setSub(k as typeof sub)}
        tabs={[
          { key: 'announcements', label: t('pc.ops.announcements') },
          { key: 'tasks', label: t('pc.ops.tasks') },
          { key: 'approvals', label: t('pc.ops.approvals') },
          { key: 'materials', label: t('pc.ops.materials') }
        ]}
      />

      {sub === 'announcements' &&
        (announcements.loading && annRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : announcements.error && annRows.length === 0 ? (
          <StateBlock error text={t('pc.loadFailed')} retryText={t('acc.retry')} onRetry={announcements.reload} />
        ) : annRows.length === 0 ? (
          <StateBlock empty icon='doc' text={t('pc.ops.emptyAnnouncements')} />
        ) : (
          annRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>
                  {r.is_pinned ? '📌 ' : ''}
                  {r.title}
                </Text>
                <Text className='badge badge--neutral'>{scopeText(r.scope)}</Text>
              </View>
              {!!r.content && <Text className='pc-row__line'>{r.content}</Text>}
              <Text className='pc-row__meta'>
                {r.publisher_name || '—'} · {dt(r.published_at)}
              </Text>
            </View>
          ))
        ))}

      {sub === 'tasks' &&
        (tasks.loading && taskRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : tasks.error && taskRows.length === 0 ? (
          <StateBlock error text={t('pc.loadFailed')} retryText={t('acc.retry')} onRetry={tasks.reload} />
        ) : taskRows.length === 0 ? (
          <StateBlock empty icon='doc' text={t('pc.ops.emptyTasks')} />
        ) : (
          taskRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.title}</Text>
                <StatusTag status={r.status === 'completed' ? 'completed' : 'pending'} />
              </View>
              {!!r.content && <Text className='pc-row__line'>{r.content}</Text>}
              <Text className='pc-row__meta'>
                {t('pc.col.assignee')} {r.assignee_name || '—'}
                {r.due_at ? ` · ${t('pc.col.dueAt')} ${dt(r.due_at)}` : ''}
              </Text>
              {r.status !== 'completed' && (
                <View className='pc-row__actions'>
                  <Act text={t('pc.ops.complete')} variant='pc-act--primary' onClick={() => completeTask(r.id)} />
                </View>
              )}
            </View>
          ))
        ))}

      {sub === 'approvals' &&
        (approvals.loading && approvalRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : approvals.error && approvalRows.length === 0 ? (
          <StateBlock error text={t('pc.loadFailed')} retryText={t('acc.retry')} onRetry={approvals.reload} />
        ) : approvalRows.length === 0 ? (
          <StateBlock empty icon='doc' text={t('pc.ops.emptyApprovals')} />
        ) : (
          approvalRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.title}</Text>
                <StatusTag status={r.status} />
              </View>
              <Text className='pc-row__meta'>
                {r.kind} · {r.amount != null ? fmtMoney(r.amount) : '—'} · {t('pc.ops.applicant')}{' '}
                {r.applicant_name || '—'}
              </Text>
              {!!r.content && <Text className='pc-row__line'>{r.content}</Text>}
              {r.status === 'pending' && (
                <View className='pc-row__actions'>
                  <Act text={t('pc.review.reject')} variant='pc-act--danger' onClick={() => reviewApproval(r.id, false)} />
                  <Act text={t('pc.review.approve')} variant='pc-act--primary' onClick={() => reviewApproval(r.id, true)} />
                </View>
              )}
            </View>
          ))
        ))}

      {sub === 'materials' &&
        (materials.loading && materialRows.length === 0 ? (
          <StateBlock loading text={t('acc.loading')} />
        ) : materials.error && materialRows.length === 0 ? (
          <StateBlock error text={t('pc.loadFailed')} retryText={t('acc.retry')} onRetry={materials.reload} />
        ) : materialRows.length === 0 ? (
          <StateBlock empty icon='doc' text={t('pc.ops.emptyMaterials')} />
        ) : (
          materialRows.map((r) => (
            <View className='pc-row' key={r.id}>
              <View className='pc-row__head'>
                <Text className='pc-row__title'>{r.title}</Text>
                <Text className='badge badge--neutral'>{scopeText(r.scope)}</Text>
              </View>
              {!!r.description && <Text className='pc-row__line'>{r.description}</Text>}
              <Text className='pc-row__meta' onClick={() => openMaterial(r.url)}>
                {r.category} · {r.url}
              </Text>
            </View>
          ))
        ))}
    </View>
  )
}

export default function PartnerConsolePage() {
  const { t } = useI18n()
  const [authorized, setAuthorized] = useState(false)
  const [tab, setTab] = useState<TabKey>('dashboard')
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)

  useDidShow(() => {
    // 仅合作公司管理员可进；其它角色直连时回各自首页，避免发必然 403 的请求
    loadFromStorage()
    if (!guardRoles(['partner_admin'])) return
    setAuthorized(true)
  })

  const tabs = useMemo(
    () => [
      { key: 'dashboard' as TabKey, label: t('pc.tab.dashboard') },
      { key: 'settlements' as TabKey, label: t('pc.tab.settlements') },
      { key: 'reviews' as TabKey, label: t('pc.tab.reviews') },
      { key: 'leads' as TabKey, label: t('pc.tab.leads') },
      { key: 'business' as TabKey, label: t('pc.tab.business') },
      { key: 'ops' as TabKey, label: t('pc.tab.ops') }
    ],
    [t]
  )

  if (!authorized) {
    return (
      <View className='pc-page'>
        <ShellHeader title={t('nav.partnerConsole')} />
        <StateBlock loading text={t('acc.loading')} />
      </View>
    )
  }

  return (
    <View className='pc-page'>
      <ShellHeader title={t('nav.partnerConsole')} />

      {/* 顶部横向胶囊页签 */}
      <ScrollView scrollX className='pc-tabs' showScrollbar={false}>
        <View className='pc-tabs__inner'>
          {tabs.map((item) => (
            <View
              key={item.key}
              className={`pc-tab${tab === item.key ? ' pc-tab--active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              <Text className='pc-tab__text'>{item.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <ScrollView scrollY className='pc-scroll'>
        <View className='pc-body'>
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'settlements' && <SettlementsTab />}
          {tab === 'reviews' && <ReviewsTab />}
          {tab === 'leads' && <LeadsTab />}
          {tab === 'business' && <BusinessTab />}
          {tab === 'ops' && <OpsTab />}
          <View className='pc-bottom-space' />
        </View>
      </ScrollView>
    </View>
  )
}
