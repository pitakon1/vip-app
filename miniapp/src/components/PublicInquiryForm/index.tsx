/**
 * 匿名留资表单（房源详情 / 学校详情共用）。
 *
 * 这是「浏览不需注册」到「有需求才留资」的转化落点：不强制注册，只收一个称呼
 * 加一项联系方式，直接写进后端 CRM 的 `Lead`。后端限流防灌水，且至少要求留
 * 一种联系方式——否则这条线索是废的，后端会直接 400。
 *
 * 样式类 `.pub-inquiry*` 来自 `pages/public/public-site.scss`，
 * 由引用本组件的页面负责 import。
 */
import { useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import { publicApi, type PublicInquiryPayload } from '@/services/publicApi'

interface Props {
  title: string
  note?: string
  /** 留资上下文：房源 / 学校 / 小区，用于后端判断意图 */
  context: Pick<PublicInquiryPayload, 'listing_id' | 'property_id' | 'project_id' | 'school_id'>
  source: string
  defaultMessage?: string
}

export default function PublicInquiryForm({ title, note, context, source, defaultMessage = '' }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [wechat, setWechat] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const submit = async () => {
    if (!name.trim()) {
      setFeedback({ tone: 'err', text: '请填写称呼' })
      return
    }
    if (!phone.trim() && !wechat.trim()) {
      setFeedback({ tone: 'err', text: '请至少留下电话或微信中的一项' })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      await publicApi.inquiry({
        name: name.trim(),
        phone: phone.trim() || undefined,
        wechat_id: wechat.trim() || undefined,
        message: message.trim() || defaultMessage || undefined,
        source,
        ...context
      })
      setFeedback({ tone: 'ok', text: '已收到，我们会尽快联系你' })
      setName('')
      setPhone('')
      setWechat('')
      setMessage('')
    } catch (err) {
      console.error('[public inquiry] 提交失败', err)
      setFeedback({ tone: 'err', text: '提交失败，请稍后重试' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='pub-card'>
      <Text className='pub-section__title'>{title}</Text>
      {note ? <Text className='pub-section__hint'>{note}</Text> : null}

      <Text className='pub-inquiry__label'>称呼</Text>
      <Input
        className='pub-inquiry__input'
        value={name}
        onInput={(e) => setName(e.detail.value)}
        placeholder='怎么称呼你'
      />

      <Text className='pub-inquiry__label'>电话 / WhatsApp</Text>
      <Input
        className='pub-inquiry__input'
        type='number'
        value={phone}
        onInput={(e) => setPhone(e.detail.value)}
        placeholder='方便回电的号码'
      />

      <Text className='pub-inquiry__label'>微信</Text>
      <Input
        className='pub-inquiry__input'
        value={wechat}
        onInput={(e) => setWechat(e.detail.value)}
        placeholder='微信号（与电话二选一即可）'
      />

      <Text className='pub-inquiry__label'>留言</Text>
      <Textarea
        className='pub-inquiry__textarea'
        value={message}
        onInput={(e) => setMessage(e.detail.value)}
        placeholder={defaultMessage || '想了解什么？'}
        maxlength={300}
      />

      {feedback ? (
        <Text
          className={`pub-inquiry__msg pub-inquiry__msg--${
            feedback.tone === 'ok' ? 'ok' : 'err'
          }`}
        >
          {feedback.text}
        </Text>
      ) : null}

      <View
        className={`btn btn--primary pub-inquiry__submit${
          submitting ? ' btn--disabled' : ''
        }`}
        onClick={() => {
          if (submitting) return
          submit()
        }}
      >
        <Text>{submitting ? '提交中...' : '提交咨询'}</Text>
      </View>
    </View>
  )
}
