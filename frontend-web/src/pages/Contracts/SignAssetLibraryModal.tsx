/**
 * 「我的签名 / 印章」资产库弹窗：资产列表 + 上传签名/印模。
 * 纯结构拆分自 pages/Contracts/index.tsx，类名与交互保持不变。
 */
import { Modal, Segmented } from 'antd'
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
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      title={t('contracts.mySignLib')}
      width={720}
      okText={t('common.close')}
      okButtonProps={{ style: { display: 'none' } }}
      cancelText={t('common.close')}
      onCancel={onClose}
    >
      <div style={{ marginBottom: 16 }}>
        <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.myAssets')}</div>
        {sigAssets.length === 0 ? (
          <div className="rent-text-sm rent-text-muted">{t('contracts.noSigAssets')}</div>
        ) : (
          <div className="rent-grid rent-grid--3" style={{ gap: 12 }}>
            {sigAssets.map((a) => (
              <div key={a.id} className="rent-contract-party" style={{ padding: 8, alignItems: 'center' }}>
                <img src={a.data_url} alt={a.name} loading="lazy" decoding="async" style={{ width: 72, height: 72, objectFit: 'contain', background: '#fff', border: '1px solid var(--rent-line, #e6eaf0)', borderRadius: 8 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div className="rent-text-sm rent-text-muted">
                    {sigAssetTypeLabel(a.asset_type)} · {sigSourceLabel(a.source)}
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
          options={[
            { value: 'handwrite', label: t('contracts.mySign') },
            { value: 'seal', label: t('contracts.mySeal') },
          ]}
          value={sigAssetType}
          onChange={(v) => setSigAssetType(v as string)}
        />
      </div>
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
