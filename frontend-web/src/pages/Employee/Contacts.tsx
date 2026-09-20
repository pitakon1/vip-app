import { useCallback, useEffect, useMemo, useState } from 'react'
import { message, Spin, Empty, Alert, Button } from 'antd'
import { employeesApi } from '@/services/api'
import { downloadReport } from '@/lib/download'
import './contacts.css'

interface EmployeeContact {
  id: string
  employee_no?: string
  full_name: string
  position?: string
  department?: string
  phone?: string
  email?: string
  wechat?: string
  line?: string
}

interface DeptStat {
  name: string
  count: number
  delta: string
  tone: Tone
}

type Tone = 'primary' | 'success' | 'info' | 'warning'

// 部门清单来自接口，色调按部门次序循环取用（不再硬编码部门/人数）
const TONES: Tone[] = ['primary', 'success', 'info', 'warning']

const DEPT_COLOR: Record<Tone, string> = {
  primary: 'var(--rent-primary)',
  success: 'var(--state-success)',
  info: 'var(--state-info)',
  warning: 'var(--state-warning)',
}

const TONE_RGB: Record<Tone, string> = {
  primary: '20,184,166',
  success: '22,163,74',
  info: '14,165,233',
  warning: '217,119,6',
}

const ALL_DEPTS = '全部部门'

// 内联 SVG 图标（照抄设计稿）
const IconPhone = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

const IconMsg = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const IconWa = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.52 0-3.01-.41-4.3-1.18l-.31-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.35c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.15.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.15-.25.23-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" />
  </svg>
)

const IconWc = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.69 4C4.62 4 1.33 6.72 1.33 10.07c0 1.93 1.1 3.65 2.81 4.78L3.4 17l2.35-1.18c.84.24 1.74.37 2.67.4-.1-.43-.16-.87-.16-1.33 0-3.13 2.9-5.67 6.48-5.67.25 0 .49.01.73.04C14.66 6.06 11.93 4 8.69 4zm-2.5 3.5a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm5 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM15.13 10.5c-3.04 0-5.5 2.17-5.5 4.85 0 2.68 2.46 4.85 5.5 4.85.7 0 1.37-.1 1.99-.3L19.2 21l-.5-1.82c1.26-.86 2.07-2.16 2.07-3.61 0-2.68-2.46-4.85-5.5-4.85zm-1.8 3.2a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zm3.6 0a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z" />
  </svg>
)

const IconLine = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 5.64 2 10.12c0 4.01 3.55 7.37 8.36 8.01.32.07.76.21.87.49.1.25.07.64.03.89l-.14.85c-.04.25-.2.99.87.54s5.78-3.4 7.89-5.83C21.39 13.13 22 11.68 22 10.12 22 5.64 17.52 2 12 2zm-3.93 6.4h-.62v3.18a.4.4 0 0 1-.4.4h-.66a.4.4 0 0 1-.4-.4V8.4h-.62a.4.4 0 0 1-.4-.4v-.54a.4.4 0 0 1 .4-.4H8.07a.4.4 0 0 1 .4.4v.54a.4.4 0 0 1-.4.4zm5.38 3.58a.4.4 0 0 1-.4.4h-.66a.4.4 0 0 1-.4-.4v-2.04l-.73 1.27a.4.4 0 0 1-.34.2h-.34a.4.4 0 0 1-.34-.2l-.73-1.27v2.04a.4.4 0 0 1-.4.4h-.66a.4.4 0 0 1-.4-.4V7.96a.4.4 0 0 1 .4-.4h.74a.4.4 0 0 1 .35.2l.95 1.66.95-1.66a.4.4 0 0 1 .35-.2h.74a.4.4 0 0 1 .4.4v4.02zm3.05-3.58h-1.62v.85h1.62a.4.4 0 0 1 .4.4v.54a.4.4 0 0 1-.4.4h-1.62v.99a.4.4 0 0 1-.4.4h-.66a.4.4 0 0 1-.4-.4V7.96a.4.4 0 0 1 .4-.4h2.68a.4.4 0 0 1 .4.4v.54a.4.4 0 0 1-.4.4z" />
  </svg>
)

