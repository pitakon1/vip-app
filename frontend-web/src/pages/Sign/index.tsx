import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { message, Modal, Segmented } from 'antd'
import { contractsPublicApi, signAssetsApi } from '@/services/api'
import { useTranslation } from 'react-i18next'
import SealCropperModal from '@/components/SealCropperModal'
import './sign.css'

/** 画布逻辑尺寸（签名导出 SVG 的 viewBox 基准），CSS 端等比缩放占满宽度 */
const CANVAS_W = 400
const CANVAS_H = 140

// 签署区字段（与后端 ContractSignField 序列化一致）＋ 预览坐标基准宽度 800
const PREVIEW_W = 800

type Phase = 'loading' | 'ready' | 'done'
type FailType = 'expired' | 'signed' | 'generic' | null
type SignFieldType = 'signature' | 'seal' | 'date'

interface SignField {
  id: string
  party_id?: string | null
  field_type: string
  page: number
  x: number
  y: number
  w: number
  h: number
  required: boolean
  signed: boolean
  signed_at?: string | null
}

interface ContractDoc {
  contract_id?: string
  title?: string
  content_html?: string
  source?: string
  file_url?: string
  party_name_masked?: string
  party_role?: string
  sign_method?: string
  real_name_verified?: boolean
  sign_fields?: SignField[]
  expires_at?: string | null
  pdf_available?: boolean
  pdf_page_count?: number
  [k: string]: unknown
}

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

/* 红色公司公章展示（后端按 company_seal 落章，这里仅预览确认） */
const CompanySeal = ({ name }: { name: string }) => (
  <svg width="140" height="140" viewBox="0 0 260 260" style={{ display: 'block', margin: '0 auto' }}>
    <circle cx="130" cy="130" r="118" fill="none" stroke="#c0392b" strokeWidth="6" />
    <circle cx="130" cy="130" r="96" fill="none" stroke="#c0392b" strokeWidth="2.5" />
    <text x="130" y="136" textAnchor="middle" fontSize="26" fontFamily="SimSun, serif" fill="#c0392b">
      {name || '签约方'}
    </text>
    <polygon
      points="120,150 126,144 132,150 138,144 130,156"
      fill="#c0392b"
    />
    <text x="130" y="196" textAnchor="middle" fontSize="16" fontFamily="SimSun, serif" fill="#c0392b">
      合同专用章
    </text>
  </svg>
)

