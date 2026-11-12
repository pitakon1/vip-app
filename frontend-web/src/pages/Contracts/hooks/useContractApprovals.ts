/**
 * 合同审批数据逻辑：待我审 / 我提交的列表、详情、通过与驳回。
 *
 * 审批规则匹配与分级流转都在后端完成；这里只负责拉取、刷新与错误提示。
 */
import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { contractsApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import type { ContractApproval } from '../contractTypes'

export type ApprovalScope = 'pending' | 'submitted'

export function useContractApprovals() {
  const { t } = useTranslation()
  const [scope, setScope] = useState<ApprovalScope>('pending')
  const [items, setItems] = useState<ContractApproval[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState<ContractApproval | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(
    async (nextScope: ApprovalScope = scope) => {
      setLoading(true)
      setError('')
      try {
        const res = await contractsApi.listApprovals(nextScope)
        setItems(Array.isArray(res.data) ? res.data : [])
      } catch (err) {
        setError(errorText(err, t('contracts.approval.errLoad')))
      } finally {
        setLoading(false)
      }
    },
    [scope, t],
  )

  useEffect(() => {
    void load(scope)
  }, [scope, load])

  const open = async (approval: ContractApproval) => {
    setActive(approval)
    setDetailLoading(true)
    try {
      const res = await contractsApi.getApproval(approval.id)
      if (res.data) setActive(res.data)
    } catch {
      // 详情拉取失败时仍展示列表里的快照，不阻断操作
    } finally {
      setDetailLoading(false)
    }
  }

  const approve = async (comment?: string) => {
    if (!active) return
    setSubmitting(true)
    try {
      await contractsApi.approveApproval(active.id, comment?.trim() || undefined)
      message.success(t('contracts.approval.msgApproved'))
      setActive(null)
      await load(scope)
    } catch (err) {
      message.error(errorText(err, t('contracts.approval.errApprove')))
    } finally {
      setSubmitting(false)
    }
  }

  const reject = async (comment: string) => {
    if (!active) return
    if (!comment.trim()) {
      message.warning(t('contracts.approval.commentRequired'))
      return
    }
    setSubmitting(true)
    try {
      await contractsApi.rejectApproval(active.id, comment.trim())
      message.success(t('contracts.approval.msgRejected'))
      setActive(null)
      await load(scope)
    } catch (err) {
      message.error(errorText(err, t('contracts.approval.errReject')))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    scope,
    setScope,
    items,
    loading,
    error,
    active,
    setActive,
    detailLoading,
    submitting,
    load,
    open,
    approve,
    reject,
  }
}
