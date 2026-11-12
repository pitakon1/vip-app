/**
 * 多人签署顺序编排弹窗：并行 / 串行切换 + 未签方序号。
 * 提交口径与后端 POST /contracts/{id}/sign-order 一致：
 * - parallel 时不提交序号（orders 传空数组）；
 * - sequential 时只提交未签方，序号必须为正整数且互不重复。
 */
import { useEffect, useMemo, useState } from 'react'
import { Modal, Segmented } from 'antd'
import { useTranslation } from 'react-i18next'
import type { Party } from './contractTypes'

type SignOrderType = 'parallel' | 'sequential'

export default function SignOrderModal({
  open,
  parties,
  type,
  onCancel,
  onOk,
}: {
  open: boolean
  parties: Party[]
  type?: SignOrderType
  onCancel: () => void
  onOk: (type: SignOrderType, orders: { party_id: string; order: number }[]) => void
}) {
  const { t } = useTranslation()
  const [orderType, setOrderType] = useState<SignOrderType>(type || 'parallel')
  const [orders, setOrders] = useState<Record<string, string>>({})

  // 每次打开时回填当前配置，避免沿用上一次编辑到一半的本地状态
  useEffect(() => {
    if (!open) return
    setOrderType(type || 'parallel')
    const init: Record<string, string> = {}
    let next = 1
    parties.forEach((p) => {
      if (p.signed) return
      if (p.sign_order && p.sign_order > 0) init[p.id] = String(p.sign_order)
      else init[p.id] = String(next)
      next += 1
    })
    setOrders(init)
  }, [open])

  // 串行模式需要校验：未签方序号为 >=1 的整数且不重复
  const unsigned = useMemo(() => parties.filter((p) => !p.signed), [parties])
  const duplicated = useMemo(() => {
    const seen = new Set<number>()
    for (const p of unsigned) {
      const n = Number(orders[p.id])
      if (seen.has(n)) return true
      seen.add(n)
    }
    return false
  }, [unsigned, orders])
  const orderValid =
    unsigned.every((p) => {
      const n = Number(orders[p.id])
      return Number.isInteger(n) && n >= 1
    }) &&
    !duplicated

  const submit = () => {
    if (orderType === 'parallel') {
      onOk('parallel', [])
      return
    }
    if (!orderValid) return
    const payload = unsigned
      .map((p) => ({ party_id: p.id, order: Number(orders[p.id]) }))
      .sort((a, b) => a.order - b.order)
    onOk('sequential', payload)
  }

  return (
    <Modal
      open={open}
      title={t('contracts.signOrderTitle')}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      okButtonProps={{ disabled: orderType === 'sequential' && !orderValid }}
      onOk={submit}
      onCancel={onCancel}
      width={560}
    >
      <div className="rent-field">
        <label className="rent-label">{t('contracts.signOrderType')}</label>
        <Segmented
          value={orderType}
          onChange={(v) => setOrderType(v as SignOrderType)}
          options={[
            { label: t('contracts.signOrderParallel'), value: 'parallel' },
            { label: t('contracts.signOrderSequential'), value: 'sequential' },
          ]}
        />
        <p className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>
          {orderType === 'parallel'
            ? t('contracts.signOrderParallelHint')
            : t('contracts.signOrderSequentialHint')}
        </p>
      </div>

      <div className="rent-field">
        <label className="rent-label">{t('contracts.signOrderParties')}</label>
        <div className="kf-order">
          {parties.map((p) => (
            <div className="kf-order__row" key={p.id}>
              <span className="kf-order__name">
                {p.name}
                <span className="rent-text-sm rent-text-muted">（{p.role}）</span>
              </span>
              {p.signed ? (
                <span className="rent-badge rent-badge--success">{t('contracts.stSigned')}</span>
              ) : orderType === 'sequential' ? (
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="rent-input kf-order__input"
                  value={orders[p.id] ?? ''}
                  onChange={(e) => setOrders((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
              ) : (
                <span className="rent-text-sm rent-text-muted">{t('contracts.signOrderFree')}</span>
              )}
            </div>
          ))}
        </div>
        {orderType === 'sequential' && !orderValid && (
          <p className="kf-order__error">{t('contracts.signOrderInvalid')}</p>
        )}
      </div>
    </Modal>
  )
}
