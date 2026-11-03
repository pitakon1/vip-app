import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { errorText } from '@/lib/errorText'
import { tenantPaymentsKey } from '../utils'
import type { PaymentVoucher } from '../types'

/** 上传付款凭证：金额/日期/方式/文件 + POST /payments/upload 并写入缓存 */
export const useVoucherUpload = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  // form state (replaces antd Form)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [fileName, setFileName] = useState('')
  const [fileObj, setFileObj] = useState<File | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) {
      setFileObj(null)
      setFileName('')
      return
    }
    setFileObj(f)
    setFileName(f.name)
  }

  const handleSubmit = async () => {
    const amt = Number(amount)
    if (!amount || isNaN(amt) || amt <= 0) {
      message.warning(t('tenantPayments.warnAmount'))
      return
    }
    if (!paymentDate) {
      message.warning(t('tenantPayments.warnDate'))
      return
    }
    if (!paymentMethod) {
      message.warning(t('tenantPayments.warnMethod'))
      return
    }
    setSubmitting(true)
    const formData = new FormData()
    formData.append('amount', String(amt))
    formData.append('payment_date', paymentDate)
    formData.append('payment_method', paymentMethod)
    if (fileObj) {
      formData.append('receipt', fileObj)
    }

    try {
      // 后端会校验并真正落盘凭证（返回落库的 receipt_url），失败即抛错。
      // 这里不再吞掉异常、也不再伪造一条本地记录——「已上传」必须是服务端确认过的。
      const res = await api.post('/payments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const payload = res.data?.data ?? res.data
      if (!payload?.id) {
        throw new Error('upload response missing id')
      }

      message.success(t('tenantPayments.uploadSuccess'))
      const newItem: PaymentVoucher = {
        ...payload,
        payment_method: payload.payment_method ?? payload.channel,
        bill_type: payload.bill_type ?? payload.payment_type,
      }
      queryClient.setQueryData(
        tenantPaymentsKey(uid),
        (prev: PaymentVoucher[] | undefined) => [newItem, ...(prev ?? [])],
      )
      setAmount('')
      setPaymentDate(dayjs().format('YYYY-MM-DD'))
      setPaymentMethod('bank_transfer')
      setFileObj(null)
      setFileName('')
    } catch (err) {
      message.error(errorText(err, t('tenantPayments.uploadFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    amount,
    setAmount,
    paymentDate,
    setPaymentDate,
    paymentMethod,
    setPaymentMethod,
    fileName,
    handleFileChange,
    submitting,
    handleSubmit,
  }
}
