/**
 * 上传电子合同卡片：选文件 → 确认上传 / 取消。
 * 纯结构拆分自 pages/Contracts/index.tsx，类名与交互保持不变。
 */
import { useTranslation } from 'react-i18next'
import { UPLOAD_ACCEPT } from './contractTypes'

export default function UploadContractCard({
  pendingFile,
  uploading,
  fileInputRef,
  onPick,
  onConfirm,
  onCancel,
}: {
  pendingFile: File | null
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement>
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('contracts.uploadTitle')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('contracts.uploadHint')}</span>
      </div>
      <div className="rent-card__body">
        {!pendingFile ? (
          <button className="rent-btn rent-btn--primary" onClick={() => fileInputRef.current?.click()}>
            {t('contracts.pickFile')}
          </button>
        ) : (
          <div className="rent-flex" style={{ gap: 12, alignItems: 'center' }}>
            <span className="rent-text-bold">{pendingFile.name}</span>
            <button className="rent-btn rent-btn--primary rent-btn--sm" disabled={uploading} onClick={onConfirm}>
              {t('contracts.upload')}
            </button>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" disabled={uploading} onClick={onCancel}>
              {t('common.cancel')}
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          style={{ display: 'none' }}
          onChange={onPick}
        />
      </div>
    </div>
  )
}
