import { useTranslation } from 'react-i18next'
import type { ContractDoc, TrayKind } from '../types'

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

/** 右：签署方组件托盘 */
const SignerAside = ({
  doc,
  seal,
  signature,
  ghostKind,
  onOpenMake,
  beginCarry,
  onDecline,
}: {
  doc: ContractDoc | null
  seal: { dataUrl: string } | null
  signature: { svg: string; png: string } | null
  ghostKind: TrayKind | null
  onOpenMake: (kind: TrayKind) => void
  beginCarry: (kind: TrayKind) => (e: React.PointerEvent) => void
  onDecline: () => void
}) => {
  const { t } = useTranslation()
  return (
    <aside className="kf-config">
      <div className="rent-card">
        <div className="rent-card__body">
          <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signers')}</div>
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

      <div className="rent-card">
        <div className="rent-card__body">
          <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.trayTitle')}</div>
          <div className="kf-tray">
            <TrayItem kind="seal" seal={seal} signature={signature} ghostKind={ghostKind} onOpenMake={onOpenMake} beginCarry={beginCarry} />
            <TrayItem kind="sign" seal={seal} signature={signature} ghostKind={ghostKind} onOpenMake={onOpenMake} beginCarry={beginCarry} />
          </div>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__body">
          <button type="button" className="rent-btn rent-btn--danger rent-btn--sm" style={{ width: '100%' }} onClick={onDecline}>{t('contracts.decline')}</button>
        </div>
      </div>
    </aside>
  )
}

export default SignerAside
