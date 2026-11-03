import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth'
import './services.css'
import type { Booking, PropertyOption } from './Services/types'
import { useServicesData } from './Services/hooks/useServicesData'
import { useTicketRows } from './Services/hooks/useTicketRows'
import { useBookingFlow } from './Services/hooks/useBookingFlow'
import { useReviewFlow } from './Services/hooks/useReviewFlow'
import { useSubscribeFlow } from './Services/hooks/useSubscribeFlow'
import { useRepairFlow } from './Services/hooks/useRepairFlow'
import HeroSection from './Services/components/HeroSection'
import ServiceCatalog from './Services/components/ServiceCatalog'
import OwnerPlans from './Services/components/OwnerPlans'
import OwnerTickets from './Services/components/OwnerTickets'
import TenantOrders from './Services/components/TenantOrders'
import ReviewsSection from './Services/components/ReviewsSection'
import PromoBanner from './Services/components/PromoBanner'
import BookingModal from './Services/modals/BookingModal'
import OrderDetailModal from './Services/modals/OrderDetailModal'
import ReviewModal from './Services/modals/ReviewModal'
import SubscribeModal from './Services/modals/SubscribeModal'
import RepairModal from './Services/modals/RepairModal'

/**
 * 租客/业主服务页：服务价目、下单、评价、业主订阅与报修。
 *
 * 纯结构拆分：本文件只保留编排与页面级挂载，
 * 数据查询、派生行、四类弹窗流程与各区块视图均落在本页面私有目录内。
 */

const TenantServices = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const isOwner = user?.role === 'owner'

  const data = useServicesData(uid)

  const [detailOrder, setDetailOrder] = useState<Booking | null>(null)

  const statusLabelMap = useMemo<Record<Booking['status'], string>>(
    () => ({
      pending: t('tenantServices.bookStatus.pending'),
      in_progress: t('tenantServices.bookStatus.in_progress'),
      completed: t('tenantServices.bookStatus.completed'),
      cancelled: t('tenantServices.bookStatus.cancelled'),
    }),
    [t],
  )

  // 可服务房源：业主用名下房源选择器；租客用生效租约房源
  const propertyOptions = useMemo<PropertyOption[]>(
    () => (isOwner ? data.ownerProperties : data.leaseProperty ? [data.leaseProperty] : []),
    [isOwner, data.ownerProperties, data.leaseProperty],
  )

  const ticketRows = useTicketRows({
    bookings: data.bookings,
    tickets: data.tickets,
    propertyOptions,
    statusLabelMap,
  })

  const booking = useBookingFlow({
    userId: user?.id,
    isOwner,
    propertyOptions,
    onChanged: data.refresh,
  })
  const review = useReviewFlow({ onChanged: data.refresh })
  const subscribe = useSubscribeFlow({ ownerProperties: data.ownerProperties, onChanged: data.refresh })
  const repair = useRepairFlow({ propertyOptions, onChanged: data.refresh })

  const completedCount = data.bookings.filter((b) => b.status === 'completed').length
  const ratedBookings = data.bookings.filter((b) => typeof b.rating === 'number' && Number(b.rating) > 0)
  const avgRating = ratedBookings.length
    ? (ratedBookings.reduce((sum, b) => sum + Number(b.rating), 0) / ratedBookings.length).toFixed(1)
    : null

  const heroStats = [
    { value: String(data.catalog.length), label: t('tenantServices.itemCount') },
    { value: String(completedCount), label: t('tenantServices.completedOrders') },
    { value: avgRating ?? '—', label: t('tenantServices.avgRating') },
  ]

  return (
    <>
      <HeroSection isOwner={isOwner} stats={heroStats} />

      <ServiceCatalog
        catalog={data.catalog}
        serviceNameOf={data.serviceNameOf}
        unitOf={data.unitOf}
        onBook={booking.openBooking}
      />

      {isOwner && (
        <OwnerPlans
          packages={data.packages}
          onSubscribe={subscribe.openSubscribe}
          onCancelPackage={subscribe.handleCancelPackage}
        />
      )}

      {/* 我的订单（租客）/ 我的工单（业主，含服务订单 + 报修工单） */}
      {isOwner ? (
        <OwnerTickets
          rows={ticketRows.mergedTickets}
          ticketFilter={ticketRows.ticketFilter}
          onFilterChange={ticketRows.setTicketFilter}
          bookings={data.bookings}
          onOpenRepair={repair.openRepair}
          onReview={review.openReview}
        />
      ) : (
        <TenantOrders
          bookings={data.bookings}
          statusLabelMap={statusLabelMap}
          onReview={review.openReview}
          onDetail={setDetailOrder}
        />
      )}

      <ReviewsSection ratedBookings={ratedBookings} />

      <PromoBanner onBuy={booking.buyPromo} />

      {/* 下单确认（真实创建服务订单） */}
      <BookingModal
        item={booking.bookItem}
        propertyId={booking.bookPropertyId}
        onPropertyChange={booking.setBookPropertyId}
        propertyOptions={propertyOptions}
        catalog={data.catalog}
        serviceNameOf={data.serviceNameOf}
        unitOf={data.unitOf}
        submitting={booking.submitting}
        onCancel={() => booking.setBookItem(null)}
        onOk={booking.submitBooking}
      />

      {/* 订单详情 */}
      <OrderDetailModal
        order={detailOrder}
        statusLabelMap={statusLabelMap}
        onCancel={() => setDetailOrder(null)}
      />

      {/* 评价服务 */}
      <ReviewModal
        order={review.reviewOrder}
        rating={review.reviewRating}
        onRatingChange={review.setReviewRating}
        comment={review.reviewComment}
        onCommentChange={review.setReviewComment}
        submitting={review.submitting}
        onCancel={() => review.setReviewOrder(null)}
        onOk={review.submitReview}
      />

      {/* 订阅套餐（业主专享） */}
      <SubscribeModal
        open={subscribe.subscribeOpen}
        form={subscribe.subscribeForm}
        ownerProperties={data.ownerProperties}
        submitting={subscribe.subscribeSubmitting}
        onCancel={() => subscribe.setSubscribeOpen(false)}
        onOk={subscribe.handleSubscribe}
      />

      {/* 提交报修（租客 / 业主均可） */}
      <RepairModal
        open={repair.repairOpen}
        form={repair.repairForm}
        propertyOptions={propertyOptions}
        submitting={repair.repairSubmitting}
        onCancel={() => !repair.repairSubmitting && repair.setRepairOpen(false)}
        onOk={repair.handleRepairSubmit}
      />
    </>
  )
}

export default TenantServices
