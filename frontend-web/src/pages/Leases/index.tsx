import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import './leases.css'
import { displayStatusMeta } from './constants'
import { getDisplayStatus } from './utils'
import { useLeasesList } from './hooks/useLeasesList'
import { useLeaseActions } from './hooks/useLeaseActions'
import LeasesHeader from './components/LeasesHeader'
import LeasesSummaryCards from './components/LeasesSummaryCards'
import LeasesFilterBar from './components/LeasesFilterBar'
import LeasesTable from './components/LeasesTable'
import LeasesPagination from './components/LeasesPagination'
import CreateLeaseModal from './components/CreateLeaseModal'
import RenewLeaseModal from './components/RenewLeaseModal'
import LeaseDetailModal from './components/LeaseDetailModal'

const Leases = () => {
  const { t } = useTranslation()
  const list = useLeasesList()
  const actions = useLeaseActions({ fetchData: list.fetchData })

  // 详情弹窗的展示态：与列表徽章同一口径
  const detailMeta = actions.detailLease
    ? displayStatusMeta[getDisplayStatus(actions.detailLease)]
    : null

  const filtered = !!(
    list.queryParams.status ||
    list.queryParams.keyword ||
    list.queryParams.propertyType ||
    list.queryParams.dateFrom ||
    list.queryParams.dateTo ||
    list.queryParams.endingWithinDays
  )

  return (
    <div className="rent-main">
      <LeasesHeader
        exporting={list.exporting}
        onExport={list.handleExport}
        onNew={actions.openCreate}
      />

      <LeasesSummaryCards
        statTotal={list.statTotal}
        statActive={list.statActive}
        statExpiring={list.statExpiring}
        statTerminated={list.statTerminated}
      />

      <LeasesFilterBar
        filterStatus={list.filterStatus}
        setFilterStatus={list.setFilterStatus}
        filterType={list.filterType}
        setFilterType={list.setFilterType}
        filterStart={list.filterStart}
        setFilterStart={list.setFilterStart}
        filterEnd={list.filterEnd}
        setFilterEnd={list.setFilterEnd}
        handleStatusChange={list.handleStatusChange}
        handleSearch={list.handleSearch}
        handleApplyFilters={list.handleApplyFilters}
        handleReset={list.handleReset}
      />

      <div className="rent-card">
        {list.loadError && list.displayData.length === 0 ? (
          <DataState error={list.loadError} errorKind={list.loadErrorKind} retryText={t('common.retry')} onRetry={list.fetchData} />
        ) : list.loading && list.displayData.length === 0 ? (
          <DataState loading loadingText={t('common.loading')} skeletonRows={6} />
        ) : (
          <>
            <LeasesTable
              items={list.displayData}
              filtered={filtered}
              resolvePropertyName={list.resolvePropertyName}
              resolveTenantName={list.resolveTenantName}
              onView={(lease) => actions.setDetailLease(lease)}
              onRenew={actions.openRenew}
              onTerminate={actions.handleTerminate}
            />
            <LeasesPagination
              total={list.statTotal}
              page={list.queryParams.page}
              totalPages={list.totalPages}
              pageNumbers={list.pageNumbers}
              onPage={list.setPage}
            />
          </>
        )}
      </div>

      <CreateLeaseModal
        open={actions.createOpen}
        form={actions.createForm}
        properties={list.properties}
        setField={actions.setCreateField}
        submitting={actions.submitting}
        onClose={actions.closeCreate}
        onSubmit={actions.handleCreate}
      />

      <RenewLeaseModal
        open={actions.renewOpen}
        form={actions.renewForm}
        setField={actions.setRenewField}
        submitting={actions.submitting}
        onClose={actions.closeRenew}
        onSubmit={actions.handleRenew}
      />

      {actions.detailLease && detailMeta && (
        <LeaseDetailModal
          lease={actions.detailLease}
          meta={detailMeta}
          resolvePropertyName={list.resolvePropertyName}
          resolveTenantName={list.resolveTenantName}
          onClose={() => actions.setDetailLease(null)}
        />
      )}
    </div>
  )
}

export default Leases
