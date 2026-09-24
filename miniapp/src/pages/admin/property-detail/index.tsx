import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { maintenanceApi } from '@/services/api'
import { fmtMoney } from '@/utils/format'
import { request } from '@/lib/api'
import { iconStyle } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'
import { useI18n } from '@/i18n'
import './index.scss'

const TYPE_LABELS: Record<string, string> = {
  apartment: 'prop.typeApartment',
  condo: 'prop.typeApartment',
  house: 'prop.typeVilla',
  villa: 'prop.typeVilla',
  commercial: 'prop.typeCommercial',
  shop: 'prop.typeCommercial',
  office: 'prop.typeOffice'
}

const STATUS_LABELS: Record<string, string> = {
  vacant: 'prop.statusVacantLong',
  rented: 'prop.statusRentedLong',
  renewing: 'prop.statusRenewing',
  maintenance: 'prop.statusMaintenanceLong'
}

// 状态 → 徽章配色（复用全局 .badge 变体）
const STATUS_BADGE: Record<string, string> = {
  vacant: 'badge--warning',
  rented: 'badge--success',
  renewing: 'badge--primary',
  maintenance: 'badge--info'
}

const LEASE_STATUS: Record<string, { text: string; cls: string }> = {
  active: { text: 'lease.stActive', cls: 'badge--success' },
  pending: { text: 'lease.stPending', cls: 'badge--info' },
  expired: { text: 'lease.stExpired', cls: 'badge--neutral' },
  terminated: { text: 'lease.stTerminated', cls: 'badge--neutral' }
}

const TICKET_STATUS: Record<string, { text: string; cls: string }> = {
  open: { text: 'maint.stOpen', cls: 'badge--warning' },
  assigned: { text: 'maint.stAssigned', cls: 'badge--info' },
  in_progress: { text: 'maint.stInProgress', cls: 'badge--primary' },
  resolved: { text: 'maint.stResolved', cls: 'badge--success' },
  closed: { text: 'maint.stClosed', cls: 'badge--neutral' }
}

const fmtDate = (v?: string) => (v ? String(v).slice(0, 10) : '-')

