﻿import { useCallback, useEffect, useState } from 'react'
import { Form, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { OPTION_PAGE_SIZE } from '@/lib/pagination'
import { commissionSplitRulesApi } from '@/services/api'
import api, { apiErrorBody } from '@/lib/api'
import { errorText } from '@/lib/errorText'
import type { SplitForm, SplitRule } from '../types'

/** 分佣拆分规则（admin）：/commission-split-rules 列表与增删改、合作公司下拉 */
export function useSplitRules() {
  const { t } = useTranslation()
  const [splitRules, setSplitRules] = useState<SplitRule[]>([])
  const [splitLoading, setSplitLoading] = useState(false)
  const [splitError, setSplitError] = useState(false)
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [splitEditId, setSplitEditId] = useState<string | null>(null)
  const [splitSaving, setSplitSaving] = useState(false)
  const [splitForm] = Form.useForm<SplitForm>()
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([])

  const fetchSplitRules = useCallback(async () => {
    setSplitLoading(true)
    setSplitError(false)
    try {
      const res = await commissionSplitRulesApi.list({ page_size: OPTION_PAGE_SIZE })
      const payload = res.data?.data ?? res.data
      setSplitRules(payload?.items ?? payload ?? [])
    } catch {
      setSplitRules([])
      setSplitError(true)
    } finally {
      setSplitLoading(false)
    }
  }, [])

  // 合作公司下拉（admin）：/admin/partners
  const fetchPartners = useCallback(async () => {
    try {
      const res = await api.get('/admin/partners', { params: { page_size: OPTION_PAGE_SIZE } })
      const payload = res.data?.data ?? res.data
      setPartners((payload?.items ?? payload ?? []).map((p: any) => ({ id: String(p.id), name: p.name || p.partner_name || '—' })))
    } catch {
      setPartners([])
    }
  }, [])

  // 分佣拆分规则加载 + 合作公司下拉
  useEffect(() => {
    void fetchSplitRules()
    void fetchPartners()
  }, [fetchSplitRules, fetchPartners])

  const openSplitCreate = () => {
    setSplitEditId(null)
    splitForm.resetFields()
    splitForm.setFieldsValue({ deal_type: 'new_rental', role: 'listing_agent', scope: 'all', is_active: true, percent: 0 })
    setSplitModalOpen(true)
  }

  const openSplitEdit = (rule: SplitRule) => {
    setSplitEditId(rule.id)
    splitForm.setFieldsValue({
      deal_type: rule.deal_type,
      role: rule.role,
      percent: rule.percent ?? 0,
      scope: rule.scope,
      partner_id: rule.partner_id || undefined,
      is_active: rule.is_active,
      effective_from: rule.effective_from,
      effective_to: rule.effective_to,
    })
    setSplitModalOpen(true)
  }

  const handleSplitSubmit = async () => {
    try {
      const values = await splitForm.validateFields()
      setSplitSaving(true)
      const payload: any = {
        deal_type: values.deal_type,
        role: values.role,
        percent: Number(values.percent) || 0,
        scope: values.scope,
        is_active: values.is_active,
        effective_from: values.effective_from || undefined,
        effective_to: values.effective_to || undefined,
      }
      if (values.scope === 'by_partner') {
        if (!values.partner_id) {
          message.error(t('commissionSplit.errPartner'))
          return
        }
        payload.partner_id = values.partner_id
      }
      if (splitEditId) {
        await commissionSplitRulesApi.update(splitEditId, payload)
        message.success(t('commissionSplit.updated'))
      } else {
        await commissionSplitRulesApi.create(payload)
        message.success(t('commissionSplit.created'))
      }
      setSplitModalOpen(false)
      void fetchSplitRules()
    } catch (err) {
      if (apiErrorBody(err)?.errorFields) return
      message.error(errorText(err, t('commissionSplit.saveFailed')))
    } finally {
      setSplitSaving(false)
    }
  }

  const handleSplitToggle = async (rule: SplitRule) => {
    try {
      await commissionSplitRulesApi.update(rule.id, { is_active: !rule.is_active })
      message.success(rule.is_active ? t('commissionSplit.ruleDisabled') : t('commissionSplit.ruleEnabled'))
      void fetchSplitRules()
    } catch (err) {
      message.error(errorText(err, t('commissionSplit.opFailed')))
    }
  }

  const handleSplitDelete = async (rule: SplitRule) => {
    try {
      await commissionSplitRulesApi.remove(rule.id)
      message.success(t('commissionSplit.deleted'))
      void fetchSplitRules()
    } catch (err) {
      message.error(errorText(err, t('commissionSplit.deleteFailed')))
    }
  }

  return {
    splitRules,
    splitLoading,
    splitError,
    splitModalOpen,
    setSplitModalOpen,
    splitEditId,
    splitSaving,
    splitForm,
    partners,
    fetchSplitRules,
    openSplitCreate,
    openSplitEdit,
    handleSplitSubmit,
    handleSplitToggle,
    handleSplitDelete,
  }
}
