import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import './payments.css'
import { usePaymentsList } from './hooks/usePaymentsList'
import { usePaymentsSummary } from './hooks/usePaymentsSummary'
import { usePaymentActions } from './hooks/usePaymentActions'
import PaymentsHeader from './components/PaymentsHeader'
import PaymentsSummaryCards from './components/PaymentsSummaryCards'
import PaymentsFilterBar from './components/PaymentsFilterBar'
import PaymentsTable from './components/PaymentsTable'
import PaymentsPagination from './components/PaymentsPagination'
import RefundModal from './components/RefundModal'
import WaiveModal from './components/WaiveModal'
import ManualEntryModal from './components/ManualEntryModal'
import ConfirmModal from './components/ConfirmModal'
import DetailModal from './components/DetailModal'

/**
 * 收付款页：列表/筛选/分页/统计 + 退款、滞纳金减免、手动记账、确认到账、详情凭证。
 *
 * 纯结构拆分：本文件只保留页面编排与各区块挂载，
 * 数据查询、派生状态、写操作与本页面视图组件均落在本页面私有目录内。
 */
const Payments = () => {
  const { t } = useTranslation()
  const list = usePaymentsList()
  const summary = usePaymentsSummary(list.serverSummary, list.total, list.queryParams.page, list.queryParams.pageSize)
  const actions = usePaymentActions(list.fetchData)

  return (
    <div className="rent-main">
      {/* Page Header */}
      <PaymentsHeader onExport={list.handleExport} onManual={() => actions.setManualOpen(true)} />

      {/* Summary Cards */}
      <PaymentsSummaryCards summary={summary.summary} />

      {/* Filter Bar */}
      <PaymentsFilterBar
        filterType={list.filterType}
        setFilterType={list.setFilterType}
        filterMethod={list.filterMethod}
        setFilterMethod={list.setFilterMethod}
        filterStart={list.filterStart}
        setFilterStart={list.setFilterStart}
        filterEnd={list.filterEnd}
        setFilterEnd={list.setFilterEnd}
        status={list.queryParams.status || ''}
        onStatusChange={list.handleStatusChange}
        onSearch={list.handleSearch}
        onApplyFilter={list.handleApplyFilter}
      />

      {/* Payments Table */}
      {list.loadError && list.data.length === 0 ? (
        <DataState error={list.loadError} errorKind={list.loadErrorKind} retryText={t('common.retry')} onRetry={list.fetchData} />
      ) : list.loading && list.data.length === 0 ? (
        <DataState loading loadingText={t('common.loading')} skeletonRows={6} />
      ) : (
        <>
          <PaymentsTable
            items={list.data}
            filtered={list.hasFilters}
            resolveTenantName={list.resolveTenantName}
            onOpenDetail={actions.openDetail}
            onOpenConfirm={actions.openConfirm}
            onOpenWaive={actions.openWaive}
            onOpenRefund={actions.openRefund}
          />

          {/* Pagination */}
          <PaymentsPagination
            total={summary.statTotal}
            page={list.queryParams.page}
            totalPages={summary.totalPages}
            pageNumbers={summary.pageNumbers}
            setPage={(page) => list.setQueryParams((p) => ({ ...p, page }))}
          />
        </>
      )}

      {/* Refund Modal (native rent-modal) */}
      {actions.refundOpen && (
        <RefundModal
          reason={actions.refundReason}
          setReason={actions.setRefundReason}
          submitting={actions.submitting}
          onSubmit={actions.handleRefund}
          onClose={() => actions.setRefundOpen(false)}
        />
      )}

      {/* Waive late fee modal */}
      {actions.waiveOpen && actions.waivePayment && (
        <WaiveModal
          payment={actions.waivePayment}
          amount={actions.waiveAmount}
          setAmount={actions.setWaiveAmount}
          reason={actions.waiveReason}
          setReason={actions.setWaiveReason}
          submitting={actions.submitting}
          onSubmit={actions.handleWaive}
          onClose={() => actions.setWaiveOpen(false)}
        />
      )}

      {/* Manual entry modal */}
      {actions.manualOpen && (
        <ManualEntryModal
          form={actions.manualForm}
          setField={actions.setManual}
          submitting={actions.submitting}
          onSubmit={actions.handleManualSubmit}
          onClose={() => actions.setManualOpen(false)}
        />
      )}

      {/* Confirm arrival modal */}
      {actions.confirmTarget && (
        <ConfirmModal
          payment={actions.confirmTarget}
          confirming={actions.confirming}
          onConfirm={actions.handleConfirmSub}
          onClose={() => actions.setConfirmTarget(null)}
        />
      )}

      {/* Detail / receipt / invoice modal */}
      {actions.detail && (
        <DetailModal
          payment={actions.detail}
          detailType={actions.detailType}
          docData={actions.docData}
          onOpenDetail={actions.openDetail}
          onClose={() => actions.setDetail(null)}
        />
      )}
    </div>
  )
}

export default Payments
