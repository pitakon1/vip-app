import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth'
import DataState from '@/components/DataState'
import './payments.css'
import { useTenantPayments } from './payments/hooks/useTenantPayments'
import { useVoucherUpload } from './payments/hooks/useVoucherUpload'
import OwnerOnlinePayCard from './payments/components/OwnerOnlinePayCard'
import PaymentsHero from './payments/components/PaymentsHero'
import PaymentsSummary from './payments/components/PaymentsSummary'
import PaymentsSearchBar from './payments/components/PaymentsSearchBar'
import VoucherUploadCard from './payments/components/VoucherUploadCard'
import PaymentRecords from './payments/components/PaymentRecords'
import PaymentDetailModal from './payments/components/PaymentDetailModal'

const TenantPayments = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  // 业主独有数据块（在线缴费）仅在业主身份下渲染；其余区块两个角色完全一致
  const isOwner = user?.role === 'owner'

  const payments = useTenantPayments()
  const pendingBills = payments.data.filter((b) => String(b.status).toLowerCase() === 'pending')
  const upload = useVoucherUpload(pendingBills)

  return (
    <>
      {payments.loading && (
        <DataState loading loadingText={t('common.loading')} skeletonRows={3} />
      )}

      {/* Hero: 本月租金大卡片 */}
      <PaymentsHero
        pendingTotal={payments.summary.pendingTotal}
        heroCurrency={payments.heroCurrency}
        heroProperty={payments.heroProperty}
        heroDue={payments.heroDue}
      />

      {/* 付款状态摘要条 */}
      <PaymentsSummary data={payments.data} />

      {/* 业主在线缴费（业主独有数据块） */}
      {isOwner && <OwnerOnlinePayCard onPaid={payments.refresh} />}

      {/* 搜索框 + 状态筛选胶囊 */}
      <PaymentsSearchBar
        keyword={payments.keyword}
        onKeywordChange={payments.setKeyword}
        filter={payments.filter}
        onFilterChange={payments.setFilter}
      />

      {/* 上传凭证表单 */}
      <VoucherUploadCard
        pendingBills={upload.pendingBills}
        billId={upload.billId}
        onBillChange={upload.handleBillChange}
        billType={upload.billType}
        onBillTypeChange={upload.setBillType}
        currency={upload.currency}
        onCurrencyChange={upload.setCurrency}
        amount={upload.amount}
        onAmountChange={upload.setAmount}
        paymentDate={upload.paymentDate}
        onPaymentDateChange={upload.setPaymentDate}
        paymentMethod={upload.paymentMethod}
        onPaymentMethodChange={upload.setPaymentMethod}
        fileName={upload.fileName}
        onFileChange={upload.handleFileChange}
        submitting={upload.submitting}
        onSubmit={upload.handleSubmit}
      />

      {/* 付款记录 */}
      <PaymentRecords
        monthGroups={payments.monthGroups}
        filter={payments.filter}
        keyword={payments.keyword}
        isError={payments.isError}
        onRetry={payments.refresh}
        onView={payments.setDetailBill}
      />

      {/* 凭证详情（字段全部来自支付单实体，不做臆造） */}
      <PaymentDetailModal
        bill={payments.detailBill}
        onClose={() => payments.setDetailBill(null)}
      />
    </>
  )
}

export default TenantPayments
