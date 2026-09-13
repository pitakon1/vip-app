import { useCallback, useEffect, useRef, useState } from 'react'
import { message, Modal, Form, Select, DatePicker, InputNumber } from 'antd'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import api from '@/lib/api'
import './services.css'

interface ServiceItem {
  id: string
  name: string
  description: string
  icon: ReactNode
  iconBg: string
  ratingFilled: number
  ratingLabel: string
  price: string
  priceUnit: string
}

interface BookedService {
  id: string
  service_name: string
  price: string
  booked_at: string
  status: string
}

interface PackageItem {
  id: string
  property_id: string
  type: 'annual_management' | 'full_service'
  commission_rate: number
  management_fee_rate: number
  amount: number
  currency: string
  start_date: string
  end_date: string
  status: string
}

interface PropertyOption {
  id: string
  room_number: string
  address: string
  monthly_rent: number
  currency: string
}

// 服务卡片数据（与原型 owner-services 一致）
const services: ServiceItem[] = [
  {
    id: 'cleaning',
    name: '深度清洁服务',
    description: '专业团队全屋深度清洁，含厨卫消毒与玻璃保养',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
        <path d="M19 14l.95 2.55L22.5 17.5l-2.55.95L19 21l-.95-2.55L15.5 17.5l2.55-.95L19 14z" />
      </svg>
    ),
    iconBg: 'rgba(14,165,233,0.12)',
    ratingFilled: 5,
    ratingLabel: '4.9/5',
    price: 'RM 150',
    priceUnit: '/次',
  },
  {
    id: 'ac',
    name: '空调维保服务',
    description: '空调滤网清洗、制冷检测与加氟，延长设备寿命',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.59 4.59A2 2 0 1 1 11 8H2" />
        <path d="M17.73 2.27A2.5 2.5 0 1 1 19.5 6.5H2" />
        <path d="M9.59 19.41A2 2 0 1 0 11 16H2" />
      </svg>
    ),
    iconBg: 'rgba(20,184,166,0.12)',
    ratingFilled: 5,
    ratingLabel: '4.8/5',
    price: 'RM 180',
    priceUnit: '/次',
  },
  {
    id: 'tax',
    name: '物业税费申报',
    description: '代办物业税、印花税申报，确保合规无忧',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="15" y2="17" />
        <line x1="9" y1="9" x2="11" y2="9" />
      </svg>
    ),
    iconBg: 'rgba(22,163,74,0.12)',
    ratingFilled: 4,
    ratingLabel: '4.7/5',
    price: 'RM 200',
    priceUnit: '/次',
  },
  {
    id: 'insurance',
    name: '房屋保险方案',
    description: '定制房屋财产保险，覆盖火灾、水损与租客责任',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    iconBg: 'rgba(217,119,6,0.12)',
    ratingFilled: 5,
    ratingLabel: '4.8/5',
    price: 'RM 800',
    priceUnit: '/年',
  },
  {
    id: 'plumbing',
    name: '管道疏通服务',
    description: '快速疏通下水管道，排查漏水隐患，24小时响应',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    iconBg: 'rgba(14,165,233,0.12)',
    ratingFilled: 4,
    ratingLabel: '4.6/5',
    price: 'RM 120',
    priceUnit: '/次',
  },
  {
    id: 'garden',
    name: '园艺养护服务',
    description: '庭院修剪、草坪养护与绿植定期护理',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 3.3 1.4 6.3.7 9.2-1 4-4 6.5-9 7.84" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6" />
      </svg>
    ),
    iconBg: 'rgba(22,163,74,0.12)',
    ratingFilled: 5,
    ratingLabel: '4.9/5',
    price: 'RM 250',
    priceUnit: '/月',
  },
]

// 订阅套餐（与原型一致）
interface PlanItem {
  id: string
  name: string
  price: string
  unit: string
  features: string[]
  recommended: boolean
}

const PLANS: PlanItem[] = [
  {
    id: 'basic',
    name: '基础版',
    price: 'RM 200',
    unit: '/月',
    features: ['清洁 1 次 / 月', '在线报修', '文档管理'],
    recommended: false,
  },
  {
    id: 'standard',
    name: '标准版',
    price: 'RM 450',
    unit: '/月',
    features: ['清洁 2 次 / 月', '空调保养', '优先报修', '税务咨询'],
    recommended: true,
  },
  {
    id: 'premium',
    name: '旗舰版',
    price: 'RM 800',
    unit: '/月',
    features: ['全部标准版服务', '深度清洁 4 次 / 月', '房屋保险', '专属管家'],
    recommended: false,
  },
]

const Star = ({ filled }: { filled: boolean }) =>
  filled ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )

const checkIcon = (color: string) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const arrowIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

const trashIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

const packageTypeLabel = (t: string) =>
  t === 'full_service' ? '全托管套餐' : '年度托管套餐'
