import './employees.css'
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import { EmployeesHeader } from './employees/components/EmployeesHeader'
import { EmployeeStatsCards } from './employees/components/EmployeeStatsCards'
import { EmployeeFilterBar } from './employees/components/EmployeeFilterBar'
import { EmployeeListCard } from './employees/components/EmployeeListCard'
import { CreateEmployeeModal } from './employees/components/CreateEmployeeModal'
import { EditEmployeeModal } from './employees/components/EditEmployeeModal'
import { EmployeeDetailModal } from './employees/components/EmployeeDetailModal'
import { EmployeePerformanceModal } from './employees/components/EmployeePerformanceModal'
import { useEmployeesList } from './employees/hooks/useEmployeesList'
import { useEmployeeActions } from './employees/hooks/useEmployeeActions'

const Employees = () => {
  const { t } = useTranslation()
  const list = useEmployeesList()
  const actions = useEmployeeActions({
    queryParams: list.queryParams,
    fetchData: list.fetchData,
    fetchDepartments: list.fetchDepartments,
  })

  return (
    <div className="rent-main">
      <EmployeesHeader
        exporting={actions.exporting}
        onExport={actions.handleExport}
        onCreate={actions.openCreate}
      />

      <EmployeeStatsCards stats={list.stats} />

      {list.listError ? (
        <DataState
          error={list.listError}
          errorKind={list.listErrorKind}
          retryText={t('common.retry')}
          onRetry={list.fetchData}
        />
      ) : (
        <>
      <EmployeeFilterBar
        keywordInput={list.keywordInput}
        onKeywordChange={list.setKeywordInput}
        queryParams={list.queryParams}
        departments={list.departments}
        sortBy={list.sortBy}
        onDepartmentChange={list.handleDepartmentChange}
        onStatusChange={list.handleStatusChange}
        onSortChange={list.handleSortChange}
      />

      <EmployeeListCard
        listData={list.listData}
        loading={list.loading}
        queryParams={list.queryParams}
        setQueryParams={list.setQueryParams}
        totalDisplay={list.totalDisplay}
        totalPages={list.totalPages}
        pageNumbers={list.pageNumbers}
        todayStr={list.todayStr}
        onView={actions.setDetailEmp}
        onEdit={actions.openEdit}
        onPerf={actions.openPerf}
      />
        </>
      )}

      <CreateEmployeeModal
        open={actions.createOpen}
        onCancel={() => actions.setCreateOpen(false)}
        onOk={actions.handleCreate}
        confirmLoading={actions.submitting}
        values={actions.createForm}
        setValues={actions.setCreateForm}
      />

      <EditEmployeeModal
        open={!!actions.editEmp}
        emp={actions.editEmp}
        values={actions.editForm}
        setValues={actions.setEditForm}
        onCancel={() => actions.setEditEmp(null)}
        onOk={actions.handleUpdate}
        confirmLoading={actions.submitting}
      />

      <EmployeeDetailModal
        emp={actions.detailEmp}
        onClose={() => actions.setDetailEmp(null)}
      />

      <EmployeePerformanceModal
        emp={actions.perfEmp}
        rows={actions.perfRows}
        loading={actions.perfLoading}
        onClose={() => actions.setPerfEmp(null)}
      />
    </div>
  )
}

export default Employees
