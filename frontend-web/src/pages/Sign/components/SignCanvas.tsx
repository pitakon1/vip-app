import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CANVAS_W, CANVAS_H, MIN_W, MAX_W, DEFAULT_W } from '../constants'

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

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.strokeStyle = '#171a1d'
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
        return `<path d="M ${s.map((p) => `${p[0]},${p[1]}`).join(' L ')}" fill="none" stroke="#171a1d" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
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
          border: '2px dashed var(--rent-line, #e2e5e8)',
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

export default SignCanvas
