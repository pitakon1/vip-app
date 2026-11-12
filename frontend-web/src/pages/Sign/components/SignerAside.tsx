import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContractDoc, Placed, SignField, TrayKind } from '../types'
import { fieldKey, isFieldDone, sortSignFields } from '../utils'

/** 托盘条目（开放签式整行交互）：
 *   未制作 → 整行可点，点一下直接弹出手写签名板 / 印章制作弹窗（不再依赖小「制作」按钮）；
 *   已制作 → 整行可按（鼠标/手指）拖到文档任意位置松手即落章；纯点按（不拖）也会落在
 *            默认签署位置，保证触屏用户不会「拖不动就签不了」；右侧留一个小「重做/更换」。 */
const TrayItem = ({
  kind,
  seal,
  signature,
  ghostKind,
  onOpenMake,
  beginCarry,
}: {
  kind: TrayKind
  seal: { dataUrl: string } | null
  signature: { svg: string; png: string } | null
  ghostKind: TrayKind | null
  onOpenMake: (kind: TrayKind) => void
  beginCarry: (kind: TrayKind) => (e: React.PointerEvent) => void
}) => {
  const { t } = useTranslation()
  const made = kind === 'seal' ? !!seal : !!signature
  const thumb = kind === 'seal' ? seal?.dataUrl : signature?.png
  const label = kind === 'seal' ? t('contracts.sealAsset') : t('contracts.signAsset')
  const openMake = () => onOpenMake(kind)
  if (!made) {
    return (
      <div
        className="kf-tray-item kf-tray-item--empty"
        role="button"
        tabIndex={0}
        onClick={openMake}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openMake()
          }
        }}
      >
        <div className="kf-tray-item__name">{label}</div>
        <div className="rent-text-sm rent-text-muted kf-tray-item__state">
          {kind === 'seal' ? t('contracts.tapMakeSeal') : t('contracts.tapSign')}
        </div>
      </div>
    )
  }
  return (
    <div
      className={`kf-tray-item kf-tray-item--made${ghostKind === kind ? ' kf-tray-item--carrying' : ''}`}
      onPointerDown={beginCarry(kind)}
      title={t('contracts.dragStampHint')}
      style={{ touchAction: 'none' }}
    >
      <div className="kf-tray-item__name">{label}</div>
      <div className="kf-tray-item__thumb">
        <img src={thumb} alt={label} draggable={false} loading="lazy" decoding="async" />
      </div>
      <div className="rent-text-sm kf-tray-item__ready">{t('contracts.readyToDrag')}</div>
      <button
        type="button"
        className="kf-tray-item__redo"
        draggable={false}
        title={kind === 'seal' ? t('contracts.changeSeal') : t('contracts.resignSign')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={openMake}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>
    </div>
  )
}

/** 签署区类型小图标：章 / 签名 / 日期 */
const FieldIcon = ({ type }: { type?: string }) => {
  if (type === 'seal') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    )
  }
  if (type === 'date') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

/** 待签控件清单：页码 + 类型 + 状态，点击可跳到对应页并高亮该签署区 */
const PendingFields = ({
  fields,
  placed,
  onFieldClick,
}: {
  fields: SignField[]
  placed: Placed[]
  onFieldClick: (f: SignField) => void
}) => {
  const { t } = useTranslation()
  const sorted = useMemo(() => sortSignFields(fields), [fields])
  const done = sorted.filter((f) => isFieldDone(f, placed)).length
  if (!sorted.length) return null
  return (
    <div className="rent-card" id="kf-pending-card">
      <div className="rent-card__body">
        <div className="kf-pending__head">
          <span className="rent-text-bold">{t('contracts.pendingFields', { count: sorted.length - done })}</span>
          <span className="rent-text-sm rent-text-muted">{t('contracts.fieldsDone', { done, total: sorted.length })}</span>
        </div>
        <div className="kf-pending__list">
          {sorted.map((f) => {
            const state = f.signed ? 'signed' : isFieldDone(f, placed) ? 'placed' : 'pending'
            const stateLabel =
              state === 'signed'
                ? t('contracts.fieldStateSigned')
                : state === 'placed'
                  ? t('contracts.fieldStatePlaced')
                  : t('contracts.fieldStatePending')
            return (
              <button
                key={fieldKey(f)}
                type="button"
                className={`kf-pending__row kf-pending__row--${state}`}
                onClick={() => state !== 'signed' && onFieldClick(f)}
                disabled={state === 'signed'}
              >
                <span className="kf-pending__icon">
                  <FieldIcon type={f.field_type} />
                </span>
                <span className="kf-pending__meta">
                  <span className="kf-pending__name">{t(`contracts.fType_${f.field_type || 'signature'}`)}</span>
                  <span className="rent-text-sm rent-text-muted">{t('contracts.fieldPage', { page: f.page || 1 })}</span>
                </span>
                <span className={`kf-pending__state kf-pending__state--${state}`}>{stateLabel}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 右：签署方组件托盘 */
const SignerAside = ({
  doc,
  fields,
  placed,
  seal,
  signature,
  ghostKind,
  onOpenMake,
  beginCarry,
  onDecline,
  onFieldClick,
}: {
  doc: ContractDoc | null
  fields: SignField[]
  placed: Placed[]
  seal: { dataUrl: string } | null
  signature: { svg: string; png: string } | null
  ghostKind: TrayKind | null
  onOpenMake: (kind: TrayKind) => void
  beginCarry: (kind: TrayKind) => (e: React.PointerEvent) => void
  onDecline: () => void
  onFieldClick: (f: SignField) => void
}) => {
  const { t } = useTranslation()
  return (
    <aside className="kf-config">
      <div className="rent-card">
        <div className="rent-card__body">
          <div className="kf-config__head">
            <span className="rent-text-bold">{t('contracts.signers')}</span>
            <button type="button" className="kf-decline-link" onClick={onDecline}>
              {t('contracts.decline')}
            </button>
          </div>
          <div className="kf-parties">
            <div className="kf-party kf-party--active">
              <div style={{ minWidth: 0 }}>
                <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc?.party?.name || doc?.party_name_masked || '—'}</div>
                <div className="rent-text-sm rent-text-muted">{doc?.party_role || ''}</div>
              </div>
              <span className="rent-badge rent-badge--success">{t('contracts.stPendingSign')}</span>
            </div>
          </div>
        </div>
      </div>

      <PendingFields fields={fields} placed={placed} onFieldClick={onFieldClick} />

      <div className="rent-card" id="kf-tray-card">
        <div className="rent-card__body">
          <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.trayTitle')}</div>
          <div className="kf-tray">
            <TrayItem kind="seal" seal={seal} signature={signature} ghostKind={ghostKind} onOpenMake={onOpenMake} beginCarry={beginCarry} />
            <TrayItem kind="sign" seal={seal} signature={signature} ghostKind={ghostKind} onOpenMake={onOpenMake} beginCarry={beginCarry} />
          </div>
        </div>
      </div>
    </aside>
  )
}

export default SignerAside
