import { useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { signAssetsApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import { CANVAS_W, CANVAS_H } from '../constants'
import { svgToPngDataUrl } from '../utils'
import type { TrayKind } from '../types'

/** 印章制作 + 手写签名制作的全部状态与操作 */
export const useSignAssets = () => {
  const { t } = useTranslation()

  // 托盘资产：印章（成品 PNG）/ 手写签名（SVG + 光栅化 PNG）
  const [seal, setSeal] = useState<{ dataUrl: string } | null>(null)
  const [signature, setSignature] = useState<{ svg: string; png: string } | null>(null)

  // 印章制作弹窗（模板生成 / 印模上传）
  const [sealModalOpen, setSealModalOpen] = useState(false)
  const [sealCreateType, setSealCreateType] = useState<'template' | 'imprint'>('template')
  const [sealCompanyName, setSealCompanyName] = useState('')
  const [sealMiddleText, setSealMiddleText] = useState(t('contracts.sealMiddleTextDefault'))
  const [sealPreview, setSealPreview] = useState('')
  const [sealGenerating, setSealGenerating] = useState(false)
  const [sealCropOpen, setSealCropOpen] = useState(false)
  const [sealCropSrc, setSealCropSrc] = useState('')
  const sealFileRef = useRef<HTMLInputElement>(null)

  // 手写签名制作弹窗（复用 SignCanvas + SVG→PNG 光栅化）
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signDraft, setSignDraft] = useState('')
  const [signRasterizing, setSignRasterizing] = useState(false)

  // ===== 印章制作：上传图片 → 裁剪弹窗 → 成品章图 =====
  const onSealFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      setSealCropSrc(String(r.result || ''))
      setSealCropOpen(true)
    }
    r.readAsDataURL(f)
  }

  const onSealCropOk = (dataUrl: string) => {
    setSeal({ dataUrl })
    setSealCropOpen(false)
    setSealModalOpen(false)
  }

  const onGenerateSealPreview = async () => {
    if (!sealCompanyName.trim()) {
      message.warning(t('contracts.sealCompanyRequired'))
      return
    }
    setSealGenerating(true)
    try {
      const res: any = await signAssetsApi.generateSeal({
        company_name: sealCompanyName.trim(),
        middle_text: sealMiddleText.trim() || t('contracts.sealMiddleTextDefault'),
      })
      const dataUrl = res?.data?.data_url
      if (!dataUrl) {
        message.error(t('contracts.errGenericSubmit'))
        return
      }
      setSealPreview(dataUrl)
    } catch (err) {
      message.error(errorText(err, t('contracts.errGenericSubmit')))
    } finally {
      setSealGenerating(false)
    }
  }

  const usePreviewSeal = () => {
    if (!sealPreview) return
    setSeal({ dataUrl: sealPreview })
    setSealModalOpen(false)
  }

  // ===== 手写签名制作：SignCanvas → SVG 光栅化 PNG =====
  const openSignModal = () => {
    setSignDraft(signature?.svg || '')
    setSignModalOpen(true)
  }

  const onSignModalOk = async () => {
    if (!signDraft.trim()) {
      message.warning(t('contracts.blankSign'))
      return
    }
    setSignRasterizing(true)
    try {
      const png = await svgToPngDataUrl(signDraft, CANVAS_W, CANVAS_H)
      setSignature({ svg: signDraft, png })
      setSignModalOpen(false)
    } catch {
      message.error(t('contracts.errGenericSubmit'))
    } finally {
      setSignRasterizing(false)
    }
  }

  const openMake = (kind: TrayKind) => {
    if (kind === 'seal') setSealModalOpen(true)
    else openSignModal()
  }

  return {
    seal,
    signature,
    sealModalOpen,
    setSealModalOpen,
    sealCreateType,
    setSealCreateType,
    sealCompanyName,
    setSealCompanyName,
    sealMiddleText,
    setSealMiddleText,
    sealPreview,
    sealGenerating,
    sealCropOpen,
    setSealCropOpen,
    sealCropSrc,
    sealFileRef,
    signModalOpen,
    setSignModalOpen,
    signDraft,
    setSignDraft,
    signRasterizing,
    onSealFile,
    onSealCropOk,
    onGenerateSealPreview,
    usePreviewSeal,
    onSignModalOk,
    openMake,
  }
}