const Contacts = () => {
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [data, setData] = useState<EmployeeContact[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [keyword, setKeyword] = useState('')
  const [department, setDepartment] = useState(ALL_DEPTS)
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await employeesApi.directory()
      const payload = res.data ?? {}
      setData(payload.items ?? [])
      setDepartments(payload.departments ?? [])
      setLoadFailed(false)
    } catch {
      // 取不到真实通讯录时给出明确失败态，不用示例数据冒充
      setData([])
      setDepartments([])
      setLoadFailed(true)
      message.error('获取员工通讯录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = useMemo(() => {
    if (!keyword.trim()) return data
    const kw = keyword.trim().toLowerCase()
    return data.filter((e) => {
      const name = (e.full_name || '').toLowerCase()
      const pos = (e.position || '').toLowerCase()
      const dept = (e.department || '').toLowerCase()
      return name.includes(kw) || pos.includes(kw) || dept.includes(kw)
    })
  }, [data, keyword])

  // 在 filtered 基础上叠加部门筛选（保留 filtered useMemo 不变）
  const visible =
    department === ALL_DEPTS
      ? filtered
      : filtered.filter((e) => (e.department || '') === department)

  // 部门统计由真实通讯录聚合，不再使用静态示例数字
  const deptStats = useMemo<DeptStat[]>(() => {
    const counts = new Map<string, number>()
    data.forEach((e) => {
      if (!e.department) return
      counts.set(e.department, (counts.get(e.department) ?? 0) + 1)
    })
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count], i) => ({
        name,
        count,
        tone: TONES[i % TONES.length],
        delta: `占比 ${data.length ? Math.round((count / data.length) * 100) : 0}%`,
      }))
  }, [data])

  const handleCopy = async (text: string, label: string) => {
    if (!text) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // 回退方案
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      message.success(`已复制${label}：${text}`)
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  // 导出通讯录（后端 /exports/employees，部门筛选与页面保持一致）
  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadReport(
        '/exports/employees',
        department === ALL_DEPTS ? {} : { department },
        'employees.csv',
      )
      message.success('通讯录已导出')
    } catch {
      message.error('导出失败，请稍后重试')
    } finally {
      setExporting(false)
    }
  }

  const handleAdd = () => {
    message.info('请联系 HR 添加新同事')
  }

  // 头像/徽章色调按部门在真实部门清单中的次序取用
  const getTone = (e: EmployeeContact): Tone => {
    const idx = e.department ? departments.indexOf(e.department) : -1
    return TONES[idx < 0 ? 0 : idx % TONES.length]
  }

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">同事通讯录</h2>
          <p className="rent-page-header__subtitle">查看同事联系方式，快速沟通协作</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--secondary" onClick={handleExport} disabled={exporting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? '导出中...' : '导出通讯录'}
          </button>
          <button className="rent-btn rent-btn--primary" onClick={handleAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加同事
          </button>
        </div>
      </div>

      {loadFailed && !loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="获取员工通讯录失败"
          action={<Button size="small" onClick={() => fetchData()}>重试</Button>}
        />
      )}

      {/* Filter Bar */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__body rent-flex rent-flex--between rent-gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="rent-flex rent-gap-3" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="rent-select-wrap">
              <select
                className="rent-form-select"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option key={ALL_DEPTS} value={ALL_DEPTS}>
                  {ALL_DEPTS}
                </option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <svg className="rent-select-wrap__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className="rent-search" style={{ width: 320 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="按姓名或电话搜索"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </div>
          <div className="rent-flex rent-gap-2" style={{ alignItems: 'center' }}>
            <span className="rent-text-sm rent-text-muted">共 {visible.length} 位同事</span>
          </div>
        </div>
      </div>

      {/* Department Stats（按真实通讯录聚合） */}
      {deptStats.length > 0 && (
        <div className="rent-grid rent-grid--4 rent-mb-5">
          {deptStats.map((d) => (
            <div className="rent-stat-card" key={d.name}>
              <div className="rent-flex rent-flex--between rent-mb-2">
                <div className="rent-stat-card__label">{d.name}</div>
                <div className="rent-stat-card__icon" style={{ background: `rgba(${TONE_RGB[d.tone]},0.1)`, color: DEPT_COLOR[d.tone] }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {d.tone === 'primary' && (
                      <>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </>
                    )}
                    {d.tone === 'success' && (
                      <>
                        <path d="M3 3v18h18" />
                        <path d="M18 17V9" />
                        <path d="M13 17V5" />
                        <path d="M8 17v-3" />
                      </>
                    )}
                    {d.tone === 'info' && (
                      <>
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </>
                    )}
                    {d.tone === 'warning' && (
                      <>
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </>
                    )}
                  </svg>
                </div>
              </div>
              <div className="rent-stat-card__value">
                {d.count} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--rent-ink-3)' }}>人</span>
              </div>
              <div className="rent-stat-card__delta rent-stat-card__delta--up">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 15 12 9 18 15" />
                </svg>
                {d.delta}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact Cards */}
      {loading ? (
        <div className="rent-empty rent-mb-5"><Spin size="small" /> 加载中...</div>
      ) : visible.length === 0 ? (
        <div className="rent-empty rent-mb-5"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无员工联系方式" /></div>
      ) : (
        <div className="rent-grid rent-grid--auto rent-mb-5">
          {visible.map((e) => {
            const tone = getTone(e)
            const initial = (e.full_name || '?').charAt(0)
            // 社交链接：有联系方式才可跳转，缺失时点击改为复制该字段
            const waLink = e.phone ? `https://wa.me/${e.phone.replace(/\D/g, '')}` : null
            const lineLink = e.line ? `https://line.me/R/ti/p/${encodeURIComponent(e.line)}` : null
            return (
              <div className="rent-card" key={e.id}>
                <div className="rent-card__body rent-contact-card__body">
                  <div className="rent-avatar rent-avatar--lg" style={{ background: DEPT_COLOR[tone] }}>
                    {initial}
                  </div>
                  <div>
                    <div className="rent-text-bold" style={{ fontSize: 15 }}>
                      {e.full_name || '-'}
                    </div>
                    <div className="rent-text-sm rent-text-muted">{e.position || '-'}</div>
                  </div>
                  <span className={`rent-badge rent-badge--${tone}`}>{e.department || '—'}</span>
                  <div className="rent-contact-phone">
                    <span className="rent-contact-phone__num">{e.phone || '—'}</span>
                    <button
                      className="rent-icon-btn"
                      style={{ width: 30, height: 30, background: 'var(--rent-primary)', borderColor: 'var(--rent-primary)', color: '#fff' }}
                      onClick={() => handleCopy(e.phone || '', '手机号')}
                      title="复制手机号"
                    >
                      <IconPhone size={14} />
                    </button>
                  </div>
                  <div className="rent-contact-social">
                    <a
                      href={waLink || '#'}
                      title={e.phone ? `WhatsApp：${e.phone}` : 'WhatsApp'}
                      className="rent-contact-social__btn rent-contact-social__btn--wa"
                      onClick={(ev) => {
                        if (!waLink) {
                          ev.preventDefault()
                          handleCopy(e.phone || '', '手机号')
                        }
                      }}
                      target={waLink ? '_blank' : undefined}
                      rel="noreferrer"
                    >
                      <IconWa size={16} />
                    </a>
                    <a
                      href="#"
                      title={e.wechat ? `微信号：${e.wechat}` : 'WeChat'}
                      className="rent-contact-social__btn rent-contact-social__btn--wc"
                      onClick={(ev) => {
                        ev.preventDefault()
                        handleCopy(e.wechat || '', '微信号')
                      }}
                    >
                      <IconWc size={16} />
                    </a>
                    <a
                      href={lineLink || '#'}
                      title={e.line ? `Line：${e.line}` : 'Line'}
                      className="rent-contact-social__btn rent-contact-social__btn--line"
                      onClick={(ev) => {
                        if (!lineLink) {
                          ev.preventDefault()
                          handleCopy(e.line || '', 'Line ID')
                        }
                      }}
                      target={lineLink ? '_blank' : undefined}
                      rel="noreferrer"
                    >
                      <IconLine size={16} />
                    </a>
                  </div>
                  <a
                    href={e.email ? `mailto:${e.email}` : '#'}
                    className="rent-btn rent-btn--primary rent-btn--sm rent-btn--block"
                    onClick={(ev) => {
                      if (!e.email) {
                        ev.preventDefault()
                        handleCopy(e.email || '', '邮箱')
                      }
                    }}
                  >
                    <IconMsg size={14} />
                    发送消息
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Emergency Contacts */}
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">紧急联系人</h3>
          <span className="rent-badge rent-badge--error">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            7×24 应急
          </span>
        </div>
        <div className="rent-card__body">
          <div className="rent-empty" style={{ padding: '24px 0' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未配置紧急联系人信息" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Contacts
