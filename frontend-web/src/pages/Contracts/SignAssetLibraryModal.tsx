/**
 * 「我的签名 / 印章」资产库弹窗：资产列表 + 上传签名/印模。
 * 纯结构拆分自 pages/Contracts/index.tsx，类名与交互保持不变。
 */
import { Modal, Segmented, Select } from 'antd'
import { useTranslation } from 'react-i18next'
import type { SignAsset } from './contractTypes'

export default function SignAssetLibraryModal({
  open,
  onClose,
  sigAssets,
  sigAssetType,
  setSigAssetType,
  sigAssetName,
  setSigAssetName,
  sigUploading,
  sigFileRef,
  onPickFile,
  onRemove,
  sigAssetTypeLabel,
  sigSourceLabel,
  sigScope,
  setSigScope,
  sigSealType,
  setSigSealType,
  canUseCompanyScope,
}: {
  open: boolean
  onClose: () => void
  sigAssets: SignAsset[]
  sigAssetType: string
  setSigAssetType: (v: string) => void
  sigAssetName: string
  setSigAssetName: (v: string) => void
  sigUploading: boolean
  sigFileRef: React.RefObject<HTMLInputElement>
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: (asset: SignAsset) => void
  sigAssetTypeLabel: (t: string) => string
  sigSourceLabel: (s: string) => string
  /** 当前资产库归属：personal=我的签名/印章，company=企业印章库 */
  sigScope?: 'personal' | 'company'
  setSigScope?: (scope: 'personal' | 'company') => void
  /** 企业印章类别：company=公章 / contract=合同章 / legal_rep=法人章 */
  sigSealType?: string
  setSigSealType?: (v: string) => void
  /** 企业印章库仅员工可用 */
  canUseCompanyScope?: boolean
}) {
  const { t } = useTranslation()

  const sealTypeLabel = (v?: string | null) =>
    v === 'contract'
      ? t('contracts.sealTypeContract')
      : v === 'legal_rep'
        ? t('contracts.sealTypeLegalRep')
        : v
          ? t('contracts.sealTypeCompany')
          : ''

  return (
    <Modal
      open={open}
      title={t('contracts.mySignLib')}
      width={880}
      okText={t('common.close')}
      okButtonProps={{ style: { display: 'none' } }}
      cancelText={t('common.close')}
      onCancel={onClose}
    >
      {canUseCompanyScope && (
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <Segmented
            block
            options={[
              { value: 'personal', label: t('contracts.scopePersonal') },
              { value: 'company', label: t('contracts.scopeCompany') },
            ]}
            value={sigScope || 'personal'}
            onChange={(v) => setSigScope?.(v as 'personal' | 'company')}
          />
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.myAssets')}</div>
        {sigAssets.length === 0 ? (
          <div className="rent-text-sm rent-text-muted">{t('contracts.noSigAssets')}</div>
        ) : (
          <div className="rent-grid rent-grid--3" style={{ gap: 12 }}>
            {sigAssets.map((a) => (
              <div key={a.id} className="rent-contract-party" style={{ padding: 8, alignItems: 'center' }}>
                <img src={a.data_url} alt={a.name} loading="lazy" decoding="async" style={{ width: 72, height: 72, objectFit: 'contain', background: '#fff', border: '1px solid var(--rent-line, #e2e5e8)', borderRadius: 8 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div className="rent-text-sm rent-text-muted">
                    {sigAssetTypeLabel(a.asset_type)} · {sigSourceLabel(a.source)}
                    {a.seal_type ? ` · ${sealTypeLabel(a.seal_type)}` : ''}
                  </div>
                  <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={() => onRemove(a)}>
                    {t('contracts.deleteField')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rent-field" style={{ marginBottom: 12 }}>
        <label className="rent-label">{t('contracts.sigAddTitle')}</label>
        <Segmented
          block
          options={
            sigScope === 'company'
              ? [{ value: 'seal', label: t('contracts.scopeCompany') }]
              : [
                  { value: 'handwrite', label: t('contracts.mySign') },
                  { value: 'seal', label: t('contracts.mySeal') },
                ]
          }
          value={sigAssetType}
          onChange={(v) => setSigAssetType(v as string)}
        />
        {sigScope === 'company' && (
          <div className="rent-text-sm rent-text-muted" style={{ marginTop: 6 }}>
            {t('contracts.scopeCompanyHint')}
          </div>
        )}
      </div>
      {sigScope === 'company' && (
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.sealTypeLabel')}</label>
          <Select
            style={{ width: '100%' }}
            value={sigSealType || 'company'}
            onChange={(v) => setSigSealType?.(v)}
            options={[
              { value: 'company', label: t('contracts.sealTypeCompany') },
              { value: 'contract', label: t('contracts.sealTypeContract') },
              { value: 'legal_rep', label: t('contracts.sealTypeLegalRep') },
            ]}
          />
        </div>
      )}
      <div className="rent-field" style={{ marginBottom: 12 }}>
        <label className="rent-label">{t('contracts.sigName')}</label>
        <input className="rent-input" value={sigAssetName} placeholder={sigAssetType === 'seal' ? t('contracts.mySeal') : t('contracts.mySign')} onChange={(e) => setSigAssetName(e.target.value)} />
      </div>
      <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
        <button className="rent-btn rent-btn--primary rent-btn--sm" disabled={sigUploading} onClick={() => sigFileRef.current?.click()}>
          {sigUploading ? t('common.loading') : t('contracts.sigPickFile')}
        </button>
        <span className="rent-text-sm rent-text-muted">
          {sigAssetType === 'seal' ? t('contracts.sealImprintHint') : t('contracts.signUploadHint')}
        </span>
        <input ref={sigFileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onPickFile} />
      </div>
    </Modal>
  )
}
