import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { maintenanceApi } from '@/services/api'
import { request } from '@/lib/api'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import './index.scss'

const TYPE_LABELS: Record<string, string> = {
  apartment: '公寓',
  condo: '公寓',
  house: '别墅',
  villa: '别墅',
  commercial: '商铺',
  shop: '商铺',
  office: '写字楼'
}

const STATUS_LABELS: Record<string, string> = {
  vacant: '空置中',
  rented: '已出租',
  renewing: '续约中',
  maintenance: '维护中'
}

// 状态 → 徽章配色（复用全局 .badge 变体）
const STATUS_BADGE: Record<string, string> = {
  vacant: 'badge--warning',
  rented: 'badge--success',
  renewing: 'badge--primary',
  maintenance: 'badge--info'
}

const LEASE_STATUS: Record<string, { text: string; cls: string }> = {
  active: { text: '履约中', cls: 'badge--success' },
  pending: { text: '待生效', cls: 'badge--info' },
  expired: { text: '已到期', cls: 'badge--neutral' },
  terminated: { text: '已终止', cls: 'badge--neutral' }
}

const TICKET_STATUS: Record<string, { text: string; cls: string }> = {
  open: { text: '待处理', cls: 'badge--warning' },
  assigned: { text: '已派单', cls: 'badge--info' },
  in_progress: { text: '处理中', cls: 'badge--primary' },
  resolved: { text: '已完成', cls: 'badge--success' },
  closed: { text: '已关闭', cls: 'badge--neutral' }
}

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  THB: '฿',
  EUR: '€',
  USD: '$'
}

const fmtMoney = (v?: number, currency?: string) =>
  `${CURRENCY_SYMBOL[currency || 'THB'] || ''}${Number(v || 0).toLocaleString()}`

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-')

