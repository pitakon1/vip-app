/**
 * 签署完成回调弹窗：主回调地址 + 多地址订阅（勾选保留/取消）+ 一次性密钥 + 投递记录与人工重投。
 * 后端确为两个接口，保存时按两步提交并在界面如实体现：
 * - POST /contracts/{id}/callback                { url }                       主地址（留空即关闭）
 * - GET  /contracts/{id}/subscriptions           多地址订阅列表
 * - POST /contracts/{id}/subscriptions           { url, label? }                新增订阅
 * - DELETE /contracts/{id}/subscriptions/{sid}                                  取消勾选后删除
 * - POST /contracts/{id}/callback/retry          重投最近一次
 * 密钥由后端生成，前端只展示不填写。
 */
import { useEffect, useMemo, useState } from 'react'
import { Checkbox, Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import type { CallbackEvent, ContractSubscription } from './contractTypes'

const STATUS_BADGE: Record<string, string> = {
  delivered: 'rent-badge--success',
  failed: 'rent-badge--error',
  pending: 'rent-badge--warning',
}

type SubRow = { key: string; url: string; label?: string | null; existingId?: string }

export default function CallbackModal({
  open,
  url,
  events,
  subscriptions,
  secret,
  saving,
  onCancel,
  onSave,
  onRetry,
}: {
  open: boolean
  url?: string | null
  events: CallbackEvent[]
  subscriptions: ContractSubscription[]
  secret: string
  saving: boolean
  onCancel: () => void
  onSave: (url: string, removedSubscriptionIds: string[], newSubscriptionUrls: string[]) => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const [urlInput, setUrlInput] = useState('')
  const [rows, setRows] = useState<SubRow[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [subInput, setSubInput] = useState('')
  const [subError, setSubError] = useState('')

  // 每次打开（或订阅列表刷新）时回填，避免沿用上一次未保存的勾选
  useEffect(() => {
    if (!open) return
    setUrlInput(url || '')
    const nextRows: SubRow[] = subscriptions.map((s) => ({
      key: s.id,
      url: s.url,
      label: s.label,
      existingId: s.id,
    }))
    setRows(nextRows)
    setChecked(Object.fromEntries(nextRows.map((r) => [r.key, true])))
    setSubInput('')
    setSubError('')
  }, [open, url, subscriptions])

  const trimmed = urlInput.trim()
  const urlValid = !trimmed || /^https?:\/\//i.test(trimmed)

  // 至少有一个可投递地址（主地址或任一勾选的订阅），否则明确提示不会推送
  const hasReceiver = !!trimmed || rows.some((r) => checked[r.key])
  const noneChecked = rows.length > 0 && rows.every((r) => !checked[r.key])

  const statusLabel = (status: string) =>
    status === 'delivered'
      ? t('contracts.callbackDelivered')
      : status === 'failed'
        ? t('contracts.callbackFailed')
        : t('contracts.callbackPending')

  const existingUrls = useMemo(() => new Set(rows.map((r) => r.url)), [rows])

  const addRow = () => {
    const value = subInput.trim()
    if (!/^https?:\/\//i.test(value)) {
      setSubError(t('contracts.callbackSubscriptionInvalid'))
      return
    }
    if (existingUrls.has(value)) {
      setSubError(t('contracts.callbackSubscriptionDuplicate'))
      return
    }
    const key = `new-${Date.now()}`
    setRows((prev) => [...prev, { key, url: value }])
    setChecked((prev) => ({ ...prev, [key]: true }))
    setSubInput('')
    setSubError('')
  }

  const submit = () => {
    const removedSubscriptionIds = rows
      .filter((r) => r.existingId && !checked[r.key])
      .map((r) => r.existingId as string)
    const newSubscriptionUrls = rows.filter((r) => !r.existingId && checked[r.key]).map((r) => r.url)
    onSave(urlInput, removedSubscriptionIds, newSubscriptionUrls)
  }

  return (
    <Modal
      open={open}
      title={t('contracts.callbackTitle')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      okButtonProps={{ loading: saving, disabled: !urlValid }}
      onOk={submit}
      onCancel={onCancel}
      width={640}
    >
      <div className="rent-field">
        <label className="rent-label">{t('contracts.callbackUrl')}</label>
        <input
          className="rent-input"
          value={urlInput}
          placeholder="https://example.com/hooks/contract-signed"
          onChange={(e) => setUrlInput(e.target.value)}
        />
        {!urlValid && <p className="kf-order__error">{t('contracts.callbackUrlInvalid')}</p>}
        <p className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>
          {t('contracts.callbackHint')}
        </p>
      </div>

      <div className="rent-field">
        <label className="rent-label">{t('contracts.callbackSubscriptions')}</label>
        <p className="rent-text-sm rent-text-muted" style={{ marginTop: 0 }}>
          {t('contracts.callbackSubscriptionsHint')}
        </p>
        {rows.length === 0 ? (
          <p className="rent-text-sm rent-text-muted">{t('contracts.callbackSubscriptionNone')}</p>
        ) : (
          <div className="kf-sub">
            {rows.map((r) => (
              <label className="kf-sub__row" key={r.key}>
                <Checkbox
                  checked={!!checked[r.key]}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [r.key]: e.target.checked }))}
                />
                <span className="kf-sub__url">
                  {r.url}
                  {r.label && <span className="kf-sub__label">（{r.label}）</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="kf-sub__add">
          <input
            className="rent-input"
            value={subInput}
            placeholder={t('contracts.callbackSubscriptionPlaceholder')}
            onChange={(e) => {
              setSubInput(e.target.value)
              setSubError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addRow()
              }
            }}
          />
          <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={addRow}>
            {t('contracts.callbackSubscriptionAdd')}
          </button>
        </div>
        {subError && <p className="kf-order__error">{subError}</p>}
        {noneChecked && (
          <p className="kf-sub__warn">{t('contracts.callbackSubscriptionRemoveTip')}</p>
        )}
        {!hasReceiver && <p className="kf-sub__warn">{t('contracts.callbackNoReceiver')}</p>}
      </div>

      {secret && (
        <div className="rent-field">
          <label className="rent-label">{t('contracts.callbackSecret')}</label>
          <div className="kf-secret">{secret}</div>
          <p className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
            {t('contracts.callbackSecretTip')}
          </p>
        </div>
      )}

      <div className="rent-field">
        <div className="kf-callback__head">
          <label className="rent-label" style={{ marginBottom: 0 }}>
            {t('contracts.callbackEvents')}
          </label>
          <button
            className="rent-btn rent-btn--ghost rent-btn--sm"
            disabled={events.length === 0}
            onClick={onRetry}
          >
            {t('contracts.callbackRetry')}
          </button>
        </div>
        {events.length === 0 ? (
          <p className="rent-text-sm rent-text-muted">{t('contracts.callbackNoEvents')}</p>
        ) : (
          <div className="kf-callback__list">
            {events.map((e) => (
              <div className="kf-callback__row" key={e.id}>
                <div className="kf-callback__head">
                  <span className="kf-callback__event">{e.event}</span>
                  <span className={`rent-badge ${STATUS_BADGE[e.status] || 'rent-badge--neutral'}`}>
                    {statusLabel(e.status)}
                  </span>
                </div>
                <div className="kf-callback__meta">
                  {t('contracts.callbackAttempts', { n: e.attempts })}
                  {e.delivered_at && ` · ${new Date(e.delivered_at).toLocaleString()}`}
                  {e.next_attempt_at &&
                    ` · ${t('contracts.callbackNextAttempt', { at: new Date(e.next_attempt_at).toLocaleString() })}`}
                </div>
                {e.last_error && <div className="kf-callback__error">{e.last_error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
