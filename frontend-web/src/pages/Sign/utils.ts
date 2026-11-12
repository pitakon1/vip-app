import type { Placed, SignField } from './types'

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const round2 = (v: number) => Math.round(v * 100) / 100

/** 签署区稳定 key：预览与清单必须用同一份判定 */
export const fieldKey = (f: SignField) =>
  f.id || `${f.field_type || 'signature'}-${f.page || 1}-${f.x}-${f.y}`

/** 已落章是否覆盖该预置签署区（页码 + 坐标差 < 1），DocumentPanel 与清单共用 */
export const isFieldCovered = (field: SignField, placed: Placed[]) =>
  placed.some(
    (p) => p.page === (field.page || 1) && Math.abs(p.x - field.x) < 1 && Math.abs(p.y - field.y) < 1,
  )

/** 清单状态：已签（后端字段）> 已放（本地落章覆盖）> 待放 */
export const isFieldDone = (field: SignField, placed: Placed[]) =>
  !!field.signed || isFieldCovered(field, placed)

/** 清单排序：页码升序，同页按 y 升序，与阅读顺序一致 */
export const sortSignFields = (fields: SignField[]) =>
  [...fields].sort((a, b) => (a.page || 1) - (b.page || 1) || a.y - b.y)

/** 把 SignCanvas 导出的 SVG 光栅化为 PNG dataURL（Web 端 canvas 直接绘制）。 */
export const svgToPngDataUrl = (svg: string, w: number, h: number): Promise<string> =>
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
