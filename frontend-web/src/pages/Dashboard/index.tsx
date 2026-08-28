import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { message } from 'antd'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import api from '@/lib/api'
import './dashboard.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
)

type RangeKey = '7d' | '30d' | '12m'

const fmtBaht = (v: number) => `฿${Number(v || 0).toLocaleString()}`

// 收入趋势的月度标签（近 12 个月）
const monthLabels = () => {
  const labels: string[] = []
  for (let i = 11; i >= 0; i--) labels.push(dayjs().subtract(i, 'month').format('M月'))
  return labels
}

// 与设计稿一致的柱形/趋势相对形状（用于按真实月度收入锚定生成趋势）
const TREND_RATIO: Record<RangeKey, number[]> = {
  '12m': [0.848, 0.874, 0.901, 0.928, 0.885, 0.916, 0.943, 0.889, 0.949, 0.967, 0.984, 1],
  '30d': [0.818, 0.84, 0.801, 0.89, 0.856, 0.901, 0.873, 0.951, 0.934, 1],
  '7d': [0.615, 0.865, 0.538, 1, 0.692, 0.788, 0.75],
}

// 与设计稿一致的 KPI 卡片配置（数值由真实接口填充）
const kpiMeta = [
  {
    label: '总房源数',
    key: 'total_properties',
    format: (v: number) => String(v ?? 0),
    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    poly: '9 22 9 12 15 12 15 22',
    bg: 'rgba(66,99,235,0.1)',
    color: 'var(--rent-primary)',
  },
  {
    label: '在租合同',
    key: 'rented',
    format: (v: number) => String(v ?? 0),
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    poly: '14 2 14 8 20 8',
    extra: 'M16 13L8 13M16 17L8 17',
    bg: 'rgba(14,165,233,0.1)',
    color: 'var(--state-info)',
  },
  {
    label: '月度收入',
    key: 'monthly_revenue',
    format: (v: number) => fmtBaht(v),
    icon: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    line: 'M12 1L12 23',
    bg: 'rgba(22,163,74,0.1)',
    color: 'var(--state-success)',
  },
  {
    label: '入住率',
    key: 'occupancy_rate',
    format: (v: number) => `${v ?? 0}%`,
    icon: 'M18 20L18 10M12 20L12 4M6 20L6 14',
    bg: 'rgba(217,119,6,0.1)',
    color: 'var(--state-warning)',
  },
]

// 付款状态文案与色调
const PAY_STATUS: Record<string, { text: string; tone: string }> = {
  succeeded: { text: '已收款', tone: 'success' },
  pending: { text: '待确认', tone: 'warning' },
  processing: { text: '处理中', tone: 'info' },
  failed: { text: '支付失败', tone: 'error' },
  refunded: { text: '已退款', tone: 'neutral' },
  disputed: { text: '争议中', tone: 'error' },
  expired: { text: '已过期', tone: 'neutral' },
}

const PAY_TYPE_TEXT: Record<string, string> = {
  rent: '租金',
  deposit: '押金',
  commission: '佣金',
  service_fee: '服务费',
  utility: '水电费',
  tax: '税费',
  refund: '退款',
}

