import { useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { commissionRulesApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import { emptyForm } from '../constants'
import type { CommissionRule, Employee, FormState } from '../types'

/** 佣金规则写操作：新建/编辑/启停/删除与表单字段更新 */
export function useCommissionRuleForm(refresh: () => void, isAdmin: boolean, employees: Employee[]) {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm((p) => ({ ...p, [field]: value }))

  const handleScopeChange = (scope: string) => {
    set('scope', scope)
    setForm((p) => ({ ...p, broker_employee_id: '' }))
  }

  const handleBrokerChange = (brokerId: string) => {
    set('broker_id', brokerId)
    setForm((p) => ({ ...p, broker_employee_id: '' }))
  }

  // 分销商员工：二级选择时的候选员工（按所选分销商过滤）
  const brokerEmployeeOptions = form.scope === 'broker_employee' && form.broker_id
    ? employees.filter((e) => e.broker_id === form.broker_id)
    : employees

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (rule: CommissionRule) => {
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      deal_type: rule.deal_type,
      rate: String(rule.rate ?? ''),
      scope: rule.scope,
      department: rule.department || '',
      employee_id: rule.employee_id || '',
      broker_id: rule.broker_id || '',
      broker_employee_id: rule.employee_id || '',
      cap_amount: rule.cap_amount != null ? String(rule.cap_amount) : '',
      minimum_amount: rule.minimum_amount != null ? String(rule.minimum_amount) : '',
      description: rule.description || '',
      is_active: rule.is_active,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      message.error(t('commissionRules.errName'))
      return
    }
    if (!form.rate || Number(form.rate) < 0) {
      message.error(t('commissionRules.errRate'))
      return
    }
    if (form.scope === 'by_department' && !form.department.trim()) {
      message.error(t('commissionRules.errDept'))
      return
    }
    if ((form.scope === 'by_employee' || form.scope === 'broker_employee') && form.scope === 'by_employee' && !form.employee_id) {
      message.error(t('commissionRules.errEmployee'))
      return
    }
    if (form.scope === 'broker_employee') {
      if (!form.broker_id) {
        message.error(t('commissionRules.errBrokerRequired'))
        return
      }
      if (!form.broker_employee_id) {
        message.error(t('commissionRules.errBrokerEmployee'))
        return
      }
    }
    try {
      setSubmitting(true)
      const payload: any = {
        name: form.name,
        deal_type: form.deal_type,
        rate: Number(form.rate),
        scope: form.scope === 'broker_employee' ? 'by_employee' : form.scope,
        description: form.description || undefined,
        is_active: form.is_active,
      }
      if (form.scope === 'by_department') payload.department = form.department
      if (form.scope === 'by_employee' || form.scope === 'broker_employee') {
        payload.employee_id = form.scope === 'broker_employee' ? form.broker_employee_id : form.employee_id
      }
      if (form.scope === 'broker_employee') payload.broker_id = form.broker_id
      if (form.scope === 'by_broker' && isAdmin && !form.broker_id) {
        message.error(t('commissionRules.errBrokerRequired'))
        return
      }
      if (form.scope === 'by_broker' && isAdmin) payload.broker_id = form.broker_id
      if (form.cap_amount !== '') payload.cap_amount = Number(form.cap_amount)
      if (form.minimum_amount !== '') payload.minimum_amount = Number(form.minimum_amount)

      if (editingId) {
        await commissionRulesApi.update(editingId, payload)
        message.success(t('commissionRules.updated'))
      } else {
        await commissionRulesApi.create(payload)
        message.success(t('commissionRules.created'))
      }
      setModalOpen(false)
      refresh()
    } catch (err) {
      message.error(errorText(err, t('commissionRules.saveFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (rule: CommissionRule) => {
    try {
      await commissionRulesApi.update(rule.id, { is_active: !rule.is_active })
      message.success(rule.is_active ? t('commissionRules.ruleDisabled') : t('commissionRules.ruleEnabled'))
      refresh()
    } catch (err) {
      message.error(errorText(err, t('commissionRules.opFailed')))
    }
  }

  const handleDelete = async (rule: CommissionRule) => {
    if (!window.confirm(t('commissionRules.deleteConfirm', { name: rule.name }))) return
    try {
      await commissionRulesApi.delete(rule.id)
      message.success(t('commissionRules.deleted'))
      refresh()
    } catch (err) {
      message.error(errorText(err, t('commissionRules.deleteFailed')))
    }
  }

  return {
    submitting,
    modalOpen,
    setModalOpen,
    editingId,
    form,
    set,
    handleScopeChange,
    handleBrokerChange,
    brokerEmployeeOptions,
    openCreate,
    openEdit,
    handleSubmit,
    toggleActive,
    handleDelete,
  }
}
