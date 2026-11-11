﻿/**
 * 「我的签名 / 印章」资产库状态与上传处理。
 * 纯结构拆分自 pages/Contracts/index.tsx：印模裁剪入库与手写直传两种流程保持不变。
 */
import { useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { signAssetsApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import { errorText } from '@/lib/errorText'
import type { SignAsset } from '../contractTypes'

// 与企业印章库后端权限一致：仅员工（admin/agent/employee）可用 company scope
const COMPANY_SCOPE_ROLES = ['admin', 'agent', 'employee']

export function useSignAssets() {
  const { t } = useTranslation()
  const role = useAuthStore((s) => s.user?.role)
  const canUseCompanyScope = COMPANY_SCOPE_ROLES.includes(String(role || ''))

  const [sigLibOpen, setSigLibOpen] = useState(false)
  const [sigAssets, setSigAssets] = useState<SignAsset[]>([])
  const [sigAssetType, setSigAssetType] = useState('handwrite')
  const [sigScope, setSigScope] = useState<'personal' | 'company'>('personal')
  // 企业印章类别：company=公章 / contract=合同章 / legal_rep=法人章（仅企业库有意义）
  const [sigSealType, setSigSealType] = useState('company')
  const [sigAssetName, setSigAssetName] = useState('')
  const [sigUploading, setSigUploading] = useState(false)
  // 印模的裁剪弹窗状态
  const [sealCropOpen, setSealCropOpen] = useState(false)
  const [sealCropSrc, setSealCropSrc] = useState('')
  const sigFileRef = useRef<HTMLInputElement>(null)

  // 签名资产库：载入列表（按当前 scope：个人 / 企业印章库）
  const loadSignAssets = (scope: 'personal' | 'company' = sigScope) => {
    signAssetsApi
      .list({ scope })
      .then((res) => setSigAssets(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSigAssets([]))
  }

  const openSigLib = (type: string = 'handwrite') => {
    // 企业印章库只有「印章」一种资产类型
    const nextType = sigScope === 'company' ? 'seal' : type
    setSigAssetType(nextType)
    setSigAssetName('')
    loadSignAssets(sigScope)
    setSigLibOpen(true)
  }

  // 切换个人 / 企业印章库：企业库仅印章，切换后重新拉取该 scope 的资产
  const changeScope = (scope: 'personal' | 'company') => {
    if (scope === 'company' && !canUseCompanyScope) return
    setSigScope(scope)
    if (scope === 'company') {
      setSigAssetType('seal')
      setSigSealType('company')
    }
    loadSignAssets(scope)
  }

  // 处理签名资产上传：seal → 先打开裁剪弹窗；handwrite → 直接保存 data_url
  const handleSigFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (sigAssetType === 'seal') {
      // 印模：读取为 data_url，先进入裁剪弹窗
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result || ''))
        r.onerror = reject
        r.readAsDataURL(f)
      })
      setSealCropSrc(dataUrl)
      setSealCropOpen(true)
      return
    }
    const name = sigAssetName.trim() || (sigAssetType === 'seal' ? t('contracts.mySeal') : t('contracts.mySign'))
    setSigUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result || ''))
        r.onerror = reject
        r.readAsDataURL(f)
      })
      await signAssetsApi.create({ name, asset_type: 'handwrite', source: 'upload', data_url: dataUrl, scope: 'personal' })
      message.success(t('contracts.sigSaved'))
      setSigAssetName('')
      loadSignAssets()
    } catch (err) {
      message.error(errorText(err, t('contracts.sigSaveFail')))
    } finally {
      setSigUploading(false)
    }
  }

  // 印模裁剪确认：裁剪出的 data_url 去掉 data: 前缀得 raw base64 → 交给透明度抠图接口入库
  const onSealCropOk = async (dataUrl: string) => {
    const imageBase64 = dataUrl.substring(dataUrl.indexOf(',') + 1)
    setSealCropOpen(false)
    const name = sigAssetName.trim() || t('contracts.mySeal')
    setSigUploading(true)
    try {
      await signAssetsApi.imprint({
        name,
        image_base64: imageBase64,
        scope: sigScope,
        // 仅企业印章库需要类别；个人印模后端一律按空处理
        seal_type: sigScope === 'company' ? sigSealType : undefined,
      })
      message.success(t('contracts.sigSaved'))
      setSigAssetName('')
      loadSignAssets()
    } catch (err) {
      message.error(errorText(err, t('contracts.sigSaveFail')))
    } finally {
      setSigUploading(false)
    }
  }

  const handleSigRemove = (asset: SignAsset) => {
    signAssetsApi
      .remove(asset.id)
      .then(() => {
        setSigAssets((prev) => prev.filter((a) => a.id !== asset.id))
        message.success(t('contracts.sigRemoved'))
      })
      .catch((err) => message.error(errorText(err, t('contracts.sigSaveFail'))))
  }

  const sigAssetTypeLabel = (t2: string) =>
    t2 === 'seal' ? t('contracts.mySeal') : t('contracts.mySign')
  const sigSourceLabel = (s: string) =>
    s === 'imprint' ? t('contracts.srcImprint') : s === 'upload' ? t('contracts.srcUpload') : t('contracts.srcDrew')

  return {
    sigLibOpen,
    setSigLibOpen,
    sigAssets,
    sigAssetType,
    setSigAssetType,
    sigScope,
    setSigScope: changeScope,
    sigSealType,
    setSigSealType,
    canUseCompanyScope,
    sigAssetName,
    setSigAssetName,
    sigUploading,
    sealCropOpen,
    setSealCropOpen,
    sealCropSrc,
    sigFileRef,
    loadSignAssets,
    openSigLib,
    handleSigFile,
    onSealCropOk,
    handleSigRemove,
    sigAssetTypeLabel,
    sigSourceLabel,
  }
}

export type SignAssetsState = ReturnType<typeof useSignAssets>