export default function AdminPropertyDetailPage() {
  const { t } = useI18n()
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
      Taro.showToast({ title: t('common.loadFailed'), icon: 'none' })
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
          <Text className='apd-state__text'>{id ? t('prop.notFoundDeleted') : t('prop.missingParam')}</Text>
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
          <Text className='apd-nav__back-text'>{t('prop.listing')}</Text>
        </View>
        <Text className='apd-nav__title'>{t('prop.detailTitle')}</Text>
        <View className='apd-nav__placeholder' />
      </View>

      <ScrollView scrollY scrollIntoView={scrollTarget} className='apd-scroll'>
        {/* 头图占位 + 类型徽章 */}
        <View className='apd-hero'>
          <Text className='apd-hero__ph'>{t('prop.listing')}</Text>
          <Text className='apd-hero__badge'>
            {t(TYPE_LABELS[detail?.property_type || ''] || 'prop.listing')}
          </Text>
        </View>

        {/* 名称 + 状态 + 地址 */}
        <View className='apd-card'>
          <View className='apd-head'>
            <Text className='apd-head__name'>
              {detail?.room_number || detail?.address || t('prop.unnamed')}
            </Text>
            <Text className={`badge ${STATUS_BADGE[detail?.status || ''] || 'badge--neutral'}`}>
              {t(STATUS_LABELS[detail?.status || ''] || 'prop.unknown')}
            </Text>
          </View>
          <View className='apd-addr'>
            <View className='icon-svg icon-svg--sm' style={iconStyle('home', 26)} />
            <Text className='apd-addr__text'>{detail?.address || t('prop.noAddress')}</Text>
          </View>
        </View>

        {/* 关键指标 */}
        <View className='apd-key-stats'>
          <View className='apd-key-stat'>
            <Text className='apd-key-stat__value apd-key-stat__value--primary'>
              {fmtMoney(detail?.monthly_rent, detail?.currency)}
            </Text>
            <Text className='apd-key-stat__label'>{t('prop.monthlyRent')}</Text>
          </View>
          <View className='apd-key-stat'>
            <Text className='apd-key-stat__value'>{detail?.size_sqm || 0}㎡</Text>
            <Text className='apd-key-stat__label'>{t('prop.areaLabel')}</Text>
          </View>
          <View className='apd-key-stat'>
            <Text className='apd-key-stat__value'>
              {t('prop.bedroomUnit', { n: detail?.bedrooms || 0 })}{' '}
              {t('prop.bathroomUnit', { n: detail?.bathrooms || 0 })}
            </Text>
            <Text className='apd-key-stat__label'>{t('prop.filterLayout')}</Text>
          </View>
          <View className='apd-key-stat'>
            <Text className='apd-key-stat__value'>
              {t(STATUS_LABELS[detail?.status || ''] || '') || '-'}
            </Text>
            <Text className='apd-key-stat__label'>{t('prop.statusLabel')}</Text>
          </View>
        </View>

        {/* 房源信息（后端字段：building/floor/furnished/deposit_amount/deposit_months/available_from） */}
        <View className='apd-card'>
          <Text className='apd-card__title'>{t('prop.infoTitle')}</Text>
          <View className='apd-info-grid'>
            <View className='apd-info-item'>
              <Text className='apd-info-item__label'>{t('prop.floorLabel')}</Text>
              <Text className='apd-info-item__value'>
                {[detail?.building, detail?.floor].filter(Boolean).join(' ') || '-'}
              </Text>
            </View>
            <View className='apd-info-item'>
              <Text className='apd-info-item__label'>{t('prop.configLabel')}</Text>
              <Text className='apd-info-item__value'>
                {detail?.furnished ? t('prop.furnishedYes') : t('prop.furnishedNo')}
              </Text>
            </View>
            <View className='apd-info-item'>
              <Text className='apd-info-item__label'>{t('prop.depositLabel')}</Text>
              <Text className='apd-info-item__value'>
                {fmtMoney(detail?.deposit_amount, detail?.currency)}
                {detail?.deposit_months ? t('prop.depositMonthsSuffix', { n: detail.deposit_months }) : ''}
              </Text>
            </View>
            <View className='apd-info-item'>
              <Text className='apd-info-item__label'>{t('prop.availableFrom')}</Text>
              <Text className='apd-info-item__value'>{fmtDate(detail?.available_from)}</Text>
            </View>
            <View className='apd-info-item apd-info-item--wide'>
              <Text className='apd-info-item__label'>{t('prop.ownerProject')}</Text>
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
            <Text className='apd-action-btn__text'>{t('prop.editListing')}</Text>
          </View>
          <View className='apd-action-btn' onClick={goLeases}>
            <Text className='apd-action-btn__text'>{t('prop.viewLeases')}</Text>
          </View>
          <View className='apd-action-btn' onClick={scrollToMaintenance}>
            <Text className='apd-action-btn__text'>{t('prop.maintenanceRecords')}</Text>
          </View>
        </View>

        {/* 当前租客（来源：/properties/{id}/leases） */}
        <View className='apd-card'>
          <Text className='apd-card__title'>{t('prop.currentTenant')}</Text>
          {activeLease ? (
            <>
              <View className='apd-tenant-head'>
                <View className='apd-tenant-avatar'>
                  <Text className='apd-tenant-avatar__text'>
                    {(activeLease.tenant_name || t('prop.tenantShort')).slice(0, 1)}
                  </Text>
                </View>
                <View className='apd-tenant-meta'>
                  <Text className='apd-tenant-meta__name'>
                    {activeLease.tenant_name ||
                      t('prop.tenantWithId', { id: String(activeLease.tenant_id || '').slice(0, 8) })}
                  </Text>
                  <Text className='apd-tenant-meta__code'>
                    {t('prop.leaseWithId', { id: String(activeLease.id || '').slice(0, 8) })}
                  </Text>
                </View>
                <Text className={`badge ${(LEASE_STATUS[activeLease.status] || LEASE_STATUS.pending).cls}`}>
                  {t((LEASE_STATUS[activeLease.status] || LEASE_STATUS.pending).text)}
                </Text>
              </View>
              <View className='apd-tenant-row'>
                <Text className='apd-tenant-row__label'>{t('lease.term')}</Text>
                <Text className='apd-tenant-row__value'>
                  {fmtDate(activeLease.start_date)} ~ {fmtDate(activeLease.end_date)}
                </Text>
              </View>
              <View className='apd-tenant-row'>
                <Text className='apd-tenant-row__label'>{t('prop.monthlyRent')}</Text>
                <Text className='apd-tenant-row__value'>
                  {fmtMoney(activeLease.monthly_rent, activeLease.currency)}
                </Text>
              </View>
            </>
          ) : (
            <View className='apd-state apd-state--inline'>
              <Text className='apd-state__text'>{t('lease.noActive')}</Text>
            </View>
          )}
        </View>

        {/* 维修记录（来源：/maintenance-tickets?property_id=） */}
        <View className='apd-card' id='apd-maintenance'>
          <Text className='apd-card__title'>{t('prop.maintenanceRecords')}</Text>
          {tickets.length === 0 && (
            <View className='apd-state apd-state--inline'>
              <Text className='apd-state__text'>{t('maint.empty')}</Text>
            </View>
          )}
          {tickets.map((ticket) => {
            const meta = TICKET_STATUS[ticket.status] || {
              text: ticket.status || '',
              cls: 'badge--neutral'
            }
            return (
              <View key={ticket.id} className='apd-maint-item'>
                <View className={`apd-maint-dot apd-maint-dot--${ticket.status || 'open'}`} />
                <View className='apd-maint-body'>
                  <View className='apd-maint-top'>
                    <Text className='apd-maint-title'>
                      {ticket.title || ticket.description || t('maint.ticketFallback')}
                    </Text>
                    <Text className={`badge ${meta.cls}`}>
                      {meta.text ? t(meta.text) : '-'}
                    </Text>
                  </View>
                  <Text className='apd-maint-date'>{fmtDate(ticket.created_at)}</Text>
                  {!!ticket.description && (
                    <Text className='apd-maint-desc'>{ticket.description}</Text>
                  )}
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