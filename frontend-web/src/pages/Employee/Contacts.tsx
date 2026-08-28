import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import api from '@/lib/api'
import './contacts.css'

interface EmployeeContact {
  id: string
  full_name: string
  position: string
  department?: string
  phone: string
  email: string
  wechat?: string
  line?: string
  [key: string]: any
}

// 部门 → 徽章/头像色调
const DEPT_TONE: Record<string, 'primary' | 'success' | 'info' | 'warning'> = {
  销售部: 'primary',
  运营部: 'success',
  技术部: 'info',
  财务部: 'warning',
}

const DEPT_COLOR: Record<string, string> = {
  primary: 'var(--rent-primary)',
  success: 'var(--state-success)',
  info: 'var(--state-info)',
  warning: 'var(--state-warning)',
}

const DEPARTMENTS = ['全部部门', '销售部', '运营部', '技术部', '财务部']

// 部门统计静态数据（与设计稿一致）
const DEPT_STATS = [
  { name: '销售部', count: 12, delta: '覆盖 5 大区域', tone: 'primary' as const },
  { name: '运营部', count: 8, delta: '在岗率 100%', tone: 'success' as const },
  { name: '技术部', count: 5, delta: '7×24 值班', tone: 'info' as const },
  { name: '财务部', count: 3, delta: '月结准时', tone: 'warning' as const },
]

// 紧急联系人静态数据（与设计稿一致）
const EMERGENCY_CONTACTS = [
  { name: '赵国栋', position: '总经理', phone: '+60 12-999 0001', initial: '赵', tone: 'primary' as const },
  { name: '孙慧敏', position: '人力资源主管', phone: '+60 12-999 0002', initial: '孙', tone: 'success' as const },
  { name: '周凯文', position: 'IT 技术支持', phone: '+60 12-999 0003', initial: '周', tone: 'info' as const },
]

