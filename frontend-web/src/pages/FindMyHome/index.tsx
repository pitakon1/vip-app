/**
 * 「帮我找房」线索表单（公开页，匿名可提交）。
 *
 * 分类页的「帮我找房」入口原先只是 notAvailable 占位，C 端流量到不了 CRM。
 * 这里把「预算 / 区域 / 入住时间 / 语言」结构化采集，服务端落 Lead 并给
 * 运营/经纪人发站内通知（见 `POST /public/inquiries`，intent=find_my_home）。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import PublicTopBar from '@/components/PublicTopBar'
import '@/styles/public-site.css'

const CURRENCIES = ['THB', 'CNY', 'USD'] as const
const LANGUAGES = ['zh', 'en', 'th'] as const

export default function FindMyHome() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    phone: '',
    wechat_id: '',
    email: '',
    budgetMin: '',
    budgetMax: '',
    currency: 'THB',
    areas: '',
    moveIn: '',
    language: 'zh',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [done, setDone] = useState(false)

  const patch = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setFeedback({ tone: 'error', text: t('publicSite.findHomeNameRequired') })
      return
    }
    if (!form.phone.trim() && !form.wechat_id.trim() && !form.email.trim()) {
      setFeedback({ tone: 'error', text: t('publicSite.findHomeContactRequired') })
      return
    }
    const min = form.budgetMin ? Number(form.budgetMin) : undefined
    const max = form.budgetMax ? Number(form.budgetMax) : undefined
    if (min !== undefined && max !== undefined && min > max) {
      setFeedback({ tone: 'error', text: t('publicSite.findHomeBudgetInvalid') })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      await api.post('/public/inquiries', {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        wechat_id: form.wechat_id.trim() || undefined,
        email: form.email.trim() || undefined,
        message: form.message.trim() || undefined,
        intent: 'find_my_home',
        source: 'find_my_home',
        budget_min: min,
        budget_max: max,
        currency: form.currency,
        areas: form.areas
          .split(/[,，]/)
          .map((a) => a.trim())
          .filter(Boolean),
        move_in_date: form.moveIn || undefined,
        language: form.language,
      })
      setDone(true)
    } catch {
      setFeedback({ tone: 'error', text: t('publicSite.findHomeError') })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pub-page">
      <PublicTopBar />
      <main className="pub-wrap" style={{ paddingTop: 28, paddingBottom: 48, maxWidth: 720 }}>
        <h1 className="pub-section__title">{t('publicSite.findHomeTitle')}</h1>
        <p className="pub-section__hint">{t('publicSite.findHomeSub')}</p>

        {done ? (
          <div className="pub-card" style={{ marginTop: 20 }}>
            <h2 className="pub-section__title">{t('publicSite.findHomeOkTitle')}</h2>
            <p className="pub-section__hint">{t('publicSite.findHomeOk')}</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" className="pub-btn pub-btn--primary" onClick={() => navigate('/listings')}>
                {t('publicSite.findHomeBrowse')}
              </button>
              <button type="button" className="pub-btn" onClick={() => setDone(false)}>
                {t('publicSite.findHomeAgain')}
              </button>
            </div>
          </div>
        ) : (
          <form className="pub-card" style={{ marginTop: 20 }} onSubmit={submit}>
            <div className="pub-field">
              <label className="pub-field__label" htmlFor="fh-name">
                {t('publicSite.findHomeName')}
              </label>
              <input
                id="fh-name"
                className="pub-input"
                value={form.name}
                onChange={(e) => patch('name', e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="fh-phone">
                  {t('publicSite.findHomePhone')}
                </label>
                <input
                  id="fh-phone"
                  className="pub-input"
                  value={form.phone}
                  onChange={(e) => patch('phone', e.target.value)}
                />
              </div>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="fh-wechat">
                  {t('publicSite.findHomeWechat')}
                </label>
                <input
                  id="fh-wechat"
                  className="pub-input"
                  value={form.wechat_id}
                  onChange={(e) => patch('wechat_id', e.target.value)}
                />
              </div>
            </div>

            <div className="pub-field">
              <label className="pub-field__label" htmlFor="fh-email">
                {t('publicSite.findHomeEmail')}
              </label>
              <input
                id="fh-email"
                className="pub-input"
                value={form.email}
                onChange={(e) => patch('email', e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 96px', gap: 12 }}>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="fh-budget-min">
                  {t('publicSite.findHomeBudgetMin')}
                </label>
                <input
                  id="fh-budget-min"
                  className="pub-input"
                  type="number"
                  min={0}
                  value={form.budgetMin}
                  onChange={(e) => patch('budgetMin', e.target.value)}
                />
              </div>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="fh-budget-max">
                  {t('publicSite.findHomeBudgetMax')}
                </label>
                <input
                  id="fh-budget-max"
                  className="pub-input"
                  type="number"
                  min={0}
                  value={form.budgetMax}
                  onChange={(e) => patch('budgetMax', e.target.value)}
                />
              </div>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="fh-currency">
                  {t('publicSite.findHomeCurrency')}
                </label>
                <select
                  id="fh-currency"
                  className="pub-input"
                  value={form.currency}
                  onChange={(e) => patch('currency', e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pub-field">
              <label className="pub-field__label" htmlFor="fh-areas">
                {t('publicSite.findHomeAreas')}
              </label>
              <input
                id="fh-areas"
                className="pub-input"
                placeholder={t('publicSite.findHomeAreasHint')}
                value={form.areas}
                onChange={(e) => patch('areas', e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="fh-move-in">
                  {t('publicSite.findHomeMoveIn')}
                </label>
                <input
                  id="fh-move-in"
                  className="pub-input"
                  type="date"
                  value={form.moveIn}
                  onChange={(e) => patch('moveIn', e.target.value)}
                />
              </div>
              <div className="pub-field">
                <label className="pub-field__label" htmlFor="fh-language">
                  {t('publicSite.findHomeLanguage')}
                </label>
                <select
                  id="fh-language"
                  className="pub-input"
                  value={form.language}
                  onChange={(e) => patch('language', e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {t(`publicSite.findHomeLang_${l}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pub-field">
              <label className="pub-field__label" htmlFor="fh-message">
                {t('publicSite.findHomeMessage')}
              </label>
              <textarea
                id="fh-message"
                className="pub-input"
                style={{ height: 84, paddingTop: 8, resize: 'vertical' }}
                value={form.message}
                onChange={(e) => patch('message', e.target.value)}
              />
            </div>

            {feedback ? (
              <p
                role="status"
                style={{
                  color: feedback.tone === 'error' ? 'var(--state-error)' : 'var(--state-success)',
                  margin: '0 0 12px',
                }}
              >
                {feedback.text}
              </p>
            ) : null}

            <button
              type="submit"
              className="pub-btn pub-btn--primary pub-btn--block pub-btn--lg"
              disabled={submitting}
            >
              {submitting ? t('publicSite.findHomeSubmitting') : t('publicSite.findHomeSubmit')}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
