import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { SEAL_BOX, SIGN_BOX, TAP_DROP } from '../constants'
import { clamp } from '../utils'
import type { DragState, Placed, SignField, TrayKind } from '../types'

/** 已落框、托盘拖拽、预置签署区点签等全部落章交互 */
export const usePlacement = ({
  seal,
  signature,
}: {
  seal: { dataUrl: string } | null
  signature: { svg: string; png: string } | null
}) => {
  const { t } = useTranslation()

  // 当前文档页（PDF 多页时用于逐页落章）
  const [currentPage, setCurrentPage] = useState(1)

  // 已落框成品（本地坐标；不落库，签署时随 sign-batch 原子提交）
  const [placed, setPlaced] = useState<Placed[]>([])
  const placedKeyRef = useRef(0)

  // 指针拖拽（鼠标 + 触屏 + 触控笔统一走 pointer 事件；HTML5 拖拽在触屏浏览器不触发，
  // 此前公开签署页在手机上无法落章，签署按钮永久置灰）。浮层用于给出手指/光标跟随反馈。
  const [ghost, setGhost] = useState<{ kind: TrayKind; x: number; y: number } | null>(null)
  const [movingKey, setMovingKey] = useState<number | null>(null)
  const dragRef = useRef<DragState>({ kind: null, key: null, startX: 0, startY: 0, moved: false })
  const currentPageRef = useRef(1)

  // 文档区落点容器（拖放坐标换算基准）
  const docRef = useRef<HTMLDivElement>(null)

  const pushPlaced = (p: Omit<Placed, 'key'>) => {
    placedKeyRef.current += 1
    setPlaced((prev) => [...prev, { ...p, key: placedKeyRef.current }])
  }

  // ===== 落章（指针事件，鼠标 / 触屏 / 触控笔通用）=====
  // 此前用 HTML5 draggable + dragstart/drop 实现「从托盘拖到文档」，但触屏浏览器
  // 不触发这些事件，公开签署链接（多在手机聊天里打开）根本无法落章，底部「签署」
  // 按钮因 placed.length === 0 永久置灰。改走 pointer 事件，并补「点按即落章」路径，
  // 使桌面与移动端行为一致（对齐 App / 小程序的触摸手势）。
  const addPlaced = useCallback(
    (kind: TrayKind, px: number, py: number, box?: { w: number; h: number }) => {
      if (kind === 'seal') {
        if (!seal) return
        const { w, h } = box || SEAL_BOX
        placedKeyRef.current += 1
        setPlaced((prev) => [
          ...prev,
          {
            key: placedKeyRef.current,
            page: currentPageRef.current,
            x: clamp(px - w / 2, 0, 100 - w),
            y: clamp(py - h / 2, 0, 100 - h),
            w,
            h,
            method: 'company_seal',
            imageDataUrl: seal.dataUrl,
          },
        ])
        return
      }
      if (!signature) return
      const { w, h } = box || SIGN_BOX
      placedKeyRef.current += 1
      setPlaced((prev) => [
        ...prev,
        {
          key: placedKeyRef.current,
          page: currentPageRef.current,
          x: clamp(px - w / 2, 0, 100 - w),
          y: clamp(py - h / 2, 0, 100 - h),
          w,
          h,
          method: 'personal_handwrite',
          imageDataUrl: signature.png,
          signatureSvg: signature.svg,
        },
      ])
    },
    [seal, signature],
  )
  // 窗口级 pointer 监听器在 mount 时一次性注册（见下方 effect），运行时需拿到
  // 「最新一版」的 addPlaced（其闭包捕获了当前已制作的 seal / signature）。
  // 用 ref 做转发：每次渲染都把最新函数写回，监听器永远调用到最新实现。
  const addPlacedRef = useRef(addPlaced)
  addPlacedRef.current = addPlaced

  // 点预置签署区：按该签署区自身的坐标与尺寸落章 —— 发起方布置在哪里，就签在哪里
  const signOnField = (f: SignField) => {
    const w = f.w > 0 ? f.w : 20
    const h = f.h > 0 ? f.h : 8
    if (f.field_type === 'date') {
      pushPlaced({ page: f.page || 1, x: f.x, y: f.y, w, h, method: 'date' })
      return
    }
    if (f.field_type === 'seal') {
      if (!seal) {
        message.warning(t('contracts.tapMakeSeal'))
        return
      }
      addPlaced('seal', f.x + w / 2, f.y + h / 2, { w, h })
      return
    }
    if (!signature) {
      message.warning(t('contracts.tapSign'))
      return
    }
    addPlaced('sign', f.x + w / 2, f.y + h / 2, { w, h })
  }

  const removePlaced = (key: number) => {
    setPlaced((prev) => prev.filter((p) => p.key !== key))
  }

  // 托盘条目 / 已落框：pointerdown 启动拖拽，在 window 上跟踪 move / up，
  // 保证手指或光标移出元素范围后仍能顺畅跟手并正确落点。
  const beginCarry = (kind: TrayKind) => (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { kind, key: null, startX: e.clientX, startY: e.clientY, moved: false }
    setGhost({ kind, x: e.clientX, y: e.clientY })
  }

  const beginMove = (key: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { kind: null, key, startX: e.clientX, startY: e.clientY, moved: false }
    setMovingKey(key)
  }

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  // 窗口级 pointer 监听器：**必须 mount 时一次性注册**。
  // 若把「是否正在拖拽」作为依赖并在空状态下 early-return，则 pointerdown → React
  // 重渲染 → effect 重跑 之间存在一个提交间隙；浏览器合成点击 / 快速点按的
  // pointerup 往往就在同一 tick 内到达，此时监听器尚未挂上 —— 结果「点一下印章条目」
  // 静默失效（托盘高亮闪一下、文档区却什么都没落）。改为常驻监听 + dragRef 读态。
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d.kind && d.key === null) return
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6) d.moved = true
      if (d.kind) setGhost({ kind: d.kind, x: e.clientX, y: e.clientY })
      if (d.key !== null && docRef.current) {
        const rect = docRef.current.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const px = ((e.clientX - rect.left) / rect.width) * 100
        const py = ((e.clientY - rect.top) / rect.height) * 100
        setPlaced((prev) =>
          prev.map((p) =>
            p.key === d.key
              ? {
                  ...p,
                  page: currentPageRef.current,
                  x: clamp(px - p.w / 2, 0, 100 - p.w),
                  y: clamp(py - p.h / 2, 0, 100 - p.h),
                }
              : p,
          ),
        )
      }
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      if (d.kind) {
        const rect = docRef.current?.getBoundingClientRect()
        const inside =
          !!rect &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        if (inside && rect.width && rect.height) {
          const px = ((e.clientX - rect.left) / rect.width) * 100
          const py = ((e.clientY - rect.top) / rect.height) * 100
          addPlacedRef.current(d.kind, px, py)
        } else if (!d.moved) {
          // 纯点按（未拖动）：落到默认签署位置，避免「拖不动就完全签不了」
          addPlacedRef.current(d.kind, TAP_DROP.x, TAP_DROP.y)
        }
      }
      dragRef.current = { kind: null, key: null, startX: 0, startY: 0, moved: false }
      setGhost(null)
      setMovingKey(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return {
    currentPage,
    setCurrentPage,
    placed,
    ghost,
    movingKey,
    docRef,
    signOnField,
    removePlaced,
    beginCarry,
    beginMove,
  }
}
