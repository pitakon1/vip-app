import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { message, Modal, Segmented } from 'antd'
import { contractsApi, contractsPublicApi, signAssetsApi } from '@/services/api'
import { useTranslation } from 'react-i18next'
import useAuthStore from '@/stores/auth'
import SealCropperModal from '@/components/SealCropperModal'
import './sign.css'

/** 画布逻辑尺寸（签名导出 SVG 的 viewBox 基准），CSS 端等比缩放占满宽度 */
const CANVAS_W = 400
const CANVAS_H = 140

// 文档区预览基准宽度（坐标一律为页面宽高百分比，界面上从不展示裸数字）
const PREVIEW_W = 800
// 落框默认尺寸（页面宽高百分比；A4 竖版下近似保持印章/签名的原始比例）
const SEAL_BOX = { w: 12, h: 8.5 }
const SIGN_BOX = { w: 24, h: 8 }

type Phase = 'loading' | 'ready' | 'done'
type FailType = 'expired' | 'signed' | 'generic' | null
type TrayKind = 'seal' | 'sign'

interface ContractDoc {
  contract_id?: string
  title?: string
  content_html?: string
  source?: string
  file_url?: string
  party_name_masked?: string
  party_role?: string
  real_name_verified?: boolean
  sign_method?: string
  pdf_available?: boolean
  pdf_page_count?: number
  party?: { id?: string; name?: string; sign_method?: string; real_name_verified?: boolean }
  [k: string]: unknown
}

/** 已落框成品（本地坐标 + 成品图；签署时一次性原子提交给 sign-batch） */
interface Placed {
  key: number
  page: number
  x: number
  y: number
  w: number
  h: number
  method: 'company_seal' | 'personal_handwrite'
  imageDataUrl: string
  signatureSvg?: string
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const round2 = (v: number) => Math.round(v * 100) / 100

/** 把 SignCanvas 导出的 SVG 光栅化为 PNG dataURL（Web 端 canvas 直接绘制）。 */
const svgToPngDataUrl = (svg: string, w: number, h: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas-not-supported'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('svg-load-failed'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })

/* 手写签名画布：pointer 绘制多条笔迹，导出为「纯 SVG path 字符串」。
   线宽随绘制速度加权（1~4px，快=细、慢=粗），对齐开放签签名笔触。
   支持单条撤销 + 一键重写。 */
const SignCanvas = ({ value, onChange }: { value: string; onChange: (svg: string) => void }) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<number[][][]>(value ? parseStrokes(value) : [])
  // 每条笔迹的线宽（与 strokesRef 下标一一对应）
  const widthsRef = useRef<number[]>(strokesRef.current.map(() => DEFAULT_W))
  const drawingRef = useRef(false)
  // 当前绘制速度累计（用于在抬手时折算整条笔迹线宽）
  const speedRef = useRef({ dist: 0, count: 0 })

  const MIN_W = 1
  const MAX_W = 4
  const DEFAULT_W = 3

  function parseStrokes(svg: string): number[][][] {
    // <path d="M x,y L x,y ..."
    const out: number[][][] = []
    const re = /<path d="([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(svg)) !== null) {
      const nums = (m[1].match(/[-\d.]+/g) || []).map(Number)
      const stroke: number[][] = []
      for (let i = 0; i + 1 < nums.length; i += 2) stroke.push([nums[i], nums[i + 1]])
      if (stroke.length) out.push(stroke)
    }
    return out
  }

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.strokeStyle = '#1f2937'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    strokesRef.current.forEach((stroke, si) => {
      if (stroke.length < 2) return
      ctx.lineWidth = widthsRef.current[si] ?? DEFAULT_W
      ctx.beginPath()
      ctx.moveTo(stroke[0][0], stroke[0][1])
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i][0], stroke[i][1])
      ctx.stroke()
    })
  }

  const emit = () => {
    const paths = strokesRef.current
      .map((s, si) => {
        if (s.length < 2) return ''
        const w = widthsRef.current[si] ?? DEFAULT_W
        return `<path d="M ${s.map((p) => `${p[0]},${p[1]}`).join(' L ')}" fill="none" stroke="#1f2937" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
      })
      .join('')
    onChange(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">${paths}</svg>`,
    )
  }

  useEffect(() => {
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pointFrom = (e: PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * CANVAS_W),
      Math.round(((e.clientY - rect.top) / rect.height) * CANVAS_H),
    ]
  }

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drawingRef.current = true
    strokesRef.current.push([pointFrom(e.nativeEvent)])
    speedRef.current = { dist: 0, count: 0 }
    canvasRef.current?.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !strokesRef.current.length) return
    const p = pointFrom(e.nativeEvent)
    const stroke = strokesRef.current[strokesRef.current.length - 1]
    const last = stroke[stroke.length - 1]
    // 累计本段位移与采样数，用于速度加权线宽
    speedRef.current.dist += Math.hypot(p[0] - last[0], p[1] - last[1])
    speedRef.current.count += 1
    stroke.push(p)
    redraw()
    emit()
  }
  const onUp = () => {
    drawingRef.current = false
    // 抬手结算：平均速度大(快)则细、慢则粗
    const { dist, count } = speedRef.current
    const avgSpeed = count > 0 ? dist / count : 0
    const w = Math.min(MAX_W, Math.max(MIN_W, MAX_W - avgSpeed * 0.15))
    if (widthsRef.current.length < strokesRef.current.length) {
      widthsRef.current.push(w)
    } else if (widthsRef.current.length === strokesRef.current.length) {
      widthsRef.current[widthsRef.current.length - 1] = w
    }
    redraw()
    emit()
  }

  const undo = () => {
    if (!strokesRef.current.length) return
    strokesRef.current.pop()
    widthsRef.current.pop()
    drawingRef.current = false
    redraw()
    emit()
  }

  const clear = () => {
    strokesRef.current = []
    widthsRef.current = []
    drawingRef.current = false
    redraw()
    onChange('')
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          width: '100%',
          height: 'auto',
          touchAction: 'none',
          border: '2px dashed var(--rent-line, #dfe5ea)',
          borderRadius: 12,
          background: '#fff',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={undo} disabled={!strokesRef.current.length}>
          {t('contracts.undoSign')}
        </button>
        <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={clear}>
          {t('contracts.clearSign')}
        </button>
      </div>
    </div>
  )
}

