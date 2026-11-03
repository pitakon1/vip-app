import { Modal, Segmented } from 'antd'
import { useTranslation } from 'react-i18next'
import CompanySeal from './CompanySeal'

/** 印章制作弹窗：模板制作 / 印模上传 */
const SealModal = ({
  open,
  onCancel,
  createType,
  onChangeCreateType,
  companyName,
  onChangeCompanyName,
  middleText,
  onChangeMiddleText,
  partyName,
  generating,
  onGenerate,
  preview,
  onUsePreview,
  seal,
  onFile,
  fileRef,
}: {
  open: boolean
  onCancel: () => void
  createType: 'template' | 'imprint'
  onChangeCreateType: (v: 'template' | 'imprint') => void
  companyName: string
  onChangeCompanyName: (v: string) => void
  middleText: string
  onChangeMiddleText: (v: string) => void
  partyName: string
  generating: boolean
  onGenerate: () => void
  preview: string
  onUsePreview: () => void
  seal: { dataUrl: string } | null
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileRef: React.RefObject<HTMLInputElement>
}) => {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      title={t('contracts.makeSeal')}
      footer={null}
      onCancel={onCancel}
    >
      <Segmented
        block
        value={createType}
        onChange={(v) => onChangeCreateType(v as 'template' | 'imprint')}
        options={[
          { value: 'template', label: t('contracts.sealTypeTemplate') },
          { value: 'imprint', label: t('contracts.sealTypeImprint') },
        ]}
        style={{ marginBottom: 16 }}
      />

      {createType === 'template' ? (
        <div>
          <div className="rent-field" style={{ marginBottom: 12 }}>
            <label className="rent-label">{t('contracts.sealCompanyName')}</label>
            <input
              className="rent-input"
              value={companyName}
              placeholder={t('contracts.sealCompanyNamePlaceholder')}
              onChange={(e) => onChangeCompanyName(e.target.value)}
            />
          </div>
          <div className="rent-field" style={{ marginBottom: 12 }}>
            <label className="rent-label">{t('contracts.sealMiddleText')}</label>
            <input
              className="rent-input"
              value={middleText}
              placeholder={t('contracts.sealMiddleTextPlaceholder')}
              onChange={(e) => onChangeMiddleText(e.target.value)}
            />
          </div>
          <div className="rent-field" style={{ marginBottom: 12 }}>
            <label className="rent-label">{t('contracts.sealStyle')}</label>
            <div className="rent-flex" style={{ alignItems: 'center', gap: 8 }}>
              <CompanySeal name={partyName} />
              <div style={{ textAlign: 'left' }}>
                <div className="rent-text-sm rent-text-bold">{t('contracts.sealStyleOfficial')}</div>
                <div className="rent-text-sm rent-text-muted">{t('contracts.sealStyleOnly')}</div>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="rent-btn rent-btn--primary"
            onClick={onGenerate}
            disabled={generating}
            style={{ width: '100%' }}
          >
            {generating ? t('common.loading') : t('contracts.sealGeneratePreview')}
          </button>

          {preview ? (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <img className="kf-asset-thumb" src={preview} alt={t('contracts.makeSeal')} loading="lazy" decoding="async" style={{ width: 160, height: 160, objectFit: 'contain' }} />
              <div style={{ marginTop: 12 }}>
                <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={onUsePreview}>{t('contracts.sealUseThis')}</button>
              </div>
            </div>
          ) : (
            <div className="rent-text-sm rent-text-muted" style={{ textAlign: 'center', marginTop: 16 }}>{t('contracts.sealSystemHint')}</div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div className="rent-text-sm rent-text-muted" style={{ margin: '8px 0 12px' }}>{t('contracts.sealUploadTip')}</div>
          <div className="rent-flex" style={{ justifyContent: 'center', gap: 8 }}>
            <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => fileRef.current?.click()}>{t('contracts.sealUpload')}</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onFile} />
          </div>
          {seal && (
            <img className="kf-asset-thumb" src={seal.dataUrl} alt={t('contracts.makeSeal')} loading="lazy" decoding="async" style={{ marginTop: 12 }} />
          )}
        </div>
      )}
    </Modal>
  )
}

export default SealModal
