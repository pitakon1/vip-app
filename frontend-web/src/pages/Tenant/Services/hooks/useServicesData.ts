/**
 * 服务页数据查询与派生。
 * 纯结构拆分自 pages/Tenant/Services.tsx：接口、参数、解析与展示映射保持不变。
 */
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { useCachedQuery } from '@/lib/queryCache'
import { useAuthStore } from '@/stores/auth'
import { DETAIL_PAGE_SIZE } from '@/lib/pagination'
import { normalizeBookingStatus } from '../constants'
import type { Booking, CatalogItem, PropertyOption, ServicesPayload } from '../types'

export function useServicesData(uid: string) {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'zh').slice(0, 2)
  // /owners/me/properties 仅业主/管理员可读，租客与员工调用会稳定 403
  const canReadOwnerProperties = useAuthStore((s) => s.user?.role === 'owner' || s.user?.role === 'admin')

  const q = useCachedQuery<ServicesPayload>({
    queryKey: ['tenant-services', uid, canReadOwnerProperties ? 'owner' : 'other'],
    cacheKey: `tenant-services:${uid}:${canReadOwnerProperties ? 'owner' : 'other'}`,
    queryFn: async () => {
      const [cRes, oRes, lRes, pkgRes, tkRes, opRes] = await Promise.allSettled([
        api.get('/billing/pricing'),
        api.get('/service-orders'),
        api.get('/leases'),
        api.get('/service-packages/me'),
        api.get('/maintenance-tickets', { params: { page_size: DETAIL_PAGE_SIZE } }),
        canReadOwnerProperties ? api.get('/owners/me/properties') : Promise.resolve(null),
      ])

      // 真实价目表（不含税基准价），页面不再使用硬编码假价格
      let catalog: CatalogItem[] = []
      if (cRes.status === 'fulfilled') {
        const cPayload = cRes.value.data?.data ?? cRes.value.data
        const cat: Record<string, any> = cPayload?.service_catalog ?? {}
        catalog = Object.entries(cat).map(([code, v]) => ({ code, ...(v as object) }))
      }

      let orders: any[] = []
      if (oRes.status === 'fulfilled') {
        const payload = oRes.value.data?.data ?? oRes.value.data
        orders = payload?.items ?? []
      }

      // 服务订单/报修必须挂到具体 property_id：租客取生效租约房源
      let leaseProperty: PropertyOption | null = null
      if (lRes.status === 'fulfilled') {
        const lPayload = lRes.value.data?.data ?? lRes.value.data
        const leases: any[] = lPayload?.items ?? []
        const lease = leases.find((l) => l.status === 'active') || leases[0]
        const pid = lease?.property_id || lease?.property?.id
        if (pid) {
          const p = lease?.property || {}
          leaseProperty = {
            id: pid,
            label: [p.room_number, p.address].filter(Boolean).join(' · ') || pid,
            monthly_rent: p.monthly_rent,
            currency: p.currency,
          }
        }
      }

      // 业主订阅套餐（租客无档案时后端返回空数组）
      let packages: ServicesPayload['packages'] = []
      if (pkgRes.status === 'fulfilled') {
        const payload = pkgRes.value.data?.data ?? pkgRes.value.data
        packages = Array.isArray(payload) ? payload : (payload?.items ?? [])
      }

      // 报修工单（租客只见自己的，业主只见自己房源的）
      let tickets: ServicesPayload['tickets'] = []
      if (tkRes.status === 'fulfilled') {
        const payload = tkRes.value.data?.data ?? tkRes.value.data
        tickets = payload?.items ?? (Array.isArray(payload) ? payload : [])
      }

      // 业主名下房源（仅业主/管理员请求；其他角色无档案时返回空数组）
      let ownerProperties: PropertyOption[] = []
      if (opRes.status === 'fulfilled' && opRes.value) {
        const payload = opRes.value.data?.data ?? opRes.value.data
        const list: any[] = Array.isArray(payload) ? payload : (payload?.items ?? [])
        ownerProperties = list.map((p) => ({
          id: p.id,
          label: [p.room_number, p.address].filter(Boolean).join(' · ') || p.id,
          monthly_rent: p.monthly_rent,
          currency: p.currency,
        }))
      }

      return { catalog, orders, leaseProperty, packages, tickets, ownerProperties }
    },
  })

  const catalog = q.data?.catalog ?? []
  const leaseProperty = q.data?.leaseProperty ?? null
  const packages = q.data?.packages ?? []
  const tickets = q.data?.tickets ?? []
  const ownerProperties = q.data?.ownerProperties ?? []

  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  // 服务展示名：优先语言包（服务名已本地化），退回价目表标签，最后退回编码
  const serviceNameOf = useCallback(
    (code: string, catalogItems: CatalogItem[]) => {
      const key = `tenantServices.serviceType.${code}`
      const translated = t(key)
      if (translated && translated !== key) return translated
      const item = catalogItems.find((c) => c.code === code)
      const label = lang === 'en' ? item?.label_en : lang === 'th' ? item?.label_th : item?.label_zh
      return label || code || t('tenantServices.otherService')
    },
    [t, lang],
  )

  const unitOf = useCallback(
    (code: string, catalogItems: CatalogItem[]) => {
      const key = `tenantServices.serviceUnit.${code}`
      const unit = catalogItems.find((c) => c.code === code)?.unit || ''
      return t(key, { defaultValue: unit })
    },
    [t],
  )

  const bookings: Booking[] = useMemo(
    () =>
      (q.data?.orders ?? []).map((o: any) => ({
        id: o.id,
        serviceId: o.service_type,
        serviceName: serviceNameOf(o.service_type, catalog),
        status: normalizeBookingStatus(o.status),
        createdAt: o.created_at,
        preferredDate: o.scheduled_at,
        completedAt: o.completed_at,
        amount: Number(o.amount || 0),
        notes: o.notes,
        rating: typeof o.rating === 'number' ? o.rating : undefined,
        reviewComment: o.review_comment,
      })),
    [q.data?.orders, catalog, serviceNameOf],
  )

  return {
    catalog,
    leaseProperty,
    packages,
    tickets,
    ownerProperties,
    bookings,
    refresh,
    serviceNameOf,
    unitOf,
  }
}
