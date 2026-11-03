/**
 * 「报表」页签：日期/部门/公司筛选 + KPI + 逐日趋势 + 部门与员工明细。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，图表配置与类名保持不变。
 */
import { useMemo } from 'react'
import { Empty, Spin } from 'antd'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'
import { chartTheme, token } from '@/lib/chartTheme'
import { useReportTab } from './hooks/useReportTab'
import type { AttendanceTab } from './attendanceTypes'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default function ReportTab({
  tab,
  companyOptions,
  companyLabel,
  showCompanyPicker,
}: {
  tab: AttendanceTab
  companyOptions: { id: string; name: string | null }[]
  companyLabel: (name: string | null) => string
  showCompanyPicker: boolean
}) {
  const { t } = useTranslation()
  const {
    reportRange,
    setReportRange,
    reportDept,
    setReportDept,
    reportPartner,
    setReportPartner,
    report,
    loadingReport,
    loadReport,
  } = useReportTab(tab)

  const totals = report?.totals
  const dailyMax = useMemo(() => {
    const rows: any[] = report?.daily ?? []
    return Math.max(1, ...rows.map((d) => d.abnormal ?? 0))
  }, [report])

  // 迟到/早退 逐日柱状图数据
  const dailyTrend = useMemo(() => {
    const rows: any[] = report?.daily ?? []
    return {
      labels: rows.map((d: any) => String(d.date).slice(5)),
      late: rows.map((d: any) => d.late ?? 0),
      earlyOut: rows.map((d: any) => d.early_out ?? 0),
    }
  }, [report])

  const dailyChartData = useMemo(
    () => ({
      labels: dailyTrend.labels,
      datasets: [
        {
          label: t('attAdm.lateChart'),
          data: dailyTrend.late,
          backgroundColor: token('--state-warning', '#f59e0b'),
          borderRadius: 4,
          maxBarThickness: 16,
        },
        {
          label: t('attAdm.earlyOutChart'),
          data: dailyTrend.earlyOut,
          backgroundColor: chartTheme.primary,
          borderRadius: 4,
          maxBarThickness: 16,
        },
      ],
    }),
    [dailyTrend, t],
  )

  const dailyChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: chartTheme.legend, boxWidth: 10, boxHeight: 10 } },
        tooltip: {
          backgroundColor: chartTheme.tooltipBg,
          titleColor: chartTheme.tooltipInk,
          bodyColor: chartTheme.tooltipInk,
          borderColor: chartTheme.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: chartTheme.ink3, font: { size: 11 } },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: chartTheme.line },
          ticks: { color: chartTheme.ink3, font: { size: 11 }, precision: 0 },
          border: { display: false },
        },
      },
    }),
    [],
  )

  return (
    <>
      <div className="rent-card rent-mb-5">
        <div className="rent-card__body attAdm-filter">
          <label className="rent-label">{t('attAdm.dateRange')}</label>
          <input
            className="rent-input"
            type="date"
            value={reportRange.start}
            onChange={(e) => setReportRange((p) => ({ ...p, start: e.target.value }))}
          />
          <span className="attAdm-filter__sep">~</span>
          <input
            className="rent-input"
            type="date"
            value={reportRange.end}
            onChange={(e) => setReportRange((p) => ({ ...p, end: e.target.value }))}
          />
          <label className="rent-label">{t('attAdm.department')}</label>
          <input
            className="rent-input"
            placeholder={t('common.all')}
            value={reportDept}
            onChange={(e) => setReportDept(e.target.value)}
          />
          {showCompanyPicker && (
            <>
              <label className="rent-label">{t('attAdm.company')}</label>
              <select
                className="rent-input"
                value={reportPartner}
                onChange={(e) => setReportPartner(e.target.value)}
              >
                <option value="">{t('common.all')}</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {companyLabel(c.name)}
                  </option>
                ))}
              </select>
            </>
          )}
          <button className="rent-btn rent-btn--primary" onClick={loadReport}>
            {t('common.search')}
          </button>
        </div>
      </div>

      {loadingReport ? (
        <div className="rent-empty">
          <Spin size="small" style={{ marginRight: 8 }} />
          {t('common.loading')}
        </div>
      ) : !report ? (
        <div className="rent-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />
        </div>
      ) : (
        <>
          <div className="rent-grid rent-grid--4 rent-mb-5">
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('attAdm.kpiRate')}</div>
              <div className="rent-stat-card__value">
                {totals?.attendance_rate ?? 0}
                <span className="attAdm-unit">%</span>
              </div>
              <div className="rent-text-sm rent-text-muted">
                {t('attAdm.kpiRateHint', {
                  attended: totals?.attended ?? 0,
                  expected: totals?.expected ?? 0,
                })}
              </div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('attAdm.kpiAbnormal')}</div>
              <div className="rent-stat-card__value" style={{ color: 'var(--state-warning)' }}>
                {totals?.abnormal ?? 0}
              </div>
              <div className="rent-text-sm rent-text-muted">
                {t('attendance.statLateCount')} {totals?.late ?? 0} · {t('attendance.stEarlyOut')}{' '}
                {totals?.early_out ?? 0} · {t('attendance.stAbsent')} {totals?.absent ?? 0}
              </div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('attAdm.kpiMinutes')}</div>
              <div className="rent-stat-card__value">{totals?.late_minutes ?? 0}</div>
              <div className="rent-text-sm rent-text-muted">
                {t('attendance.stEarlyOut')} {totals?.early_out_minutes ?? 0}
              </div>
            </div>
            <div className="rent-stat-card">
              <div className="rent-stat-card__label">{t('attAdm.kpiOther')}</div>
              <div className="rent-stat-card__value">{totals?.field_work ?? 0}</div>
              <div className="rent-text-sm rent-text-muted">
                {t('attendance.stLeave')} {totals?.leave ?? 0} · {t('attendance.stField')}{' '}
                {totals?.field_work ?? 0}
              </div>
            </div>
          </div>

          <div className="rent-card rent-mb-5">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('attAdm.trendTitle')}</h3>
              <span className="rent-text-sm rent-text-muted">
                {t('attAdm.attendRate')}：{totals?.attendance_rate ?? 0}%
              </span>
            </div>
            <div className="rent-card__body">
              {dailyTrend.labels.length === 0 ? (
                <div className="rent-empty">{t('common.noData')}</div>
              ) : (
                <div className="attAdm-chart">
                  <Bar data={dailyChartData} options={dailyChartOptions} />
                </div>
              )}
            </div>
          </div>

          <div className="rent-grid rent-grid--2 rent-mb-5">
            <div className="rent-card">
              <div className="rent-card__header">
                <h3 className="rent-card__title">{t('attAdm.deptTitle')}</h3>
              </div>
              <div className="rent-card__body" style={{ padding: 0 }}>
                <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="rent-table">
                    <thead>
                      <tr>
                        <th>{t('attAdm.thDepartment')}</th>
                        <th>{t('attendance.stLate')}</th>
                        <th>{t('attendance.stEarlyOut')}</th>
                        <th>{t('attendance.stAbsent')}</th>
                        <th>{t('attendance.stLeave')}</th>
                        <th>{t('attAdm.thAbnormal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.departments ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="rent-empty">{t('common.noData')}</div>
                          </td>
                        </tr>
                      ) : (
                        report.departments.map((d: any) => (
                          <tr key={d.department}>
                            <td className="rent-text-bold">{d.department}</td>
                            <td>{d.late}</td>
                            <td>{d.early_out}</td>
                            <td>{d.absent}</td>
                            <td>{d.leave}</td>
                            <td>
                              <span className="rent-badge rent-badge--warning">{d.abnormal}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="rent-card">
              <div className="rent-card__header">
                <h3 className="rent-card__title">{t('attAdm.trendTitle')}</h3>
                <span className="rent-caption">{t('attAdm.trendHint')}</span>
              </div>
              <div className="rent-card__body">
                {(report.daily ?? []).length === 0 ? (
                  <div className="rent-empty">{t('common.noData')}</div>
                ) : (
                  <div className="attAdm-trend">
                    {report.daily.map((d: any) => {
                      const value = d.abnormal ?? 0
                      return (
                        <div key={d.date} className="attAdm-trend__row">
                          <span className="attAdm-trend__label">{d.date.slice(5)}</span>
                          <div className="rent-progress attAdm-trend__bar">
                            <div
                              className="rent-progress__bar"
                              style={{ width: `${Math.round((value / dailyMax) * 100)}%` }}
                            />
                          </div>
                          <span className="attAdm-trend__value">
                            {t('attAdm.trendValue', {
                              present: d.present,
                              abnormal: d.abnormal,
                            })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">{t('attAdm.empTitle')}</h3>
              <span className="rent-caption">
                {t('attAdm.employeeCount', { count: report.total_employees ?? 0 })}
              </span>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>{t('attAdm.thEmployee')}</th>
                      <th>{t('attAdm.thDepartment')}</th>
                      <th>{t('attendance.stPresent')}</th>
                      <th>{t('attendance.stLate')}</th>
                      <th>{t('attendance.stEarlyOut')}</th>
                      <th>{t('attendance.stAbsent')}</th>
                      <th>{t('attendance.stLeave')}</th>
                      <th>{t('attendance.stField')}</th>
                      <th>{t('attAdm.thAbnormal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.employees ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={9}>
                          <div className="rent-empty">{t('common.noData')}</div>
                        </td>
                      </tr>
                    ) : (
                      report.employees.map((e: any) => (
                        <tr key={e.employee_id}>
                          <td className="rent-text-bold">{e.name || e.email || '—'}</td>
                          <td>{e.department || '—'}</td>
                          <td>{e.present}</td>
                          <td>{e.late}</td>
                          <td>{e.early_out}</td>
                          <td>{e.absent}</td>
                          <td>{e.leave}</td>
                          <td>{e.field_work}</td>
                          <td>
                            {e.abnormal > 0 ? (
                              <span className="rent-badge rent-badge--warning">{e.abnormal}</span>
                            ) : (
                              <span className="rent-badge rent-badge--neutral">0</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
