/**
 * 管理端 · 合作公司考勤汇总（role=partner_admin）
 *
 * 复用 `/attendance/admin/summary`：作用域由后端 `_resolve_scope_partner` 强制覆盖为
 * 「本公司」，前端不传 partner_id，因此无法越权查看其它公司。支持日期区间检索。
 */
import { useEffect, useState } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { attendanceApi } from '@/services/api'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

interface AttEmployee {
  employee_id?: string
  name?: string | null
  department?: string | null
  attended?: number
  late?: number
  early_out?: number
  absent?: number
  abnormal?: number
}

interface AttData {
  range?: { start?: string; end?: string } | null
  total_employees?: number
  totals?: {
    attended?: number
    late?: number
    early_out?: number
    absent?: number
    abnormal?: number
    attendance_rate?: number
  } | null
  employees?: AttEmployee[]
}

/** 本地日期 YYYY-MM-DD（与后端 date 参数同口径） */
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const today = new Date()
const DEFAULT_START = fmtDate(new Date(today.getFullYear(), today.getMonth(), 1))
const DEFAULT_END = fmtDate(today)

export default function PartnerAttendancePage() {
  const { t } = useI18n()
  const [start, setStart] = useState(DEFAULT_START)
  const [end, setEnd] = useState(DEFAULT_END)
  const [data, setData] = useState<AttData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi
      .summary({ start_date: start, end_date: end })
      .then((res: any) => {
        if (cancelled) return
        setData((res?.data ?? res) ?? null)
      })
      .catch((error) => {
        console.error('[PartnerAttendance] 加载失败', error)
        if (!cancelled) Taro.showToast({ title: t('member.attFailed'), icon: 'none' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [start, end, t])

  const totals = data?.totals ?? {}
  const rows = data?.employees ?? []
  const isEmpty = !data || (data.total_employees ?? 0) === 0

  return (
    <View className='pa-page'>
      <ShellHeader title={t('nav.partnerAttendance')} />

      {/* 日期区间检索 */}
      <View className='pa-filter-card'>
        <Text className='pa-filter-label'>{t('attAdm.dateRange')}</Text>
        <View className='pa-filter'>
          <Picker mode='date' value={start} onChange={(e: any) => setStart(e.detail.value)}>
            <View className='pa-filter__pick'>
              <Text className='pa-filter__pick-text'>{start}</Text>
            </View>
          </Picker>
          <Text className='pa-filter__sep'>~</Text>
          <Picker mode='date' value={end} onChange={(e: any) => setEnd(e.detail.value)}>
            <View className='pa-filter__pick'>
              <Text className='pa-filter__pick-text'>{end}</Text>
            </View>
          </Picker>
        </View>
      </View>

      {loading && isEmpty ? (
        <StateBlock loading text={t('acc.loading')} />
      ) : isEmpty ? (
        <StateBlock empty icon='calendar' text={t('member.attEmpty')} />
      ) : (
        <>
          {!!data?.range?.start && (
            <Text className='pa-range'>
              {t('member.attRange', { start: data.range.start, end: data.range.end || '' })}
            </Text>
          )}

          <View className='pa-stats-row'>
            <View className='pa-stat-card'>
              <Text className='pa-stat-card__value'>{data?.total_employees ?? 0}</Text>
              <Text className='pa-stat-card__label'>{t('member.attMembers')}</Text>
            </View>
            <View className='pa-stat-card'>
              <Text className='pa-stat-card__value'>{Number(totals.attendance_rate ?? 0)}%</Text>
              <Text className='pa-stat-card__label'>{t('member.attRate')}</Text>
            </View>
            <View className='pa-stat-card'>
              <Text className='pa-stat-card__value'>{Number(totals.abnormal ?? 0)}</Text>
              <Text className='pa-stat-card__label'>{t('member.attAbnormal')}</Text>
            </View>
          </View>

          <View className='pa-section-head'>
            <Text className='pa-section-head__title'>{t('member.attByMember')}</Text>
            <Text className='pa-section-head__count'>{t('member.countPeople', { n: rows.length })}</Text>
          </View>

          {rows.map((r) => (
            <View key={r.employee_id || r.name || ''} className='pa-agent'>
              <View className='pa-agent__row'>
                <Text className='pa-agent__name'>{r.name || '-'}</Text>
                <Text className='pa-agent__name'>
                  {t('member.attPresent')} {Number(r.attended ?? 0)}
                </Text>
              </View>
              <Text className='pa-agent__meta'>
                {t('member.attLate')} {Number(r.late ?? 0)} · {t('member.attEarlyOut')}{' '}
                {Number(r.early_out ?? 0)} · {t('member.attAbsent')} {Number(r.absent ?? 0)}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}