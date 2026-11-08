﻿import { apiErrorBody, apiErrorResponse } from '@/lib/api';
/**
 * 报修工单流程：打开弹窗（默认房源/优先级）→ POST /maintenance-tickets。
 * 纯结构拆分自 pages/Tenant/Services.tsx，表单默认值与请求体保持不变。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Form } from 'antd'
import api from '@/lib/api'
import { errorText } from '@/lib/errorText'
import type { PropertyOption } from '../types'

export function useRepairFlow({
  propertyOptions,
  onChanged,
}: {
  propertyOptions: PropertyOption[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [repairOpen, setRepairOpen] = useState(false)
  const [repairSubmitting, setRepairSubmitting] = useState(false)
  const [repairForm] = Form.useForm()

  // ===== 报修工单 =====
  const openRepair = () => {
    if (!propertyOptions.length) {
      message.warning(t('ownerServices.warnNoRepairableProperty'))
      return
    }
    repairForm.setFieldsValue({
      property_id: propertyOptions[0]?.id,
      priority: 'medium',
      title: '',
      description: '',
    })
    setRepairOpen(true)
  }

  const handleRepairSubmit = async () => {
    try {
      const values = await repairForm.validateFields()
      setRepairSubmitting(true)
      await api.post('/maintenance-tickets', {
        property_id: values.property_id,
        title: values.title,
        description: values.description || values.title,
        priority: values.priority,
      })
      message.success(t('ownerServices.repairSuccess'))
      setRepairOpen(false)
      repairForm.resetFields()
      onChanged()
    } catch (err) {
      if (apiErrorBody(err)?.errorFields) {
        repairForm.scrollToField(apiErrorBody(err)?.errorFields?.[0]?.name ?? '')
        return
      }
      if (apiErrorResponse(err)) {
        message.error(errorText(err, t('ownerServices.repairFailed')))
      }
    } finally {
      setRepairSubmitting(false)
    }
  }

  return {
    repairOpen,
    setRepairOpen,
    repairSubmitting,
    repairForm,
    openRepair,
    handleRepairSubmit,
  }
}
