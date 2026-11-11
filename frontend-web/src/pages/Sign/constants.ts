import type { CSSProperties } from 'react'

/** 画布逻辑尺寸（签名导出 SVG 的 viewBox 基准），CSS 端等比缩放占满宽度 */
export const CANVAS_W = 400
export const CANVAS_H = 140

// 文档区预览基准宽度（坐标一律为页面宽高百分比，界面上从不展示裸数字）
export const PREVIEW_W = 800
// 落框默认尺寸（页面宽高百分比；A4 竖版下近似保持印章/签名的原始比例）。
// 与 App / 小程序统一为同一组数值（印章宽 16% ≈ A4 下正方形，签名 24×8）。
export const SEAL_BOX = { w: 16, h: 11.3 }
export const SIGN_BOX = { w: 24, h: 8 }
// 点按（未拖拽）时的默认落点：页面中部偏下，靠近常见签署位置
export const TAP_DROP = { x: 30, y: 74 }

/* 手写笔迹线宽区间（快=细、慢=粗，对齐开放签笔触）。
   必须放在模块作用域：此前它们声明在组件体内、却在 `useRef` 那行之前被引用，
   于是 `widthsRef` 的初始化实参 `strokesRef.current.map(() => DEFAULT_W)` 在
   每次重渲染时都会命中「暂时性死区」——空画布时 map 不回调所以侥幸不报错，
   一旦落笔有笔迹，emit()→父组件 setState→重渲染，map 回调被调用即抛
   `Cannot access 'DEFAULT_W' before initialization`，整页被错误边界接管。
   即：用户画下第一笔，签名页就崩。 */
export const MIN_W = 1
export const MAX_W = 4
export const DEFAULT_W = 3

export const pageStyle: CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '24px 16px 96px',
  minHeight: '100vh',
  background: 'var(--rent-canvas, #f4f6f7)',
}
