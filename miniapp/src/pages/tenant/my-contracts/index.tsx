/**
 * 租客 / 业主「我的合同」签署页（开放签风格：签署配置栏 + 文档区）。
 *
 * 列出当前用户可见的合同（contractsApi.list：本人作为签署方或挂在本人租约下）。
 * 详情以竖向「签署配置栏(上) + 文档区(下)」呈现：
 *  配置栏含签署方列表 / 签署方式分段（指定位置·关键字）/ 印章·签名资产库 / 签署意愿验证码；
 *  文档区用 PDF 页图叠加本人的签署框，点按本人未签签署框即选中为签署对象，
 *  提交前完成二次验证（signCode → sign 带 code）。
 * 文本走 i18n 三语。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, Image, Input, Canvas } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { contractsApi, signAssetsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import useAuthStore from '@/stores/auth'
import { useI18n } from '@/i18n'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '-')

// 后端 ContractStatus / ContractSource 文案映射（key 需在 i18n 三语有值）
const STATUS_META: Record<string, string> = {
  draft: 'contract.status.draft',
  sent: 'contract.status.sent',
  partially_signed: 'contract.status.partially_signed',
  signed: 'contract.status.signed',
  rejected: 'contract.status.rejected',
  voided: 'contract.status.voided',
  completed: 'contract.status.completed'
}

const SOURCE_META: Record<string, string> = {
  generated: 'contract.sourceGenerated',
  uploaded: 'contract.sourceUploaded'
}

const ROLE_META: Record<string, string> = {
  landlord: 'contract.roleLandlord',
  owner: 'contract.roleLandlord',
  tenant: 'contract.roleTenant',
  witness: 'contract.roleWitness',
  agent: 'contract.roleAgent'
}

// 签署区类型（法大大风格：手写 / 公章 / 日期）
const FIELD_TYPE_META: Record<string, string> = {
  signature: 'contract.field.signature',
  seal: 'contract.field.seal',
  date: 'contract.field.date'
}

// 页面百分比坐标：非法/越界值回退到默认，防止越界撑爆页图容器（x/y/w/h 均为页面百分比 0-100）
const pct = (v: any, min: number, max: number, def: number) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

const isRealNameError = (e: any) =>
  typeof e?.message === 'string' && e.message.toUpperCase().includes('REAL_NAME_REQUIRED')

export default function MyContractsPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [signing, setSigning] = useState(false)
  // PDF 页图预览：pdf_available 为真时以页图作为签署画布
  const [pdfAvailable, setPdfAvailable] = useState(false)
  const [pdfNumPages, setPdfNumPages] = useState(0)
  const [fieldPage, setFieldPage] = useState(1)

  // ===== 开放签「签署配置栏 + 文档区」 =====
  const [signMode, setSignMode] = useState<'position' | 'keyword'>('position')
  const [selFieldId, setSelFieldId] = useState('')
  const [kwHits, setKwHits] = useState<any[]>([])
  const [kwHitCount, setKwHitCount] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [kwBusy, setKwBusy] = useState(false)

  // ===== 签署意愿二次验证 =====
  const [intentCode, setIntentCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [codeBusy, setCodeBusy] = useState(false)

  // ===== 拒签 =====
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineBusy, setDeclineBusy] = useState(false)

  // ===== 签名资产库（本人可复用） =====
  const [assets, setAssets] = useState<any[]>([])
  const [showSealMaker, setShowSealMaker] = useState(false)
  const [sealMakerBusy, setSealMakerBusy] = useState(false)
  // 印章制作：模板制作（系统生成公章）/ 上传实章（印模抠图）并列切换
  const [sealMakerMode, setSealMakerMode] = useState<'template' | 'imprint'>('template')
  const [companyName, setCompanyName] = useState('')
  const [middleText, setMiddleText] = useState('测试印章')
  const [generatedSeal, setGeneratedSeal] = useState('')
  const [genSealBusy, setGenSealBusy] = useState(false)
  const [showSigDraw, setShowSigDraw] = useState(false)
  const [assetBusyId, setAssetBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await contractsApi.list()
      const d = unwrap(res)
      const items: any[] = Array.isArray(d) ? d : d?.items || []
      setList(items)
    } catch (error) {
      console.error('[MyContracts] 获取合同失败', error)
      Taro.showToast({ title: t('contract.loadFail'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [t])

  useDidShow(() => {
    void load()
  })

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res: any = await contractsApi.get(id)
      const d = unwrap(res)
      setDetail({ ...d, content_html: d.content_html || '' })
      setPdfAvailable(!!d?.pdf_available)
      setPdfNumPages(Number(d?.pdf_page_count) || 0)
      setSelFieldId('')
      refreshAssets()
    } catch (error) {
      console.error('[MyContracts] 加载合同失败', error)
      Taro.showToast({ title: t('contract.loadFail'), icon: 'none' })
    } finally {
      setDetailLoading(false)
    }
  }

  const isSelfParty = (p: any) =>
    String(p?.user_id ?? '') === String(user?.id ?? '') ||
    String(p?.email ?? '').toLowerCase() === String(user?.email ?? '').toLowerCase()

  // 当前用户对应的签署方（可能有多个，取第一个匹配项）
  const myParty = Array.isArray(detail?.parties)
    ? detail.parties.find((p: any) => isSelfParty(p)) || null
    : null

  // 本人生效、且未签署的签署区
  const myFields = Array.isArray(detail?.sign_fields)
    ? detail.sign_fields.filter((f: any) => String(f?.party_id) === String(myParty?.id))
    : []
  const pendingMyFields = myFields.filter((f: any) => !f?.signed)
  const activeField =
    pendingMyFields.find((f: any) => String(f?.id) === String(selFieldId)) || pendingMyFields[0] || null
  const allMineSigned = myFields.length > 0 && pendingMyFields.length === 0
  const alreadySigned = !!myParty?.signed || myParty?.declined_at

  const sealAssets = assets.filter((a: any) => a?.asset_type === 'seal')
  const sigAssets = assets.filter((a: any) => a?.asset_type === 'handwrite')
  const currentSeal = (sealAssets.length ? sealAssets[sealAssets.length - 1] : null) || null
  const currentSig = (sigAssets.length ? sigAssets[sigAssets.length - 1] : null) || null

  const refreshAssets = useCallback(() => {
    signAssetsApi
      .list()
      .then((res: any) => {
        setAssets(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [])
      })
      .catch(() => setAssets([]))
  }, [])

  // 签署意愿二次验证：向本人下发验证码
  const sendIntentCode = async () => {
    if (!detail?.id || !myParty?.id) {
      Taro.showToast({ title: t('contract.partyRequired'), icon: 'none' })
      return
    }
    setCodeBusy(true)
    try {
      await contractsApi.signCode(detail.id, String(myParty.id))
      setCodeSent(true)
      setCodeCooldown(60)
      Taro.showToast({ title: t('contract.codeSentTo'), icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.getCode'), icon: 'none' })
    } finally {
      setCodeBusy(false)
    }
  }

  // 倒计时：让「获取/重新发送」按钮显示剩余秒数
  useEffect(() => {
    if (codeCooldown <= 0) return
    const timer = setTimeout(() => setCodeCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [codeCooldown])

  const resetIntent = () => {
    setIntentCode('')
    setCodeSent(false)
    setCodeCooldown(0)
  }

  const doSign = async () => {
    if (!detail?.id || !activeField?.id || !myParty?.id || signing) return
    const fieldId = String(activeField.id)
    const method = String(activeField.field_type || 'signature')
    if (!intentCode.trim() || !codeSent) {
      Taro.showToast({ title: t('contract.sendCodeFirst'), icon: 'none' })
      return
    }
    setSigning(true)
    try {
      await contractsApi.sign(detail.id, { fieldId, method, code: intentCode.trim(), partyId: String(myParty.id) })
      Taro.showToast({ title: t('contract.signDone'), icon: 'success' })
      resetIntent()
      await openDetail(detail.id)
      await load()
    } catch (e: any) {
      if (isRealNameError(e)) {
        Taro.showToast({ title: t('contract.realNameRequired'), icon: 'none' })
      } else {
        Taro.showToast({ title: e?.message || t('contract.confirmSignCode'), icon: 'none' })
      }
    } finally {
      setSigning(false)
    }
  }

  // 关键字签署（可选）：按命中在文档建字段后再签
  const doKeywordSearch = async () => {
    if (!detail?.id || !keyword.trim()) {
      Taro.showToast({ title: t('contract.searchKeyword'), icon: 'none' })
      return
    }
    setKwBusy(true)
    try {
      const res: any = await contractsApi.keywordSearch(detail.id, keyword.trim())
      const d = unwrap(res)
      const hits: any[] = Array.isArray(d?.hits) ? d.hits : []
      setKwHits(hits)
      setKwHitCount(Number(d?.count) || hits.length)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.searchKeyword'), icon: 'none' })
    } finally {
      setKwBusy(false)
    }
  }

  // ===== 拒签（本人） =====
  const openDecline = () => {
    setDeclineReason('')
    setShowDecline(true)
  }

  const doDecline = async () => {
    if (!detail?.id || !myParty?.id) {
      Taro.showToast({ title: t('contract.partyRequired'), icon: 'none' })
      return
    }
    if (!declineReason.trim()) {
      Taro.showToast({ title: t('contract.declineReasonRequired'), icon: 'none' })
      return
    }
    setDeclineBusy(true)
    try {
      await contractsApi.decline(detail.id, String(myParty.id), declineReason.trim())
      Taro.showToast({ title: t('contract.declineDone'), icon: 'none' })
      setShowDecline(false)
      await openDetail(detail.id)
      await load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.decline'), icon: 'none' })
    } finally {
      setDeclineBusy(false)
    }
  }

  // ===== 签名资产：制作印章 / 手写签名 =====
  const makeSeal = () => {
    Taro.chooseImage({ count: 1, sizeType: ['original'], sourceType: ['album', 'camera'] }).then(async (res) => {
      const path = res?.tempFilePaths?.[0]
      if (!path) return
      setSealMakerBusy(true)
      try {
        const fs: any = Taro.getFileSystemManager()
        const b64 = await new Promise<string>((resolve, reject) =>
          fs.readFile({ filePath: path, encoding: 'base64', success: (r: any) => resolve(r?.data || ''), fail: reject })
        )
        await signAssetsApi.imprint({ name: `seal-${Date.now()}`, image_base64: b64 })
        Taro.showToast({ title: t('contract.imprintDone'), icon: 'success' })
        setShowSealMaker(false)
        await refreshAssets()
      } catch (e: any) {
        Taro.showToast({ title: e?.message || t('contract.imprintStamp'), icon: 'none' })
      } finally {
        setSealMakerBusy(false)
      }
    })
  }

  // 模板制作：调后端生成章图并预览
  const generateTemplateSeal = async () => {
    if (!companyName.trim()) {
      Taro.showToast({ title: t('contract.companyNameRequired'), icon: 'none' })
      return
    }
    setGenSealBusy(true)
    try {
      const res: any = await signAssetsApi.generateSeal({
        name: `seal-${Date.now()}`,
        company_name: companyName.trim(),
        middle_text: middleText.trim() || '测试印章',
        size: 300
      })
      const d = unwrap(res)
      const url = d?.data_url || ''
      if (!url) {
        Taro.showToast({ title: t('contract.generateSealFailed'), icon: 'none' })
        return
      }
      setGeneratedSeal(url)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.generateSealFailed'), icon: 'none' })
    } finally {
      setGenSealBusy(false)
    }
  }

  // 使用生成的模板章：写入签名库并设为当前签署用章
  const useGeneratedSeal = async () => {
    if (!generatedSeal) return
    setGenSealBusy(true)
    try {
      await signAssetsApi.create({
        name: `seal-${Date.now()}`,
        asset_type: 'seal',
        source: 'drew',
        data_url: generatedSeal
      })
      Taro.showToast({ title: t('contract.assetSaved'), icon: 'success' })
      setShowSealMaker(false)
      await refreshAssets()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.saveToLibrary'), icon: 'none' })
    } finally {
      setGenSealBusy(false)
    }
  }

  // 手写签名：按笔画记录（速度加权 1~4px 线宽）+ 单笔撤销 / 整面重写
  const sigStrokes = useRef<{ pts: { x: number; y: number }[]; w: number }[]>([])
  const sigCur = useRef<{ pts: { x: number; y: number }[]; dist: number; count: number } | null>(null)

  const sigDrawStart = (e: any) => {
    const tt = e?.touches?.[0]
    sigCur.current = { pts: [{ x: tt?.x ?? 0, y: tt?.y ?? 0 }], dist: 0, count: 0 }
    const ctx = Taro.createCanvasContext('mcSignCanvas')
    ctx.setStrokeStyle('#1f2937')
    ctx.setLineWidth(4)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    ctx.beginPath()
    ctx.moveTo(sigCur.current.pts[0].x, sigCur.current.pts[0].y)
    ctx.stroke()
    ctx.draw(true)
  }

  const sigDrawMove = (e: any) => {
    const tt = e?.touches?.[0]
    if (!tt || !sigCur.current) return
    const last = sigCur.current.pts[sigCur.current.pts.length - 1]
    // 累计位移与采样数 → 抬手时折算速度加权线宽
    sigCur.current.dist += Math.hypot(tt.x - last.x, tt.y - last.y)
    sigCur.current.count += 1
    sigCur.current.pts.push({ x: tt.x, y: tt.y })
    const ctx = Taro.createCanvasContext('mcSignCanvas')
    ctx.setStrokeStyle('#1f2937')
    ctx.setLineWidth(4)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    ctx.lineTo(tt.x, tt.y)
    ctx.stroke()
    ctx.draw(true)
  }

  const sigDrawEnd = () => {
    if (!sigCur.current) return
    const { dist, count } = sigCur.current
    const avgSpeed = count > 0 ? dist / count : 0
    const w = Math.min(4, Math.max(1, 4 - avgSpeed * 0.15)) // 快=细、慢=粗
    sigStrokes.current.push({ pts: sigCur.current.pts, w })
    sigCur.current = null
  }

  // 整面按笔画重绘（撤销后重建）
  const redrawSig = () => {
    const ctx = Taro.createCanvasContext('mcSignCanvas')
    ctx.clearRect(0, 0, 2000, 1000)
    sigStrokes.current.forEach((s) => {
      if (!s.pts.length) return
      ctx.setStrokeStyle('#1f2937')
      ctx.setLineCap('round')
      ctx.setLineJoin('round')
      ctx.setLineWidth(s.w)
      ctx.beginPath()
      ctx.moveTo(s.pts[0].x, s.pts[0].y)
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y)
      ctx.stroke()
    })
    ctx.draw(true)
  }

  const undoSigCanvas = () => {
    if (!sigStrokes.current.length) return
    sigStrokes.current.pop()
    sigCur.current = null
    redrawSig()
  }

  const clearSigCanvas = () => {
    sigStrokes.current = []
    sigCur.current = null
    const ctx = Taro.createCanvasContext('mcSignCanvas')
    ctx.clearRect(0, 0, 2000, 1000)
    ctx.draw()
  }

  const saveSig = () => {
    Taro.canvasToTempFilePath({ canvasId: 'mcSignCanvas' })
      .then((res: any) => {
        const path = res?.tempFilePath
        if (!path) return
        const fs: any = Taro.getFileSystemManager()
        fs.readFile({ filePath: path, encoding: 'base64', success: (fi: any) => {
          const b64 = fi?.data || ''
          signAssetsApi
            .create({ name: `sig-${Date.now()}`, asset_type: 'handwrite', source: 'drew', data_url: `data:image/png;base64,${b64}` })
            .then(() => {
              Taro.showToast({ title: t('contract.assetSaved'), icon: 'success' })
              setShowSigDraw(false)
              refreshAssets()
            })
            .catch((e: any) => Taro.showToast({ title: e?.message || t('contract.saveToLibrary'), icon: 'none' }))
        }, fail: () => {} })
      })
      .catch(() => {})
  }

  const removeAsset = async (aid: string) => {
    setAssetBusyId(aid)
    try {
      await signAssetsApi.remove(aid)
      Taro.showToast({ title: t('contract.assetSaved'), icon: 'success' })
      await refreshAssets()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.removeAsset'), icon: 'none' })
    } finally {
      setAssetBusyId(null)
    }
  }

  const canSign = !!activeField?.id && !alreadySigned && !allMineSigned
  const docFields = Array.isArray(detail?.sign_fields)
    ? detail.sign_fields.filter((f: any) => pct(f?.page, 1, pdfNumPages, 1) === fieldPage)
    : []

  const fieldLabel = (f: any) => {
    const mine = String(f?.party_id) === String(myParty?.id)
    if (f?.signed) return t('contract.signed')
    if (mine) return String(f?.id) === String(activeField?.id) ? t('contract.signSelf') : t('contract.tapToSign')
    return '-'
  }

  return (
    <View className='mc-page'>
      <ShellHeader title={t('contract.my')} />

      {detail ? (
        /* ===== 详情：签署配置栏 + 文档区 ===== */
        <View className='mc-wrap'>
          <ScrollView scrollY className='mc-scroll'>
            {detailLoading && !detail?.parties ? (
              <StateBlock loading text={t('pub.loading')} />
            ) : (
              <View>
                <View className='mc-card'>
                  <View className='mc-card__top'>
                    <Text className='mc-card__title'>{detail?.title || t('contract.unknown')}</Text>
                    <Text className={`mc-badge ${
                      detail?.status === 'signed' || detail?.status === 'completed'
                        ? 'mc-badge--success'
                        : detail?.status === 'voided' || detail?.status === 'rejected'
                          ? 'mc-badge--error'
                          : 'mc-badge--warning'
                    }`}>
                      {t(STATUS_META[detail?.status || 'draft'])}
                    </Text>
                  </View>
                  <View className='mc-card__meta'>
                    <Text className='mc-badge mc-badge--primary'>
                      {t(SOURCE_META[detail?.source || ''] || 'contract.sourceGenerated')}
                    </Text>
                  </View>
                  <View className='mc-card__divider' />
                  <View className='mc-card__row'>
                    <Text className='mc-card__row-label'>{t('contract.kind')}</Text>
                    <Text className='mc-card__row-value'>{detail?.kind || '-'}</Text>
                  </View>
                  <View className='mc-card__row'>
                    <Text className='mc-card__row-label'>{t('contract.created_at')}</Text>
                    <Text className='mc-card__row-value'>{fmtDate(detail?.created_at)}</Text>
                  </View>
                </View>

                {/* ===== 签署配置栏（上） ===== */}
                <View className='mc-config'>
                  <Text className='mc-config__title'>{t('contract.configTitle')}</Text>

                  {/* 1. 签署方列表（本人高亮） */}
                  <Text className='mc-config__label'>{t('contract.parties')}</Text>
                  {Array.isArray(detail?.parties) && detail.parties.length
                    ? detail.parties.map((p: any, idx: number) => {
                        const isSelf = isSelfParty(p)
                        const st = p?.signed
                          ? 'mc-badge--success'
                          : p?.declined_at
                            ? 'mc-badge--error'
                            : 'mc-badge--warning'
                        const stt = p?.signed
                          ? t('contract.signed')
                          : p?.declined_at
                            ? t('contract.declined')
                            : t('contract.unsigned')
                        return (
                          <View key={p?.id ?? idx} className={`mc-party ${isSelf ? 'mc-party--active' : ''}`}>
                            <View className='mc-party__main'>
                              <Text className='mc-party__name'>{p?.name || t('contract.unknown')}</Text>
                              <Text className='mc-party__role'>
                                {p?.role ? t(ROLE_META[p.role] || 'contract.roleOther') : ''}
                                {isSelf ? ` · ${t('contract.self')}` : ''}
                              </Text>
                            </View>
                            <Text className={`mc-badge ${st}`}>{stt}</Text>
                          </View>
                        )
                      })
                    : <Text className='mc-config__hint'>{t('contract.empty')}</Text>}

                  {/* 2. 签署方式分段 */}
                  <Text className='mc-config__label'>{t('contract.fieldType')}</Text>
                  <View className='mc-seg'>
                    <View
                      className={`mc-seg__item ${signMode === 'position' ? 'mc-seg__item--active' : ''}`}
                      onClick={() => { setSignMode('position'); setSelFieldId('') }}
                    >
                      <Text className={`mc-seg__text ${signMode === 'position' ? 'mc-seg__text--active' : ''}`}>
                        {t('contract.positionSign')}
                      </Text>
                    </View>
                    <View
                      className={`mc-seg__item ${signMode === 'keyword' ? 'mc-seg__item--active' : ''}`}
                      onClick={() => { setSignMode('keyword'); setKwHits([]); setKwHitCount(0) }}
                    >
                      <Text className={`mc-seg__text ${signMode === 'keyword' ? 'mc-seg__text--active' : ''}`}>
                        {t('contract.keywordSign')}
                      </Text>
                    </View>
                  </View>

                  {/* 3. 印章 / 签名资产块 */}
                  <Text className='mc-config__label'>{t('contract.mySeal')}</Text>
                  {currentSeal ? (
                    <View className='mc-asset-line'>
                      <Image className='mc-asset-thumb' src={currentSeal?.data_url} mode='aspectFit' />
                      <Text className='mc-asset-name'>{currentSeal?.name || '-'}</Text>
                      <View className='mc-config__row' style={{ marginLeft: 'auto' }}>
                        <View className='mc-btn mc-btn--ghost' onClick={() => setShowSealMaker(true)}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.chgAsset')}</Text>
                        </View>
                        <View className={`mc-btn mc-btn--ghost ${assetBusyId === currentSeal?.id ? 'mc-btn--disabled' : ''}`} onClick={() => { if (currentSeal?.id && assetBusyId !== currentSeal?.id) void removeAsset(String(currentSeal.id)) }}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.removeAsset')}</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View className='mc-assets__empty'>
                      <Text className='mc-config__hint'>{t('contract.sealUnmade')}</Text>
                      <View className='mc-btn mc-btn--ghost' onClick={() => setShowSealMaker(true)}>
                        <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.makeSeal')}</Text>
                      </View>
                    </View>
                  )}

                  <Text className='mc-config__label'>{t('contract.mySignature')}</Text>
                  {currentSig ? (
                    <View className='mc-asset-line'>
                      <Image className='mc-asset-thumb' src={currentSig?.data_url} mode='aspectFit' />
                      <Text className='mc-asset-name'>{currentSig?.name || '-'}</Text>
                      <View className='mc-config__row' style={{ marginLeft: 'auto' }}>
                        <View className='mc-btn mc-btn--ghost' onClick={() => setShowSigDraw(true)}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.chgAsset')}</Text>
                        </View>
                        <View className={`mc-btn mc-btn--ghost ${assetBusyId === currentSig?.id ? 'mc-btn--disabled' : ''}`} onClick={() => { if (currentSig?.id && assetBusyId !== currentSig?.id) void removeAsset(String(currentSig.id)) }}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.removeAsset')}</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View className='mc-assets__empty'>
                      <Text className='mc-config__hint'>{t('contract.sealUnmade')}</Text>
                      <View className='mc-btn mc-btn--ghost' onClick={() => setShowSigDraw(true)}>
                        <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.drawSignature')}</Text>
                      </View>
                    </View>
                  )}

                  {showSealMaker && (
                    <View className='mc-maker'>
                      <Text className='mc-config__label'>{t('contract.makeSeal')}</Text>

                      <View className='mc-seg' style={{ marginBottom: '12rpx' }}>
                        <View
                          className={`mc-seg__item ${sealMakerMode === 'template' ? 'mc-seg__item--active' : ''}`}
                          onClick={() => setSealMakerMode('template')}
                        >
                          <Text className={`mc-seg__text ${sealMakerMode === 'template' ? 'mc-seg__text--active' : ''}`}>
                            {t('contract.sealMakeTemplate')}
                          </Text>
                        </View>
                        <View
                          className={`mc-seg__item ${sealMakerMode === 'imprint' ? 'mc-seg__item--active' : ''}`}
                          onClick={() => setSealMakerMode('imprint')}
                        >
                          <Text className={`mc-seg__text ${sealMakerMode === 'imprint' ? 'mc-seg__text--active' : ''}`}>
                            {t('contract.sealMakeImprint')}
                          </Text>
                        </View>
                      </View>

                      {sealMakerMode === 'template' ? (
                        <View>
                          <Text className='mc-config__label'>{t('contract.companyName')}</Text>
                          <Input
                            className='mc-kw__input'
                            placeholder={t('contract.companyNamePlaceholder')}
                            value={companyName}
                            onInput={(e: any) => setCompanyName(e.detail.value)}
                          />
                          <Text className='mc-config__label'>{t('contract.middleText')}</Text>
                          <Input
                            className='mc-kw__input'
                            placeholder={t('contract.middleTextPlaceholder')}
                            value={middleText}
                            onInput={(e: any) => setMiddleText(e.detail.value)}
                          />
                          <Text className='mc-config__label'>{t('contract.sealStyle')}</Text>
                          <Text className='mc-seal-style'>{t('contract.sealStyleOfficial')}</Text>
                          <View className='mc-config__row' style={{ marginTop: '12rpx' }}>
                            <View className={`mc-btn mc-btn--ghost ${genSealBusy ? 'mc-btn--disabled' : ''}`} onClick={() => { if (!genSealBusy) void generateTemplateSeal() }}>
                              <Text className='mc-btn__text mc-btn__text--ghost'>{genSealBusy ? t('pub.loading') : t('contract.generateSeal')}</Text>
                            </View>
                          </View>
                          {generatedSeal ? (
                            <View className='mc-config__row' style={{ marginTop: '12rpx' }}>
                              <Image className='mc-asset-thumb mc-seal-preview' src={generatedSeal} mode='aspectFit' />
                              <View className={`mc-btn mc-btn--ghost ${genSealBusy ? 'mc-btn--disabled' : ''}`} onClick={() => { if (!genSealBusy) void useGeneratedSeal() }}>
                                <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.useThisSeal')}</Text>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <View className='mc-config__row'>
                          <View className={`mc-btn mc-btn--ghost ${sealMakerBusy ? 'mc-btn--disabled' : ''}`} onClick={() => { if (!sealMakerBusy) makeSeal() }}>
                            <Text className='mc-btn__text mc-btn__text--ghost'>{sealMakerBusy ? t('pub.loading') : t('contract.uploadSeal')}</Text>
                          </View>
                        </View>
                      )}

                      <View className='mc-config__row' style={{ marginTop: '12rpx' }}>
                        <View className='mc-btn mc-btn--ghost' onClick={() => setShowSealMaker(false)}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('common.back')}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {showSigDraw && (
                    <View className='mc-maker'>
                      <Text className='mc-config__label'>{t('contract.drawSignature')}</Text>
                      <View className='mc-signbox'>
                        <Canvas
                          canvasId='mcSignCanvas'
                          id='mcSignCanvas'
                          className='mc-signbox__canvas'
                          onTouchStart={sigDrawStart}
                          onTouchMove={sigDrawMove}
                          onTouchEnd={sigDrawEnd}
                        />
                      </View>
                      <View className='mc-config__row'>
                        <View className='mc-btn mc-btn--ghost' onClick={undoSigCanvas}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.undoSign')}</Text>
                        </View>
                        <View className='mc-btn mc-btn--ghost' onClick={clearSigCanvas}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.clear')}</Text>
                        </View>
                        <View className='mc-btn mc-btn--ghost' onClick={saveSig}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.saveToLibrary')}</Text>
                        </View>
                        <View className='mc-btn mc-btn--ghost' onClick={() => setShowSigDraw(false)}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('common.back')}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 4. 关键字模式 */}
                  {signMode === 'keyword' && (
                    <View className='mc-kw'>
                      <Text className='mc-config__label'>{t('contract.searchKeyword')}</Text>
                      <View className='mc-config__row'>
                        <Input
                          className='mc-kw__input'
                          value={keyword}
                          placeholder={t('contract.keywordPlaceholder')}
                          onInput={(e: any) => setKeyword(e.detail.value)}
                        />
                        <View className={`mc-btn mc-btn--ghost ${kwBusy ? 'mc-btn--disabled' : ''}`} onClick={() => { if (!kwBusy) void doKeywordSearch() }}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.search')}</Text>
                        </View>
                      </View>
                      {kwHitCount > 0 && <Text className='mc-config__hint'>{t('contract.keywordHit', { n: kwHitCount })}</Text>}
                      {kwHits.map((h: any, idx: number) => (
                        <View key={idx} className='mc-kw__hit'>
                          <Text className='mc-kw__hit-page'>{t('contract.hitOnPage', { page: h?.page ?? 1 })}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* 5. 签署意愿验证码 */}
                  {canSign && (
                    <View className='mc-verify'>
                      <Text className='mc-config__label'>{t('contract.verifyCode')}</Text>
                      <Text className='mc-config__hint'>{t('contract.verifyDesc')}</Text>
                      {!myParty?.real_name_verified && (
                        <Text className='mc-config__hint mc-config__hint--warn'>{t('contract.realNameRequired')}</Text>
                      )}
                      <View className='mc-config__row'>
                        <Input
                          className='mc-kw__input'
                          placeholder={t('contract.codePlaceholder')}
                          value={intentCode}
                          onInput={(e: any) => setIntentCode(e.detail.value)}
                        />
                        <View className={`mc-btn mc-btn--ghost ${codeBusy || codeCooldown > 0 ? 'mc-btn--disabled' : ''}`} onClick={() => { if (!codeBusy && codeCooldown <= 0) void sendIntentCode() }}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>
                            {codeCooldown > 0
                              ? t('contract.codeCooldown', { n: codeCooldown })
                              : (codeSent ? t('contract.resendCode') : t('contract.getCode'))}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {!myParty && detail?.parties && detail.parties.length > 0 ? (
                    <Text className='mc-config__hint mc-config__hint--warn'>{t('contract.self')}</Text>
                  ) : null}
                </View>

                {/* ===== 文档区（下） ===== */}
                <View className='mc-doc'>
                  <View className='mc-doc__head'>
                    <Text className='mc-doc__title'>{t('contract.docArea')}</Text>
                    {pdfNumPages > 1 && (
                      <View className='mc-config__row'>
                        <View className={`mc-btn mc-btn--ghost ${fieldPage <= 1 ? 'mc-btn--disabled' : ''}`} onClick={() => { if (fieldPage > 1) setFieldPage((p) => p - 1) }}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.prevPage')}</Text>
                        </View>
                        <View className={`mc-btn mc-btn--ghost ${fieldPage >= pdfNumPages ? 'mc-btn--disabled' : ''}`} onClick={() => { if (fieldPage < pdfNumPages) setFieldPage((p) => p + 1) }}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.nextPage')}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                  {pdfAvailable && pdfNumPages > 0 ? (
                    <View className='mc-doc__canvas'>
                      <Image className='mc-doc__img' src={contractsApi.pdfPageUrl(detail.id, fieldPage)} mode='widthFix' />
                      {docFields.map((f: any, idx: number) => {
                        const mine = String(f?.party_id) === String(myParty?.id)
                        const clickable = mine && !f?.signed && !alreadySigned
                        return (
                          <View
                            key={f?.id ?? idx}
                            className={`mc-doc__field ${mine ? 'mc-doc__field--mine' : ''} ${f?.signed ? 'mc-doc__field--done' : ''} ${String(f?.id) === String(activeField?.id) ? 'mc-doc__field--active' : ''}`}
                            style={{
                              left: `${pct(f?.x, 0, 100, 8)}%`,
                              top: `${pct(f?.y, 0, 100, 40)}%`,
                              width: `${pct(f?.w, 2, 100, 16)}%`,
                              height: `${pct(f?.h, 1, 100, 5)}%`
                            }}
                            onClick={() => { if (clickable) { setSelFieldId(String(f?.id)); setSignMode('position') } }}
                          >
                            <Text className='mc-doc__field-label'>{fieldLabel(f)}</Text>
                          </View>
                        )
                      })}
                    </View>
                  ) : (
                    !!detail?.content_html && (
                      <View className='mc-doc__text'>
                        <Text userSelect>{String(detail.content_html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')}</Text>
                      </View>
                    )
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* ===== 底部主按钮 + 拒签 ===== */}
          <View className='mc-footer'>
            {myParty && !alreadySigned && pendingMyFields.length > 0 && (
              <View className={`mc-btn mc-btn--ghost mc-footer__decline ${declineBusy ? 'mc-btn--disabled' : ''}`} onClick={() => { if (!declineBusy) openDecline() }}>
                <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.decline')}</Text>
              </View>
            )}
            <View
              className={`mc-sign ${allMineSigned ? 'mc-sign--done' : ''} ${!canSign ? 'mc-sign--disabled' : ''}`}
              onClick={() => {
                if (allMineSigned) {
                  Taro.showToast({ title: t('contract.completedToast'), icon: 'none' })
                  return
                }
                if (canSign) void doSign()
              }}
            >
              <Text className='mc-sign__text'>
                {allMineSigned
                  ? t('contract.completedToast')
                  : signing
                    ? t('contract.signing')
                    : (canSign ? t('contract.signSelf') : t('contract.tapToSign'))}
              </Text>
              {allMineSigned && (
                <View className='icon-svg' style={{ ...iconStyle('check', 30), marginLeft: '4rpx' }} />
              )}
            </View>
          </View>
        </View>
      ) : (
        /* ===== 列表 ===== */
        <View>
          <View className='mc-head'>
            <Text className='mc-head__title'>{t('contract.my')}</Text>
            <Text className='mc-head__desc'>{t('contract.myEmptyHint')}</Text>
          </View>
          {loading ? (
            <StateBlock loading text={t('pub.loading')} />
          ) : list.length === 0 ? (
            <View className='mc-state'>
              <View className='icon-svg' style={iconStyle('doc', 72)} />
              <Text className='mc-state__text'>{t('contract.empty')}</Text>
              <Text className='mc-state__desc'>{t('contract.myEmptyHint')}</Text>
            </View>
          ) : (
            list.map((c: any) => (
              <View key={c.id} className='mc-card' onClick={() => openDetail(c.id)}>
                <View className='mc-card__top'>
                  <Text className='mc-card__title'>{c.title || t('contract.unknown')}</Text>
                  <Text className={`mc-badge ${c.status === 'signed' || c.status === 'completed' ? 'mc-badge--success' : c.status === 'voided' || c.status === 'rejected' ? 'mc-badge--error' : 'mc-badge--warning'}`}>
                    {t(STATUS_META[c.status || 'draft'])}
                  </Text>
                </View>
                <View className='mc-card__meta'>
                  <Text className='mc-badge mc-badge--primary'>
                    {t(SOURCE_META[c.source || ''] || 'contract.sourceGenerated')}
                  </Text>
                </View>
                <View className='mc-card__divider' />
                <View className='mc-card__row'>
                  <Text className='mc-card__row-label'>{t('contract.created_at')}</Text>
                  <Text className='mc-card__row-value'>{fmtDate(c.created_at)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* ===== 拒签弹层 ===== */}
      {showDecline && (
        <View className='mc-mask' onClick={() => { if (!declineBusy) setShowDecline(false) }}>
          <View className='mc-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='mc-sheet__head'>
              <Text className='mc-sheet__title'>{t('contract.declineTitle')}</Text>
              <View className='mc-sheet__close' onClick={() => { if (!declineBusy) setShowDecline(false) }}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
            <Text className='mc-sheet__hint'>{t('contract.declineConfirm')}</Text>
            <View className='mc-sheet__verify'>
              <Input
                className='mc-verify-input'
                placeholder={t('contract.declineReasonRequired')}
                value={declineReason}
                onInput={(e: any) => setDeclineReason(e.detail.value)}
              />
            </View>
            <View className={`mc-sheet__submit ${declineBusy ? 'mc-sheet__submit--busy' : ''}`} onClick={() => { if (!declineBusy) void doDecline() }}>
              <Text className='mc-sheet__submit-text'>{declineBusy ? t('pub.loading') : t('contract.decline')}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}