/**
 * 租客 / 业主「我的合同」签署页（开放签 kaifangqian 1:1 风格：单屏签署台）。
 *
 * 单屏结构：文档区（PDF 逐页图 / 合同正文）+「签署方」托盘（电子印章 / 手写签名）。
 *   1) 托盘固定两项；未制作 = 灰态 + 制作按钮，点开制作弹窗；
 *   2) 制作 →「使用」后条目回填缩略图并出现拖拽能力；
 *   3) 从托盘按住拖到文档任意位置，松手在落点渲染成品图；落框可拖动改位、✕ 删除
 *      （坐标仅内部按页面百分比计算，界面不暴露任何裸数字）；
 *   4) 底部【签署】一次性原子提交全部落章项（sign-batch），成功后刷新详情。
 *
 * 已移除独立的「签署意愿验证」发码/输码与「手写画板」「签名库」弹层，能力并入托盘 / 制作弹窗。
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

// 落章方式（后端 method）：电子印章 / 手写签名
type SignMethod = 'company_seal' | 'personal_handwrite'

interface PlacedItem {
  key: string
  method: SignMethod
  page: number
  x: number
  y: number
  w: number
  h: number
  dataUrl: string
  svg?: string
}

// 落框默认尺寸（页面百分比）：公章近方形、手写签名扁长，适配 A4 竖版视觉比例
const ITEM_SIZE: Record<SignMethod, { w: number; h: number }> = {
  company_seal: { w: 18, h: 13 },
  personal_handwrite: { w: 26, h: 10 }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const r2 = (n: number) => Math.round(n * 100) / 100

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

  // ===== 签名资产库（本人可复用） =====
  const [assets, setAssets] = useState<any[]>([])
  // 已制作的手写签名（本地保留 SVG + PNG，拖拽时随落章项一并提交）
  const [sigMadeLocal, setSigMadeLocal] = useState<{ dataUrl: string; svg: string } | null>(null)

  // ===== 制作弹窗：电子印章 =====
  const [showSealMaker, setShowSealMaker] = useState(false)
  const [sealMakerBusy, setSealMakerBusy] = useState(false)
  const [sealMakerMode, setSealMakerMode] = useState<'template' | 'imprint'>('template')
  const [companyName, setCompanyName] = useState('')
  const [middleText, setMiddleText] = useState('测试印章')
  const [generatedSeal, setGeneratedSeal] = useState('')
  const [genSealBusy, setGenSealBusy] = useState(false)

  // ===== 制作弹窗：手写签名 =====
  const [showSigMaker, setShowSigMaker] = useState(false)
  const [sigUseBusy, setSigUseBusy] = useState(false)

  // ===== 印模裁剪：方形选区 + 旋转（选区坐标仅内部计算，界面不显示裸数字） =====
  const [showSealCrop, setShowSealCrop] = useState(false)
  const [sealCropPath, setSealCropPath] = useState('')
  const [sealImgMeta, setSealImgMeta] = useState<{ w: number; h: number }>({ w: 1, h: 1 })
  const [sealRotate, setSealRotate] = useState(0)
  const [sealCropSel, setSealCropSel] = useState<{ x: number; y: number; s: number }>({ x: 0.1, y: 0.1, s: 0.8 })
  const [sealAreaPx, setSealAreaPx] = useState(300)
  const [sealCropBusy, setSealCropBusy] = useState(false)
  const sealCropRectRef = useRef<any>(null)
  const sealCropDragRef = useRef<{ startX: number; startY: number; ox: number; oy: number; s: number } | null>(null)

  // ===== 拖拽落章（托盘 → 文档 / 落框改位） =====
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [movingKey, setMovingKey] = useState('')
  const [overDoc, setOverDoc] = useState(false)
  const [dragGhost, setDragGhost] = useState<{ method: SignMethod; x: number; y: number; dataUrl: string } | null>(null)
  const docRectRef = useRef<any>(null)
  const gestureRef = useRef<
    | { type: 'tray'; method: SignMethod }
    | { type: 'move'; key: string; offX: number; offY: number }
    | null
  >(null)

  // ===== 拒签 =====
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineBusy, setDeclineBusy] = useState(false)

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
      setFieldPage(1)
      setPlacedItems([])
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
  const alreadySigned = !!myParty?.signed || !!myParty?.declined_at

  const sealAssets = assets.filter((a: any) => a?.asset_type === 'seal')
  const sigAssets = assets.filter((a: any) => a?.asset_type === 'handwrite')
  const currentSeal = (sealAssets.length ? sealAssets[sealAssets.length - 1] : null) || null
  const currentSig = (sigAssets.length ? sigAssets[sigAssets.length - 1] : null) || null

  // 托盘两项的成品图（image_data_url）
  const madeSealData = currentSeal?.data_url || ''
  const madeSigData = sigMadeLocal?.dataUrl || currentSig?.data_url || ''

  const refreshAssets = useCallback(() => {
    signAssetsApi
      .list()
      .then((res: any) => {
        setAssets(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [])
      })
      .catch(() => setAssets([]))
  }, [])

  // ===== 文档区尺寸测量（拖拽落点换算为页面百分比） =====
  const measureDoc = () =>
    new Promise<any>((resolve) => {
      const pageInstance = Taro.getCurrentInstance()?.page
      const q = pageInstance
        ? Taro.createSelectorQuery().in(pageInstance as any)
        : Taro.createSelectorQuery()
      q.select('#mcDocCanvas').boundingClientRect((rect: any) => resolve(rect)).exec()
    })

  const pctFromPoint = (pageX: number, pageY: number, rect: any) => {
    if (!rect || !rect.width || !rect.height || pageX == null || pageY == null) return null
    const x = ((pageX - rect.left) / rect.width) * 100
    const y = ((pageY - rect.top) / rect.height) * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return null
    return { x, y }
  }

  // 打开详情 / 翻页后预测量文档区位置（页面布局稳定后再测）
  useEffect(() => {
    if (!detail?.id) return
    const timer = setTimeout(() => {
      void measureDoc().then((rect) => { docRectRef.current = rect })
    }, 400)
    return () => clearTimeout(timer)
  }, [detail?.id, fieldPage, pdfAvailable])

  // ===== 托盘拖拽 → 文档落章 =====
  const trayData = (method: SignMethod) => (method === 'company_seal' ? madeSealData : madeSigData)

  const onTrayTouchStart = (method: SignMethod) => (e: any) => {
    const data = trayData(method)
    if (!data) return
    const touch = e?.touches?.[0] || e?.changedTouches?.[0]
    if (!touch) return
    gestureRef.current = { type: 'tray', method }
    setDragging(true)
    setDragGhost({ method, x: touch.pageX, y: touch.pageY, dataUrl: data })
    void measureDoc().then((rect) => {
      docRectRef.current = rect
      setOverDoc(!!pctFromPoint(touch.pageX, touch.pageY, rect))
    })
  }

  const onTrayTouchMove = (e: any) => {
    const g = gestureRef.current
    if (!g || g.type !== 'tray') return
    const touch = e?.touches?.[0]
    if (!touch) return
    setDragGhost((prev) => (prev ? { ...prev, x: touch.pageX, y: touch.pageY } : prev))
    setOverDoc(!!pctFromPoint(touch.pageX, touch.pageY, docRectRef.current))
  }

  const onTrayTouchEnd = async (e: any) => {
    const g = gestureRef.current
    gestureRef.current = null
    setDragging(false)
    setDragGhost(null)
    setOverDoc(false)
    if (!g || g.type !== 'tray') return
    const touch = e?.changedTouches?.[0] || e?.touches?.[0]
    if (!touch) return
    // 始终重新测量文档区（防止拖拽期间页面滚动导致落点偏移）
    const rect = await measureDoc()
    docRectRef.current = rect
    const pt = pctFromPoint(touch.pageX, touch.pageY, rect)
    if (!pt) return
    addPlaced(g.method, pt.x, pt.y)
  }

  // 在落点渲染成品图（以指尖为落框中心）
  const addPlaced = (method: SignMethod, x: number, y: number) => {
    const data = trayData(method)
    if (!data) return
    const size = ITEM_SIZE[method]
    const item: PlacedItem = {
      key: `${method}-${Date.now()}-${placedItems.length}`,
      method,
      page: fieldPage,
      x: r2(clamp(x - size.w / 2, 0, 100 - size.w)),
      y: r2(clamp(y - size.h / 2, 0, 100 - size.h)),
      w: size.w,
      h: size.h,
      dataUrl: data,
      svg: method === 'personal_handwrite' ? sigMadeLocal?.svg || '' : ''
    }
    setPlacedItems((prev) => [...prev, item])
  }

  // ===== 落框拖动改位 / 删除 =====
  const onItemTouchStart = (key: string) => (e: any) => {
    const touch = e?.touches?.[0]
    const item = placedItems.find((it) => it.key === key)
    if (!touch || !item) return
    const rect = docRectRef.current
    let offX = 0
    let offY = 0
    if (rect?.width && rect?.height) {
      offX = ((touch.pageX - rect.left) / rect.width) * 100 - item.x
      offY = ((touch.pageY - rect.top) / rect.height) * 100 - item.y
    }
    gestureRef.current = { type: 'move', key, offX, offY }
    setMovingKey(key)
    void measureDoc().then((r) => { docRectRef.current = r })
  }

  const onItemTouchMove = (e: any) => {
    const g = gestureRef.current
    if (!g || g.type !== 'move') return
    const touch = e?.touches?.[0]
    if (!touch) return
    const pt = pctFromPoint(touch.pageX, touch.pageY, docRectRef.current)
    if (!pt) return
    setPlacedItems((prev) =>
      prev.map((it) =>
        it.key === g.key
          ? { ...it, x: r2(clamp(pt.x - g.offX, 0, 100 - it.w)), y: r2(clamp(pt.y - g.offY, 0, 100 - it.h)) }
          : it
      )
    )
  }

  const onItemTouchEnd = () => {
    gestureRef.current = null
    setMovingKey('')
  }

  const removePlaced = (key: string) => setPlacedItems((prev) => prev.filter((it) => it.key !== key))

  // ===== 一次性原子提交（sign-batch） =====
  const doSignBatch = async () => {
    if (!detail?.id || !myParty?.id || signing) return
    if (!placedItems.length) {
      Taro.showToast({ title: t('contract.signNeedPlace'), icon: 'none' })
      return
    }
    setSigning(true)
    try {
      const items = placedItems.map((it) => ({
        page: it.page,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        method: it.method,
        ...(it.svg ? { signature_svg: it.svg } : {}),
        ...(it.dataUrl ? { image_data_url: it.dataUrl } : {})
      }))
      await contractsApi.signBatch(detail.id, { party_id: String(myParty.id), items })
      Taro.showToast({ title: t('contract.signDone'), icon: 'success' })
      setPlacedItems([])
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

  // ===== 电子印章制作 =====
  const openSealMaker = () => {
    setGeneratedSeal('')
    setShowSealMaker(true)
  }

  // 印模：选图 → 方形裁剪+旋转 → 导出 base64 → imprint
  const makeSeal = () => {
    Taro.chooseImage({ count: 1, sizeType: ['original'], sourceType: ['album', 'camera'] }).then(async (res) => {
      const path = res?.tempFilePaths?.[0]
      if (!path) return
      try {
        const info = await Taro.getImageInfo({ src: path })
        setSealImgMeta({ w: info?.width || 1, h: info?.height || 1 })
        setSealRotate(0)
        setSealCropPath(path)
        setShowSealCrop(true)
      } catch {
        // 读图失败时回退仍可进入裁剪面板（用默认元数据）
        setSealRotate(0)
        setSealCropPath(path)
        setShowSealCrop(true)
      }
    })
  }

  // 测量裁剪方形框（px），用于展示图与原图坐标换算
  const measureSealCropArea = () =>
    new Promise<any>((resolve) => {
      const pageInstance = Taro.getCurrentInstance()?.page
      const q = pageInstance
        ? Taro.createSelectorQuery().in(pageInstance as any)
        : Taro.createSelectorQuery()
      q.select('#mcCropArea').boundingClientRect((rect: any) => resolve(rect)).exec()
    })

  // 进入面板后测量并给出居中的默认方形选区
  useEffect(() => {
    if (!showSealCrop) return
    let alive = true
    const timer = setTimeout(async () => {
      const rect = await measureSealCropArea()
      if (!alive) return
      const L = rect?.width || 300
      sealCropRectRef.current = rect
      setSealAreaPx(L)
      const { w, h } = sealImgMeta
      const scale = Math.max(L / Math.max(1, w), L / Math.max(1, h))
      const visLen = Math.min(L / scale, L)
      const s = Math.max(0.5, visLen / L)
      setSealCropSel({ x: (1 - s) / 2, y: (1 - s) / 2, s })
    }, 60)
    return () => { alive = false; clearTimeout(timer) }
  }, [showSealCrop])

  const rotateSeal = (deg: number) => setSealRotate((r) => (r + deg + 360) % 360)

  const cancelSealCrop = () => {
    setShowSealCrop(false)
    setSealCropPath('')
    setSealRotate(0)
    sealCropDragRef.current = null
  }

  const onSealCropStart = (e: any) => {
    const touch = e?.touches?.[0]
    const rect = sealCropRectRef.current
    if (!touch || !rect) return
    sealCropDragRef.current = {
      startX: touch.pageX,
      startY: touch.pageY,
      ox: sealCropSel.x,
      oy: sealCropSel.y,
      s: sealCropSel.s
    }
  }

  const onSealCropMove = (e: any) => {
    const g = sealCropDragRef.current
    const touch = e?.touches?.[0]
    const rect = sealCropRectRef.current
    if (!g || !touch || !rect?.width) return
    const dx = (touch.pageX - g.startX) / rect.width
    const dy = (touch.pageY - g.startY) / rect.height
    // 选区坐标仅内部计算，越界回退到合法范围
    setSealCropSel({
      x: Math.max(0, Math.min(1 - g.s, g.ox + dx)),
      y: Math.max(0, Math.min(1 - g.s, g.oy + dy)),
      s: g.s
    })
  }

  const onSealCropEnd = () => { sealCropDragRef.current = null }

  // 确认：把原图按旋转角绘制到方形 Canvas（取中心方形裁切）→ 导出 → base64 → imprint
  const confirmSealCrop = async () => {
    if (!sealCropPath || sealCropBusy) return
    setSealCropBusy(true)
    const EXPORT = 800
    try {
      const rect = sealCropRectRef.current
      const L = rect?.width || sealAreaPx || 300
      const { w, h } = sealImgMeta
      const scale = Math.max(L / Math.max(1, w), L / Math.max(1, h))
      const visW = L / scale
      const { x, y, s } = sealCropSel
      const srcSize = s * visW
      const srcX = (w - visW) / 2 + (x * L) / scale
      const srcY = (h - visW) / 2 + (y * L) / scale
      const ctx = Taro.createCanvasContext('mcCropExport')
      ctx.clearRect(0, 0, EXPORT, EXPORT)
      ctx.translate(EXPORT / 2, EXPORT / 2)
      ctx.rotate((sealRotate * Math.PI) / 180)
      ctx.drawImage(sealCropPath, srcX, srcY, srcSize, srcSize, -EXPORT / 2, -EXPORT / 2, EXPORT, EXPORT)
      const temp = await new Promise<string>((resolve, reject) => {
        ctx.draw(false, () => {
          Taro.canvasToTempFilePath({
            canvasId: 'mcCropExport',
            destWidth: EXPORT,
            destHeight: EXPORT,
            success: (r: any) => resolve(r?.tempFilePath || ''),
            fail: () => reject(new Error('export-fail'))
          })
        })
      })
      if (!temp) return
      const fs: any = Taro.getFileSystemManager()
      const b64 = await new Promise<string>((resolve, reject) =>
        fs.readFile({ filePath: temp, encoding: 'base64', success: (r: any) => resolve(r?.data || ''), fail: reject })
      )
      await signAssetsApi.imprint({ name: `seal-${Date.now()}`, image_base64: b64 })
      Taro.showToast({ title: t('contract.imprintDone'), icon: 'success' })
      setShowSealCrop(false)
      setShowSealMaker(false)
      await refreshAssets()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.imprintStamp'), icon: 'none' })
    } finally {
      setSealCropBusy(false)
    }
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

  // 使用生成的模板章：写入签名库并设为当前签署用章（托盘回填缩略图）
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

  // ===== 手写签名：按笔画记录（速度加权 1~4px 线宽）+ 单笔撤销 / 整面重写 =====
  const sigStrokes = useRef<{ pts: { x: number; y: number }[]; w: number }[]>([])
  const sigCur = useRef<{ pts: { x: number; y: number }[]; dist: number; count: number } | null>(null)

  const openSigMaker = () => {
    sigStrokes.current = []
    sigCur.current = null
    setShowSigMaker(true)
  }

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

  // 笔画包围盒（用于 SVG / 离屏 PNG 紧致裁切）
  const sigBBox = () => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    sigStrokes.current.forEach((s) =>
      s.pts.forEach((p) => {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      })
    )
    if (!Number.isFinite(minX)) return null
    const pad = 6
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
  }

  // 产出 SVG（随落章项 signature_svg 一并提交，作为矢量兜底）
  const buildSigSvg = (): string => {
    const bb = sigBBox()
    if (!bb) return ''
    const w = bb.maxX - bb.minX
    const h = bb.maxY - bb.minY
    const paths = sigStrokes.current
      .map((s) => {
        const d = s.pts
          .map((p, i) => `${i ? 'L' : 'M'}${(p.x - bb.minX).toFixed(1)} ${(p.y - bb.minY).toFixed(1)}`)
          .join(' ')
        return `<path d="${d}" stroke="#1f2937" stroke-width="${s.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      })
      .join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">${paths}</svg>`
  }

  // 额外：把签名画到离屏 canvas → 导出 → base64 → data:image/png;base64,... 作为 image_data_url
  const exportSigPng = async (): Promise<string> => {
    const bb = sigBBox()
    if (!bb) return ''
    const CW = 600
    const CH = 240
    const bw = bb.maxX - bb.minX
    const bh = bb.maxY - bb.minY
    const scale = Math.min(CW / Math.max(1, bw), CH / Math.max(1, bh))
    const ox = (CW - bw * scale) / 2
    const oy = (CH - bh * scale) / 2
    const ctx = Taro.createCanvasContext('mcSigExport')
    ctx.clearRect(0, 0, CW, CH)
    sigStrokes.current.forEach((s) => {
      if (!s.pts.length) return
      ctx.setStrokeStyle('#1f2937')
      ctx.setLineCap('round')
      ctx.setLineJoin('round')
      ctx.setLineWidth(Math.max(1, s.w * scale))
      ctx.beginPath()
      ctx.moveTo(ox + (s.pts[0].x - bb.minX) * scale, oy + (s.pts[0].y - bb.minY) * scale)
      for (let i = 1; i < s.pts.length; i++) {
        ctx.lineTo(ox + (s.pts[i].x - bb.minX) * scale, oy + (s.pts[i].y - bb.minY) * scale)
      }
      ctx.stroke()
    })
    const temp = await new Promise<string>((resolve) => {
      ctx.draw(false, () => {
        Taro.canvasToTempFilePath({
          canvasId: 'mcSigExport',
          destWidth: CW,
          destHeight: CH,
          success: (r: any) => resolve(r?.tempFilePath || ''),
          fail: () => resolve('')
        })
      })
    })
    if (!temp) return ''
    const fs: any = Taro.getFileSystemManager()
    const b64 = await new Promise<string>((resolve) =>
      fs.readFile({ filePath: temp, encoding: 'base64', success: (r: any) => resolve(r?.data || ''), fail: () => resolve('') })
    )
    return b64 ? `data:image/png;base64,${b64}` : ''
  }

  // 使用手写签名：产出 SVG + PNG，回填托盘（并尽力持久化到签名库）
  const useSignature = async () => {
    if (sigUseBusy) return
    if (!sigStrokes.current.length) {
      Taro.showToast({ title: t('contract.sigDrawEmpty'), icon: 'none' })
      return
    }
    setSigUseBusy(true)
    try {
      const svg = buildSigSvg()
      const dataUrl = await exportSigPng()
      setSigMadeLocal({ dataUrl, svg })
      if (dataUrl) {
        signAssetsApi
          .create({ name: `sig-${Date.now()}`, asset_type: 'handwrite', source: 'drew', data_url: dataUrl })
          .then(() => refreshAssets())
          .catch(() => {})
      }
      Taro.showToast({ title: t('contract.assetSaved'), icon: 'success' })
      setShowSigMaker(false)
      sigStrokes.current = []
      sigCur.current = null
    } finally {
      setSigUseBusy(false)
    }
  }

  const canSign = !!myParty?.id && !alreadySigned
  const pageItems = placedItems.filter((it) => it.page === fieldPage)

  // 托盘条目（开放签式整行交互）：
  //   未制作 → 整行点一下直接打开手写签名板 / 印章制作（不再有小「制作」按钮）；
  //   已制作 → 整行即 touch 拖拽源，按在条目上拖到文档任意位置松手即落章，右上小按钮用于重做/更换。
  const renderTrayItem = (method: SignMethod) => {
    const made = method === 'company_seal' ? !!madeSealData : !!madeSigData
    const label = method === 'company_seal' ? t('contract.traySeal') : t('contract.traySignature')
    const openMaker = () => (method === 'company_seal' ? openSealMaker() : openSigMaker())
    return (
      <View
        key={method}
        className={`mc-tray-item ${made ? 'mc-tray-item--made' : 'mc-tray-item--empty'} ${dragging && dragGhost?.method === method ? 'mc-tray-item--dragging' : ''}`}
        catchMove
        onTouchStart={onTrayTouchStart(method)}
        onTouchMove={onTrayTouchMove}
        onTouchEnd={onTrayTouchEnd}
        onTouchCancel={onTrayTouchEnd}
        onClick={() => { if (!made) openMaker() }}
      >
        <View className='mc-tray-item__thumb'>
          {made
            ? <Image className='mc-tray-item__img' src={method === 'company_seal' ? madeSealData : madeSigData} mode='aspectFit' />
            : <Text className='mc-tray-item__placeholder'>{method === 'company_seal' ? t('contract.sealUnmadeShort') : t('contract.sigUnmadeShort')}</Text>}
        </View>
        <Text className='mc-tray-item__name'>{label}</Text>
        <Text className={`mc-tray-item__hint ${made ? '' : 'mc-tray-item__hint--tap'}`}>
          {made
            ? t('contract.readyToDrag')
            : (method === 'company_seal' ? t('contract.tapMakeSeal') : t('contract.tapSign'))}
        </Text>
        {made && (
          <View
            className='mc-tray-item__redo'
            catchMove
            onClick={(ev: any) => { ev.stopPropagation?.(); openMaker() }}
          >
            <View className='icon-svg' style={iconStyle('edit', 26)} />
          </View>
        )}
      </View>
    )
  }

  return (
    <View className='mc-page'>
      <ShellHeader title={t('contract.my')} />

      {detail ? (
        /* ===== 详情：单屏签署台（托盘 + 文档区） ===== */
        <View className='mc-wrap'>
          <ScrollView scrollY={!dragging && !movingKey} className='mc-scroll'>
            {detailLoading && !detail?.parties ? (
              <StateBlock loading text={t('pub.loading')} />
            ) : (
              <View>
                <View className='mc-card'>
                  <View className='mc-card__top'>
                    <View className='mc-card__topmain'>
                      <Text className='mc-card__title'>{detail?.title || t('contract.unknown')}</Text>
                      {/* v2 角标仅用于自证设备已加载新 bundle */}
                      <Text className='mc-ver'>v2</Text>
                    </View>
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

                {/* 签署方（本人高亮）列表 */}
                <View className='mc-config'>
                  <Text className='mc-config__title'>{t('contract.parties')}</Text>
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
                </View>

                {/* ===== 文档区 ===== */}
                <View className='mc-doc'>
                  <View className='mc-doc__head'>
                    <Text className='mc-doc__title'>{t('contract.docArea')}</Text>
                    {pdfNumPages > 1 && (
                      <View className='mc-config__row'>
                        <View className={`mc-btn mc-btn--ghost ${fieldPage <= 1 ? 'mc-btn--disabled' : ''}`} onClick={() => { if (fieldPage > 1) setFieldPage((p) => p - 1) }}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.prevPage')}</Text>
                        </View>
                        <Text className='mc-doc__pageno'>{fieldPage} / {pdfNumPages}</Text>
                        <View className={`mc-btn mc-btn--ghost ${fieldPage >= pdfNumPages ? 'mc-btn--disabled' : ''}`} onClick={() => { if (fieldPage < pdfNumPages) setFieldPage((p) => p + 1) }}>
                          <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.nextPage')}</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <View id='mcDocCanvas' className={`mc-doc__canvas ${overDoc ? 'mc-doc__canvas--over' : ''}`}>
                    {pdfAvailable && pdfNumPages > 0 ? (
                      <Image className='mc-doc__img' src={contractsApi.pdfPageUrl(detail.id, fieldPage)} mode='widthFix' />
                    ) : (
                      <View className='mc-doc__text'>
                        {detail?.content_html
                          ? <Text userSelect>{String(detail.content_html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')}</Text>
                          : <Text className='mc-doc__empty'>{detail?.title || t('contract.unknown')}</Text>}
                      </View>
                    )}

                    {/* 落章成品图（当前页） */}
                    {pageItems.map((it) => (
                      <View
                        key={it.key}
                        className={`mc-placed ${movingKey === it.key ? 'mc-placed--moving' : ''}`}
                        catchMove
                        style={{
                          left: `${it.x}%`,
                          top: `${it.y}%`,
                          width: `${it.w}%`,
                          height: `${it.h}%`
                        }}
                        onTouchStart={onItemTouchStart(it.key)}
                        onTouchMove={onItemTouchMove}
                        onTouchEnd={onItemTouchEnd}
                        onTouchCancel={onItemTouchEnd}
                      >
                        <Image className='mc-placed__img' src={it.dataUrl} mode='aspectFit' />
                        <View
                          className='mc-placed__del'
                          onClick={(ev: any) => { ev.stopPropagation?.(); removePlaced(it.key) }}
                        >
                          <View className='icon-svg' style={iconStyle('close', 22)} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* ===== 底部固定栏：签章托盘 + 签署按钮（与文档同屏，边拖边看） ===== */}
          <View className='mc-footer mc-dock'>
            <View className='mc-dock__tray'>
              {renderTrayItem('company_seal')}
              {renderTrayItem('personal_handwrite')}
            </View>
            <View className='mc-dock__actions'>
              {myParty && !alreadySigned && (
                <View className={`mc-btn mc-btn--ghost mc-footer__decline ${declineBusy ? 'mc-btn--disabled' : ''}`} onClick={() => { if (!declineBusy) openDecline() }}>
                  <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.decline')}</Text>
                </View>
              )}
              <View
                className={`mc-sign ${!canSign || signing || !placedItems.length ? 'mc-sign--disabled' : ''}`}
                onClick={() => {
                  if (alreadySigned) {
                    Taro.showToast({ title: t('contract.completedToast'), icon: 'none' })
                    return
                  }
                  if (canSign && !signing) void doSignBatch()
                }}
              >
                <Text className='mc-sign__text'>{t('contract.sign')}</Text>
              </View>
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

      {/* 拖拽跟随预览（position: fixed，跟随手指） */}
      {dragGhost && (
        <View
          className='mc-ghost'
          style={{ left: `${dragGhost.x - 44}px`, top: `${dragGhost.y - 44}px` }}
        >
          <Image className='mc-ghost__img' src={dragGhost.dataUrl} mode='aspectFit' />
        </View>
      )}

      {/* ===== 制作弹窗：电子印章 ===== */}
      {showSealMaker && (
        <View className='mc-mask' onClick={() => setShowSealMaker(false)}>
          <View className='mc-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='mc-sheet__head'>
              <Text className='mc-sheet__title'>{t('contract.makeSeal')}</Text>
              <View className='mc-sheet__close' onClick={() => setShowSealMaker(false)}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>

            <View className='mc-seg'>
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
                  <View className='mc-maker-preview'>
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
          </View>
        </View>
      )}

      {/* ===== 制作弹窗：手写签名 ===== */}
      {showSigMaker && (
        <View className='mc-mask' onClick={() => setShowSigMaker(false)}>
          <View className='mc-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='mc-sheet__head'>
              <Text className='mc-sheet__title'>{t('contract.drawSignature')}</Text>
              <View className='mc-sheet__close' onClick={() => setShowSigMaker(false)}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
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
            <View className='mc-config__row mc-sig-actions'>
              <View className='mc-btn mc-btn--ghost' onClick={undoSigCanvas}>
                <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.undoSign')}</Text>
              </View>
              <View className='mc-btn mc-btn--ghost' onClick={clearSigCanvas}>
                <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.clear')}</Text>
              </View>
            </View>
            <View className={`mc-sheet__submit ${sigUseBusy ? 'mc-sheet__submit--busy' : ''}`} onClick={() => { if (!sigUseBusy) void useSignature() }}>
              <Text className='mc-sheet__submit-text'>{sigUseBusy ? t('pub.loading') : t('contract.useThis')}</Text>
            </View>
            {/* 离屏导出画布（生成 image_data_url 用） */}
            <Canvas
              canvasId='mcSigExport'
              id='mcSigExport'
              style={{ position: 'absolute', left: '-9999rpx', top: 0, width: '600px', height: '240px' }}
            />
          </View>
        </View>
      )}

      {/* ===== 印模方形裁剪弹层 ===== */}
      {showSealCrop && (
        <View className='mc-mask'>
          <View className='mc-sheet'>
            <View className='mc-sheet__head'>
              <Text className='mc-sheet__title'>{t('contract.cropSeal')}</Text>
              <View className='mc-sheet__close' onClick={cancelSealCrop}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>

            <View
              id='mcCropArea'
              className='mc-signbox'
              style={{ position: 'relative', width: '100%', height: `${sealAreaPx}px`, touchAction: 'none' }}
              onTouchStart={onSealCropStart}
              onTouchMove={onSealCropMove}
              onTouchEnd={onSealCropEnd}
              onTouchCancel={onSealCropEnd}
            >
              <Image
                className='mc-crop-img'
                src={sealCropPath}
                mode='aspectFill'
                style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}
              />
              <View
                className='mc-crop-sel'
                style={{
                  position: 'absolute',
                  left: `${sealCropSel.x * 100}%`,
                  top: `${sealCropSel.y * 100}%`,
                  width: `${sealCropSel.s * 100}%`,
                  height: `${sealCropSel.s * 100}%`,
                  border: '4rpx solid var(--primary)',
                  boxSizing: 'border-box',
                  background: 'rgba(20,184,166,0.08)'
                }}
              />
            </View>

            <View className='mc-config__row' style={{ marginTop: '12rpx' }}>
              <View className='mc-btn mc-btn--ghost' onClick={() => rotateSeal(-90)}>
                <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.rotateSeal')}</Text>
              </View>
              <View className='mc-btn mc-btn--ghost' onClick={() => rotateSeal(90)}>
                <Text className='mc-btn__text mc-btn__text--ghost'>{t('contract.rotateSeal')}</Text>
              </View>
            </View>

            <View className='mc-config__row' style={{ marginTop: '12rpx' }}>
              <View className={`mc-btn mc-btn--ghost ${sealCropBusy ? 'mc-btn--disabled' : ''}`} onClick={() => { if (!sealCropBusy) void confirmSealCrop() }}>
                <Text className='mc-btn__text mc-btn__text--ghost'>{sealCropBusy ? t('pub.loading') : t('contract.applyCrop')}</Text>
              </View>
              <View className='mc-btn mc-btn--ghost' onClick={cancelSealCrop}>
                <Text className='mc-btn__text mc-btn__text--ghost'>{t('common.back')}</Text>
              </View>
            </View>

            <Canvas
              canvasId='mcCropExport'
              id='mcCropExport'
              style={{ position: 'absolute', left: '-9999rpx', top: 0, width: '800px', height: '800px' }}
            />
          </View>
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
