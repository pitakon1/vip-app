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

/** 上传付款凭证：绑定待缴账单/类型/币种/付款日/方式/文件 + POST /payments/upload */
export const useVoucherUpload = (pendingBills: PaymentVoucher[]) => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState(false)

  // form state (replaces antd Form)
  const [billId, setBillId] = useState('')
  const [billType, setBillType] = useState('rent')
  const [currency, setCurrency] = useState('THB')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [fileName, setFileName] = useState('')
  const [fileObj, setFileObj] = useState<File | null>(null)

  // 选中待缴账单时金额/币种/类型以账单为准，避免凭证冲抵别的账单
  const handleBillChange = (id: string) => {
    setBillId(id)
    const bill = pendingBills.find((b) => String(b.id) === id)
    if (bill) {
      setAmount(String(Number(bill.amount || 0)))
      setCurrency((bill.currency || 'THB').toUpperCase())
      setBillType(bill.bill_type || bill.payment_type || 'rent')
    } else {
      setAmount('')
    }
  }

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
    formData.append('payment_type', billType)
    formData.append('currency', currency)
    if (billId) formData.append('payment_id', billId)
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
      // 重新拉取而不是本地插一条：绑定账单后该单状态 pending → processing，
      // 待缴汇总必须跟着后端真实状态下降。
      await queryClient.invalidateQueries({ queryKey: tenantPaymentsKey(uid) })
      setBillId('')
      setAmount('')
      setPaymentDate(dayjs().format('YYYY-MM-DD'))
      setPaymentMethod('bank_transfer')
      setBillType('rent')
      setCurrency('THB')
      setFileObj(null)
      setFileName('')
    } catch (err) {
      message.error(errorText(err, t('tenantPayments.uploadFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    pendingBills,
    billId,
    handleBillChange,
    billType,
    setBillType,
    currency,
    setCurrency,
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