const Sign = () => {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('loading')
  const [doc, setDoc] = useState<ContractDoc | null>(null)
  const [fail, setFail] = useState<FailType>(null)

  // 法大大式：覆盖层 + 逐个签署
  const [signFields, setSignFields] = useState<SignField[]>([])
  const [activeField, setActiveField] = useState<SignField | null>(null)
  const [signature, setSignature] = useState('')
  const [signing, setSigning] = useState(false)
  const [result, setResult] = useState<{ signed?: boolean; contract_status?: string } | null>(null)

  // 实名认证弹窗
  const [realOpen, setRealOpen] = useState(false)
  const [realStep, setRealStep] = useState<'send' | 'verify'>('send')
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [realName, setRealName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [pendingSign, setPendingSign] = useState<() => void>(() => () => {})

  // 签署意愿二次验证（签前发码、签署提交必须带 code）+ 拒签
  const [intentOpen, setIntentOpen] = useState(false)
  const [intentCode, setIntentCode] = useState('')
  const [intentMasked, setIntentMasked] = useState('')
  const [intentSending, setIntentSending] = useState(false)
  const [intentCountdown, setIntentCountdown] = useState(0)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declined, setDeclined] = useState(false)
  const pendingSigRef = useRef<{ field: SignField; svg?: string } | null>(null)
  const intentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sealFileRef = useRef<HTMLInputElement>(null)
  // 手写弹窗提交模式：'save' 仅保存签名资产；'sign' 保存并签署当前所选字段
  const signModalModeRef = useRef<'save' | 'sign'>('save')

  // 开放签双栏布局：签署方式 / 当前预览页 / 单次印章资产
  const [mode, setMode] = useState<'position' | 'keyword'>('position')
  const [currentPage, setCurrentPage] = useState(1)
  const [sealMade, setSealMade] = useState(false)
  const [sealImg, setSealImg] = useState('') // 单次印章图（模板生成/上传）或空（未制作）
  const [sealModalOpen, setSealModalOpen] = useState(false)
  const [sealCreateType, setSealCreateType] = useState<'template' | 'imprint'>('template')
  // 印模上传：先打开裁剪弹窗，确认后得到裁剪图 data_url 设回 preview/use
  const [sealCropOpen, setSealCropOpen] = useState(false)
  const [sealCropSrc, setSealCropSrc] = useState('')
  const [sealCompanyName, setSealCompanyName] = useState('')
  const [sealMiddleText, setSealMiddleText] = useState(t('contracts.sealMiddleTextDefault'))
  const [sealPreview, setSealPreview] = useState('') // 模板生成后的章图 data_url 预览
  const [sealGenerating, setSealGenerating] = useState(false)
  const [signModalOpen, setSignModalOpen] = useState(false)

  // 当前预览页：随已选签署字段所在页自动跳转
  useEffect(() => {
    if (activeField) setCurrentPage(activeField.page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeField?.id])

  // 卸载时清理重发定时器
  useEffect(
    () => () => {
      if (intentTimerRef.current) clearInterval(intentTimerRef.current)
    },
    [],
  )
  // 重发倒计时驱动
  useEffect(() => {
    if (intentCountdown <= 0) {
      if (intentTimerRef.current) {
        clearInterval(intentTimerRef.current)
        intentTimerRef.current = null
      }
      return
    }
    const timer = setInterval(() => {
      setIntentCountdown((c) => (c <= 1 ? 0 : c - 1))
    }, 1000)
    intentTimerRef.current = timer
    return () => {
      if (intentTimerRef.current) clearInterval(intentTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentCountdown > 0])

  const fileUrl = useMemo(() => contractsPublicApi.fileUrl(token), [token])

  useEffect(() => {
    let mounted = true
    contractsPublicApi
      .get(token)
      .then((res) => {
        if (!mounted) return
        setDoc(res.data)
        setSignFields(Array.isArray(res.data?.sign_fields) ? res.data.sign_fields : [])
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

  const pendingFields = signFields.filter((f) => !f.signed)

  // 双栏文档：点按签署框 → 选中该字段（主「签署」按钮据此提交）
  const selectField = (f: SignField) => {
    if (f.signed) return
    setActiveField(f)
    setSignature('')
    setCurrentPage(f.page)
  }

  // 单次印章：上传图片 → 先打开裁剪弹窗，确认后设回 sealImg（仅本地展示，签署仍由服务端按 company_seal 落章）
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

  // 裁剪弹窗确认：用裁剪后的正方形 PNG(data_url) 作为当前印章预览
  const onSealCropOk = (dataUrl: string) => {
    setSealImg(dataUrl)
    setSealMade(true)
    setSealCropOpen(false)
    setSealModalOpen(false)
  }

  // 模板制作：调用后端接口生成透明底章图，先在弹窗内预览
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

  // 预览后「使用此印章」：把生成的章图设置为当前签署用章
  const usePreviewSeal = () => {
    if (!sealPreview) return
    setSealImg(sealPreview)
    setSealMade(true)
    setSealModalOpen(false)
  }

  // 执行一次签署 POST（code 为签前「签署意愿验证码」，有联系方式时必传）
  const doSign = async (field: SignField, svg?: string, code?: string) => {
    setSigning(true)
    try {
      const method =
        field.field_type === 'seal'
          ? 'company_seal'
          : field.field_type === 'date'
            ? 'date'
            : doc?.sign_method || 'personal_handwrite'
      const res: any = await contractsPublicApi.submit(token, {
        field_id: field.id,
        method,
        ...(svg ? { signature_svg: svg } : {}),
        ...(code ? { code } : {}),
      })
      const data = res?.data || {}
      const othersDone = signFields.every((x) => x.id === field.id || x.signed)
      setSignFields((prev) =>
        prev.map((x) => (x.id === field.id ? { ...x, signed: true } : x)),
      )
      setActiveField(null)
      setSignature('')
      // 全部字段签完 → 成功
      if (othersDone) {
        setResult({ signed: true, contract_status: data.contract_status })
        setPhase('done')
      }
    } catch (err: any) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 403 && detail === 'REAL_NAME_REQUIRED') {
        // 触发实名认证，完成后回签该字段（携带同一意愿验证码）
        setPendingSign(() => () => doSign(field, svg, code))
        setRealOpen(true)
        setRealStep('send')
        message.warning(t('contracts.realNameRequired'))
      } else if (status === 410) setFail('expired')
      else if (status === 409) setFail('signed')
      else if (status === 400 && detail === 'SIGN_INTENT_CODE_REQUIRED') {
        // 未带验证码：重新打开意愿验证弹窗
        pendingSigRef.current = { field, svg: svg ?? undefined }
        setIntentCode('')
        setIntentMasked('')
        setIntentOpen(true)
        message.warning(t('contracts.intentRequired'))
      } else message.error(err?.response?.data?.detail || t('contracts.errGenericSubmit'))
    } finally {
      setSigning(false)
    }
  }

  // 主「签署」按钮：校验所选字段 + 准备手写签名，随后进入签署意愿验证并提交
  const signTheSelected = () => {
    if (!activeField) {
      message.warning(t('contracts.placeChooseField'))
      return
    }
    const ft = activeField.field_type as SignFieldType
    if (ft === 'signature' && !signature.trim()) {
      // 未设置手写签名 → 打开手写画板（保存后立即签署所选项）
      pendingSigRef.current = { field: activeField }
      signModalModeRef.current = 'sign'
      setSignModalOpen(true)
      return
    }
    startIntent(activeField, ft === 'signature' ? signature : undefined)
  }

  // 从左侧资产块准备手写签名（仅保存，不立即签署）
  const openSignPrepare = () => {
    signModalModeRef.current = 'save'
    setSignature('')
    setSignModalOpen(true)
  }

  // 签名资产块「手写签名」确认后：保存并通过签署意愿验证提交
  const onSignModalOk = async () => {
    if (!signature.trim()) {
      message.warning(t('contracts.blankSign'))
      return
    }
    const mode = signModalModeRef.current
    const field = pendingSigRef.current?.field
    setSignModalOpen(false)
    // 'sign' 模式并已选中字段 → 保存后继续签署；否则仅保存签名资产
    if (mode === 'sign' && field) {
      startIntent(field, signature)
    }
  }

  // 开启一次签署（先做签署意愿二次验证：发码 → 输入验证码 → 提交时携带 code）
  const startIntent = (field: SignField, svg?: string) => {
    pendingSigRef.current = { field, svg }
    setIntentCode('')
    setIntentMasked('')
    setIntentOpen(true)
    sendIntentCode()
  }

  // 获取签署意愿验证码
  const sendIntentCode = async () => {
    setIntentSending(true)
    try {
      const res: any = await contractsPublicApi.sendSignCode(token)
      setIntentMasked(res?.data?.to_masked || '')
      setIntentCountdown(60)
      message.success(t('contracts.codeSent'))
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail === 'No verifiable contact for this party') {
        // 无联系方式：跳出意愿验证，直接签署
        setIntentOpen(false)
        const p = pendingSigRef.current
        if (p) await doSign(p.field, p.svg)
      } else {
        message.error(detail || t('contracts.errCode'))
      }
    } finally {
      setIntentSending(false)
    }
  }

  // 确认意愿验证并提交签署
  const confirmIntent = async () => {
    const p = pendingSigRef.current
    if (!p) return
    if (!intentCode.trim()) {
      message.warning(t('contracts.intentCodeBlank'))
      return
    }
    await doSign(p.field, p.svg, intentCode.trim())
    // doSign 成功时会关闭签署面板；此处同步关闭意向弹窗
    setIntentOpen(false)
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

  // 校验身份证 + 验证码，完成实名
  const verifyIdentity = async () => {
    if (!realName.trim() || !idNumber.trim() || !code.trim()) {
      message.warning(t('contracts.realNameFillAll'))
      return
    }
    setSendLoading(true)
    try {
      await contractsPublicApi.verifyIdentity(token, {
        name: realName.trim(),
        id_number: idNumber.trim(),
        contact: contact.trim(),
        code: code.trim(),
      })
      message.success(t('contracts.realNameDone'))
      setRealOpen(false)
      setDoc((d) => (d ? { ...d, real_name_verified: true } : d))
      setRealName('')
      setIdNumber('')
      setCode('')
      setContact('')
      // 接着执行此前被拦截的签署
      pendingSign()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('contracts.realNameFail'))
    } finally {
      setSendLoading(false)
    }
  }

  

  // 逾期
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

  // 全部签署完成
  if (phase === 'done' && result?.signed) {
    return (
      <div style={pageStyle}>
        <div className="rent-card">
          <div className="rent-card__body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 44, lineHeight: 1 }}>✅</div>
            <div className="rent-text-bold" style={{ fontSize: 20, margin: '12px 0 6px' }}>{t('contracts.successTitle')}</div>
            <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 16 }}>{t('contracts.signedDesc')}</div>
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

  // ===== 开放签双栏：左「签署配置」+ 右「文档区」=====
  const contentHtml = !(doc?.source === 'uploaded' && doc?.file_url) && !doc?.pdf_available && doc?.content_html
  const pdfCount = doc?.pdf_available ? doc?.pdf_page_count || 1 : 0
  const page = Math.min(Math.max(currentPage, 1), pdfCount || 1)

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{doc?.title || ''}</h2>
      </div>

      <div className="kf-layout">
        {/* ===== 左：签署配置 ===== */}
        <aside className="kf-config">
          {/* 1) 签署方 + 拒签 */}
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signers')}</div>
              <div className="kf-parties">
                <div className="kf-party kf-party--active">
                  <div style={{ minWidth: 0 }}>
                    <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc?.party_name_masked || '—'}</div>
                    <div className="rent-text-sm rent-text-muted">{doc?.party_role || ''}</div>
                  </div>
                  <span className="rent-badge rent-badge--success">{t('contracts.stPendingSign')}</span>
                </div>
              </div>
              <button type="button" className="rent-btn rent-btn--danger rent-btn--sm" style={{ marginTop: 10 }} onClick={() => setDeclineOpen(true)}>
                {t('contracts.decline')}
              </button>
            </div>
          </div>

          {/* 2) 签署方式 */}
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signMethod')}</div>
              <Segmented
                block
                value={mode}
                onChange={(v) => setMode(v as 'position' | 'keyword')}
                options={[
                  { value: 'position', label: t('contracts.methodPosition') },
                  { value: 'keyword', label: t('contracts.methodKeyword') },
                ]}
              />
              {mode === 'keyword' && (
                <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.keywordPublicHint')}</div>
              )}
            </div>
          </div>

          {/* 3) 电子印章（单次） */}
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.sealAsset')}</div>
              {sealMade ? (
                <div>
                  {sealImg ? (
                    <img className="kf-asset-thumb" src={sealImg} alt={t('contracts.sealAsset')} />
                  ) : (
                    <CompanySeal name={doc?.party_name_masked || ''} />
                  )}
                  <div className="rent-flex" style={{ gap: 8, marginTop: 8 }}>
                    <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setSealModalOpen(true)}>{t('contracts.sealChange')}</button>
                    <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => { setSealMade(false); setSealImg('') }}>{t('contracts.sealDelete')}</button>
                  </div>
                </div>
              ) : (
                <div className="kf-asset-empty">
                  <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 8 }}>{t('contracts.sealEmpty')}</div>
                  <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => setSealModalOpen(true)}>{t('contracts.makeSeal')}</button>
                </div>
              )}
            </div>
          </div>

          {/* 3) 手写签名（单次） */}
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signAsset')}</div>
              {signature.trim() ? (
                <div>
                  <div style={{ width: '100%', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid var(--rent-line, #e6eaf0)', borderRadius: 8, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: signature }} />
                  <div className="rent-flex" style={{ gap: 8, marginTop: 8 }}>
                    <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={openSignPrepare}>{t('contracts.signResign')}</button>
                    <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setSignature('')}>{t('contracts.sealDelete')}</button>
                  </div>
                </div>
              ) : (
                <div className="kf-asset-empty">
                  <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 8 }}>{t('contracts.signEmpty')}</div>
                  <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={openSignPrepare}>{t('contracts.setSign')}</button>
                </div>
              )}
            </div>
          </div>

          {/* 5) 主「签署」按钮 */}
          <button type="button" className="rent-btn rent-btn--primary rent-btn--lg" style={{ width: '100%' }} onClick={signTheSelected}>
            {activeField ? `${t('contracts.signNow')} · ${t(`contracts.fType_${activeField.field_type}`) || activeField.field_type}` : t('contracts.placeChooseField')}
          </button>
        </aside>

        {/* ===== 右：文档区 ===== */}
        <main className="kf-doc">
          <div className="rent-card">
            <div className="rent-card__body" style={{ padding: doc?.source === 'uploaded' && doc?.file_url ? 0 : 12 }}>
              {doc?.source === 'uploaded' && doc?.file_url ? (
                <div>
                  <iframe src={fileUrl} title={doc?.title || 'contract'} style={{ width: '100%', height: 520, border: 'none', background: '#fff' }} />
                  <div style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <a className="rent-btn rent-btn--ghost rent-btn--sm" href={fileUrl} target="_blank" rel="noopener noreferrer" download>{t('contracts.downloadView')}</a>
                  </div>
                </div>
              ) : pdfCount > 0 ? (
                <div>
                  {/* 翻页工具栏 */}
                  <div className="kf-doc__toolbar">
                    <span className="rent-text-sm rent-text-muted">{t('contracts.pageIndicator', { cur: page, total: pdfCount })}</span>
                    <span className="kf-page-nav">
                      <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" disabled={page <= 1} onClick={() => setCurrentPage(page - 1)}>{t('contracts.prevPage')}</button>
                      <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" disabled={page >= pdfCount} onClick={() => setCurrentPage(page + 1)}>{t('contracts.nextPage')}</button>
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ position: 'relative', width: PREVIEW_W, maxWidth: '100%', margin: '0 auto' }}>
                      <img src={contractsPublicApi.pdfPageUrl(token, page)} alt={`page ${page}`} style={{ width: '100%', display: 'block', border: '1px solid var(--rent-line, #dfe5ea)' }} />
                      {signFields.filter((f) => f.page === page).map((f, i) =>
                        f.signed ? (
                          <div key={f.id} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, border: '2px solid #10b981', borderRadius: 6, background: 'rgba(16,185,129,0.10)', boxSizing: 'border-box', pointerEvents: 'none' }}>
                            <div style={{ position: 'absolute', top: -18, left: 0, fontSize: 10, color: '#10b981', background: '#fff', padding: '0 4px', border: '1px solid #10b981', borderRadius: 4, whiteSpace: 'nowrap' }}>✓ {t('contracts.stSigned')}</div>
                          </div>
                        ) : (
                          <div key={f.id} className={`rent-sign-slot ${activeField?.id === f.id ? 'kf-slot--selected' : ''}`} onClick={() => selectField(f)} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}>
                            <span style={{ position: 'absolute', top: -16, left: 0, fontSize: 10, background: '#ef4444', color: '#fff', padding: '0 4px', borderRadius: 4, whiteSpace: 'nowrap' }}>{t('contracts.signFieldN', { n: i + 1 })}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.placeHintPublic', { n: pendingFields.length })}</div>
                </div>
              ) : contentHtml ? (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ position: 'relative', width: PREVIEW_W, maxWidth: '100%', margin: '0 auto' }}>
                    <div className="rent-contract-html" style={{ width: PREVIEW_W, lineHeight: 1.9, fontSize: 14, wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: String(doc.content_html) }} />
                    {signFields.map((f, i) =>
                      f.signed ? (
                        <div key={f.id} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, border: '2px solid #10b981', borderRadius: 6, background: 'rgba(16,185,129,0.10)', boxSizing: 'border-box', pointerEvents: 'none' }}>
                          <div style={{ position: 'absolute', top: -18, left: 0, fontSize: 10, color: '#10b981', background: '#fff', padding: '0 4px', border: '1px solid #10b981', borderRadius: 4, whiteSpace: 'nowrap' }}>✓ {t('contracts.stSigned')}</div>
                        </div>
                      ) : (
                        <div key={f.id} className={`rent-sign-slot ${activeField?.id === f.id ? 'kf-slot--selected' : ''}`} onClick={() => selectField(f)} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}>
                          <span style={{ position: 'absolute', top: -16, left: 0, fontSize: 10, background: '#ef4444', color: '#fff', padding: '0 4px', borderRadius: 4, whiteSpace: 'nowrap' }}>{t('contracts.signFieldN', { n: i + 1 })}</span>
                        </div>
                      ),
                    )}
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.placeHintPublic', { n: pendingFields.length })}</div>
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>

      {/* 手写签名（单次）弹窗 */}
      <Modal
        open={signModalOpen}
        title={t('contracts.setSign')}
        okText={t('contracts.confirmSign')}
        cancelText={t('common.cancel')}
        onOk={onSignModalOk}
        onCancel={() => setSignModalOpen(false)}
      >
        <SignCanvas value={signature} onChange={setSignature} />
        <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.drawHint')}</div>
      </Modal>

      {/* 单次印章制作弹窗：模板制作 / 印模上传 两种方式 */}
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
                <CompanySeal name={doc?.party_name_masked || ''} />
                <div style={{ textAlign: 'left' }}>
                  <div className="rent-text-sm rent-text-bold">{t('contracts.sealStyleOfficial')}</div>
                  <div className="rent-text-sm rent-text-muted">{t('contracts.sealStyleOnly')}</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="rent-btn rent-btn--primary rent-btn--block"
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
            {sealImg && (
              <img className="kf-asset-thumb" src={sealImg} alt={t('contracts.makeSeal')} style={{ marginTop: 12 }} />
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

      {/* 签署意愿二次验证弹窗 */}
      <Modal
        open={intentOpen}
        title={t('contracts.intentTitle')}
        okText={t('contracts.intentConfirm')}
        cancelText={t('common.cancel')}
        confirmLoading={signing}
        onOk={confirmIntent}
        onCancel={() => setIntentOpen(false)}
        maskClosable={false}
      >
        <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 12 }}>{t('contracts.intentDesc')}</div>
        {intentMasked && (
          <div className="rent-text-sm" style={{ marginBottom: 12, color: 'var(--rent-text-muted, #6b7280)' }}>
            {t('contracts.intentTo', { contact: intentMasked })}
          </div>
        )}
        <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
          <input
            className="rent-input"
            value={intentCode}
            placeholder={t('contracts.verifyCodePlaceholder')}
            onChange={(e) => setIntentCode(e.target.value)}
          />
          <button
            type="button"
            className="rent-btn rent-btn--ghost rent-btn--sm"
            disabled={intentSending || intentCountdown > 0}
            onClick={sendIntentCode}
            style={{ whiteSpace: 'nowrap' }}
          >
            {intentSending
              ? t('common.loading')
              : intentCountdown > 0
                ? t('contracts.resendIn', { s: intentCountdown })
                : intentMasked
                  ? t('contracts.resend')
                  : t('contracts.getCode')}
          </button>
        </div>
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
  maxWidth: 900,
  margin: '0 auto',
  padding: '24px 16px 64px',
  minHeight: '100vh',
  background: 'var(--rent-canvas, #f5f7fa)',
}

export default Sign