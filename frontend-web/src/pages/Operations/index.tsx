import { useCallback, useEffect, useState } from 'react'
import { Tag, message, Spin, Progress, Drawer, Empty } from 'antd'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import api from '@/lib/api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface FunnelRow {
  stage: string
  key: string
  value: number
  rate: number
}
interface Activity {
  dau: number
  wau: number
  mau: number
  by_role: Record<string, number>
  daily: Record<string, number>
}
interface CountryRow {
  country: string
  properties: number
  rented: number
  occupancy: number
}

const ROLE_LABEL: Record<string, string> = { admin: '管理员', agent: '经纪人', employee: '员工', owner: '业主', tenant: '租客' }

const Operations = () => {
  const [funnel, setFunnel] = useState<FunnelRow[]>([])
  const [activity, setActivity] = useState<Activity | null>(null)
  const [countries, setCountries] = useState<CountryRow[]>([])
  const [sources, setSources] = useState<{ source: string; count: number }[]>([])
  const [revenue, setRevenue] = useState<{ month_paid: number; currency: string }>({ month_paid: 0, currency: 'THB' })
  const [leadsByStage, setLeadsByStage] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  // 钻取状态
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day')
  const [series, setSeries] = useState<Record<string, number>>({})
  const [countryOpen, setCountryOpen] = useState(false)
  const [cityRows, setCityRows] = useState<{ city: string; properties: number; rented: number; occupancy: number }[]>([])
  const [countryName, setCountryName] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/operations/overview')
      const d = res.data?.data ?? res.data
      setFunnel(d.funnel ?? [])
      setActivity(d.activity ?? null)
      setCountries(d.by_country ?? [])
      setSources(d.sources ?? [])
      setRevenue(d.revenue ?? { month_paid: 0, currency: 'THB' })
      setLeadsByStage(d.leads_by_stage ?? {})
      setSeries(d.activity?.daily ?? {})
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '加载运营数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const loadActivity = async (gran: 'day' | 'week' | 'month') => {
    setGranularity(gran)
    try {
      const res = await api.get('/operations/activity', { params: { days: 30, granularity: gran } })
      const d = res.data?.data ?? res.data
      setSeries(d.series ?? {})
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '加载趋势失败')
    }
  }

  const loadCountry = async (country: string) => {
    setCountryName(country)
    setCountryOpen(true)
    try {
      const res = await api.get(`/operations/country/${encodeURIComponent(country)}`)
      const d = res.data?.data ?? res.data
      setCityRows(d.cities ?? [])
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '加载城市数据失败')
      setCityRows([])
    }
  }

  const trendEntries = Object.entries(series).sort((a, b) => a[0].localeCompare(b[0]))
  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1)
  const maxSource = Math.max(...sources.map((s) => s.count), 1)
  const STAGE_LABEL: Record<string, string> = {
    inquiring: '咨询中',
    viewing_scheduled: '看房中',
    negotiating: '谈判中',
    pending_contract: '待签约',
    closed: '已成交',
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title" style={{ margin: '0 0 4px' }}>运营数据看板</h2>
          <p className="rent-page-header__subtitle" style={{ margin: 0 }}>
            转化漏斗 · 活跃度 · 分国家运营数据
          </p>
        </div>
        <div className="rent-page-header__actions">
          <a className="rent-btn rent-btn--secondary" onClick={fetchData}>
            刷新
          </a>
        </div>
      </div>

      {loading && <div className="rent-loading-row"><Spin size="small" style={{ marginRight: 8 }} />加载中...</div>}

      {/* 活跃度 */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {[
          {
            label: '日活 DAU',
            value: activity?.dau ?? 0,
            note: '近 30 日活跃用户',
            icon: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'],
            style: { background: 'rgba(20,184,166,0.1)', color: 'var(--rent-primary)' },
          },
          {
            label: '周活 WAU',
            value: activity?.wau ?? 0,
            note: '近 7 日活跃用户',
            icon: ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
            style: { background: 'rgba(14,165,233,0.1)', color: 'var(--state-info)' },
          },
          {
            label: '月活 MAU',
            value: activity?.mau ?? 0,
            note: '近 30 日活跃用户',
            icon: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6v6l4 2'],
            style: { background: 'rgba(217,119,6,0.12)', color: 'var(--state-warning)' },
          },
          {
            label: '本月实收',
            value: `${revenue.currency || 'THB'} ${Number(revenue.month_paid ?? 0).toLocaleString()}`,
            note: '本月实收合计',
            icon: ['M12 2v20', 'M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
            style: { background: 'rgba(22,163,74,0.1)', color: 'var(--state-success)' },
          },
        ].map((c) => (
          <div className="rent-stat-card" key={c.label}>
            <div className="rent-stat-card__head">
              <div>
                <div className="rent-stat-card__label">{c.label}</div>
                <div className="rent-stat-card__value rent-num" style={{ fontSize: 26 }}>
                  {c.value}
                </div>
                <div className="rent-stat-card__delta rent-text-muted">{c.note}</div>
              </div>
              <div className="rent-stat-card__icon" style={c.style}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {c.icon.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rent-grid rent-grid--2 rent-mb-5">
        {/* 活跃趋势（支持日/周/月上卷） */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">活跃趋势（近 30 日）</h3>
            <div className="rent-chart-range-group">
              {(['day', 'week', 'month'] as const).map((g) => (
                <button
                  key={g}
                  className={`rent-chart-range ${granularity === g ? 'rent-chart-range--active' : ''}`}
                  onClick={() => loadActivity(g)}
                >
                  {g === 'day' ? '日' : g === 'week' ? '周' : '月'}
                </button>
              ))}
            </div>
          </div>
          <div className="rent-card__body">
            <div className="rent-chart-container" style={{ height: 220 }}>
              <Line
                data={{
                  labels: trendEntries.map(([k]) => (granularity === 'day' ? k.slice(5) : k)),
                  datasets: [
                    {
                      label: '活跃用户',
                      data: trendEntries.map(([, v]) => v),
                      borderColor: '#14b8a6',
                      backgroundColor: 'rgba(20,184,166,0.1)',
                      fill: true,
                      tension: 0.3,
                      borderWidth: 2,
                      pointRadius: 2,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                }}
              />
            </div>
          </div>
        </div>

        {/* 转化漏斗 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">流程转化漏斗</h3>
            <span className="rent-text-sm rent-text-muted">线索 → 带看 → 成交 → 签约</span>
          </div>
          <div className="rent-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {funnel.map((f, i) => (
              <div key={f.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{f.stage}</span>
                  <span>
                    <b style={{ color: 'var(--rent-primary)' }}>{f.value}</b>
                    <span className="rent-text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                      {i === 0 ? '基准' : `${f.rate}%`}
                    </span>
                  </span>
                </div>
                <Progress
                  percent={i === 0 ? 100 : Math.round((f.rate / funnel[0]?.rate) * 100)}
                  showInfo={false}
                  strokeColor="var(--rent-primary)"
                  trailColor="rgba(148,163,184,0.15)"
                  strokeWidth={10}
                />
              </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(leadsByStage).map(([k, v]) => (
                <Tag key={k}>{STAGE_LABEL[k] || k} · {v}</Tag>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rent-grid rent-grid--2">
        {/* 分国家数据 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">按国家分布</h3>
          </div>
          <div className="rent-card__body">
            <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="rent-table">
                <thead>
                  <tr>
                    <th>国家</th>
                    <th>房源</th>
                    <th>在租</th>
                    <th>出租率</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {countries.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="rent-empty">
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无国家维度数据" />
                        </div>
                      </td>
                    </tr>
                  ) : (
                    countries.map((r) => (
                      <tr key={r.country}>
                        <td>{r.country}</td>
                        <td className="rent-num">{r.properties}</td>
                        <td className="rent-num">{r.rented}</td>
                        <td style={{ minWidth: 140 }}>
                          <Progress percent={r.occupancy} size="small" strokeColor="var(--state-success)" />
                        </td>
                        <td>
                          <button className="rent-btn rent-btn--ghost rent-btn--sm" type="button" onClick={() => loadCountry(r.country)}>
                            下钻 ›
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 线索渠道 */}
        <div className="rent-card">
          <div className="rent-card__header">
            <h3 className="rent-card__title">线索渠道分布</h3>
            <span className="rent-text-sm rent-text-muted">共 {sources.reduce((s, x) => s + x.count, 0)} 条</span>
          </div>
          <div className="rent-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sources.length === 0 ? (
              <div className="rent-empty rent-text-muted">暂无渠道数据</div>
            ) : (
              sources.map((s) => (
                <div key={s.source}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 500 }}>{s.source}</span>
                    <span style={{ color: 'var(--rent-ink-3)', fontSize: 13 }}>{s.count}</span>
                  </div>
                  <Progress
                    percent={Math.round((s.count / maxSource) * 100)}
                    showInfo={false}
                    strokeColor="var(--state-info)"
                    trailColor="rgba(148,163,184,0.15)"
                    strokeWidth={8}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 国家下钻：城市明细 */}
      <Drawer
        title={`${countryName} · 城市分布`}
        open={countryOpen}
        onClose={() => setCountryOpen(false)}
        width={420}
      >
        {cityRows.length === 0 ? (
          <div className="rent-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无城市维度数据" />
          </div>
        ) : (
          <div className="rent-table-wrap">
            <table className="rent-table">
              <thead>
                <tr>
                  <th>城市</th>
                  <th>房源</th>
                  <th>在租</th>
                  <th>出租率</th>
                </tr>
              </thead>
              <tbody>
                {cityRows.map((r) => (
                  <tr key={r.city}>
                    <td>{r.city}</td>
                    <td className="rent-num">{r.properties}</td>
                    <td className="rent-num">{r.rented}</td>
                    <td style={{ minWidth: 120 }}>
                      <Progress percent={r.occupancy} size="small" strokeColor="var(--state-success)" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default Operations