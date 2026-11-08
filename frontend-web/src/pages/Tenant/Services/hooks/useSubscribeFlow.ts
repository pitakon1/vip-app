﻿import { apiErrorBody, apiErrorResponse } from '@/lib/api';
/**
 * 业主订阅套餐流程：订阅弹窗（POST /service-packages）与取消订阅（PATCH）。
 * 纯结构拆分自 pages/Tenant/Services.tsx，表单默认值与请求体保持不变。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Form } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { errorText } from '@/lib/errorText'
import type { PackageItem, PropertyOption } from '../types'

export function useSubscribeFlow({
  ownerProperties,
  onChanged,
}: {
  ownerProperties: PropertyOption[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [subscribeSubmitting, setSubscribeSubmitting] = useState(false)
  const [subscribeForm] = Form.useForm()

  // ===== 订阅套餐（业主专享）=====
  const openSubscribe = () => {
    if (!ownerProperties.length) {
      message.warning(t('ownerServices.warnNoSubscribableProperty'))
      return
    }
    subscribeForm.setFieldsValue({
      property_id: ownerProperties[0]?.id,
      type: 'annual_management',
      start_date: dayjs(),
      commission_rate: 1,
      management_fee_rate: 0.5,
    })
    setSubscribeOpen(true)
  }

  const handleSubscribe = async () => {
    try {
      const values = await subscribeForm.validateFields()
      setSubscribeSubmitting(true)
      await api.post('/service-packages', {
        ...values,
        start_date: values.start_date.format('YYYY-MM-DDTHH:mm:ss'),
      })
      message.success(t('ownerServices.subscribeSuccess'))
      setSubscribeOpen(false)
      subscribeForm.resetFields()
      onChanged()
    } catch (err) {
      if (apiErrorBody(err)?.errorFields) {
        subscribeForm.scrollToField(apiErrorBody(err)?.errorFields?.[0]?.name ?? '')
        return
      }
      if (apiErrorResponse(err)) {
        message.error(errorText(err, t('ownerServices.subscribeFailed')))
      }
    } finally {
      setSubscribeSubmitting(false)
    }
  }

  const handleCancelPackage = async (pkg: PackageItem) => {
    try {
      await api.patch(`/service-packages/${pkg.id}`, { status: 'cancelled' })
      message.success(t('ownerServices.unsubscribeSuccess'))
      onChanged()
    } catch (err) {
      message.error(errorText(err, t('ownerServices.unsubscribeFailed')))
    }
  }

  return {
    subscribeOpen,
    setSubscribeOpen,
    subscribeSubmitting,
    subscribeForm,
    openSubscribe,
    handleSubscribe,
    handleCancelPackage,
  }
}
