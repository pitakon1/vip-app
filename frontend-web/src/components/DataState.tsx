import type { ReactNode } from 'react'
import { Spin } from 'antd'

interface DataStateProps {
  /** 加载中：显示转圈 + 文案 */
  loading?: boolean
  /** 加载失败：红色提示 + 可选重试按钮，避免把失败误读成「没有数据」 */
  error?: string | null
  loadingText?: ReactNode
  retryText?: ReactNode
  onRetry?: () => void
}

/**
 * 列表/面板统一的「加载中 / 加载失败」两态。
 * 空数据仍由各页面保留自己的插画式空态（视觉更贴合业务），
 * 但失败态必须与空态区分开，并提供重试入口。
 */
export default function DataState({ loading, error, loadingText, retryText, onRetry }: DataStateProps) {
  if (loading) {
    return (
      <div className="rent-empty" role="status" aria-live="polite">
        <Spin />
        {loadingText ? (
          <div className="rent-text-muted" style={{ marginTop: 8 }}>
            {loadingText}
          </div>
        ) : null}
      </div>
    )
  }
  if (error) {
    return (
      <div className="rent-empty" role="alert">
        <div style={{ color: 'var(--rent-danger)' }}>{error}</div>
        {onRetry ? (
          <button type="button" className="rent-btn rent-btn--secondary" style={{ marginTop: 12 }} onClick={onRetry}>
            {retryText}
          </button>
        ) : null}
      </div>
    )
  }
  return null
}
