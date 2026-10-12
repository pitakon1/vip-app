import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, Image, Input, Canvas } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { contractsApi, signAssetsApi } from '@/services/api'
import { iconStyle } from '@/utils/icons'
import { useI18n } from '@/i18n'
import ShellHeader from '@/components/ShellHeader'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

// 页面百分比坐标：非法/越界值回退到默认，防止越界撑爆页图容器（x/y/w/h 均为页面百分比 0-100）
const pct = (v: any, min: number, max: number, def: number) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

const ROLE_META: Record<string, string> = {
  landlord: 'contract.roleLandlord',
  owner: 'contract.roleLandlord',
  tenant: 'contract.roleTenant',
  witness: 'contract.roleWitness',
  agent: 'contract.roleAgent'
}

const FIELD_TYPE_META: Record<string, string> = {
  signature: 'contract.field.signature',
  seal: 'contract.field.seal',
  date: 'contract.field.date'
}

const FIELD_TYPES = ['signature', 'seal', 'date'] as const

export default function StaffContractPage() {
  const { t } = useI18n()
  const router = useRouter()
  const id = router.params?.id || ''
  const [contract, setContract] = useState<any>(null)
  const [loading, setLoading] = useState(!!id)
  const [signing, setSigning] = useState(false)
  // PDF 页图预览：pdf_available 为真时以页图作为签署画布
  const [pdfAvailable, setPdfAvailable] = useState(false)
  const [pdfNumPages, setPdfNumPages] = useState(0)
  const [fieldPage, setFieldPage] = useState(1)
  // ===== 开放签「拖拽克隆落框」：待放置签署域 / 已落框移动（百分比坐标，界面不显示裸坐标） =====
  const [mark, setMark] = useState<{ x: string; y: string }>({ x: '', y: '' })
  const [placing, setPlacing] = useState(false)
  const [dragField, setDragField] = useState<{ id: string; x: number; y: number } | null>(null)
  const [fieldBusy, setFieldBusy] = useState(false)
  const canvasRectRef = useRef<any>(null)
  const workGestureRef = useRef<{ type: 'place' | 'move'; id?: string; start: { x: number; y: number } } | null>(null)

  // ===== 开放签「签署配置栏 + 文档区」 =====
  const [signMode, setSignMode] = useState<'position' | 'keyword'>('position')
  const [signFieldType, setSignFieldType] = useState<string>('signature')
  const [selFieldId, setSelFieldId] = useState('')
  const [kwHits, setKwHits] = useState<any[]>([])
  const [kwHitCount, setKwHitCount] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [kwBusy, setKwBusy] = useState(false)
  const [kwPlacing, setKwPlacing] = useState(false)

  // ===== 签署意愿二次验证 =====
  const [intentCode, setIntentCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [codeBusy, setCodeBusy] = useState(false)

  // ===== 拒签（经纪人本人） =====
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineBusy, setDeclineBusy] = useState(false)

  // ===== 签名资产库（经纪人本人可复用） =====
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

  useEffect(() => {
    if (codeCooldown <= 0) return
    const timer = setTimeout(() => setCodeCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [codeCooldown])

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    contractsApi
      .get(id)
      .then((res: any) => {
        const d = unwrap(res)
        setContract({ ...d, content_html: d.content_html || '' })
        setPdfAvailable(!!d?.pdf_available)
        setPdfNumPages(Number(d?.pdf_page_count) || 0)
      })
      .catch((err) => {
        console.error('[Contract] 加载合同失败', err)
        Taro.showToast({ title: t('lease.contractLoadFailed'), icon: 'none' })
      })
      .finally(() => setLoading(false))
  }, [id])

  useDidShow(() => {
    load()
    refreshAssets()
  })

  // 本人作为经纪人签署（role=agent 的签署方）
  const agentParty = Array.isArray(contract?.parties)
    ? contract.parties.find((p: any) => p.role === 'agent')
    : null
  const signed = !!agentParty?.signed

  // 经纪人在本合同上待签署的签署区（按 field 逐项签署）
  const agentFields = Array.isArray(contract?.sign_fields)
    ? contract.sign_fields.filter(
        (f: any) => String(f?.party_id) === String(agentParty?.id) && !f?.signed
      )
    : []
  const activeField =
    agentFields.find((f: any) => String(f?.id) === String(selFieldId)) || agentFields[0] || null

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

  // 签署意愿二次验证：给本人（agent party）下发验证码
  const sendIntentCode = async () => {
    if (!id || !agentParty?.id) {
      Taro.showToast({ title: t('contract.partyRequired'), icon: 'none' })
      return
    }
    setCodeBusy(true)
    try {
      await contractsApi.signCode(id, String(agentParty.id))
      setCodeSent(true)
      setCodeCooldown(60)
      Taro.showToast({ title: t('contract.codeSentTo'), icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.getCode'), icon: 'none' })
    } finally {
      setCodeBusy(false)
    }
  }

  const resetIntent = () => {
    setIntentCode('')
    setCodeSent(false)
    setCodeCooldown(0)
  }

  const handleSign = async () => {
    if (!agentParty || signed || signing || !activeField?.id) return
    if (!intentCode.trim() || !codeSent) {
      Taro.showToast({ title: t('contract.sendCodeFirst'), icon: 'none' })
      return
    }
    setSigning(true)
    try {
      await contractsApi.sign(id, {
        fieldId: String(activeField.id),
        method: String(activeField.field_type || 'signature'),
        code: intentCode.trim(),
        partyId: String(agentParty.id)
      })
      Taro.showToast({ title: t('lease.signSuccess'), icon: 'success' })
      resetIntent()
      load()
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('lease.signFailed'), icon: 'none' })
    } finally {
      setSigning(false)
    }
  }

  // 关键字签署：按命中 index 建字段（经纪人本人落框后再签）
  const doKeywordSearch = async () => {
    if (!id || !keyword.trim()) {
      Taro.showToast({ title: t('contract.searchKeyword'), icon: 'none' })
      return
    }
    setKwBusy(true)
    try {
      const res: any = await contractsApi.keywordSearch(id, keyword.trim())
      const d = unwrap(res)
      const hits: any[] = Array.isArray(d?.hits) ? d.hits : []
      setKwHits(hits)
      setKwHitCount(Number(d?.count) || hits.length)
      if (!hits.length) Taro.showToast({ title: t('contract.noKeywordMatch'), icon: 'none' })
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.searchKeyword'), icon: 'none' })
    } finally {
      setKwBusy(false)
    }
  }

  const placeKeywordField = async (idx: number) => {
    if (!id || !agentParty?.id) {
      Taro.showToast({ title: t('contract.partyRequired'), icon: 'none' })
      return
    }
    setKwPlacing(true)
    try {
      await contractsApi.keywordFields(id, {
        keyword: keyword.trim(),
        party_id: String(agentParty.id),
        field_type: signFieldType,
        index: idx
      })
      Taro.showToast({ title: t('contract.fieldPlaced'), icon: 'success' })
      load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.createField'), icon: 'none' })
    } finally {
      setKwPlacing(false)
    }
  }

  // 拒签
  const openDecline = () => {
    setDeclineReason('')
    setShowDecline(true)
  }

  const doDecline = async () => {
    if (!id || !agentParty?.id) {
      Taro.showToast({ title: t('contract.partyRequired'), icon: 'none' })
      return
    }
    if (!declineReason.trim()) {
      Taro.showToast({ title: t('contract.declineReasonRequired'), icon: 'none' })
      return
    }
    setDeclineBusy(true)
    try {
      await contractsApi.decline(id, String(agentParty.id), declineReason.trim())
      Taro.showToast({ title: t('contract.declineDone'), icon: 'none' })
      setShowDecline(false)
      load()
      setTimeout(() => Taro.navigateBack(), 800)
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
    const ctx = Taro.createCanvasContext('ctSignCanvas')
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
    const ctx = Taro.createCanvasContext('ctSignCanvas')
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
    const ctx = Taro.createCanvasContext('ctSignCanvas')
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
    const ctx = Taro.createCanvasContext('ctSignCanvas')
    ctx.clearRect(0, 0, 2000, 1000)
    ctx.draw()
  }

  const saveSig = () => {
    Taro.canvasToTempFilePath({ canvasId: 'ctSignCanvas' })
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

  const canSign = !signed && !!agentParty && !agentParty?.declined_at && !!activeField?.id

  const docFields = Array.isArray(contract?.sign_fields)
    ? contract.sign_fields.filter((f: any) => pct(f?.page, 1, pdfNumPages, 1) === fieldPage)
    : []

  const selfFieldLabel = (f: any) =>
    f?.signed
      ? t('contract.signed')
      : String(f?.party_id) === String(agentParty?.id)
        ? (String(f?.id) === String(activeField?.id) ? t('contract.signSelf') : t('contract.tapToSign'))
        : '-'

  // ===== 开放签拖拽克隆落框：触点 → 画布内页面百分比 =====
  const measureDocCanvas = () =>
    new Promise<any>((resolve) => {
      const pageInstance = Taro.getCurrentInstance()?.page
      const q = pageInstance
        ? Taro.createSelectorQuery().in(pageInstance as any)
        : Taro.createSelectorQuery()
      q.select('#ct-signfield-canvas').boundingClientRect((rect: any) => resolve(rect)).exec()
    })

  const pctFromTouch = (touch: any, rect: any) => {
    if (!rect || !rect.width || !rect.height || touch?.pageX == null) return null
    return {
      x: Math.max(0, Math.min(100, ((touch.pageX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((touch.pageY - rect.top) / rect.height) * 100))
    }
  }

  const fieldContains = (f: any, pt: { x: number; y: number }) => {
    const x = Number.parseFloat(String(f?.x))
    const y = Number.parseFloat(String(f?.y))
    const w = Number.parseFloat(String(f?.w ?? 16))
    const h = Number.parseFloat(String(f?.h ?? 5))
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    return pt.x >= x - 2 && pt.x <= x + w + 2 && pt.y >= y - 2 && pt.y <= y + h + 2
  }

  // 按下：命中本人未签签署框→拖动；否则开始放置新的「待放置签署域」（本人）
  const onPlaceStart = async (e: any) => {
    setMark({ x: '', y: '' })
    setDragField(null)
    if (signMode !== 'position' || !agentParty?.id || !signFieldType) return
    const touch = e?.touches?.[0] || e?.changedTouches?.[0]
    if (!touch) return
    const rect = await measureDocCanvas()
    canvasRectRef.current = rect
    const pt = pctFromTouch(touch, rect)
    if (!pt) return
    const mine = docFields.find(
      (f) => String(f?.party_id) === String(agentParty?.id) && !f?.signed && fieldContains(f, pt)
    )
    if (mine?.id) {
      workGestureRef.current = { type: 'move', id: String(mine.id), start: pt }
      setDragField({ id: String(mine.id), x: Number(pt.x.toFixed(1)), y: Number(pt.y.toFixed(1)) })
    } else {
      workGestureRef.current = { type: 'place', start: pt }
      setPlacing(true)
      setMark({ x: pt.x.toFixed(1), y: pt.y.toFixed(1) })
    }
  }

  const onPlaceMove = (e: any) => {
    const g = workGestureRef.current
    if (!g) return
    const touch = e?.touches?.[0] || e?.changedTouches?.[0]
    if (!touch) return
    const pt = pctFromTouch(touch, canvasRectRef.current)
    if (!pt) return
    if (g.type === 'place') {
      setMark({ x: pt.x.toFixed(1), y: pt.y.toFixed(1) })
    } else if (g.type === 'move' && g.id) {
      setDragField({ id: g.id, x: Number(pt.x.toFixed(1)), y: Number(pt.y.toFixed(1)) })
    }
  }

  // 松手：放置→新建本人签署框（无 id=新增）；拖动→带 id 更新坐标
  const onPlaceEnd = async (e: any) => {
    const g = workGestureRef.current
    workGestureRef.current = null
    const touch = e?.changedTouches?.[0] || e?.touches?.[0]
    const pt = pctFromTouch(touch, canvasRectRef.current)
    if (g?.type === 'place') {
      setPlacing(false)
      setMark({ x: '', y: '' })
      if (pt) await createOwnField(pt.x, pt.y)
      return
    }
    setDragField(null)
    if (g?.type === 'move' && g.id && pt) {
      const f = docFields.find((x) => String(x?.id) === g.id)
      const moved = Math.hypot(pt.x - g.start.x, pt.y - g.start.y) > 0.5
      if (f && moved) await moveOwnField(f, pt.x, pt.y)
    }
  }

  // 新建本人签署框（POST /sign-fields 无 id = 新增）
  const createOwnField = async (x: number, y: number) => {
    if (!id || !agentParty?.id || !signFieldType) return
    setFieldBusy(true)
    try {
      await contractsApi.saveSignFields(id, [
        {
          party_id: String(agentParty.id),
          field_type: signFieldType,
          page: fieldPage,
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          w: signFieldType === 'date' ? 16 : 24,
          h: signFieldType === 'date' ? 3 : 5,
          required: true
        }
      ])
      Taro.showToast({ title: t('contract.fieldSaved'), icon: 'success' })
      setPlacing(false)
      load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.saveFields'), icon: 'none' })
    } finally {
      setFieldBusy(false)
    }
  }

  // 拖动已落框本人签署框位置（POST /sign-fields 带 id = 更新坐标）
  const moveOwnField = async (f: any, x: number, y: number) => {
    if (!id || !f?.id) return
    setFieldBusy(true)
    try {
      await contractsApi.saveSignFields(id, [
        {
          id: String(f.id),
          party_id: f?.party_id ?? String(agentParty?.id),
          field_type: f?.field_type || signFieldType,
          page: fieldPage,
          x: Number(x.toFixed(1)),
          y: Number(y.toFixed(1)),
          w: f?.w,
          h: f?.h,
          required: f?.required !== false
        }
      ])
      Taro.showToast({ title: t('contract.fieldSaved'), icon: 'success' })
      setDragField(null)
      load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.saveFields'), icon: 'none' })
    } finally {
      setFieldBusy(false)
    }
  }

  // 删除已落框本人签署框（DELETE /sign-fields/{id}）
  const deleteOwnField = async (fid: string) => {
    if (!id) return
    setFieldBusy(true)
    try {
      await contractsApi.deleteSignField(id, String(fid))
      Taro.showToast({ title: t('contract.fieldRemoved'), icon: 'none' })
      load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.deleteField'), icon: 'none' })
    } finally {
      setFieldBusy(false)
    }
  }

  return (
    <View className='ct-page'>
      <ShellHeader title={t('nav.contract')} />
      {loading && !contract ? (
        <View className='ct-state'><Text className='ct-state__text'>{t('pub.loading')}</Text></View>
      ) : (
        <View className='ct-wrap'>
          <ScrollView scrollY className='ct-scroll'>
            <View className='ct-head'>
              <Text className='ct-head__title'>{contract?.title || t('lease.contractFallback')}</Text>
              <View className={`ct-badge ${signed ? 'ct-badge--ok' : 'ct-badge--warn'}`}>
                <Text className='ct-badge__text'>{signed ? t('lease.signed') : t('lease.pendingSign')}</Text>
              </View>
            </View>

            {/* ===== 签署配置栏（上） ===== */}
            <View className='ct-config'>
              <Text className='ct-config__title'>{t('contract.configTitle')}</Text>

              {/* 1. 签署方列表（当前方高亮）+ 拒签 */}
              <Text className='ct-config__label'>{t('contract.parties')}</Text>
              {(Array.isArray(contract?.parties) ? contract.parties : []).map((p: any, idx: number) => {
                const isAgent = String(p?.id) === String(agentParty?.id)
                const st = p?.signed
                  ? 'ct-badge--ok'
                  : p?.declined_at
                    ? 'ct-badge--err'
                    : 'ct-badge--warn'
                const stt = p?.signed
                  ? t('contract.signed')
                  : p?.declined_at
                    ? t('contract.declined')
                    : t('contract.unsigned')
                return (
                  <View key={p?.id ?? idx} className={`ct-party ${isAgent ? 'ct-party--active' : ''}`}>
                    <View className='ct-party__main'>
                      <Text className='ct-party__name'>{p?.name || t('contract.unknown')}</Text>
                      <Text className='ct-party__role'>
                        {p?.role ? t(ROLE_META[p.role] || 'contract.roleOther') : ''}
                        {isAgent ? ` · ${t('contract.self')}` : ''}
                      </Text>
                    </View>
                    <View className={`ct-badge ${st}`}>
                      <Text className='ct-badge__text'>{stt}</Text>
                    </View>
                  </View>
                )
              })}
              {!signed && agentParty && !agentParty?.declined_at ? (
                <View className='ct-config__row'>
                  <View className={`ct-btn ${declineBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!declineBusy) openDecline() }}>
                    <Text className='ct-btn__text ct-btn__text--danger'>{t('contract.decline')}</Text>
                  </View>
                </View>
              ) : null}

              {/* 2. 签署方式分段切换 */}
              <Text className='ct-config__label'>{t('contract.fieldType')}</Text>
              <View className='ct-seg'>
                <View
                  className={`ct-seg__item ${signMode === 'position' ? 'ct-seg__item--active' : ''}`}
                  onClick={() => { setSignMode('position'); setSelFieldId('') }}
                >
                  <Text className={`ct-seg__text ${signMode === 'position' ? 'ct-seg__text--active' : ''}`}>
                    {t('contract.positionSign')}
                  </Text>
                </View>
                <View
                  className={`ct-seg__item ${signMode === 'keyword' ? 'ct-seg__item--active' : ''}`}
                  onClick={() => { setSignMode('keyword'); setKwHits([]); setKwHitCount(0) }}
                >
                  <Text className={`ct-seg__text ${signMode === 'keyword' ? 'ct-seg__text--active' : ''}`}>
                    {t('contract.keywordSign')}
                  </Text>
                </View>
              </View>

              {/* 3. 印章 / 签名资产块 */}
              <View className='ct-assets'>
                <Text className='ct-config__label'>{t('contract.mySeal')}</Text>
                {currentSeal ? (
                  <View className='ct-asset-line'>
                    <Image className='ct-asset-thumb' src={currentSeal?.data_url} mode='aspectFit' />
                    <Text className='ct-asset-name'>{currentSeal?.name || '-'}</Text>
                    <View className='ct-config__row' style={{ marginLeft: 'auto' }}>
                      <View className='ct-btn' onClick={() => setShowSealMaker(true)}>
                        <Text className='ct-btn__text'>{t('contract.chgAsset')}</Text>
                      </View>
                      <View className={`ct-btn ${assetBusyId === currentSeal?.id ? 'ct-btn--disabled' : ''}`} onClick={() => { if (currentSeal?.id && assetBusyId !== currentSeal?.id) void removeAsset(String(currentSeal.id)) }}>
                        <Text className='ct-btn__text'>{t('contract.removeAsset')}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className='ct-assets__empty'>
                    <Text className='ct-assets__hint'>{t('contract.sealUnmade')}</Text>
                    <View className='ct-btn' onClick={() => setShowSealMaker(true)}>
                      <Text className='ct-btn__text'>{t('contract.makeSeal')}</Text>
                    </View>
                  </View>
                )}

                <Text className='ct-config__label'>{t('contract.mySignature')}</Text>
                {currentSig ? (
                  <View className='ct-asset-line'>
                    <Image className='ct-asset-thumb' src={currentSig?.data_url} mode='aspectFit' />
                    <Text className='ct-asset-name'>{currentSig?.name || '-'}</Text>
                    <View className='ct-config__row' style={{ marginLeft: 'auto' }}>
                      <View className='ct-btn' onClick={() => setShowSigDraw(true)}>
                        <Text className='ct-btn__text'>{t('contract.chgAsset')}</Text>
                      </View>
                      <View className={`ct-btn ${assetBusyId === currentSig?.id ? 'ct-btn--disabled' : ''}`} onClick={() => { if (currentSig?.id && assetBusyId !== currentSig?.id) void removeAsset(String(currentSig.id)) }}>
                        <Text className='ct-btn__text'>{t('contract.removeAsset')}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className='ct-assets__empty'>
                    <Text className='ct-assets__hint'>{t('contract.sealUnmade')}</Text>
                    <View className='ct-btn' onClick={() => setShowSigDraw(true)}>
                      <Text className='ct-btn__text'>{t('contract.drawSignature')}</Text>
                    </View>
                  </View>
                )}
              </View>

              {showSealMaker && (
                <View className='ct-maker'>
                  <Text className='ct-maker__title'>{t('contract.makeSeal')}</Text>

                  {/* 制作方式切换：模板制作 / 上传实章 */}
                  <View className='ct-seg' style={{ marginBottom: '12rpx' }}>
                    <View
                      className={`ct-seg__item ${sealMakerMode === 'template' ? 'ct-seg__item--active' : ''}`}
                      onClick={() => setSealMakerMode('template')}
                    >
                      <Text className={`ct-seg__text ${sealMakerMode === 'template' ? 'ct-seg__text--active' : ''}`}>
                        {t('contract.sealMakeTemplate')}
                      </Text>
                    </View>
                    <View
                      className={`ct-seg__item ${sealMakerMode === 'imprint' ? 'ct-seg__item--active' : ''}`}
                      onClick={() => setSealMakerMode('imprint')}
                    >
                      <Text className={`ct-seg__text ${sealMakerMode === 'imprint' ? 'ct-seg__text--active' : ''}`}>
                        {t('contract.sealMakeImprint')}
                      </Text>
                    </View>
                  </View>

                  {sealMakerMode === 'template' ? (
                    <View>
                      <Text className='ct-config__label'>{t('contract.companyName')}</Text>
                      <Input
                        className='ct-kw__input'
                        placeholder={t('contract.companyNamePlaceholder')}
                        value={companyName}
                        onInput={(e: any) => setCompanyName(e.detail.value)}
                      />
                      <Text className='ct-config__label'>{t('contract.middleText')}</Text>
                      <Input
                        className='ct-kw__input'
                        placeholder={t('contract.middleTextPlaceholder')}
                        value={middleText}
                        onInput={(e: any) => setMiddleText(e.detail.value)}
                      />
                      <Text className='ct-config__label'>{t('contract.sealStyle')}</Text>
                      <Text className='ct-seal-style'>{t('contract.sealStyleOfficial')}</Text>
                      <View className='ct-config__row' style={{ marginTop: '12rpx' }}>
                        <View className={`ct-btn ${genSealBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!genSealBusy) void generateTemplateSeal() }}>
                          <Text className='ct-btn__text'>{genSealBusy ? t('pub.loading') : t('contract.generateSeal')}</Text>
                        </View>
                      </View>
                      {generatedSeal ? (
                        <View className='ct-config__row' style={{ marginTop: '12rpx' }}>
                          <Image className='ct-asset-thumb ct-seal-preview' src={generatedSeal} mode='aspectFit' />
                          <View className={`ct-btn ${genSealBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!genSealBusy) void useGeneratedSeal() }}>
                            <Text className='ct-btn__text'>{t('contract.useThisSeal')}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View className='ct-config__row'>
                      <View className={`ct-btn ${sealMakerBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!sealMakerBusy) makeSeal() }}>
                        <Text className='ct-btn__text'>{sealMakerBusy ? t('pub.loading') : t('contract.uploadSeal')}</Text>
                      </View>
                    </View>
                  )}

                  <View className='ct-config__row' style={{ marginTop: '12rpx' }}>
                    <View className='ct-btn' onClick={() => setShowSealMaker(false)}>
                      <Text className='ct-btn__text'>{t('common.back')}</Text>
                    </View>
                  </View>
                </View>
              )}

              {showSigDraw && (
                <View className='ct-maker'>
                  <Text className='ct-maker__title'>{t('contract.drawSignature')}</Text>
                  <View className='ct-signbox'>
                    <Canvas
                      canvasId='ctSignCanvas'
                      id='ctSignCanvas'
                      className='ct-signbox__canvas'
                      onTouchStart={sigDrawStart}
                      onTouchMove={sigDrawMove}
                      onTouchEnd={sigDrawEnd}
                    />
                  </View>
                  <View className='ct-config__row'>
                    <View className='ct-btn' onClick={undoSigCanvas}>
                      <Text className='ct-btn__text'>{t('contract.undoSign')}</Text>
                    </View>
                    <View className='ct-btn' onClick={clearSigCanvas}>
                      <Text className='ct-btn__text'>{t('contract.clear')}</Text>
                    </View>
                    <View className='ct-btn' onClick={saveSig}>
                      <Text className='ct-btn__text'>{t('contract.saveToLibrary')}</Text>
                    </View>
                    <View className='ct-btn' onClick={() => setShowSigDraw(false)}>
                      <Text className='ct-btn__text'>{t('common.back')}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* 4. 关键字模式 */}
              {signMode === 'keyword' && (
                <View className='ct-kw'>
                  <Text className='ct-config__label'>{t('contract.searchKeyword')}</Text>
                  <View className='ct-config__row'>
                    <Input
                      className='ct-kw__input'
                      value={keyword}
                      placeholder={t('contract.keywordPlaceholder')}
                      onInput={(e: any) => setKeyword(e.detail.value)}
                    />
                    <View className={`ct-btn ${kwBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!kwBusy) void doKeywordSearch() }}>
                      <Text className='ct-btn__text'>{t('contract.search')}</Text>
                    </View>
                  </View>
                  {kwHitCount > 0 && <Text className='ct-config__hint'>{t('contract.keywordHit', { n: kwHitCount })}</Text>}
                  {kwHits.map((h: any, idx: number) => (
                    <View key={idx} className='ct-kw__hit'>
                      <Text className='ct-kw__hit-page'>{t('contract.hitOnPage', { page: h?.page ?? 1 })}</Text>
                      <View className={`ct-btn ${kwPlacing ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!kwPlacing) void placeKeywordField(idx) }}>
                        <Text className='ct-btn__text'>{t('contract.createField')}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* 5. 签署意愿验证码 */}
              {canSign && (
                <View className='ct-verify'>
                  <Text className='ct-config__label'>{t('contract.verifyCode')}</Text>
                  <Text className='ct-config__hint'>{t('contract.verifyDesc')}</Text>
                  <View className='ct-config__row'>
                    <Input
                      className='ct-kw__input'
                      placeholder={t('contract.codePlaceholder')}
                      value={intentCode}
                      onInput={(e: any) => setIntentCode(e.detail.value)}
                    />
                    <View className={`ct-btn ${codeBusy || codeCooldown > 0 ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!codeBusy && codeCooldown <= 0) void sendIntentCode() }}>
                      <Text className='ct-btn__text'>
                        {codeCooldown > 0
                          ? t('contract.codeCooldown', { n: codeCooldown })
                          : (codeSent ? t('contract.resendCode') : t('contract.getCode'))}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* ===== 文档区（下） ===== */}
            <View className='ct-doc'>
              <View className='ct-doc__head'>
                <Text className='ct-doc__title'>{t('contract.docArea')}</Text>
                {pdfNumPages > 1 && (
                  <View className='ct-config__row'>
                    <View className={`ct-btn ${fieldPage <= 1 ? 'ct-btn--disabled' : ''}`} onClick={() => { if (fieldPage > 1) setFieldPage((p) => p - 1) }}>
                      <Text className='ct-btn__text'>{t('contract.prevPage')}</Text>
                    </View>
                    <View className={`ct-btn ${fieldPage >= pdfNumPages ? 'ct-btn--disabled' : ''}`} onClick={() => { if (fieldPage < pdfNumPages) setFieldPage((p) => p + 1) }}>
                      <Text className='ct-btn__text'>{t('contract.nextPage')}</Text>
                    </View>
                  </View>
                )}
              </View>
              {pdfAvailable && pdfNumPages > 0 ? (
                <View
                  id='ct-signfield-canvas'
                  className='ct-doc__canvas'
                  onTouchStart={onPlaceStart}
                  onTouchMove={onPlaceMove}
                  onTouchEnd={onPlaceEnd}
                >
                  <Image className='ct-doc__img' src={contractsApi.pdfPageUrl(id, fieldPage)} mode='widthFix' />
                  {mark.x !== '' && (
                    <View className='ct-doc__pending' style={{ left: `${mark.x}%`, top: `${mark.y}%` }} />
                  )}
                  {docFields.map((f: any, idx: number) => {
                    const isMine = String(f?.party_id) === String(agentParty?.id) && !f?.signed
                    const dragIt = dragField?.id === String(f?.id)
                    const lx = dragIt ? String(dragField.x) : pct(f?.x, 0, 100, 8)
                    const ly = dragIt ? String(dragField.y) : pct(f?.y, 0, 100, 40)
                    return (
                      <View
                        key={f?.id ?? idx}
                        className={`ct-doc__field ${isMine ? 'ct-doc__field--mine' : ''} ${String(f?.id) === String(activeField?.id) ? 'ct-doc__field--active' : ''} ${dragIt ? 'ct-doc__field--drag' : ''}`}
                        style={{
                          left: `${lx}%`,
                          top: `${ly}%`,
                          width: `${pct(f?.w, 2, 100, 16)}%`,
                          height: `${pct(f?.h, 1, 100, 5)}%`
                        }}
                        onClick={() => {
                          if (isMine) {
                            setSelFieldId(String(f?.id))
                            setSignMode('position')
                          }
                        }}
                      >
                        <Text className='ct-doc__field-label'>{selfFieldLabel(f)}</Text>
                        {isMine && f?.id ? (
                          <View
                            className='ct-doc__field-del'
                            onClick={(ev: any) => { ev.stopPropagation?.(); void deleteOwnField(String(f.id)) }}
                          >
                            <View className='icon-svg' style={iconStyle('close', 20)} />
                          </View>
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              ) : (
                <View className='ct-doc__text'>
                  <Text userSelect>{(contract?.content_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* ===== 底部主按钮 ===== */}
          <View className='ct-footer'>
            <View className={`ct-sign ${signed ? 'ct-sign--done' : ''} ${!canSign ? 'ct-sign--disabled' : ''}`} onClick={ () => {
              if (signed) return
              if (canSign) void handleSign()
            } }>
              <Text className='ct-sign__text'>
                {signed ? t('lease.signed') : signing ? t('lease.signing') : t('lease.signSelf')}
              </Text>
              {signed && (
                <View className='icon-svg' style={{ ...iconStyle('check', 30), marginLeft: '8rpx' }} />
              )}
            </View>
          </View>
        </View>
      )}

      {/* ===== 拒签弹层 ===== */}
      {showDecline && (
        <View className='ct-mask' onClick={() => { if (!declineBusy) setShowDecline(false) }}>
          <View className='ct-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='ct-sheet__head'>
              <Text className='ct-sheet__title'>{t('contract.declineTitle')}</Text>
              <View className='ct-sheet__close' onClick={() => { if (!declineBusy) setShowDecline(false) }}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
            <Text className='ct-sheet__hint'>{t('contract.declineConfirm')}</Text>
            <View className='ct-sheet__block'>
              <Input
                className='ct-verify-input'
                placeholder={t('contract.declineReasonRequired')}
                value={declineReason}
                onInput={(e: any) => setDeclineReason(e.detail.value)}
              />
            </View>
            <View className={`ct-sheet__submit ${declineBusy ? 'ct-btn--disabled' : ''}`} onClick={() => { if (!declineBusy) void doDecline() }}>
              <Text className='ct-sheet__submit-text'>{declineBusy ? t('pub.loading') : t('contract.decline')}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}