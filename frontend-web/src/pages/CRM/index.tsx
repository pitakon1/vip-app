import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import './crm.css'
import { useLeadStageLabels } from './hooks/useLeadStageLabels'
import { useEmployeeDirectory } from './hooks/useEmployeeDirectory'
import { useLeadList } from './hooks/useLeadList'
import { useLeadMutations } from './hooks/useLeadMutations'
import { useLeadContact } from './hooks/useLeadContact'
import PageHeader from './components/PageHeader'
import ViewTabs from './components/ViewTabs'
import KanbanBoard from './components/KanbanBoard'
import PipelineStats from './components/PipelineStats'
import LeadFilterBar from './components/LeadFilterBar'
import LeadTable from './components/LeadTable'
import Pagination from './components/Pagination'
import LeadFormModal from './components/LeadFormModal'
import StageModal from './components/StageModal'

/**
 * CRM 客户线索页：看板/列表双视图、阶段筛选、分页、新建/编辑/改阶段/删除与 CSV 批量导入。
 *
 * 纯结构拆分：本文件只保留编排与页面级挂载，
 * 数据查询、员工目录、阶段文案、写操作与各区块视图均落在本页面私有目录内。
 */

const CRM = () => {
  const { t } = useTranslation()
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  const { stageLabels, stageOptions } = useLeadStageLabels()
  const { employeeOptions, employeeNameMap } = useEmployeeDirectory()
  const list = useLeadList()
  const mutations = useLeadMutations(list.fetchData)
  const contact = useLeadContact()

  const filtered = !!(list.queryParams.stage || list.queryParams.keyword)

  return (
    <div className="rent-main">
      {/* Page Header */}
      <PageHeader
        importRef={mutations.importRef}
        importing={mutations.importing}
        onImportFile={mutations.handleImportFile}
        onNewLead={mutations.openCreate}
      />

      {/* Tabs */}
      <ViewTabs view={view} onViewChange={setView} />

      {list.loading && list.displayData.length === 0 ? (
        <DataState loading loadingText={t('common.loading')} skeletonRows={6} />
      ) : list.loadError && list.displayData.length === 0 ? (
        <DataState error={list.loadError} errorKind={list.loadErrorKind} retryText={t('common.retry')} onRetry={list.fetchData} />
      ) : null}

      {list.showDataView && view === 'kanban' && (
        <>
          <KanbanBoard
            groups={list.kanbanGroups}
            employeeNameMap={employeeNameMap}
            hasLeads={list.hasLeads}
            filtered={filtered}
            onOpenStage={mutations.openEditStage}
            onCall={contact.handleCall}
            onChat={contact.handleChat}
            onEdit={mutations.openEdit}
            onDelete={mutations.handleDelete}
          />

          <PipelineStats stats={list.pipelineStats} hasLeads={list.hasLeads} />
        </>
      )}

      {list.showDataView && view === 'list' && (
        <>
          <LeadFilterBar
            stage={list.queryParams.stage}
            stageOptions={stageOptions}
            onStageChange={list.handleStageChange}
            onSearch={list.handleSearch}
          />

          <LeadTable
            items={list.displayData}
            stageLabels={stageLabels}
            employeeNameMap={employeeNameMap}
            filtered={filtered}
            onCall={contact.handleCall}
            onChat={contact.handleChat}
            onEdit={mutations.openEdit}
            onOpenStage={mutations.openEditStage}
            onDelete={mutations.handleDelete}
          />

          <Pagination
            page={list.queryParams.page}
            pageSize={list.queryParams.pageSize}
            total={list.total}
            onPrev={list.goPrevPage}
            onNext={list.goNextPage}
          />
        </>
      )}

      {/* Create Modal (native rent-modal) */}
      <LeadFormModal
        open={mutations.modalOpen}
        form={mutations.createForm}
        employeeOptions={employeeOptions}
        stageOptions={stageOptions}
        submitting={mutations.creating}
        onPatch={mutations.patchCreateForm}
        onSubmit={mutations.handleSubmit}
        onClose={() => mutations.setModalOpen(false)}
      />

      {/* Stage Edit Modal (native rent-modal) */}
      <StageModal
        open={mutations.stageModalOpen}
        value={mutations.stageValue}
        stageOptions={stageOptions}
        submitting={mutations.creating}
        onChange={mutations.setStageValue}
        onSubmit={mutations.handleUpdateStage}
        onClose={() => mutations.setStageModalOpen(false)}
      />
    </div>
  )
}

export default CRM