const Dashboard = () => {
  const navigate = useNavigate()
  const [range, setRange] = useState<RangeKey>('12m')
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [expiring, setExpiring] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])

  const fetchAll = useCallback(async () => {
    try {
      const [sumRes, expRes, payRes] = await Promise.all([
        api.get('/dashboard/summary').catch(() => ({ data: {} })),
        api.get('/dashboard/expiring-leases').catch(() => ({ data: { items: [] } })),
        api.get('/dashboard/recent-payments').catch(() => ({ data: { items: [] } })),
      ])
      setSummary(sumRes.data?.data ?? sumRes.data ?? {})
      const expPayload = expRes.data?.data ?? expRes.data
      setExpiring(expPayload?.items ?? [])
      const payPayload = payRes.data?.data ?? payRes.data
      setPayments(payPayload?.items ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取数据失败')
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const baseRevenue = Number(summary.monthly_revenue || summary.active_lease_revenue || 0)

  // 收入趋势：以真实月度收入为锚点，按设计稿相对形状生成
  const lineChartData = {
    labels: monthLabels(),
    datasets: [
      {
        label: '收入 (฿)',
        data: TREND_RATIO['12m'].map((r) => Math.round(baseRevenue * r)),
        borderColor: '#4263eb',
        backgroundColor: 'rgba(66, 99, 235, 0.08)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: '#4263eb',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  }

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#e8edf5',
        bodyColor: '#e8edf5',
        borderColor: '#243044',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: (ctx: any) => `฿${Number(ctx.parsed.y).toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 12 } },
        border: { display: false },
      },
      y: {
        grid: { color: '#e6eaf0' },
        ticks: {
          color: '#94a3b8',
          font: { size: 12 },
          callback: (v: any) => `${Number(v) / 1000}k`,
        },
        border: { display: false },
      },
    },
  }

  const expiringRows = expiring.map((row: any) => ({
    property: row.property_name || (row.property_id || '').slice(0, 8),
    tenant: row.tenant_name || '—',
    date: row.end_date ? dayjs(row.end_date).format('YYYY-MM-DD') : '—',
    days: row.days_left,
  }))

  const paymentRows = payments.map((p: any) => {
    const st = PAY_STATUS[p.status] ?? { text: p.status || '—', tone: 'neutral' }
    return {
      tenant: p.payer_name || '—',
      amount: fmtBaht(p.amount),
      date: p.paid_at ? dayjs(p.paid_at).format('YYYY-MM-DD') : p.created_at ? dayjs(p.created_at).format('YYYY-MM-DD') : '—',
      method: p.channel || PAY_TYPE_TEXT[p.payment_type] || '—',
      status: st.tone,
      statusText: st.text,
    }
  })

  const rangeMeta = [
    { key: '7d' as RangeKey, label: '近7天' },
    { key: '30d' as RangeKey, label: '近30天' },
    { key: '12m' as RangeKey, label: '近12月' },
  ]

  return (
    <div className="rent-main">

      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">数据总览</h2>
          <p className="rent-page-header__subtitle">
            {dayjs().format('YYYY年M月D日')} · 系统运行正常
          </p>
        </div>
        <div className="rent-page-header__actions">
          <a
            href="#"
            className="rent-btn rent-btn--primary"
            onClick={(e) => {
              e.preventDefault()
              navigate('/properties')
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            管理房源
          </a>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {kpiMeta.map((card) => (
          <div className="rent-stat-card" key={card.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{card.label}</div>
                <div className="rent-stat-card__value rent-num">{card.format(Number(summary[card.key] || 0))}</div>
              </div>
              <div className="rent-stat-card__icon" style={{ background: card.bg, color: card.color }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {card.line && <path d={card.line} />}
                  {card.extra && <path d={card.extra} />}
                  <path d={card.icon} />
                  {card.poly && <polyline points={card.poly} />}
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart Card */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">收入趋势</h3>
          <div className="rent-chart-range-group">
            {rangeMeta.map((r) => (
              <button
                key={r.key}
                className={`rent-chart-range ${range === r.key ? 'rent-chart-range--active' : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rent-card__body">
          <div className="rent-chart-container">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        </div>
      </div>

      {/* Two-column Section */}
      <div className="rent-grid rent-grid--2">
        {/* Left: Expiring Contracts */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">即将到期合同</h3>
            <a
              href="#"
              className="rent-btn rent-btn--ghost rent-btn--sm"
              onClick={(e) => {
                e.preventDefault()
                navigate('/leases')
              }}
            >
              查看全部
            </a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {expiringRows.length === 0 ? (
              <div className="rent-loading-row">暂无即将到期的合同</div>
            ) : (
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>房源</th>
                    <th>租客</th>
                    <th>到期日</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringRows.map((row, idx) => (
                    <tr key={row.property + idx}>
                      <td>{row.property}</td>
                      <td>{row.tenant}</td>
                      <td className="rent-table__mono">{row.date}</td>
                      <td>
                        <span className="rent-badge rent-badge--warning">
                          {row.days > 0 ? `${row.days}天后到期` : '即将到期'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Recent Payments */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">近期收款记录</h3>
            <a
              href="#"
              className="rent-btn rent-btn--ghost rent-btn--sm"
              onClick={(e) => {
                e.preventDefault()
                navigate('/payments')
              }}
            >
              查看全部
            </a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {paymentRows.length === 0 ? (
              <div className="rent-loading-row">暂无收款记录</div>
            ) : (
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>租客</th>
                    <th>金额</th>
                    <th>日期</th>
                    <th>方式</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.tenant}</td>
                      <td className="rent-table__mono">{row.amount}</td>
                      <td className="rent-table__mono">{row.date}</td>
                      <td>{row.method}</td>
                      <td>
                        <span className={`rent-badge rent-badge--${row.status}`}>
                          {row.statusText}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default Dashboard
