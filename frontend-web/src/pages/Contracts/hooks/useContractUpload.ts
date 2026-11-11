﻿/**
 * 上传电子合同的状态与动作。
 * 纯结构拆分自 pages/Contracts/index.tsx：先 generate 建记录再挂文件的两步流程保持不变。
 */
import { useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { contractsApi } from '@/services/api'
import { errorText } from '@/lib/errorText'

export function useContractUpload({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useTranslation()

  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 上传电子合同
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPendingFile(f)
  }

  const handleUploadConfirm = async () => {
    if (!pendingFile) return
    setUploading(true)
    try {
      // 后端 /contracts/{id}/upload 只给「已存在」的合同挂载文件，且无「仅建空合同」端点。
      // 因此先借 generate 建一条合同记录（title 取文件名），再把文件挂上去标为 uploaded。
      const genRes: any = await contractsApi.generate({
        language: 'zh',
        counters: { title: pendingFile.name.replace(/\.[^.]+$/, '') },
      })
      const cid = genRes?.data?.id
      if (!cid) throw new Error('no contract id')
      const upRes: any = await contractsApi.uploadFile(cid, pendingFile)
      // 上传件转 PDF 失败不阻断上传，但要明确提示：否则用户会以为能在 PDF 上落章
      if (upRes?.data?.pdf_converted === false) {
        const code = upRes?.data?.pdf_convert_error
        message.warning(
          code === 'PDF_CONVERT_DISABLED'
            ? t('contracts.pdfConvertDisabled')
            : t('contracts.pdfConvertFailed'),
        )
      }
      message.success(t('contracts.msgUploaded'))
      setPendingFile(null)
      onUploaded()
    } catch (err) {
      message.error(errorText(err, t('contracts.errUpload')))
    } finally {
      setUploading(false)
    }
  }

  return { uploading, pendingFile, setPendingFile, fileInputRef, handleFilePicked, handleUploadConfirm }
}

export type ContractUploadState = ReturnType<typeof useContractUpload>
