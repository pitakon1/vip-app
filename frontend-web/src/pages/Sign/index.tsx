import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { message, Modal } from 'antd'
import { contractsPublicApi } from '@/services/api'
import { useTranslation } from 'react-i18next'
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
  [k: string]: unknown
}

/* 手写签名画布：pointer 绘制多条笔迹，导出为「纯 SVG path 字符串」。 */
const SignCanvas = ({ value, onChange }: { value: string; onChange: (svg: string) => void }) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<number[][][]>(value ? parseStrokes(value) : [])
  const drawingRef = useRef(false)

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
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    strokesRef.current.forEach((stroke) => {
      if (stroke.length < 2) return
      ctx.beginPath()
      ctx.moveTo(stroke[0][0], stroke[0][1])
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i][0], stroke[i][1])
      ctx.stroke()
    })
  }

  const emit = () => {
    const paths = strokesRef.current
      .filter((s) => s.length >= 2)
      .map(
        (s) =>
          `<path d="M ${s.map((p) => `${p[0]},${p[1]}`).join(' L ')}" fill="none" stroke="#1f2937" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
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
    canvasRef.current?.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !strokesRef.current.length) return
    strokesRef.current[strokesRef.current.length - 1].push(pointFrom(e.nativeEvent))
    redraw()
    emit()
  }
  const onUp = () => {
    drawingRef.current = false
    redraw()
    emit()
  }

  const clear = () => {
    strokesRef.current = []
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
      <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" onClick={clear} style={{ marginTop: 8 }}>
        {t('contracts.clearSign')}
      </button>
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

  // 打开某字段的签署面板
  const openSignPanel = (f: SignField) => {
    setActiveField(f)
    setSignature('')
  }

  // 执行一次签署 POST
  const doSign = async (field: SignField, svg?: string) => {
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
        // 触发实名认证，完成后回签该字段
        setPendingSign(() => () => doSign(field, svg))
        setRealOpen(true)
        setRealStep('send')
        message.warning(t('contracts.realNameRequired'))
      } else if (status === 410) setFail('expired')
      else if (status === 409) setFail('signed')
      else message.error(err?.response?.data?.detail || t('contracts.errGenericSubmit'))
    } finally {
      setSigning(false)
    }
  }

  const confirmSign = async () => {
    if (!activeField) return
    const ft = activeField.field_type as SignFieldType
    // 手写签名必须已绘制
    if (ft === 'signature' && !signature.trim()) {
      message.warning(t('contracts.blankSign'))
      return
    }
    try {
      await doSign(activeField, ft === 'signature' ? signature : undefined)
    } catch {
      /* doSign 内部已处理错误 */
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

  const today = new Date()
  const dateText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 过期 / 已签署 / 通用错误
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

  // 覆盖层仍可交互时禁止手写画布穿透
  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{doc?.title || ''}</h2>
      </div>

      {/* 原文 + 签署覆盖层（法大大式） */}
      <div className="rent-card" style={{ marginBottom: 16 }}>
        <div className="rent-card__body" style={{ padding: doc?.source === 'uploaded' && doc?.file_url ? 0 : 12 }}>
          {doc?.source === 'uploaded' && doc?.file_url ? (
            <div>
              <iframe src={fileUrl} title={doc?.title || 'contract'} style={{ width: '100%', height: 520, border: 'none', background: '#fff' }} />
              <div style={{ padding: '10px 12px', textAlign: 'right' }}>
                <a className="rent-btn rent-btn--ghost rent-btn--sm" href={fileUrl} target="_blank" rel="noopener noreferrer" download>
                  {t('contracts.downloadView')}
                </a>
              </div>
            </div>
          ) : doc?.content_html ? (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ position: 'relative', width: PREVIEW_W, maxWidth: '100%', margin: '0 auto' }}>
                <div
                  className="rent-contract-html"
                  style={{ width: PREVIEW_W, lineHeight: 1.9, fontSize: 14, wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{ __html: String(doc.content_html) }}
                />
                {signFields.map((f) =>
                  f.signed ? (
                    <div
                      key={f.id}
                      style={{
                        position: 'absolute',
                        left: f.x,
                        top: f.y,
                        width: f.w,
                        height: f.h,
                        border: '2px solid #10b981',
                        borderRadius: 6,
                        background: 'rgba(16,185,129,0.10)',
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }}
                    >
                      <div style={{ position: 'absolute', top: -18, left: 0, fontSize: 11, color: '#10b981', background: '#fff', padding: '0 4px', border: '1px solid #10b981', borderRadius: 4, whiteSpace: 'nowrap' }}>
                        ✓ {t('contracts.stSigned')}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={f.id}
                      className="rent-sign-slot"
                      onClick={() => openSignPanel(f)}
                      style={{
                        position: 'absolute',
                        left: f.x,
                        top: f.y,
                        width: f.w,
                        height: f.h,
                      }}
                    />
                  ),
                )}
              </div>
              <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>
                ↓ {t('contracts.placeHintPublic', { n: pendingFields.length })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 待签进度 */}
      <div className="rent-card" style={{ marginBottom: 16 }}>
        <div className="rent-card__body">
          <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signProgress')}</div>
          {signFields.length === 0 ? (
            <div className="rent-text-sm rent-text-muted">{t('contracts.noFiledOnlyParty')}</div>
          ) : (
            signFields.map((f) => (
              <div key={f.id} className="rent-sign-slot__row">
                <span className={f.signed ? 'rent-badge rent-badge--success' : 'rent-badge rent-badge--warning'}>
                  {f.signed ? '✓ ' : ''}
                  {t(`contracts.fType_${f.field_type || 'signature'}`) || f.field_type}
                </span>
                {!f.signed && (
                  <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openSignPanel(f)}>
                    {t('contracts.signThis')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 单个签署面板 */}
      <Modal
        open={!!activeField}
        title={t(`contracts.fType_${activeField?.field_type || 'signature'}`)}
        okText={t('contracts.confirmSign')}
        cancelText={t('common.cancel')}
        confirmLoading={signing}
        onOk={confirmSign}
        onCancel={() => {
          setActiveField(null)
          setSignature('')
        }}
      >
        {activeField && (
          <div>
            {activeField.field_type === 'seal' ? (
              <div style={{ textAlign: 'center' }}>
                <CompanySeal name={doc?.party_name_masked || ''} />
                <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.sealConfirmHint')}</div>
              </div>
            ) : activeField.field_type === 'date' ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 42, fontWeight: 600 }}>{dateText}</div>
                <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.dateStampHint')}</div>
              </div>
            ) : (
              <div>
                <SignCanvas value={signature} onChange={setSignature} />
                <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.drawHint')}</div>
              </div>
            )}
          </div>
        )}
      </Modal>

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