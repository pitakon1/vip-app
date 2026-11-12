/**
 * 员工端合同审批入口：待我审 / 我提交的 + 审批详情弹窗。
 *
 * 仅做展示与操作编排，规则匹配、层级推进、自审拦截都由后端负责。
 */
import { useState } from 'react'
import { Button, Empty, Input, Modal, Spin, Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  approvalFieldLabel,
  approvalOperatorLabel,
  approvalRoleLabel,
  approvalStatusLabel,
} from './contractTypes'
import { useContractApprovals } from './hooks/useContractApprovals'

const { TextArea } = Input

export default function ApprovalCenterCard() {
  const { t } = useTranslation()
  const approvals = useContractApprovals()
  const [comment, setComment] = useState('')

  const open = (approval: (typeof approvals.items)[number]) => {
    setComment('')
    void approvals.open(approval)
  }

  const active = approvals.active
  const canAct = approvals.scope === 'pending' && active?.status === 'pending'

  return (
    <div className="rent-card rent-mt-5">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('contracts.approval.title')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('contracts.approval.subtitle')}</span>
      </div>
      <div className="rent-card__body">
        <Tabs
          activeKey={approvals.scope}
          onChange={(key) => approvals.setScope(key as 'pending' | 'submitted')}
          items={[
            { key: 'pending', label: t('contracts.approval.tabPending') },
            { key: 'submitted', label: t('contracts.approval.tabSubmitted') },
          ]}
        />
        {approvals.error && <div className="rent-text-sm rent-text-muted">{approvals.error}</div>}
        <Spin spinning={approvals.loading}>
          {approvals.items.length === 0 ? (
            <Empty description={t('contracts.approval.empty')} />
          ) : (
            <div className="rent-flex" style={{ flexDirection: 'column', gap: 8 }}>
              {approvals.items.map((item) => (
                <div
                  key={item.id}
                  className="rent-flex"
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    border: '1px solid var(--rent-border, #e5e7eb)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => open(item)}
                >
                  <div>
                    <div className="rent-text-bold">
                      {item.contract_title || t('contracts.approval.contractFallback')}
                      {item.contract_no ? ` · ${item.contract_no}` : ''}
                    </div>
                    <div className="rent-text-sm rent-text-muted">
                      {t('contracts.approval.submitter')}: {item.submitter_name || '-'}
                      {item.submitted_at ? ` · ${new Date(item.submitted_at).toLocaleString()}` : ''}
                      {item.required_level > 1
                        ? ` · ${t('contracts.approval.levelProgress', {
                            current: item.current_level,
                            total: item.required_level,
                          })}`
                        : ''}
                    </div>
                  </div>
                  <span className="rent-badge rent-badge--neutral">
                    {t(approvalStatusLabel[item.status] || item.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Spin>
      </div>

      <Modal
        open={!!active}
        title={t('contracts.approval.detailTitle')}
        onCancel={() => approvals.setActive(null)}
        footer={
          canAct
            ? [
                <Button key="reject" danger loading={approvals.submitting} onClick={() => void approvals.reject(comment)}>
                  {t('contracts.approval.reject')}
                </Button>,
                <Button key="approve" type="primary" loading={approvals.submitting} onClick={() => void approvals.approve(comment)}>
                  {t('contracts.approval.approve')}
                </Button>,
              ]
            : null
        }
        width={720}
      >
        {active && (
          <Spin spinning={approvals.detailLoading}>
            <div className="rent-text-sm" style={{ lineHeight: 1.9 }}>
              <div>
                <b>{t('contracts.approval.contract')}：</b>
                {active.contract_title || '-'}
                {active.contract_no ? `（${active.contract_no}）` : ''}
              </div>
              <div>
                <b>{t('contracts.approval.status')}：</b>
                {t(approvalStatusLabel[active.status] || active.status)}
              </div>
              <div>
                <b>{t('contracts.approval.submitter')}：</b>
                {active.submitter_name || '-'}
                {active.submitted_at ? ` · ${new Date(active.submitted_at).toLocaleString()}` : ''}
              </div>
              <div>
                <b>{t('contracts.approval.levels')}：</b>
                {active.levels
                  .map(
                    (lv) =>
                      `${t('contracts.approval.levelN', { n: lv.level })} ${t(
                        approvalRoleLabel[lv.role] || lv.role,
                      )}`,
                  )
                  .join(' → ')}
              </div>
              <div style={{ marginTop: 8 }}>
                <b>{t('contracts.approval.ruleHits')}：</b>
                {active.rule_hits.length === 0 ? (
                  t('contracts.approval.noRuleHits')
                ) : (
                  <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                    {active.rule_hits.map((hit) => {
                      const range =
                        hit.threshold_max != null
                          ? `${hit.threshold} ~ ${hit.threshold_max}`
                          : `${hit.threshold}`
                      return (
                        <li key={`${hit.rule_id}-${hit.field}`}>
                          {t(approvalFieldLabel[hit.field] || hit.field)}{' '}
                          {approvalOperatorLabel[hit.operator] || hit.operator} {range}
                          {`（${t('contracts.approval.actualValue')} ${hit.value}）`}
                          {hit.note ? ` · ${hit.note}` : ''}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              {active.steps.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <b>{t('contracts.approval.steps')}：</b>
                  <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                    {active.steps.map((step, index) => (
                      <li key={`${step.level}-${index}`}>
                        {t('contracts.approval.levelN', { n: step.level })} ·{' '}
                        {t(approvalRoleLabel[step.role] || step.role)} ·{' '}
                        {t(
                          step.decision === 'approved'
                            ? 'contracts.approval.decisionApproved'
                            : 'contracts.approval.decisionRejected',
                        )}
                        {step.approver_name ? ` · ${step.approver_name}` : ''}
                        {step.comment ? `：${step.comment}` : ''}
                        {step.at ? `（${new Date(step.at).toLocaleString()}）` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {canAct && (
                <div style={{ marginTop: 12 }}>
                  <b>{t('contracts.approval.opinion')}：</b>
                  <TextArea
                    rows={3}
                    value={comment}
                    placeholder={t('contracts.approval.opinionPlaceholder')}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              )}
              {!canAct && active.comment && (
                <div style={{ marginTop: 8 }}>
                  <b>{t('contracts.approval.opinion')}：</b>
                  {active.comment}
                </div>
              )}
            </div>
          </Spin>
        )}
      </Modal>
    </div>
  )
}
