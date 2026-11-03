import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import './commission-rules.css'
import { useCommissionLabels } from './hooks/useCommissionLabels'
import { useCommissionRulesList } from './hooks/useCommissionRulesList'
import { useCommissionRuleForm } from './hooks/useCommissionRuleForm'
import { useSplitRules } from './hooks/useSplitRules'
import CommissionRulesTab from './components/CommissionRulesTab'
import SplitRulesTab from './components/SplitRulesTab'
import CommissionRuleModal from './components/CommissionRuleModal'
import SplitRuleModal from './components/SplitRuleModal'

/**
 * 佣金规则页：费用规则（列表/分页/新建/编辑/启停/删除）+ 分佣拆分规则（admin）。
 *
 * 纯结构拆分：本文件只保留页面编排与两个 Tab 的挂载，
 * 数据查询、写操作、表单与表格视图均落在本页面私有目录内。
 */

const CommissionRules = () => {
  const { t } = useTranslation()
  const labels = useCommissionLabels()
  const list = useCommissionRulesList()
  const ruleForm = useCommissionRuleForm(list.refresh, labels.isAdmin, list.employees)
  const split = useSplitRules()

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('commissionRules.title')}</h2>
          <p className="rent-page-header__subtitle">{t('commissionRules.subtitle')}</p>
        </div>
        <div className="rent-page-header__actions">
          <button className="rent-btn rent-btn--primary" onClick={ruleForm.openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('commissionRules.addRule')}
          </button>
        </div>
      </div>

      <Tabs
        defaultActiveKey="fees"
        items={[
          {
            key: 'fees',
            label: t('commissionSplit.tabFees'),
            children: (
              <CommissionRulesTab
                loading={list.loading}
                loadFailed={list.loadFailed}
                items={list.items}
                pagedItems={list.pagedItems}
                page={list.page}
                pageCount={list.pageCount}
                pageSize={list.pageSize}
                brokers={list.brokers}
                dealTypeText={labels.dealTypeText}
                scopeText={labels.scopeText}
                onRefresh={list.refresh}
                onPrev={() => list.setPage(Math.max(1, list.page - 1))}
                onNext={() => list.setPage(Math.min(list.pageCount, list.page + 1))}
                onEdit={ruleForm.openEdit}
                onToggle={ruleForm.toggleActive}
                onDelete={ruleForm.handleDelete}
              />
            ),
          },
          {
            key: 'split',
            label: t('commissionSplit.tabSplit'),
            children: (
              <SplitRulesTab
                splitRules={split.splitRules}
                splitLoading={split.splitLoading}
                splitError={split.splitError}
                partners={split.partners}
                onFetch={split.fetchSplitRules}
                onCreate={split.openSplitCreate}
                onEdit={split.openSplitEdit}
                onToggle={split.handleSplitToggle}
                onDelete={split.handleSplitDelete}
              />
            ),
          },
        ]}
      />

      {/* 分佣拆分规则 Modal */}
      <SplitRuleModal
        open={split.splitModalOpen}
        editId={split.splitEditId}
        form={split.splitForm}
        partners={split.partners}
        saving={split.splitSaving}
        onSubmit={split.handleSplitSubmit}
        onCancel={() => split.setSplitModalOpen(false)}
      />

      {/* Modal */}
      <CommissionRuleModal
        open={ruleForm.modalOpen}
        editingId={ruleForm.editingId}
        form={ruleForm.form}
        isAdmin={labels.isAdmin}
        employees={list.employees}
        brokers={list.brokers}
        brokerEmployeeOptions={ruleForm.brokerEmployeeOptions}
        scopeOptions={labels.scopeOptions}
        brokerScopeOptions={labels.brokerScopeOptions}
        dealTypeText={labels.dealTypeText}
        submitting={ruleForm.submitting}
        onSet={ruleForm.set}
        onScopeChange={ruleForm.handleScopeChange}
        onBrokerChange={ruleForm.handleBrokerChange}
        onSubmit={ruleForm.handleSubmit}
        onClose={() => ruleForm.setModalOpen(false)}
      />
    </div>
  )
}

export default CommissionRules
