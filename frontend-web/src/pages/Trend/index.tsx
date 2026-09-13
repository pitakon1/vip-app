import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { financialApi } from '@/services/api'
import './trend.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface SeriesPoint {
  month: string
  revenue: number
  leases_new: number
  leads_new: number
  viewings_new: number
}

const fmtMoney = (v: number) => `¥${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const Trend = () => {
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await financialApi.trend({ months: 12 })
      const payload = res.data?.data ?? res.data
      setSeries(payload?.series ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取运营趋势失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totals = useMemo(() => {
    let revenue = 0
    let leases = 0
    let leads = 0
    let viewings = 0
    series.forEach((p) => {
      revenue += Number(p.revenue || 0)
      leases += Number(p.leases_new || 0)
      leads += Number(p.leads_new || 0)
      viewings += Number(p.viewings_new || 0)
    })
    return { revenue, leases, leads, viewings }
  }, [series])

  const labels = series.map((p) => p.month)
  const revenueChartData = {
    labels,
    datasets: [
      {
        label: '营收 (¥)',
        data: series.map((p) => Number(p.revenue || 0)),
        backgroundColor: '#14b8a6',
        borderRadius: 6,
        maxBarThickness: 36,
      },
    ],
  }

  const metricChartData = {
    labels,
    datasets: [
      {
        label: '新增合同',
        data: series.map((p) => Number(p.leases_new || 0)),
        backgroundColor: '#14b8a6',
        borderRadius: 4,
        maxBarThickness: 14,
      },
      {
        label: '新增线索',
        data: series.map((p) => Number(p.leads_new || 0)),
        backgroundColor: '#f59e0b',
        borderRadius: 4,
        maxBarThickness: 14,
      },
      {
        label: '预约看房',
        data: series.map((p) => Number(p.viewings_new || 0)),
        backgroundColor: '#0ea5e9',
        borderRadius: 4,
        maxBarThickness: 14,
      },
    ],
  }

  const chartOptions = (fmt: (v: number) => string) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#64748b', boxWidth: 10, boxHeight: 10 } },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#e8edf5',
        bodyColor: '#e8edf5',
        borderColor: '#243044',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 11 } },
        border: { display: false },
      },
      y: {
        grid: { color: '#e6eaf0' },
        ticks: { color: '#94a3b8', font: { size: 11 } },
        border: { display: false },
      },
    },
  })

  const statCards = [
    { label: '累计营收', value: fmtMoney(totals.revenue), icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    { label: '新增合同', value: String(totals.leases), icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { label: '新增线索', value: String(totals.leads), icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { label: '预约看房', value: String(totals.viewings), icon: 'M8 2v4M16 2v4M3 10h18' },
  ]

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">运营趋势</h2>
          <p className="rent-page-header__subtitle">近 12 个月营收与运营指标走势</p>
        </div>
        <div className="rent-page-header__actions">
          <span className="rent-badge rent-badge--neutral">近12个月</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {statCards.map((c) => (
          <div className="rent-stat-card" key={c.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{c.label}</div>
                <div className="rent-stat-card__value trend-chart-col">{c.value}</div>
              </div>
              <div className="rent-stat-card__icon" style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--rent-primary)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {c.icon.split('M').slice(1).map((d, i) => (
                    <path key={i} d={`M${d}`} />
                  ))}
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rent-empty"><div className="rent-text-muted">加载中...</div></div>
      ) : series.length === 0 ? (
        <div className="rent-empty rent-text-muted">暂无运营趋势数据</div>
      ) : (
        <>
          <div className="rent-grid rent-grid--2 rent-mb-5">
            <div className="rent-card">
              <div className="rent-card__header"><h3 className="rent-card__title">月度营收</h3></div>
              <div className="rent-card__body">
                <div className="rent-chart-container" style={{ height: 260 }}>
                  <Bar data={revenueChartData} options={chartOptions(fmtMoney)} />
                </div>
              </div>
            </div>
            <div className="rent-card">
              <div className="rent-card__header"><h3 className="rent-card__title">运营指标（合同 / 线索 / 看房）</h3></div>
              <div className="rent-card__body">
                <div className="rent-chart-container" style={{ height: 260 }}>
                  <Bar data={metricChartData} options={chartOptions((v) => String(Number(v).toLocaleString()))} />
                </div>
              </div>
            </div>
          </div>

          <div className="rent-card">
            <div className="rent-card__header">
              <h3 className="rent-card__title">月度明细</h3>
              <span className="rent-badge rent-badge--neutral">单位：营收为货币，其余为笔数</span>
            </div>
            <div className="rent-card__body" style={{ padding: 0 }}>
              <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="rent-table">
                  <thead>
                    <tr>
                      <th>月份</th>
                      <th style={{ textAlign: 'right' }}>营收 (¥)</th>
                      <th style={{ textAlign: 'right' }}>新增合同</th>
                      <th style={{ textAlign: 'right' }}>新增线索</th>
                      <th style={{ textAlign: 'right' }}>预约看房</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((p) => (
                      <tr key={p.month}>
                        <td>{p.month || '—'}</td>
                        <td className="trend-chart-col" style={{ textAlign: 'right' }}>{fmtMoney(p.revenue)}</td>
                        <td className="trend-chart-col" style={{ textAlign: 'right' }}>{p.leases_new ?? 0}</td>
                        <td className="trend-chart-col" style={{ textAlign: 'right' }}>{p.leads_new ?? 0}</td>
                        <td className="trend-chart-col" style={{ textAlign: 'right' }}>{p.viewings_new ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Trend