import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import {
  BellOutlined,
  BuildOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  CustomerServiceOutlined,
  FileTextOutlined,
  HomeOutlined,
  KeyOutlined,
  LineChartOutlined,
  ProfileOutlined,
  RightOutlined,
  SearchOutlined,
  SoundOutlined,
  StarOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import api from '@/lib/api'
import { chatApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
// 待缴口径与「账单」页保持同一实现（未确认到账一律计入），避免两处数字打架
import { isUnpaid } from '@/pages/Tenant/payments/constants'
import './MyHome.css'

/**
 * C 端「我家」页（/tenant/my-home，业主 + 租客 + 未登录访客共用）。
 *
 * 信息结构对齐贝壳「我家」，全页只允许三种版式：
 *   1. 房产卡（多套可切换；未绑定为空态插画卡）
 *   2. 一排等大的四列功能宫格
 *   3. 分组行卡（分区标题 + 结构一致的行）
 * 文档中心 / 房屋档案 / 资料下载不进本页；合同只以「待签署」待办行出现。
 * 资产与事务入口只在这里出现，「我的」不再重复。
 */

type IconComp = React.ComponentType<{ className?: string }>

interface GridItem {
  key: string
  label: string
  icon: IconComp
  route: string
  badge?: number
}

interface RowItem {
  key: string
  label: string
  meta?: string
  icon: IconComp
  route?: string
  onClick?: () => void
  tone?: 'default' | 'warn'
}

interface RowSection {
  key: string
  title: string
  rows: RowItem[]
}

const unwrapList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const isActiveLease = (lease: any) => {
  const status = String(lease?.status ?? '').toLowerCase()
  if (status && status !== 'active') return false
  const end = new Date(lease?.end_date || lease?.endDate || '').getTime()
  return Number.isNaN(end) ? true : end > Date.now()
}

const fmtDate = (value?: string | null) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

const propTitle = (p: any, fallback: string) =>
  p?.name ||
  (p?.project_name ? `${p.project_name}·${p.room_number ?? ''}` : p?.room_number || p?.address || fallback)

const propAddress = (p: any) =>
  [p?.district, p?.city, p?.address].filter(Boolean).join(' · ')

const propCover = (p: any): string => {
  const raw = p?.cover_image || p?.cover_url || p?.photos?.[0] || p?.images?.[0] || ''
  return typeof raw === 'string' ? raw : raw?.url || ''
}

const TenantMyHome = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, token } = useAuthStore()

  const [properties, setProperties] = useState<any[]>([])
  const [lease, setLease] = useState<any>(null)
  const [binding, setBinding] = useState<any>(null)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) {
      setProperties([])
      setLease(null)
      setBinding(null)
      setUnpaidCount(0)
      setLoading(false)
      return
    }
    const [propsRes, leaseRes, bindRes, payRes] = await Promise.allSettled([
      api.get('/owners/me/properties'),
      api.get('/leases'),
      api.get('/property-bindings/me'),
      api.get('/payments/me'),
    ])
    setProperties(propsRes.status === 'fulfilled' ? unwrapList(propsRes.value?.data) : [])

    const leases = leaseRes.status === 'fulfilled' ? unwrapList(leaseRes.value?.data) : []
    setLease(leases.find(isActiveLease) ?? null)

    const bindings = bindRes.status === 'fulfilled' ? unwrapList(bindRes.value?.data) : []
    const sorted = [...bindings].sort(
      (a, b) => new Date(b?.created_at ?? 0).getTime() - new Date(a?.created_at ?? 0).getTime(),
    )
    setBinding(sorted[0] ?? null)

    const payments = payRes.status === 'fulfilled' ? unwrapList(payRes.value?.data) : []
    setUnpaidCount(payments.filter((p) => isUnpaid(p?.status)).length)
    setLoading(false)
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const go = useCallback(
    (route: string) => {
      if (!token) {
        navigate('/login')
        return
      }
      navigate(route)
    },
    [navigate, token],
  )

  // 专属管家：后端 /chat/support 幂等返回与平台客服（管理员）的会话，
  // 点击后进入真实聊天页，而不是帮助中心静态页。
  const openManager = useCallback(async () => {
    if (!token) {
      navigate('/login')
      return
    }
    try {
      const res: any = await chatApi.support()
      const id = res?.data?.id ?? res?.data?.conversation_id
      if (!id) throw new Error('missing conversation')
      navigate(`/chat?id=${id}`)
    } catch {
      message.error(t('myHome.managerError'))
    }
  }, [navigate, token, t])

  const bindingStatus = String(binding?.status ?? '').toLowerCase()
  const hasPendingBinding = bindingStatus === 'pending' || bindingStatus === 'reviewing'
  const hasRejectedBinding = bindingStatus === 'rejected'
  const mode: 'owner' | 'tenant' | 'empty' =
    properties.length > 0 ? 'owner' : lease ? 'tenant' : 'empty'

  const gridItems = useMemo<GridItem[]>(() => {
    if (mode === 'owner') {
      return [
        { key: 'income', label: t('myHome.gridIncome'), icon: LineChartOutlined, route: '/tenant/income' },
        { key: 'properties', label: t('myHome.gridProperties'), icon: HomeOutlined, route: '/tenant/my-properties' },
        { key: 'marketing', label: t('myHome.gridMarketing'), icon: SoundOutlined, route: '/tenant/marketing' },
        { key: 'services', label: t('myHome.gridServices'), icon: StarOutlined, route: '/tenant/services' },
      ]
    }
    if (mode === 'tenant') {
      return [
        { key: 'bill', label: t('myHome.gridBill'), icon: CreditCardOutlined, route: '/tenant/payments', badge: unpaidCount },
        { key: 'repair', label: t('myHome.gridRepair'), icon: ToolOutlined, route: '/tenant/maintenance' },
        { key: 'contract', label: t('myHome.gridContract'), icon: FileTextOutlined, route: '/tenant/contracts' },
        { key: 'lease', label: t('myHome.gridLease'), icon: KeyOutlined, route: '/tenant/leases' },
      ]
    }
    return [
      { key: 'search', label: t('myHome.gridSearch'), icon: SearchOutlined, route: '/tenant/listings' },
      { key: 'orders', label: t('myHome.svcOrders'), icon: ProfileOutlined, route: '/tenant/deals' },
      { key: 'bill', label: t('myHome.gridBill'), icon: CreditCardOutlined, route: '/tenant/payments' },
      { key: 'support', label: t('myHome.gridSupport'), icon: CustomerServiceOutlined, route: '/tenant/help' },
    ]
  }, [mode, t, unpaidCount])

  const sections = useMemo<RowSection[]>(() => {
    const todo: RowItem[] = []
    if (hasRejectedBinding) {
      todo.push({
        key: 'binding',
        label: t('myHome.bindingRejected'),
        meta: t('myHome.bindingRejectedMeta'),
        icon: BellOutlined,
        route: '/tenant/my-properties?add=1',
        tone: 'warn',
      })
    }
    if (hasPendingBinding) {
      todo.push({
        key: 'binding',
        label: t('myHome.bindingPending'),
        meta: t('myHome.bindingPendingMeta'),
        icon: ClockCircleOutlined,
        route: '/tenant/my-properties?add=1',
      })
    }
    if (unpaidCount > 0) {
      todo.push({
        key: 'bill',
        label: mode === 'owner' ? t('myHome.todoOwnerBill') : t('myHome.todoBill'),
        meta: `${unpaidCount} ${t('myHome.todoBillUnit')}`,
        icon: CreditCardOutlined,
        route: '/tenant/payments',
        tone: 'warn',
      })
    }
    if (lease?.end_date) {
      const days = Math.round((new Date(lease.end_date).getTime() - Date.now()) / 86400000)
      if (days >= 0 && days <= 60) {
        todo.push({
          key: 'lease',
          label: t('myHome.todoLease'),
          meta: `${days} ${t('myHome.todoDayUnit')}`,
          icon: CalendarOutlined,
          route: '/tenant/leases',
          tone: 'warn',
        })
      }
    }

    const result: RowSection[] = []
    if (todo.length > 0) {
      result.push({ key: 'todo', title: t('myHome.todo'), rows: todo })
    }

    if (mode === 'owner') {
      result.push({
        key: 'services',
        title: t('myHome.services'),
        rows: [
          { key: 'income', label: t('myHome.svcIncome'), meta: t('myHome.viewDetail'), icon: LineChartOutlined, route: '/tenant/income' },
          { key: 'properties', label: t('myHome.svcProperties'), meta: t('myHome.svcPropertiesMeta'), icon: HomeOutlined, route: '/tenant/my-properties' },
          { key: 'marketing', label: t('myHome.svcMarketing'), meta: t('myHome.svcMarketingMeta'), icon: SoundOutlined, route: '/tenant/marketing' },
          { key: 'orders', label: t('myHome.svcOrders'), meta: t('myHome.viewDetail'), icon: ProfileOutlined, route: '/tenant/deals' },
        ],
      })
    } else if (mode === 'tenant') {
      result.push({
        key: 'services',
        title: t('myHome.services'),
        rows: [
          { key: 'bill', label: t('myHome.svcBill'), meta: t('myHome.viewDetail'), icon: CreditCardOutlined, route: '/tenant/payments' },
          { key: 'lease', label: t('myHome.svcLease'), meta: t('myHome.viewDetail'), icon: KeyOutlined, route: '/tenant/leases' },
          { key: 'value', label: t('tenantValue.title'), meta: t('tenantValue.entryMeta'), icon: StarOutlined, route: '/tenant/value-estimate' },
          { key: 'notice', label: t('tenantAnn.title'), meta: t('tenantAnn.entryMeta'), icon: BellOutlined, route: '/tenant/announcements' },
          { key: 'orders', label: t('myHome.svcOrders'), meta: t('myHome.viewDetail'), icon: ProfileOutlined, route: '/tenant/deals' },
          { key: 'services', label: t('myHome.svcValue'), meta: t('myHome.svcValueMeta'), icon: StarOutlined, route: '/tenant/services' },
        ],
      })
    } else {
      result.push({
        key: 'guide',
        title: t('myHome.guide'),
        rows: [
          { key: 'claim', label: t('myHome.claim'), meta: t('myHome.claimMeta'), icon: HomeOutlined, route: '/tenant/my-properties?add=1' },
          { key: 'add', label: t('myHome.addProperty'), meta: t('myHome.addPropertyMeta'), icon: BuildOutlined, route: '/tenant/my-properties?add=1' },
          { key: 'help', label: t('myHome.help'), meta: t('myHome.helpMeta'), icon: CustomerServiceOutlined, route: '/tenant/help' },
        ],
      })
    }

    result.push({
      key: 'support',
      title: t('myHome.supportTitle'),
      rows: [
        { key: 'manager', label: t('myHome.manager'), meta: t('myHome.managerMeta'), icon: CustomerServiceOutlined, onClick: openManager },
        { key: 'help', label: t('myHome.help'), meta: t('myHome.helpMeta'), icon: ProfileOutlined, route: '/tenant/help' },
      ],
    })

    return result
  }, [mode, t, unpaidCount, lease, hasPendingBinding, hasRejectedBinding, openManager])

  const renderPropertyCard = () => {
    if (mode === 'empty' && !hasPendingBinding && !hasRejectedBinding) {
      return (
        <div className="mh-card mh-prop">
          <div className="mh-empty">
            <div className="mh-empty__art">
              <HomeOutlined />
              <span className="mh-empty__dot" />
            </div>
            <div className="mh-empty__body">
              <div className="mh-empty__title">{t('myHome.emptyTitle')}</div>
              <div className="mh-empty__desc">{t('myHome.emptyDesc')}</div>
            </div>
          </div>
          <div className="mh-empty__actions">
            <button type="button" className="mh-btn mh-btn--primary" onClick={() => go('/tenant/my-properties?add=1')}>
              {t('myHome.claim')}
            </button>
            <button type="button" className="mh-btn mh-btn--ghost" onClick={() => go('/tenant/my-properties?add=1')}>
              {t('myHome.addProperty')}
            </button>
          </div>
        </div>
      )
    }

    if (mode === 'empty') {
      const rejected = hasRejectedBinding
      return (
        <button
          type="button"
          className="mh-card mh-prop mh-prop--state"
          onClick={() => go('/tenant/my-properties?add=1')}
        >
          <span className={`mh-state__icon${rejected ? ' mh-state__icon--warn' : ''}`}>
            {rejected ? <BellOutlined /> : <ClockCircleOutlined />}
          </span>
          <span className="mh-state__body">
            <span className="mh-state__title">
              {rejected ? t('myHome.bindingRejected') : t('myHome.bindingPending')}
            </span>
            <span className="mh-state__desc">
              {rejected
                ? binding?.reject_reason || binding?.reason || t('myHome.bindingRejectedMeta')
                : t('myHome.bindingPendingMeta')}
            </span>
          </span>
          <RightOutlined className="mh-chevron" />
        </button>
      )
    }

    const isOwner = mode === 'owner'
    const active = properties[Math.min(activeIdx, Math.max(properties.length - 1, 0))]
    const cover = isOwner ? propCover(active) : ''
    const title = isOwner
      ? propTitle(active, t('myHome.gridProperties'))
      : lease?.property_name || lease?.room_number || lease?.address || t('myHome.svcLease')
    const meta = isOwner
      ? `${t('myHome.ownerMetaPrefix')} ${properties.length} ${t('myHome.ownerMetaUnit')}`
      : `${fmtDate(lease?.start_date || lease?.startDate)} - ${fmtDate(lease?.end_date || lease?.endDate)}`
    const address = isOwner ? propAddress(active) : lease?.address || ''

    return (
      <div
        className="mh-card mh-prop mh-prop--clickable"
        role="button"
        tabIndex={0}
        onClick={() => go(isOwner ? '/tenant/my-properties' : '/tenant/leases')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') go(isOwner ? '/tenant/my-properties' : '/tenant/leases')
        }}
      >
        <div className="mh-prop__row">
          {cover ? (
            <img className="mh-prop__cover" src={cover} alt={title} loading="lazy" />
          ) : (
            <span className="mh-prop__cover mh-prop__cover--fallback">
              {isOwner ? <HomeOutlined /> : <KeyOutlined />}
            </span>
          )}
          <div className="mh-prop__info">
            <div className="mh-prop__badge-row">
              <span className="mh-prop__badge">
                {isOwner ? t('myHome.ownerBadge') : t('myHome.tenantBadge')}
              </span>
              {isOwner && properties.length > 1 ? (
                <button
                  type="button"
                  className="mh-prop__switch"
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveIdx((idx) => (idx + 1) % properties.length)
                  }}
                >
                  {t('myHome.switch')}
                </button>
              ) : null}
            </div>
            <div className="mh-prop__title">{title}</div>
            <div className="mh-prop__meta">{meta}</div>
            {address ? <div className="mh-prop__address">{address}</div> : null}
          </div>
          <RightOutlined className="mh-chevron" />
        </div>
        {isOwner && properties.length > 1 ? (
          <div className="mh-dots">
            {Array.from({ length: Math.min(properties.length, 5) }).map((_, idx) => {
              const dotIdx =
                properties.length <= 5
                  ? idx
                  : Math.round((activeIdx / (properties.length - 1)) * 4)
              return <span key={idx} className={`mh-dot${dotIdx === idx ? ' mh-dot--active' : ''}`} />
            })}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mh-page">
      <div className="mh-head">
        <h2 className="mh-head__title">{t('myHome.title')}</h2>
        <p className="mh-head__sub">
          {user?.full_name ? `${user.full_name}，` : ''}
          {t('myHome.subtitle')}
        </p>
      </div>

      {loading ? (
        <div className="mh-loading">…</div>
      ) : (
        <>
          {renderPropertyCard()}

          <div className="mh-card mh-grid">
            {gridItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  type="button"
                  className="mh-grid__item"
                  onClick={() => go(item.route)}
                >
                  <span className="mh-grid__icon">
                    <Icon className="mh-grid__svg" />
                    {item.badge ? (
                      <span className="mh-grid__badge">{item.badge > 99 ? '99+' : item.badge}</span>
                    ) : null}
                  </span>
                  <span className="mh-grid__label">{item.label}</span>
                </button>
              )
            })}
          </div>

          {sections.map((section) => (
            <div key={section.key} className="mh-card mh-section">
              <div className="mh-section__title">{section.title}</div>
              {section.rows.map((row, idx) => {
                const Icon = row.icon
                return (
                  <button
                    key={row.key}
                    type="button"
                    className={`mh-row${idx < section.rows.length - 1 ? ' mh-row--border' : ''}`}
                    onClick={() => (row.onClick ? row.onClick() : row.route ? go(row.route) : undefined)}
                  >
                    <span className="mh-row__icon">
                      <Icon className="mh-row__svg" />
                    </span>
                    <span className="mh-row__label">{row.label}</span>
                    {row.meta ? (
                      <span className={`mh-row__meta${row.tone === 'warn' ? ' mh-row__meta--warn' : ''}`}>
                        {row.meta}
                      </span>
                    ) : null}
                    <RightOutlined className="mh-chevron" />
                  </button>
                )
              })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default TenantMyHome
