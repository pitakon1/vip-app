import { useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { useDidShow, useLoad } from '@tarojs/taro'
import { publicApi } from '@/services/publicApi'
import { useI18n } from '@/i18n'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'

/**
 * 「帮我找房」线索表单（C 端匿名可进）。
 *
 * 分类页的「帮我找房」入口此前是 notAvailable 占位。这里把预算 / 区域 /
 * 入住时间 / 语言结构化提交到 `POST /public/inquiries`（intent=find_my_home），
 * 后端落 Lead 并给运营/经纪人发站内通知。
 */

const CURRENCIES = ['THB', 'CNY', 'USD']
const LANGUAGES = ['zh', 'en', 'th']

export default function TenantFindMyHomePage() {
  const { t } = useI18n()
  const [form, setForm] = useState({
    name: '',
    phone: '',
    wechat_id: '',
    email: '',
    budgetMin: '',
    budgetMax: '',
    areas: '',
    moveIn: '',
    message: ''
  })
  const [currency, setCurrency] = useState('THB')
  const [language, setLanguage] = useState('zh')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const patch = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: t('pub.findHomeTitle') })
  })

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: t('pub.findHomeTitle') })
  })

  const submit = async () => {
    if (!form.name.trim()) {
      setError(t('pub.findHomeNameRequired'))
      return
    }
    if (!form.phone.trim() && !form.wechat_id.trim() && !form.email.trim()) {
      setError(t('pub.findHomeContactRequired'))
      return
    }
    const min = form.budgetMin ? Number(form.budgetMin) : undefined
    const max = form.budgetMax ? Number(form.budgetMax) : undefined
    if (min != null && max != null && min > max) {
      setError(t('pub.findHomeBudgetInvalid'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await publicApi.inquiry({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        wechat_id: form.wechat_id.trim() || undefined,
        email: form.email.trim() || undefined,
        message: form.message.trim() || undefined,
        intent: 'find_my_home',
        source: 'find_my_home',
        budget_min: min,
        budget_max: max,
        currency,
        areas: form.areas
          .split(/[,，]/)
          .map((a) => a.trim())
          .filter(Boolean),
        move_in_date: form.moveIn || undefined,
        language: language as 'zh' | 'en' | 'th'
      })
      setDone(true)
    } catch {
      setError(t('pub.findHomeError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='fmh'>
      <ShellHeader title={t('pub.findHomeTitle')} />
      <View className='fmh__body'>
        {done ? (
          <View className='fmh__card fmh__done'>
            <Text className='fmh__title'>{t('pub.findHomeOkTitle')}</Text>
            <Text className='fmh__hint'>{t('pub.findHomeOk')}</Text>
            <View
              className='fmh__btn'
              onClick={() => Taro.navigateTo({ url: '/pages/public/listings/index' })}
            >
              <Text className='fmh__btn-text'>{t('pub.findHomeBrowse')}</Text>
            </View>
            <View className='fmh__ghost' onClick={() => setDone(false)}>
              <Text className='fmh__ghost-text'>{t('pub.findHomeAgain')}</Text>
            </View>
          </View>
        ) : (
          <View className='fmh__card'>
            <Text className='fmh__title'>{t('pub.findHomeTitle')}</Text>
            <Text className='fmh__hint'>{t('pub.findHomeSub')}</Text>

            <Text className='fmh__label'>{t('pub.findHomeName')}</Text>
            <Input
              className='fmh__input'
              value={form.name}
              onInput={(e) => patch('name', e.detail.value)}
            />

            <Text className='fmh__label'>{t('pub.findHomePhone')}</Text>
            <Input
              className='fmh__input'
              type='number'
              value={form.phone}
              onInput={(e) => patch('phone', e.detail.value)}
            />

            <Text className='fmh__label'>{t('pub.findHomeWechat')}</Text>
            <Input
              className='fmh__input'
              value={form.wechat_id}
              onInput={(e) => patch('wechat_id', e.detail.value)}
            />

            <Text className='fmh__label'>{t('pub.findHomeEmail')}</Text>
            <Input
              className='fmh__input'
              value={form.email}
              onInput={(e) => patch('email', e.detail.value)}
            />

            <Text className='fmh__label'>{t('pub.findHomeCurrency')}</Text>
            <View className='fmh__chips'>
              {CURRENCIES.map((c) => (
                <View
                  key={c}
                  className={`fmh__chip ${currency === c ? 'fmh__chip--active' : ''}`}
                  onClick={() => setCurrency(c)}
                >
                  <Text className='fmh__chip-text'>{c}</Text>
                </View>
              ))}
            </View>

            <View className='fmh__row'>
              <View className='fmh__half'>
                <Text className='fmh__label'>{t('pub.findHomeBudgetMin')}</Text>
                <Input
                  className='fmh__input'
                  type='digit'
                  value={form.budgetMin}
                  onInput={(e) => patch('budgetMin', e.detail.value)}
                />
              </View>
              <View className='fmh__half'>
                <Text className='fmh__label'>{t('pub.findHomeBudgetMax')}</Text>
                <Input
                  className='fmh__input'
                  type='digit'
                  value={form.budgetMax}
                  onInput={(e) => patch('budgetMax', e.detail.value)}
                />
              </View>
            </View>

            <Text className='fmh__label'>{t('pub.findHomeAreas')}</Text>
            <Input
              className='fmh__input'
              placeholder={t('pub.findHomeAreasHint')}
              value={form.areas}
              onInput={(e) => patch('areas', e.detail.value)}
            />

            <Text className='fmh__label'>{t('pub.findHomeMoveIn')}</Text>
            <Input
              className='fmh__input'
              placeholder='2026-12-01'
              value={form.moveIn}
              onInput={(e) => patch('moveIn', e.detail.value)}
            />

            <Text className='fmh__label'>{t('pub.findHomeLanguage')}</Text>
            <View className='fmh__chips'>
              {LANGUAGES.map((l) => (
                <View
                  key={l}
                  className={`fmh__chip ${language === l ? 'fmh__chip--active' : ''}`}
                  onClick={() => setLanguage(l)}
                >
                  <Text className='fmh__chip-text'>{t(`pub.findHomeLang_${l}`)}</Text>
                </View>
              ))}
            </View>

            <Text className='fmh__label'>{t('pub.findHomeMessage')}</Text>
            <Textarea
              className='fmh__input fmh__textarea'
              value={form.message}
              onInput={(e) => patch('message', e.detail.value)}
            />

            {error ? <Text className='fmh__error'>{error}</Text> : null}

            <View
              className={`fmh__btn ${submitting ? 'fmh__btn--disabled' : ''}`}
              onClick={() => {
                if (!submitting) void submit()
              }}
            >
              <Text className='fmh__btn-text'>
                {submitting ? t('pub.findHomeSubmitting') : t('pub.findHomeSubmit')}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