/* 红色公司公章展示（模板生成前的样式预览；实际盖章由后端按 company_seal 落章） */
const CompanySeal = ({ name }: { name: string }) => (
  <svg width="140" height="140" viewBox="0 0 260 260" style={{ display: 'block', margin: '0 auto' }}>
    <circle cx="130" cy="130" r="118" fill="none" stroke="#c0392b" strokeWidth="6" />
    <circle cx="130" cy="130" r="96" fill="none" stroke="#c0392b" strokeWidth="2.5" />
    <text x="130" y="136" textAnchor="middle" fontSize="26" fontFamily="SimSun, serif" fill="#c0392b">
      {name || '签约方'}
    </text>
    <polygon points="120,150 126,144 132,150 138,144 130,156" fill="#c0392b" />
    <text x="130" y="196" textAnchor="middle" fontSize="16" fontFamily="SimSun, serif" fill="#c0392b">
      合同专用章
    </text>
  </svg>
)

const Sign = () => {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  // 登录态：站内员工持有登录令牌时走 contracts/sign-batch；匿名访客走公开 token 端点
  const authToken = useAuthStore((s) => s.token)
  const [phase, setPhase] = useState<Phase>('loading')
  const [doc, setDoc] = useState<ContractDoc | null>(null)
  const [fail, setFail] = useState<FailType>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ signed?: boolean; contract_status?: string } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  // 托盘资产：印章（成品 PNG）/ 手写签名（SVG + 光栅化 PNG）
  const [seal, setSeal] = useState<{ dataUrl: string } | null>(null)
  const [signature, setSignature] = useState<{ svg: string; png: string } | null>(null)

  // 已落框成品（本地坐标；不落库，签署时随 sign-batch 原子提交）
  const [placed, setPlaced] = useState<Placed[]>([])
  const placedKeyRef = useRef(0)

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

  // 实名认证（403 REAL_NAME_REQUIRED 时触发，完成后自动重签）
  const [realOpen, setRealOpen] = useState(false)
  const [realStep, setRealStep] = useState<'send' | 'verify'>('send')
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [realName, setRealName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const pendingRetryRef = useRef<(() => void) | null>(null)
  // 实名认证通过后记下的手机号（匿名签署提交时作为 phone 一并上报）
  const [signerPhone, setSignerPhone] = useState('')

  // 拒签
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declined, setDeclined] = useState(false)

  // 文档区落点容器（拖放坐标换算基准）
  const docRef = useRef<HTMLDivElement>(null)

  const fileUrl = useMemo(() => contractsPublicApi.fileUrl(token), [token])

  useEffect(() => {
    let mounted = true
    contractsPublicApi
      .get(token)
      .then((res) => {
        if (!mounted) return
        setDoc(res.data)
        setPhase('ready')
      })
      .catch((err: any) => {
        if (!mounted) return
        if (err?.response?.status === 410) setFail('expired')
        else setFail('generic')
        setPhase('done')
      })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

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
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('contracts.errGenericSubmit'))
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

  // ===== 拖拽落框（原生 HTML5 drag，从托盘克隆 / 落框改位） =====
  const onTrayDragStart = (kind: TrayKind) => (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', `new:${kind}`)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const onPlacedDragStart = (key: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', `move:${key}`)
    e.dataTransfer.effectAllowed = 'move'
  }

  const addPlaced = (kind: TrayKind, px: number, py: number) => {
    if (kind === 'seal') {
      if (!seal) return
      const { w, h } = SEAL_BOX
      placedKeyRef.current += 1
      setPlaced((prev) => [
        ...prev,
        {
          key: placedKeyRef.current,
          page: currentPage,
          x: clamp(px - w / 2, 0, 100 - w),
          y: clamp(py - h / 2, 0, 100 - h),
          w,
          h,
          method: 'company_seal',
          imageDataUrl: seal.dataUrl,
        },
      ])
    } else {
      if (!signature) return
      const { w, h } = SIGN_BOX
      placedKeyRef.current += 1
      setPlaced((prev) => [
        ...prev,
        {
          key: placedKeyRef.current,
          page: currentPage,
          x: clamp(px - w / 2, 0, 100 - w),
          y: clamp(py - h / 2, 0, 100 - h),
          w,
          h,
          method: 'personal_handwrite',
          imageDataUrl: signature.png,
          signatureSvg: signature.svg,
        },
      ])
    }
  }

  const movePlaced = (key: number, px: number, py: number) => {
    setPlaced((prev) =>
      prev.map((p) =>
        p.key === key
          ? {
              ...p,
              page: currentPage,
              x: clamp(px - p.w / 2, 0, 100 - p.w),
              y: clamp(py - p.h / 2, 0, 100 - p.h),
            }
          : p,
      ),
    )
  }

  const removePlaced = (key: number) => {
    setPlaced((prev) => prev.filter((p) => p.key !== key))
  }

  const onDocDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDocDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (!docRef.current) return
    const data = e.dataTransfer.getData('text/plain')
    const rect = docRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    if (data === 'new:seal') addPlaced('seal', px, py)
    else if (data === 'new:sign') addPlaced('sign', px, py)
    else if (data.startsWith('move:')) movePlaced(Number(data.slice(5)), px, py)
  }

  // ===== 底部【签署】：一次性原子提交全部落框 =====
  const submitPlaced = async () => {
    if (!doc?.contract_id || !doc?.party?.id) return
    if (placed.length === 0) {
      message.warning(t('contracts.signNothingPlaced'))
      return
    }
    setSubmitting(true)
    try {
      const items = placed.map((p) => ({
        page: p.page,
        x: round2(p.x),
        y: round2(p.y),
        w: round2(p.w),
        h: round2(p.h),
        method: p.method,
        ...(p.signatureSvg ? { signature_svg: p.signatureSvg } : {}),
        image_data_url: p.imageDataUrl,
      }))
      // 场景分流：登录态走站内 sign-batch；匿名访客走公开 token 端点（token 即身份，不再传 code）
      const res: any = authToken
        ? await contractsApi.signBatch(doc.contract_id, {
            partyId: doc.party.id,
            items,
          })
        : await contractsPublicApi.signByToken(token, {
            name: (doc.party.name || '').trim(),
            ...(signerPhone ? { phone: signerPhone } : {}),
            items,
          })
      const data = res?.data || {}
      setResult({ signed: true, contract_status: data.contract_status })
      setPhase('done')
    } catch (err: any) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 403 && detail === 'REAL_NAME_REQUIRED') {
        pendingRetryRef.current = () => {
          void submitPlaced()
        }
        setRealStep('send')
        setRealOpen(true)
        message.warning(t('contracts.realNameRequired'))
      } else if (status === 410) setFail('expired')
      else if (status === 409) setFail('signed')
      else message.error(detail || t('contracts.errGenericSubmit'))
    } finally {
      setSubmitting(false)
    }
  }

  // 发送实名验证码
  const sendCode = async () => {
    if (!contact.trim()) {
      message.warning(t('contracts.blankContact'))
      return
    }
    setSendLoading(true)
    try {
      await contractsPublicApi.sendCode(token, contact.trim())
      message.success(t('contracts.codeSent'))
      setRealStep('verify')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('contracts.errCode'))
    } finally {
      setSendLoading(false)
    }
  }

  // 校验身份证 + 验证码，完成实名后重签
  const verifyIdentity = async () => {
    if (!realName.trim() || !idNumber.trim() || !code.trim()) {
      message.warning(t('contracts.realNameFillAll'))
      return
    }
    setSendLoading(true)
    try {
      const verifiedName = realName.trim()
      const verifiedContact = contact.trim()
      await contractsPublicApi.verifyIdentity(token, {
        name: verifiedName,
        id_number: idNumber.trim(),
        contact: verifiedContact,
        code: code.trim(),
      })
      message.success(t('contracts.realNameDone'))
      setRealOpen(false)
      // 实名通过后会写回 party.name（真实姓名），本地同步更新，避免重签时把旧名覆盖回去
      setDoc((d) => (d ? { ...d, real_name_verified: true, party: { ...d.party, name: verifiedName } } : d))
      // 联系方式是手机号（非邮箱）时记下，匿名提交一并作为 phone 上报
      if (verifiedContact && !verifiedContact.includes('@')) setSignerPhone(verifiedContact)
      setRealName('')
      setIdNumber('')
      setCode('')
      setContact('')
      const retry = pendingRetryRef.current
      pendingRetryRef.current = null
      retry?.()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('contracts.realNameFail'))
    } finally {
      setSendLoading(false)
    }
  }

  // 拒签
  const confirmDecline = async () => {
    if (!declineReason.trim()) {
      message.warning(t('contracts.declineReasonBlank'))
      return
    }
    try {
      await contractsPublicApi.decline(token, declineReason.trim())
      setDeclineOpen(false)
      setDeclined(true)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('contracts.declineFail'))
    }
  }

  // 逾期 / 已签 等失败态
  if (fail) {
    return (
      <div style={pageStyle}>
        <div className="rent-card">
          <div className="rent-card__body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="rent-text-bold" style={{ fontSize: 18, marginBottom: 8 }}>
              {fail === 'expired' ? t('contracts.errLinkExpired') : fail === 'signed' ? t('contracts.errAlreadySigned') : t('contracts.errGetContract')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 已拒签
  if (declined) {
    return (
      <div style={pageStyle}>
        <div className="rent-card">
          <div className="rent-card__body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="rent-text-bold" style={{ fontSize: 18, marginBottom: 8 }}>{t('contracts.declinedTitle')}</div>
            <div className="rent-text-sm rent-text-muted">{t('contracts.declinedDesc')}</div>
          </div>
        </div>
      </div>
    )
  }

  // 签署完成
  if (phase === 'done' && result?.signed) {
    return (
      <div style={pageStyle}>
        <div className="rent-card">
          <div className="rent-card__body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="rent-text-bold" style={{ fontSize: 20, margin: '0 0 6px' }}>{t('contracts.successTitle')}</div>
            <div className="rent-text-sm rent-text-muted">{t('contracts.signedDesc')}</div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div style={pageStyle}>
        <div className="rent-card"><div className="rent-card__body" style={{ textAlign: 'center', padding: '32px' }}>{t('common.loading')}</div></div>
      </div>
    )
  }

  // ===== 单屏签署台：左=文档区，右=签署方组件托盘 =====
  const contentHtml = !(doc?.source === 'uploaded' && doc?.file_url) && !doc?.pdf_available && doc?.content_html
  const pdfCount = doc?.pdf_available ? doc?.pdf_page_count || 1 : 0
  const page = Math.min(Math.max(currentPage, 1), pdfCount || 1)
  const pageItems = placed.filter((p) => p.page === page)

  // 落框成品渲染（可拖动改位 + ✕ 删除；不展示任何坐标数字）
  const renderPlaced = (p: Placed) => (
    <div
      key={p.key}
      className="kf-placed"
      draggable
      onDragStart={onPlacedDragStart(p.key)}
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%` }}
    >
      <img src={p.imageDataUrl} alt="" draggable={false} />
      <button
        type="button"
        className="kf-placed__del"
        draggable={false}
        title={t('contracts.removePlaced')}
        onClick={() => removePlaced(p.key)}
      >
        ×
      </button>
    </div>
  )

  // 托盘条目（开放签式整行交互）：
  //   未制作 → 整行可点，点一下直接弹出手写签名板 / 印章制作弹窗（不再依赖小「制作」按钮）；
  //   已制作 → 整行即拖拽源，按住条目拖到文档任意位置松手即落章，右侧仅留一个小「重做/更换」图标按钮。
  const renderTrayItem = (kind: TrayKind) => {
    const made = kind === 'seal' ? !!seal : !!signature
    const thumb = kind === 'seal' ? seal?.dataUrl : signature?.png
    const label = kind === 'seal' ? t('contracts.sealAsset') : t('contracts.signAsset')
    const openMake = () => (kind === 'seal' ? setSealModalOpen(true) : openSignModal())
    if (!made) {
      return (
        <div
          key={kind}
          className="kf-tray-item kf-tray-item--empty"
          role="button"
          tabIndex={0}
          onClick={openMake}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openMake()
            }
          }}
        >
          <div className="kf-tray-item__name">{label}</div>
          <div className="rent-text-sm rent-text-muted kf-tray-item__state">
            {kind === 'seal' ? t('contracts.tapMakeSeal') : t('contracts.tapSign')}
          </div>
        </div>
      )
    }
    return (
      <div className="kf-tray-item kf-tray-item--made" key={kind} draggable onDragStart={onTrayDragStart(kind)} title={t('contracts.dragStampHint')}>
        <div className="kf-tray-item__name">{label}</div>
        <div className="kf-tray-item__thumb">
          <img src={thumb} alt={label} draggable={false} />
        </div>
        <div className="rent-text-sm kf-tray-item__ready">{t('contracts.readyToDrag')}</div>
        <button
          type="button"
          className="kf-tray-item__redo"
          draggable={false}
          title={kind === 'seal' ? t('contracts.changeSeal') : t('contracts.resignSign')}
          onClick={openMake}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{doc?.title || ''}</h2>
        {/* v2 角标仅用于自证设备已加载新 bundle */}
        <span className="kf-ver">v2</span>
      </div>

      <div className="kf-layout">
        {/* ===== 左：文档区（PDF 逐页图 / 合同正文背景） ===== */}
        <main className="kf-doc">
          <div className="rent-card">
            <div className="rent-card__body" style={{ padding: doc?.source === 'uploaded' && doc?.file_url && pdfCount === 0 ? 0 : 12 }}>
              {doc?.source === 'uploaded' && doc?.file_url && pdfCount === 0 ? (
                <div>
                  <iframe src={fileUrl} title={doc?.title || 'contract'} style={{ width: '100%', height: 520, border: 'none', background: '#fff' }} />
                  <div style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <a className="rent-btn rent-btn--ghost rent-btn--sm" href={fileUrl} target="_blank" rel="noopener noreferrer" download>{t('contracts.downloadView')}</a>
                  </div>
                </div>
              ) : pdfCount > 0 ? (
                <div>
                  <div className="kf-doc__toolbar">
                    <span className="rent-text-sm rent-text-muted">{t('contracts.pageIndicator', { cur: page, total: pdfCount })}</span>
                    <span className="kf-page-nav">
                      <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" disabled={page <= 1} onClick={() => setCurrentPage(page - 1)}>{t('contracts.prevPage')}</button>
                      <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" disabled={page >= pdfCount} onClick={() => setCurrentPage(page + 1)}>{t('contracts.nextPage')}</button>
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <div
                      ref={docRef}
                      className="kf-stage"
                      style={{ width: PREVIEW_W, maxWidth: '100%', margin: '0 auto' }}
                      onDragOver={onDocDragOver}
                      onDrop={onDocDrop}
                    >
                      <img className="kf-stage__bg" src={contractsPublicApi.pdfPageUrl(token, page)} alt={`page ${page}`} draggable={false} />
                      {pageItems.map(renderPlaced)}
                    </div>
                  </div>
                </div>
              ) : contentHtml ? (
                <div style={{ overflowX: 'auto' }}>
                  <div
                    ref={docRef}
                    className="kf-stage"
                    style={{ width: PREVIEW_W, maxWidth: '100%', margin: '0 auto' }}
                    onDragOver={onDocDragOver}
                    onDrop={onDocDrop}
                  >
                    <div className="rent-contract-html" style={{ width: PREVIEW_W, lineHeight: 1.9, fontSize: 14, wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: String(doc.content_html) }} />
                    {placed.map(renderPlaced)}
                  </div>
                </div>
              ) : null}
              <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.dragStampHint')}</div>
            </div>
          </div>
        </main>

        {/* ===== 右：签署方组件托盘 ===== */}
        <aside className="kf-config">
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signers')}</div>
              <div className="kf-parties">
                <div className="kf-party kf-party--active">
                  <div style={{ minWidth: 0 }}>
                    <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc?.party?.name || doc?.party_name_masked || '—'}</div>
                    <div className="rent-text-sm rent-text-muted">{doc?.party_role || ''}</div>
                  </div>
                  <span className="rent-badge rent-badge--success">{t('contracts.stPendingSign')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.trayTitle')}</div>
              <div className="kf-tray">
                {renderTrayItem('seal')}
                {renderTrayItem('sign')}
              </div>
            </div>
          </div>

          <div className="rent-card">
            <div className="rent-card__body">
              <button type="button" className="rent-btn rent-btn--danger rent-btn--sm" style={{ width: '100%' }} onClick={() => setDeclineOpen(true)}>{t('contracts.decline')}</button>
            </div>
          </div>
        </aside>
      </div>

      {/* 底部【签署】：恒显示「签署」文案，未落章时置灰；一次性提交全部落框 */}
      <div className="kf-signbar">
        <button
          type="button"
          className="rent-btn rent-btn--primary rent-btn--lg"
          style={{ width: '100%' }}
          disabled={submitting || placed.length === 0}
          onClick={submitPlaced}
        >
          {t('contracts.signNow')}
        </button>
      </div>

      {/* 手写签名制作弹窗 */}
      <Modal
        open={signModalOpen}
        title={t('contracts.setSign')}
        okText={t('contracts.confirmSign')}
        cancelText={t('common.cancel')}
        confirmLoading={signRasterizing}
        onOk={onSignModalOk}
        onCancel={() => setSignModalOpen(false)}
      >
        <SignCanvas value={signDraft} onChange={setSignDraft} />
        <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.drawHint')}</div>
      </Modal>

      {/* 印章制作弹窗：模板制作 / 印模上传 */}
      <Modal
        open={sealModalOpen}
        title={t('contracts.makeSeal')}
        footer={null}
        onCancel={() => setSealModalOpen(false)}
      >
        <Segmented
          block
          value={sealCreateType}
          onChange={(v) => setSealCreateType(v as 'template' | 'imprint')}
          options={[
            { value: 'template', label: t('contracts.sealTypeTemplate') },
            { value: 'imprint', label: t('contracts.sealTypeImprint') },
          ]}
          style={{ marginBottom: 16 }}
        />

        {sealCreateType === 'template' ? (
          <div>
            <div className="rent-field" style={{ marginBottom: 12 }}>
              <label className="rent-label">{t('contracts.sealCompanyName')}</label>
              <input
                className="rent-input"
                value={sealCompanyName}
                placeholder={t('contracts.sealCompanyNamePlaceholder')}
                onChange={(e) => setSealCompanyName(e.target.value)}
              />
            </div>
            <div className="rent-field" style={{ marginBottom: 12 }}>
              <label className="rent-label">{t('contracts.sealMiddleText')}</label>
              <input
                className="rent-input"
                value={sealMiddleText}
                placeholder={t('contracts.sealMiddleTextPlaceholder')}
                onChange={(e) => setSealMiddleText(e.target.value)}
              />
            </div>
            <div className="rent-field" style={{ marginBottom: 12 }}>
              <label className="rent-label">{t('contracts.sealStyle')}</label>
              <div className="rent-flex" style={{ alignItems: 'center', gap: 8 }}>
                <CompanySeal name={doc?.party?.name || doc?.party_name_masked || ''} />
                <div style={{ textAlign: 'left' }}>
                  <div className="rent-text-sm rent-text-bold">{t('contracts.sealStyleOfficial')}</div>
                  <div className="rent-text-sm rent-text-muted">{t('contracts.sealStyleOnly')}</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="rent-btn rent-btn--primary"
              onClick={onGenerateSealPreview}
              disabled={sealGenerating}
              style={{ width: '100%' }}
            >
              {sealGenerating ? t('common.loading') : t('contracts.sealGeneratePreview')}
            </button>

            {sealPreview ? (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <img className="kf-asset-thumb" src={sealPreview} alt={t('contracts.makeSeal')} style={{ width: 160, height: 160, objectFit: 'contain' }} />
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={usePreviewSeal}>{t('contracts.sealUseThis')}</button>
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
              <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => sealFileRef.current?.click()}>{t('contracts.sealUpload')}</button>
              <input ref={sealFileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onSealFile} />
            </div>
            {seal && (
              <img className="kf-asset-thumb" src={seal.dataUrl} alt={t('contracts.makeSeal')} style={{ marginTop: 12 }} />
            )}
          </div>
        )}
      </Modal>

      {/* 印模上传裁剪弹窗 */}
      <SealCropperModal
        open={sealCropOpen}
        src={sealCropSrc}
        onOk={onSealCropOk}
        onCancel={() => setSealCropOpen(false)}
      />

      {/* 实名认证弹窗 */}
      <Modal
        open={realOpen}
        title={t('contracts.realNameTitle')}
        okText={realStep === 'send' ? t('contracts.sendCode') : t('contracts.completeVerify')}
        cancelText={t('common.cancel')}
        confirmLoading={sendLoading}
        onOk={realStep === 'send' ? sendCode : verifyIdentity}
        onCancel={() => setRealOpen(false)}
      >
        {realStep === 'send' ? (
          <div className="rent-field">
            <label className="rent-label">{t('contracts.contactLabel')}</label>
            <input className="rent-input" value={contact} placeholder={t('contracts.contactPlaceholder')} onChange={(e) => setContact(e.target.value)} />
          </div>
        ) : (
          <div>
            <div className="rent-field" style={{ marginBottom: 12 }}>
              <label className="rent-label">{t('contracts.fName')}</label>
              <input className="rent-input" value={realName} placeholder={t('contracts.namePlaceholder')} onChange={(e) => setRealName(e.target.value)} />
            </div>
            <div className="rent-field" style={{ marginBottom: 12 }}>
              <label className="rent-label">{t('contracts.idNumber')}</label>
              <input className="rent-input" value={idNumber} placeholder={t('contracts.idNumberPlaceholder')} onChange={(e) => setIdNumber(e.target.value)} />
            </div>
            <div className="rent-field">
              <label className="rent-label">{t('contracts.verifyCode')}（{contact}）</label>
              <input className="rent-input" value={code} placeholder={t('contracts.verifyCodePlaceholder')} onChange={(e) => setCode(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>

      {/* 拒签弹窗 */}
      <Modal
        open={declineOpen}
        title={t('contracts.declineTitle')}
        okText={t('contracts.decline')}
        okButtonProps={{ danger: true }}
        cancelText={t('common.cancel')}
        onOk={confirmDecline}
        onCancel={() => setDeclineOpen(false)}
      >
        <div className="rent-field">
          <label className="rent-label">{t('contracts.declineReason')}</label>
          <textarea className="rent-input" rows={3} value={declineReason} placeholder={t('contracts.declineReasonPlaceholder')} onChange={(e) => setDeclineReason(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '24px 16px 96px',
  minHeight: '100vh',
  background: 'var(--rent-canvas, #f5f7fa)',
}

export default Sign