const packageStatusLabel = (s: string) => {
  const map: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
    active: { label: '生效中', tone: 'success' },
    pending: { label: '待生效', tone: 'warning' },
    expired: { label: '已到期', tone: 'neutral' },
    cancelled: { label: '已取消', tone: 'neutral' },
  }
  return map[s] || { label: s, tone: 'neutral' as const }
}
const fmtMoney = (v: number, currency = 'THB') => {
  const sym = currency === 'THB' ? '฿' : currency === 'MYR' || currency === 'RM' ? 'RM' : currency
  return `${sym} ${Number(v || 0).toLocaleString()}`
}

const Services = () => {
  const [bookedServices, setBookedServices] = useState<BookedService[]>([])
  const [packages, setPackages] = useState<PackageItem[]>([])
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const plansRef = useRef<HTMLDivElement>(null)

  const fetchPackages = useCallback(async () => {
    try {
      const res = await api.get('/service-packages/me')
      setPackages(Array.isArray(res.data) ? res.data : (res.data?.items ?? []))
    } catch {
      // 接口不可用或未订阅时保持空列表
    }
  }, [])

  const fetchProperties = useCallback(async () => {
    try {
      const res = await api.get('/owners/me/properties')
      const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? [])
      setProperties(items)
    } catch {
      setProperties([])
    }
  }, [])

  useEffect(() => {
    fetchPackages()
    fetchProperties()
  }, [fetchPackages, fetchProperties])

  const handleBook = (service: ServiceItem) => {
    setBookedServices((prev) => [
      {
        id: `${service.id}-${Date.now()}`,
        service_name: service.name,
        price: service.price,
        booked_at: dayjs().format('YYYY-MM-DD HH:mm'),
        status: 'pending',
      },
      ...prev,
    ])
    message.success('预约成功，工作人员将尽快联系您')
  }

  const openSubscribe = () => {
    if (!properties.length) {
      message.warning('暂无可订阅的房源，请先在「我的房源」中添加')
      return
    }
    form.setFieldsValue({
      property_id: properties[0]?.id,
      type: 'annual_management',
      start_date: dayjs(),
      commission_rate: 1,
      management_fee_rate: 0.5,
    })
    setModalOpen(true)
  }

  const handleSubscribe = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        ...values,
        start_date: values.start_date.format('YYYY-MM-DDTHH:mm:ss'),
      }
      const res = await api.post('/service-packages', payload)
      message.success('套餐订阅成功')
      setModalOpen(false)
      setPackages((prev) => [res.data, ...prev])
      fetchPackages()
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.detail || '订阅失败')
      }
      // validateFields 失败时静默
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelPackage = async (pkg: PackageItem) => {
    try {
      await api.patch(`/service-packages/${pkg.id}`, { status: 'cancelled' })
      message.success('已取消订阅')
      fetchPackages()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '取消失败')
    }
  }

  const scrollToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="rent-main">
      {/* Page Header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">推荐服务</h2>
          <p className="rent-page-header__subtitle">为您的房产提供一站式增值服务</p>
        </div>
        <div className="rent-page-header__actions">
          <button type="button" className="rent-btn rent-btn--secondary" onClick={scrollToPlans}>
            {trashIcon}
            我的订阅
          </button>
        </div>
      </div>

      {/* Featured Banner */}
      <div
        className="rent-card rent-mb-5"
        style={{ background: '#14b8a6', border: 'none' }}
      >
        <div
          className="rent-card__body"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className="rent-badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>限时优惠</span>
              <span className="rent-badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>8 折</span>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#fff', letterSpacing: '-0.01em' }}>
              年度维护套餐 限时8折
            </h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', margin: 0 }}>
              涵盖清洁、空调保养、管道检修，一站式守护您的房产价值
            </p>
          </div>
          <button
            type="button"
            className="rent-btn"
            style={{ background: '#fff', color: 'var(--rent-primary)', fontWeight: 600, boxShadow: 'var(--rent-shadow-2)', padding: '11px 22px' }}
            onClick={openSubscribe}
          >
            立即订阅
            {arrowIcon}
          </button>
        </div>
      </div>

      {/* Service Cards Grid */}
      <div className="rent-grid rent-grid--3 rent-mb-5">
        {services.map((s) => (
          <div className="rent-card" key={s.id}>
            <div className="rent-card__body">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--rent-radius-md)',
                    background: s.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--rent-ink)', margin: '0 0 4px' }}>{s.name}</h4>
                  <p className="rent-text-sm rent-text-muted" style={{ margin: 0, lineHeight: 1.5 }}>{s.description}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} filled={i < s.ratingFilled} />
                ))}
                <span className="rent-text-sm rent-text-muted">{s.ratingLabel}</span>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span className="rent-text-sm rent-text-muted">起价</span>
                <span className="rent-num" style={{ fontSize: 20, color: 'var(--rent-ink)', marginLeft: 4 }}>{s.price}</span>
                <span className="rent-text-sm rent-text-muted">{s.priceUnit}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => handleBook(s)}>
                  立即预约
                </button>
                <button
                  type="button"
                  className="rent-btn rent-btn--ghost rent-btn--sm"
                  onClick={() => message.info('服务详情即将上线')}
                >
                  了解更多
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subscription Plans */}
      <div className="rent-card" ref={plansRef}>
        <div className="rent-card__header">
          <h3 className="rent-card__title">订阅套餐</h3>
          <span className="rent-text-sm rent-text-muted">选择适合您的服务方案，按月订阅随时取消</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-grid rent-grid--3">
            {PLANS.map((plan) => {
              const checkColor = plan.recommended ? 'var(--rent-primary)' : 'var(--state-success)'
              return (
                <div
                  className="rent-card"
                  key={plan.id}
                  style={
                    plan.recommended
                      ? { border: '2px solid var(--rent-primary)', position: 'relative', boxShadow: 'var(--rent-shadow-2)' }
                      : { border: '1px solid var(--rent-border)' }
                  }
                >
                  {plan.recommended && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -1,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--rent-primary)',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 14px',
                        borderRadius: '0 0 var(--rent-radius-md) var(--rent-radius-md)',
                      }}
                    >
                      推荐
                    </div>
                  )}
                  <div className="rent-card__body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                      <h4
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: plan.recommended ? 'var(--rent-primary)' : 'var(--rent-ink)',
                          margin: '0 0 10px',
                        }}
                      >
                        {plan.name}
                      </h4>
                      <div>
                        <span className="rent-num" style={{ fontSize: 30, color: 'var(--rent-ink)' }}>{plan.price}</span>
                        <span className="rent-text-sm rent-text-muted">{plan.unit}</span>
                      </div>
                    </div>
                    <hr className="rent-divider" />
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '0 0 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        flex: 1,
                      }}
                    >
                      {plan.features.map((f) => (
                        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--rent-ink-2)' }}>
                          {checkIcon(checkColor)}
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`rent-btn rent-btn--${plan.recommended ? 'primary' : 'secondary'} rent-btn--block`}
                      onClick={openSubscribe}
                    >
                      选择
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 我的订阅（API 数据） */}
          {packages.length > 0 && (
            <div className="rent-sub-section">
              <h4 className="rent-sub-title">我的订阅</h4>
              <div className="rent-sub-list">
                {packages.map((pkg) => {
                  const st = packageStatusLabel(pkg.status)
                  return (
                    <div className="rent-sub-item" key={pkg.id}>
                      <div className="rent-sub-item__main">
                        <div className="rent-sub-item__name">{packageTypeLabel(pkg.type)}</div>
                        <div className="rent-sub-item__meta">
                          房源 {pkg.property_id} · {dayjs(pkg.start_date).format('YYYY-MM-DD')} ~ {dayjs(pkg.end_date).format('YYYY-MM-DD')}
                        </div>
                      </div>
                      <div className="rent-sub-item__right">
                        <span className="rent-sub-item__amount">{fmtMoney(pkg.amount, pkg.currency)}</span>
                        <span className={`rent-badge rent-badge--${st.tone === 'info' ? 'info' : st.tone}`}>{st.label}</span>
                        {pkg.status === 'active' && (
                          <button
                            type="button"
                            className="rent-btn rent-btn--secondary rent-btn--sm"
                            onClick={() => handleCancelPackage(pkg)}
                          >
                            取消订阅
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 最近预约（本地记录） */}
          {bookedServices.length > 0 && (
            <div className="rent-sub-section">
              <h4 className="rent-sub-title">最近预约</h4>
              <div className="rent-sub-list">
                {bookedServices.map((b) => (
                  <div className="rent-sub-item" key={b.id}>
                    <div className="rent-sub-item__main">
                      <div className="rent-sub-item__name">{b.service_name}</div>
                      <div className="rent-sub-item__meta">{b.booked_at}</div>
                    </div>
                    <div className="rent-sub-item__right">
                      <span className="rent-sub-item__amount">{b.price}</span>
                      <span className="rent-badge rent-badge--warning">待处理</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Subscribe Modal ===== */}
      <Modal
        title="订阅年度托管套餐"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubscribe}
        confirmLoading={submitting}
        okText="确认订阅"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="property_id" label="选择房源" rules={[{ required: true, message: '请选择房源' }]}>
            <Select
              placeholder="请选择房源"
              options={properties.map((p) => ({
                value: p.id,
                label: `${p.room_number} · ${fmtMoney(p.monthly_rent, p.currency)}/月`,
              }))}
            />
          </Form.Item>
          <Form.Item name="type" label="套餐类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'annual_management', label: '年度托管（收租 + 代缴 + 托管费）' },
                { value: 'full_service', label: '全托管（含维修/清洁等增值服务）' },
              ]}
            />
          </Form.Item>
          <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <div className="rent-grid rent-grid--2">
            <Form.Item name="commission_rate" label="佣金（个月租金）" rules={[{ required: true }]}>
              <InputNumber min={0.5} max={3} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="management_fee_rate" label="托管费（个月租金/年）" rules={[{ required: true }]}>
              <InputNumber min={0} max={3} step={0.25} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default Services
