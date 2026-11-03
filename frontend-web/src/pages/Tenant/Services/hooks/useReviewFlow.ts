/**
 * 服务评价弹窗流程：打开 → 评分/评语 → POST /service-orders/:id/review。
 * 纯结构拆分自 pages/Tenant/Services.tsx，请求体与原逻辑保持不变。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import api from '@/lib/api'
import { errorText } from '@/lib/errorText'
import type { Booking } from '../types'

export function useReviewFlow({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation()
  const [reviewOrder, setReviewOrder] = useState<Booking | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const openReview = (item: Booking) => {
    setReviewOrder(item)
    setReviewRating(5)
    setReviewComment('')
  }

  const submitReview = async () => {
    if (!reviewOrder) return
    setSubmitting(true)
    try {
      await api.post(`/service-orders/${reviewOrder.id}/review`, {
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      })
      message.success(t('tenantServices.reviewSuccess'))
      setReviewOrder(null)
      onChanged()
    } catch (err) {
      message.error(errorText(err, t('tenantServices.reviewFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    reviewOrder,
    setReviewOrder,
    reviewRating,
    setReviewRating,
    reviewComment,
    setReviewComment,
    submitting,
    openReview,
    submitReview,
  }
}
