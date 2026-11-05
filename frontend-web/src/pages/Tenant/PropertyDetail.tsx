import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTenantPropertyDetail } from './tenantPropertyDetail/hooks/useTenantPropertyDetail'
import PropertyBreadcrumb from './tenantPropertyDetail/components/PropertyBreadcrumb'
import PropertyGallery from './tenantPropertyDetail/components/PropertyGallery'
import PropertyPriceSection from './tenantPropertyDetail/components/PropertyPriceSection'
import PropertyCoreInfo from './tenantPropertyDetail/components/PropertyCoreInfo'
import PropertySellingPoints from './tenantPropertyDetail/components/PropertySellingPoints'
import PropertyDescription from './tenantPropertyDetail/components/PropertyDescription'
import PropertyLocation from './tenantPropertyDetail/components/PropertyLocation'
import PropertyActionBar from './tenantPropertyDetail/components/PropertyActionBar'
import BookingModal from './tenantPropertyDetail/components/BookingModal'
import LoanModal from './tenantPropertyDetail/components/LoanModal'

/**
 * 租客门户 · 房源详情（对齐 rental-full-draft/pages/tenant-property-detail.html）
 * 区块顺序：面包屑 → 图集 → 双业务价格区 → 核心信息(+同小区横评)
 *          → 卖点与配套 → 房源描述与翻译 → 位置与周边 → 底部固定操作栏
 * 数据全部来自真实接口，无数据渲染空态，不填充示例数据。
 */
const TenantPropertyDetail = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const d = useTenantPropertyDetail()

  if (d.loading) {
    return <div className="rent-empty">{t('tenantPropertyDetail.loading')}</div>
  }

  if (!d.detail) {
    return (
      <>
        <PropertyBreadcrumb
          onHome={() => navigate('/tenant/dashboard')}
          onListings={() => navigate('/tenant/listings')}
        />
        <div className="rent-empty">{t('tenantPropertyDetail.emptyDetail')}</div>
      </>
    )
  }

  const displayName = d.detail.room_number || d.detail.address || t('tenantPropertyDetail.detailDefaultName')

  return (
    <>
      {/* 面包屑 */}
      <PropertyBreadcrumb
        current={displayName}
        ariaLabel={t('tenantPropertyDetail.ariaBreadcrumb')}
        onHome={() => navigate('/tenant/dashboard')}
        onListings={() => navigate('/tenant/listings')}
      />

      <div className="rent-detail-wrap">
        {/* 1 图集 */}
        <PropertyGallery
          photos={d.photos}
          photoIndex={d.photoIndex}
          onSelectPhoto={d.setPhotoIndex}
          displayName={displayName}
          videoUrl={d.detail.video_url}
        />

        {/* 2 价格区（双业务） */}
        <PropertyPriceSection
          biz={d.biz}
          onBizChange={d.setBiz}
          detail={d.detail}
          displayName={displayName}
          saleListing={d.saleListing}
          buyPrice={d.buyPrice}
          buyCurrency={d.buyCurrency}
          buyLoanAmount={d.buyLoanAmount}
          loanDownPct={d.loanDownPct}
          loanYears={d.loanYears}
        />

        {/* 3 核心信息 */}
        <PropertyCoreInfo facts={d.facts} benchmark={d.benchmark} />

        {/* 4 卖点与基础配套 */}
        <PropertySellingPoints chips={d.chips} />

        {/* 5 房源描述与翻译 */}
        <PropertyDescription
          description={d.detail.description}
          translatedDesc={d.translatedDesc}
          transTarget={d.transTarget}
          translating={d.translating}
          onTargetChange={d.setTransTarget}
          onTranslate={d.handleTranslate}
          onViewOriginal={() => d.setTranslatedDesc(null)}
        />

        {/* 6 位置与周边 */}
        <PropertyLocation
          pinLabel={d.detail.project_name || d.detail.room_number}
          pois={d.pois}
        />
      </div>

      {/* 7 底部固定操作栏 */}
      <PropertyActionBar
        favorited={d.favorited}
        favBusy={d.favBusy}
        biz={d.biz}
        hasSaleListing={!!d.saleListing}
        onToggleFavorite={d.handleToggleFavorite}
        onOpenLoan={() => d.setLoanOpen(true)}
        onOpenBooking={() => d.setBookingOpen(true)}
        onContactBroker={d.handleContactBroker}
        contactBusy={d.contactBusy}
      />

      {/* 预约看房 */}
      <BookingModal
        open={d.bookingOpen}
        displayName={displayName}
        bookingAt={d.bookingAt}
        onBookingAtChange={d.setBookingAt}
        bookingNote={d.bookingNote}
        onBookingNoteChange={d.setBookingNote}
        busy={d.bookingBusy}
        onOk={d.handleBooking}
        onCancel={() => d.setBookingOpen(false)}
      />

      {/* 贷款试算 */}
      <LoanModal
        open={d.loanOpen}
        onCancel={() => d.setLoanOpen(false)}
        buyPrice={d.buyPrice}
        buyCurrency={d.buyCurrency}
        loanDownPct={d.loanDownPct}
        onLoanDownPctChange={d.setLoanDownPct}
        loanYears={d.loanYears}
        onLoanYearsChange={d.setLoanYears}
        loanRate={d.loanRate}
        onLoanRateChange={d.setLoanRate}
        buyDown={d.buyDown}
        buyLoanAmount={d.buyLoanAmount}
        loanResult={d.loanResult}
      />
    </>
  )
}

export default TenantPropertyDetail
