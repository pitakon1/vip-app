import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { message } from 'antd'
import { contractsPublicApi } from '@/services/api'
import { useTranslation } from 'react-i18next'

/** 画布逻辑尺寸（签名导出 SVG 的 viewBox 基准），CSS 端等比缩放占满宽度 */
const CANVAS_W = 400
const CANVAS_H = 140

type Phase = 'loading' | 'ready' | 'done'
type FailType = 'expired' | 'signed' | 'generic' | null

interface ContractDoc {
  contract_id?: string
  title?: string
  content_html?: string
  source?: string
  file_url?: string
  party_name_masked?: string
  party_role?: string
  expires_at?: string | null
  [k: string]: unknown
}

/* 手写签名画布：pointer 绘制多条笔迹，导出为「纯 SVG path 字符串」。
   生成的 <svg> 只含固定属性与 <path d>，不含 href/xlink/script/on* 等被后端黑名单拦的属性。 */
const SignCanvas = ({ onChange }: { onChange: (svg: string) => void }) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<number[][][]>([]) // 每条 stroke: [[x,y], ...]
  const drawingRef = useRef(false)

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

const Sign = () => {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('loading')
  const [doc, setDoc] = useState<ContractDoc | null>(null)
  const [fail, setFail] = useState<FailType>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [signature, setSignature] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ signed?: boolean; signature_hash?: string; contract_status?: string } | null>(null)

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

  // auto = true 表示不提交手写签名，交由后端自动生成
  const submit = async (auto = false) => {
    if (phase !== 'ready' || !doc) return
    if (!name.trim()) {
      message.warning(t('contracts.blankName'))
      return
    }
    setSubmitting(true)
    try {
      const res: any = await contractsPublicApi.submit(token, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        id_number: idNumber.trim() || undefined,
        ...(signature && !auto ? { signature_svg: signature } : {}),
      })
      const data = res?.data || {}
      setResult({
        signed: !!data.signed,
        signature_hash: data.signature_hash,
        contract_status: data.contract_status,
      })
      setPhase('done')
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 410) setFail('expired')
      else if (status === 409) setFail('signed')
      else setFail('generic')
      setPhase('done')
    } finally {
      setSubmitting(false)
    }
  }

  // 过期 / 已签署 / 通用错误：整页提示
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

  // 签署成功
  if (phase === 'done' && result?.signed) {
    return (
      <div style={pageStyle}>
        <div className="rent-card">
          <div className="rent-card__body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 44, lineHeight: 1 }}>✅</div>
            <div className="rent-text-bold" style={{ fontSize: 20, margin: '12px 0 6px' }}>{t('contracts.successTitle')}</div>
            <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 16 }}>{t('contracts.signedDesc')}</div>
            {result.signature_hash && (
              <div className="rent-text-sm rent-text-muted" style={{ wordBreak: 'break-all' }}>
                {t('contracts.signatureHash')}：{result.signature_hash.slice(0, 24)}…
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // loading
  if (phase === 'loading') {
    return (
      <div style={pageStyle}>
        <div className="rent-card"><div className="rent-card__body" style={{ textAlign: 'center', padding: '32px' }}>{t('common.loading')}</div></div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      {/* 标题 */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{doc?.title || ''}</h2>
      </div>

      {/* 原文展示 */}
      <div className="rent-card" style={{ marginBottom: 16 }}>
        <div className="rent-card__body" style={{ padding: doc?.source === 'uploaded' && doc?.file_url ? 0 : 16 }}>
          {doc?.source === 'uploaded' && doc?.file_url ? (
            <div>
              <iframe src={fileUrl} title={doc?.title || 'contract'} style={{ width: '100%', height: 520, border: 'none', background: '#fff' }} />
              <div style={{ padding: '10px 12px', textAlign: 'right' }}>
                <a className="rent-btn rent-btn--ghost rent-btn--sm" href={fileUrl} target="_blank" rel="noopener noreferrer" download>
                  {t('contracts.downloadView')}
                </a>
              </div>
            </div>
          ) : (
            doc?.content_html && (
              <div
                className="rent-contract-html"
                style={{ lineHeight: 1.9, fontSize: 14, wordBreak: 'break-word' }}
                // 后端已保证 content_html 安全（HTML 白名单 + 哈希），此处受控渲染
                dangerouslySetInnerHTML={{ __html: String(doc.content_html) }}
              />
            )
          )}
        </div>
      </div>

      {/* 签署表单 */}
      <div className="rent-card">
        <div className="rent-card__header"><h3 className="rent-card__title">{t('contracts.fillInfo')}</h3></div>
        <div className="rent-card__body">
          <div className="rent-field" style={{ marginBottom: 12 }}>
            <label className="rent-label">{t('contracts.fName')}</label>
            <input
              className="rent-input"
              value={name}
              placeholder={doc?.party_name_masked || t('contracts.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="rent-field" style={{ marginBottom: 12 }}>
            <label className="rent-label">{t('contracts.fPhone')}</label>
            <input className="rent-input" value={phone} placeholder={t('contracts.phonePlaceholder')} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="rent-field" style={{ marginBottom: 16 }}>
            <label className="rent-label">{t('contracts.idNumber')}</label>
            <input className="rent-input" value={idNumber} placeholder={t('contracts.idNumberPlaceholder')} onChange={(e) => setIdNumber(e.target.value)} />
          </div>

          <div className="rent-field" style={{ marginBottom: 20 }}>
            <label className="rent-label">{t('contracts.drawSign')}</label>
            <SignCanvas onChange={setSignature} />
            <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.drawHint')}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            <button type="button" className="rent-btn rent-btn--primary" disabled={submitting} onClick={() => submit(false)}>
              {t('contracts.submitSign')}
            </button>
            <button type="button" className="rent-btn rent-btn--ghost" disabled={submitting} onClick={() => submit(true)}>
              {t('contracts.autoSign')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  padding: '24px 16px 64px',
  minHeight: '100vh',
  background: 'var(--rent-canvas, #f5f7fa)',
}

export default Sign