export default function AdminPropertyDetailPage() {
  const router = useRouter()
  const id = router.params?.id || ''

  const [detail, setDetail] = useState<any>(null)
  const [leases, setLeases] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [scrollTarget, setScrollTarget] = useState('')

  const fetchAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [d, l, m]: any[] = await Promise.all([
        request({ url: `/properties/${id}`, method: 'GET' }),
        request({ url: `/properties/${id}/leases`, method: 'GET' }),
        maintenanceApi.list({ property_id: id, page_size: 20 })
      ])
      setDetail(d?.data ?? d)
      setLeases((l?.data ?? l)?.items || [])
      const mr: any = m?.data ?? m
      setTickets(Array.isArray(mr) ? mr : mr?.items || [])
    } catch (error) {
      console.error('[AdminPropertyDetail] 加载房源详情失败', error)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchAll()
  })

  // 当前租客 = 最近一条履约中租约（后端 /properties/{id}/leases 已附租客名）
  const activeLease = leases.find((l) => l.status === 'active') || leases[0]

  // 编辑房源：进入完整编辑表单页（含字段编辑 + 照片）
  const goEdit = () => {
    if (!id) return
    Taro.navigateTo({ url: `/pages/employee/property-edit/index?id=${id}` })
  }

  const goLeases = () => {
    Taro.redirectTo({ url: '/pages/admin/leases/index' })
  }

  // 维修记录在 ScrollView 内，用 scrollIntoView 定位（pageScrollTo 对 scroll-view 无效）
  const scrollToMaintenance = () => setScrollTarget('apd-maintenance')

  if (!loading && !detail) {
    return (
      <View className='apd-page'>
        <View className='apd-state'>
          <View className='icon-svg' style={iconStyle('home', 72)} />
          <Text className='apd-state__text'>{id ? '房源不存在或已删除' : '缺少房源参数'}</Text>
        </View>
        <BottomNav role='admin' active='properties' />
      </View>
    )
  }

  return (
    <View className='apd-page'>
      {/* 返回条（对齐原型 header 的返回按钮） */}
      <View className='apd-nav'>
        <View className='apd-nav__back' onClick={() => Taro.redirectTo({ url: '/pages/admin/properties/index' })}>
          <Text className='apd-nav__back-icon'>‹</Text>
          <Text className='apd-nav__back-text'>房源</Text>
        </View>
        <Text className='apd-nav__title'>房源详情</Text>
        <View className='apd-nav__placeholder' />
      </View>

      <ScrollView scrollY scrollIntoView={scrollTarget} className='apd-scroll'>
        {/* 头图占位 + 类型徽章 */}
        <View className='apd-hero'>
          <Text className='apd-hero__ph'>房源</Text>
          <Text className='apd-hero__badge'>
            {TYPE_LABELS[detail?.property_type || ''] || '房源'}
          </Text>
        </View>

        {/* 名称 + 状态 + 地址 */}
        <View className='apd-card'>
          <View className='apd-head'>
            <Text className='apd-head__name'>
              {detail?.room_number || detail?.address || '未命名房源'}
            </Text>
            <Text className={`badge ${STATUS_BADGE[detail?.status || ''] || 'badge--neutral'}`}>
              {STATUS_LABELS[detail?.status || ''] || '未知'}
            </Text>
          </View>
          <View className='apd-addr'>
            <View className='icon-svg icon-svg--sm' style={iconStyle('home', 26)} />
            <Text className='apd-addr__text'>{detail?.address || '暂无地址'}</Text>
          </View>
        </View>

        {/* 关键指标 */}
        <View className='apd-key-stats'>
          <View className='apd-key-stat'>
            <Text className='apd-key-stat__value apd-key-stat__value--primary'>
              {fmtMoney(detail?.monthly_rent, detail?.currency)}
            </Text>
            <Text className='apd-key-stat__label'>月租</Text>
          </View>
          <View className='apd-key-stat'>
            <Text className='apd-key-stat__value'>{detail?.size_sqm || 0}㎡</Text>
            <Text className='apd-key-stat__label'>面积</Text>
          </View>
          <View className='apd-key-stat'>
            <Text className='apd-key-stat__value'>
              {detail?.bedrooms || 0}室{detail?.bathrooms || 0}卫
            </Text>
            <Text className='apd-key-stat__label'>户型</Text>
          </View>
          <View className='apd-key-stat'>
            <Text className='apd-key-stat__value'>
              {STATUS_LABELS[detail?.status || ''] || '-'}
            </Text>
            <Text className='apd-key-stat__label'>状态</Text>
          </View>
        </View>

        {/* 房源信息（后端字段：building/floor/furnished/deposit_amount/deposit_months/available_from） */}
        <View className='apd-card'>
          <Text className='apd-card__title'>房源信息</Text>
          <View className='apd-info-grid'>
            <View className='apd-info-item'>
              <Text className='apd-info-item__label'>楼层</Text>
              <Text className='apd-info-item__value'>
                {[detail?.building, detail?.floor].filter(Boolean).join(' ') || '-'}
              </Text>
            </View>
            <View className='apd-info-item'>
              <Text className='apd-info-item__label'>配置</Text>
              <Text className='apd-info-item__value'>{detail?.furnished ? '带家具' : '无家具'}</Text>
            </View>
            <View className='apd-info-item'>
              <Text className='apd-info-item__label'>押金</Text>
              <Text className='apd-info-item__value'>
                {fmtMoney(detail?.deposit_amount, detail?.currency)}
                {detail?.deposit_months ? `（${detail.deposit_months} 个月）` : ''}
              </Text>
            </View>
            <View className='apd-info-item'>
              <Text className='apd-info-item__label'>可入住</Text>
              <Text className='apd-info-item__value'>{fmtDate(detail?.available_from)}</Text>
            </View>
            <View className='apd-info-item apd-info-item--wide'>
              <Text className='apd-info-item__label'>业主 / 项目</Text>
              <Text className='apd-info-item__value'>
                {[detail?.owner_name, detail?.project_name].filter(Boolean).join(' · ') || '-'}
              </Text>
            </View>
          </View>
          {!!detail?.description && (
            <Text className='apd-desc'>{detail.description}</Text>
          )}
        </View>

        {/* 操作区 */}
        <View className='apd-action-row'>
          <View className='apd-action-btn' onClick={goEdit}>
            <Text className='apd-action-btn__text'>编辑房源</Text>
          </View>
          <View className='apd-action-btn' onClick={goLeases}>
            <Text className='apd-action-btn__text'>查看合同</Text>
          </View>
          <View className='apd-action-btn' onClick={scrollToMaintenance}>
            <Text className='apd-action-btn__text'>维修记录</Text>
          </View>
        </View>

        {/* 当前租客（来源：/properties/{id}/leases） */}
        <View className='apd-card'>
          <Text className='apd-card__title'>当前租客</Text>
          {activeLease ? (
            <>
              <View className='apd-tenant-head'>
                <View className='apd-tenant-avatar'>
                  <Text className='apd-tenant-avatar__text'>
                    {(activeLease.tenant_name || '租').slice(0, 1)}
                  </Text>
                </View>
                <View className='apd-tenant-meta'>
                  <Text className='apd-tenant-meta__name'>
                    {activeLease.tenant_name || `租客 ${String(activeLease.tenant_id || '').slice(0, 8)}`}
                  </Text>
                  <Text className='apd-tenant-meta__code'>
                    租约 {String(activeLease.id || '').slice(0, 8)}
                  </Text>
                </View>
                <Text className={`badge ${(LEASE_STATUS[activeLease.status] || LEASE_STATUS.pending).cls}`}>
                  {(LEASE_STATUS[activeLease.status] || LEASE_STATUS.pending).text}
                </Text>
              </View>
              <View className='apd-tenant-row'>
                <Text className='apd-tenant-row__label'>租期</Text>
                <Text className='apd-tenant-row__value'>
                  {fmtDate(activeLease.start_date)} ~ {fmtDate(activeLease.end_date)}
                </Text>
              </View>
              <View className='apd-tenant-row'>
                <Text className='apd-tenant-row__label'>月租</Text>
                <Text className='apd-tenant-row__value'>
                  {fmtMoney(activeLease.monthly_rent, activeLease.currency)}
                </Text>
              </View>
            </>
          ) : (
            <View className='apd-state apd-state--inline'>
              <Text className='apd-state__text'>当前没有租约记录</Text>
            </View>
          )}
        </View>

        {/* 维修记录（来源：/maintenance-tickets?property_id=） */}
        <View className='apd-card' id='apd-maintenance'>
          <Text className='apd-card__title'>维修记录</Text>
          {tickets.length === 0 && (
            <View className='apd-state apd-state--inline'>
              <Text className='apd-state__text'>暂无维修工单</Text>
            </View>
          )}
          {tickets.map((t) => {
            const meta = TICKET_STATUS[t.status] || { text: t.status || '-', cls: 'badge--neutral' }
            return (
              <View key={t.id} className='apd-maint-item'>
                <View className={`apd-maint-dot apd-maint-dot--${t.status || 'open'}`} />
                <View className='apd-maint-body'>
                  <View className='apd-maint-top'>
                    <Text className='apd-maint-title'>{t.title || t.description || '维修工单'}</Text>
                    <Text className={`badge ${meta.cls}`}>{meta.text}</Text>
                  </View>
                  <Text className='apd-maint-date'>{fmtDate(t.created_at)}</Text>
                  {!!t.description && <Text className='apd-maint-desc'>{t.description}</Text>}
                </View>
              </View>
            )
          })}
        </View>
      </ScrollView>

      {/* 底部导航：房源 */}
      <BottomNav role='admin' active='properties' />
    </View>
  )
}