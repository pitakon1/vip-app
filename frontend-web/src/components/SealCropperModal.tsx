import { useEffect, useRef } from 'react'
import { Modal } from 'antd'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  src: string
  title?: string
  onOk: (dataUrl: string) => void
  onCancel: () => void
}

/** 印模上传前裁剪弹窗：将真章扫描图裁成 400×400 正方形（可旋转 ±90°、可缩放）。
    onOk 回调输出裁剪后的 PNG data:image/png;base64 数据 URL（调用方自行去掉前缀后交 imprint 接口）。 */
const SealCropperModal = ({ open, src, title, onOk, onCancel }: Props) => {
  const { t } = useTranslation()
  const imgRef = useRef<HTMLImageElement>(null)
  const cropperRef = useRef<Cropper | null>(null)

  useEffect(() => {
    if (!open || !imgRef.current || !src) return
    const cropper = new Cropper(imgRef.current, {
      aspectRatio: 1,
      viewMode: 1,
      responsive: true,
      autoCropArea: 0.9,
      movable: true,
      rotatable: true,
      zoomable: true,
    })
    cropperRef.current = cropper
    return () => {
      cropper.destroy()
      cropperRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, src])

  const confirm = () => {
    const c = cropperRef.current
    if (!c) return
    onOk(
      c
        .getCroppedCanvas({ width: 400, height: 400 })
        .toDataURL('image/png'),
    )
  }

  return (
    <Modal
      open={open}
      title={title || t('contracts.cropSeal')}
      okText={t('contracts.cropConfirm')}
      cancelText={t('common.cancel')}
      onOk={confirm}
      onCancel={onCancel}
      width={520}
    >
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => cropperRef.current?.rotate(-90)}>{t('contracts.rotateLeft')}</button>
        <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => cropperRef.current?.rotate(90)}>{t('contracts.rotateRight')}</button>
        <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => cropperRef.current?.zoom(0.1)}>{t('contracts.zoomIn')}</button>
        <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => cropperRef.current?.zoom(-0.1)}>{t('contracts.zoomOut')}</button>
      </div>
      <div style={{ background: '#111', borderRadius: 8, overflow: 'hidden' }}>
        <img ref={imgRef} src={src || undefined} alt={t('contracts.cropSeal')} style={{ maxWidth: '100%', display: 'block' }} />
      </div>
    </Modal>
  )
}

export default SealCropperModal