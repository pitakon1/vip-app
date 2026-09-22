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
import { useI18n } from '@/i18n'

interface Props {
  title: string
  note?: string
  /** 留资上下文：房源 / 学校 / 小区，用于后端判断意图 */
  context: Pick<PublicInquiryPayload, 'listing_id' | 'property_id' | 'project_id' | 'school_id'>
  source: string
  defaultMessage?: string
}

export default function PublicInquiryForm({ title, note, context, source, defaultMessage = '' }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [wechat, setWechat] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const submit = async () => {
    if (!name.trim()) {
      setFeedback({ tone: 'err', text: t('pub.inquireNameRequired') })
      return
    }
    if (!phone.trim()) {
      setFeedback({ tone: 'err', text: t('pub.inquirePhoneRequired') })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      await publicApi.inquiry({
        name: name.trim(),
        phone: phone.trim(),
        wechat_id: wechat.trim() || undefined,
        message: message.trim() || defaultMessage || undefined,
        source,
        ...context
      })
      setFeedback({ tone: 'ok', text: t('pub.inquireOk') })
      setName('')
      setPhone('')
      setWechat('')
      setMessage('')
    } catch (err) {
      console.error('[public inquiry] 提交失败', err)
      setFeedback({ tone: 'err', text: t('pub.inquireError') })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='pub-card'>
      <Text className='pub-section__title'>{title}</Text>
      {note ? <Text className='pub-section__hint'>{note}</Text> : null}

      <Text className='pub-inquiry__label'>{t('pub.inquireName')}</Text>
      <Input
        className='pub-inquiry__input'
        value={name}
        onInput={(e) => setName(e.detail.value)}
        placeholder={t('pub.inquireNamePlaceholder')}
      />

      <Text className='pub-inquiry__label'>{t('pub.inquirePhone')}</Text>
      <Input
        className='pub-inquiry__input'
        type='number'
        value={phone}
        onInput={(e) => setPhone(e.detail.value)}
        placeholder={t('pub.inquirePhonePlaceholder')}
      />

      <Text className='pub-inquiry__label'>{t('pub.inquireWechat')}</Text>
      <Input
        className='pub-inquiry__input'
        value={wechat}
        onInput={(e) => setWechat(e.detail.value)}
        placeholder={t('pub.inquireWechatPlaceholder')}
      />

      <Text className='pub-inquiry__label'>{t('pub.inquireMessage')}</Text>
      <Textarea
        className='pub-inquiry__textarea'
        value={message}
        onInput={(e) => setMessage(e.detail.value)}
        placeholder={defaultMessage || t('pub.inquireMessagePlaceholder')}
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
        <Text>{submitting ? t('pub.inquireSubmitting') : t('pub.inquireSubmit')}</Text>
      </View>
    </View>
  )
}