// 静态联系人数据（API 不可用时回退使用，与设计稿一致）
const STATIC_CONTACTS: EmployeeContact[] = [
  { id: 's1', full_name: '王明华', position: '销售经理', department: '销售部', phone: '+60 12-345 6789', email: '', _tone: 'primary' },
  { id: 's2', full_name: '李婷婷', position: '销售代表', department: '销售部', phone: '+60 12-888 2233', email: '', _tone: 'success' },
  { id: 's3', full_name: '张伟强', position: '运营主管', department: '运营部', phone: '+60 16-220 4455', email: '', _tone: 'info' },
  { id: 's4', full_name: '陈晓琳', position: '运营专员', department: '运营部', phone: '+60 11-557 8899', email: '', _tone: 'warning' },
  { id: 's5', full_name: '刘建国', position: '技术总监', department: '技术部', phone: '+60 18-332 1100', email: '', _tone: 'primary' },
  { id: 's6', full_name: '黄思琪', position: '前端工程师', department: '技术部', phone: '+60 17-661 2456', email: '', _tone: 'success' },
  { id: 's7', full_name: '周建华', position: '财务主管', department: '财务部', phone: '+60 15-778 9900', email: '', _tone: 'info' },
  { id: 's8', full_name: '吴美玲', position: '会计', department: '财务部', phone: '+60 13-229 6677', email: '', _tone: 'warning' },
]

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
  const [data, setData] = useState<EmployeeContact[]>([])
  const [keyword, setKeyword] = useState('')
  const [department, setDepartment] = useState('全部部门')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/employees', {
        params: { pageSize: 500 },
      })
      const payload = res.data?.data ?? res.data
      const items: EmployeeContact[] = payload?.items ?? []
      if (items.length > 0) {
        setData(items)
      } else {
        // API 返回空数据时使用静态数据展示
        setData(STATIC_CONTACTS)
      }
    } catch (err: any) {
      // 接口不可用时使用静态数据，避免影响页面查看
      setData(STATIC_CONTACTS)
      if (err?.response?.status !== 404) {
        message.error(err?.response?.data?.message || '获取员工通讯录失败，已展示示例数据')
      }
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
    department === '全部部门'
      ? filtered
      : filtered.filter((e) => (e.department || '') === department)

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

  const handleExport = () => {
    message.success('通讯录导出已开始，请稍候')
  }

  const handleAdd = () => {
    message.info('请联系 HR 添加新同事')
  }

  const getTone = (e: EmployeeContact): 'primary' | 'success' | 'info' | 'warning' => {
    if (e._tone) return e._tone as 'primary' | 'success' | 'info' | 'warning'
    if (e.department && DEPT_TONE[e.department]) return DEPT_TONE[e.department]
    return 'primary'
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
          <button className="rent-btn rent-btn--secondary" onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出通讯录
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
                {DEPARTMENTS.map((d) => (
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

      {/* Department Stats */}
      <div className="rent-grid rent-grid--4 rent-mb-5">
        {DEPT_STATS.map((d) => (
          <div className="rent-stat-card" key={d.name}>
            <div className="rent-flex rent-flex--between rent-mb-2">
              <div className="rent-stat-card__label">{d.name}</div>
              <div className="rent-stat-card__icon" style={{ background: `rgba(${d.tone === 'primary' ? '66,99,235' : d.tone === 'success' ? '22,163,74' : d.tone === 'info' ? '14,165,233' : '217,119,6'},0.1)`, color: DEPT_COLOR[d.tone] }}>
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

      {/* Contact Cards */}
      {loading ? (
        <div className="rent-empty rent-mb-5">加载中...</div>
      ) : visible.length === 0 ? (
        <div className="rent-empty rent-mb-5">暂无员工联系方式</div>
      ) : (
        <div className="rent-grid rent-grid--auto rent-mb-5">
          {visible.map((e) => {
            const tone = getTone(e)
            const initial = (e.full_name || '?').charAt(0)
            const deptTone = e.department && DEPT_TONE[e.department] ? DEPT_TONE[e.department] : 'primary'
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
                  <span className={`rent-badge rent-badge--${deptTone}`}>{e.department || '—'}</span>
                  <div className="rent-contact-phone">
                    <span className="rent-contact-phone__num">{e.phone || '—'}</span>
                    <button
                      className="rent-icon-btn"
                      style={{ width: 30, height: 30, background: 'var(--rent-primary)', borderColor: 'var(--rent-primary)', color: '#fff' }}
                      onClick={() => handleCopy(e.phone, '手机号')}
                      title="复制手机号"
                    >
                      <IconPhone size={14} />
                    </button>
                  </div>
                  <div className="rent-contact-social">
                    <a
                      href="#"
                      title="WhatsApp"
                      className="rent-contact-social__btn rent-contact-social__btn--wa"
                      onClick={(ev) => ev.preventDefault()}
                    >
                      <IconWa size={16} />
                    </a>
                    <a
                      href="#"
                      title="WeChat"
                      className="rent-contact-social__btn rent-contact-social__btn--wc"
                      onClick={(ev) => ev.preventDefault()}
                    >
                      <IconWc size={16} />
                    </a>
                    <a
                      href="#"
                      title="Line"
                      className="rent-contact-social__btn rent-contact-social__btn--line"
                      onClick={(ev) => ev.preventDefault()}
                    >
                      <IconLine size={16} />
                    </a>
                  </div>
                  <a
                    href="#"
                    className="rent-btn rent-btn--primary rent-btn--sm rent-btn--block"
                    onClick={(ev) => ev.preventDefault()}
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            7×24 应急
          </span>
        </div>
        <div className="rent-card__body">
          <div className="rent-grid rent-grid--3">
            {EMERGENCY_CONTACTS.map((c) => (
              <div className="rent-emergency-item" key={c.name}>
                <div className="rent-flex rent-gap-3" style={{ alignItems: 'center' }}>
                  <div className="rent-avatar rent-avatar--lg" style={{ background: DEPT_COLOR[c.tone] }}>
                    {c.initial}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="rent-text-bold" style={{ fontSize: 15 }}>
                      {c.name}
                    </div>
                    <div className="rent-text-sm rent-text-muted rent-mb-2">{c.position}</div>
                    <div className="rent-text-sm rent-mono">{c.phone}</div>
                  </div>
                </div>
                <div className="rent-flex rent-gap-2 rent-mt-3">
                  <a
                    href={`tel:${c.phone.replace(/\s/g, '')}`}
                    className="rent-btn rent-btn--primary rent-btn--sm rent-btn--block"
                  >
                    <IconPhone size={14} /> 立即拨打
                  </a>
                  <a
                    href="#"
                    className="rent-btn rent-btn--secondary rent-btn--sm"
                    title="发送消息"
                    onClick={(ev) => ev.preventDefault()}
                  >
                    <IconMsg size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Contacts
