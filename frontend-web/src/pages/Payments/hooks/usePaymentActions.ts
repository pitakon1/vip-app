import { useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { paymentsApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import type { Payment } from '@/types'
import { DEFAULT_MANUAL_FORM } from '../constants'
import type { DetailType, DocData, ManualForm } from '../types'

/** 收付款写操作：退款 / 滞纳金减免 / 手动记账 / 确认到账 / 详情凭证 */
export function usePaymentActions(refresh: () => void | Promise<void>) {
  const { t } = useTranslation()
  const [refundOpen, setRefundOpen] = useState(false)
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  // 逾期滞纳金减免
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [waivePayment, setWaivePayment] = useState<Payment | null>(null)
  const [waiveAmount, setWaiveAmount] = useState('')
  const [waiveReason, setWaiveReason] = useState('')
  // 手动记账
  const [manualOpen, setManualOpen] = useState(false)
  const [manualForm, setManualForm] = useState<ManualForm>({ ...DEFAULT_MANUAL_FORM })
  // 确认到账
  const [confirmTarget, setConfirmTarget] = useState<Payment | null>(null)
  const [confirming, setConfirming] = useState(false)
  // 查看详情
  const [detail, setDetail] = useState<Payment | null>(null)
  const [detailType, setDetailType] = useState<DetailType>('detail')
  const [docData, setDocData] = useState<DocData | null>(null)

  const openRefund = (record: Payment) => {
    setCurrentPayment(record)
    setRefundReason('')
    setRefundOpen(true)
  }

  const handleRefund = async () => {
    if (!currentPayment) return
    if (!refundReason.trim()) {
      message.error(t('payments.errRefundReason'))
      return
    }
    try {
      setSubmitting(true)
      await paymentsApi.refund(String(currentPayment.id), refundReason)
      message.success(t('payments.msgRefundSubmitted'))
      setRefundOpen(false)
      refresh()
    } catch (err) {
      message.error(errorText(err, t('payments.errRefundFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  const openWaive = (record: Payment) => {
    setWaivePayment(record)
    setWaiveAmount('')
    setWaiveReason('')
    setWaiveOpen(true)
  }

  // 不填金额 = 全额减免剩余滞纳金（后端同样支持）
  const handleWaive = async () => {
    if (!waivePayment) return
    const amount = waiveAmount.trim() ? Number(waiveAmount) : null
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      message.error(t('payments.errWaiveAmount'))
      return
    }
    try {
      setSubmitting(true)
      await paymentsApi.waiveLateFee(String(waivePayment.id), amount, waiveReason.trim())
      message.success(t('payments.msgWaived'))
      setWaiveOpen(false)
      refresh()
    } catch (err) {
      message.error(errorText(err, t('payments.errWaiveFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  // 手动记账提交
  const handleManualSubmit = async () => {
    if (!Number(manualForm.amount) || Number(manualForm.amount) <= 0) {
      message.error(t('payments.errInvalidAmount'))
      return
    }
    // 后端 PaymentCreate.payer_id 是必填（UUID）。此前表单标注「可留空」并把空值发成
    // undefined，提交后只会收到 422，页面笼统提示「登记失败」，用户看不出是哪个字段的问题。
    if (!manualForm.payer_id.trim()) {
      message.error(t('payments.errPayerRequired'))
      return
    }
    try {
      setSubmitting(true)
      await paymentsApi.create({
        ...manualForm,
        payer_id: manualForm.payer_id.trim(),
        payee_id: manualForm.payee_id || undefined,
        amount: Number(manualForm.amount),
        due_date: manualForm.due_date || undefined,
        description: manualForm.description || undefined,
      })
      message.success(t('payments.msgRegistered'))
      setManualOpen(false)
      setManualForm({ ...DEFAULT_MANUAL_FORM })
      refresh()
    } catch (err) {
      message.error(errorText(err, t('payments.errRegisterFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  // 确认到账
  const openConfirm = (record: Payment) => setConfirmTarget(record)
  const handleConfirmSub = async () => {
    if (!confirmTarget) return
    try {
      setConfirming(true)
      await paymentsApi.confirm(String(confirmTarget.id), { note: undefined })
      message.success(t('payments.msgConfirmed'))
      setConfirmTarget(null)
      refresh()
    } catch (err) {
      message.error(errorText(err, t('payments.errConfirmFailed')))
    } finally {
      setConfirming(false)
    }
  }

  // 查看详情 / 凭证 / 发票
  const openDetail = (record: Payment, type: DetailType = 'detail') => {
    setDetail(record)
    setDetailType(type)
    setDocData(null)
    if (type === 'detail') return
    const apiFn = type === 'receipt' ? paymentsApi.receipt : paymentsApi.invoice
    apiFn(String(record.id))
      .then((res) => {
        // 后端返回 { data: {...} } 或直接对象；若是文件流则带 urls
        const payload = res?.data?.data ?? res?.data ?? res
        setDocData(typeof payload === 'string' ? { url: payload } : payload)
      })
      .catch(() => {
        setDocData({ error: true })
      })
  }

  const setManual = (k: keyof ManualForm) => (e: any) =>
    setManualForm((f) => ({ ...f, [k]: e.target.value }))

  return {
    refundOpen,
    setRefundOpen,
    currentPayment,
    submitting,
    refundReason,
    setRefundReason,
    openRefund,
    handleRefund,
    waiveOpen,
    setWaiveOpen,
    waivePayment,
    waiveAmount,
    setWaiveAmount,
    waiveReason,
    setWaiveReason,
    openWaive,
    handleWaive,
    manualOpen,
    setManualOpen,
    manualForm,
    setManual,
    handleManualSubmit,
    confirmTarget,
    setConfirmTarget,
    confirming,
    openConfirm,
    handleConfirmSub,
    detail,
    setDetail,
    detailType,
    docData,
    openDetail,
  }
}
