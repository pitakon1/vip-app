import type { ReactNode } from 'react'
import { Skeleton } from 'antd'
import type { ErrorKind } from '@/lib/errorText'

interface DataStateProps {
  /** 加载中：显示骨架屏 + 文案 */
  loading?: boolean
  /** 加载失败：红色提示 + 可选重试按钮，避免把失败误读成「没有数据」 */
  error?: string | null
  /** 失败类型：403/404/5xx/网络；决定图标与是否给重试入口 */
  errorKind?: ErrorKind
  /** 空数据：真的没有数据时为 true */
  empty?: boolean
  /** 空态是否由筛选条件导致，用于区分「真的没有」与「筛选无结果」 */
  filtered?: boolean
  loadingText?: ReactNode
  /** 加载骨架行数 */
  skeletonRows?: number
  /** 空态文案与操作；允许各页面保留自己的业务文案，不做强制统一 */
  emptyTitle?: ReactNode
  emptySub?: ReactNode
  emptyAction?: ReactNode
  retryText?: ReactNode
  onRetry?: () => void
}

/**
 * 列表/面板统一的三态：加载中（骨架）/ 加载失败（可重试）/ 空数据。
 *
 * - 失败态与空态在视觉与语义上都区分开：失败带 role="alert" 与重试入口；
 * - 空态通过 `filtered` 区分「数据确实为空」与「当前筛选无结果」，文案由调用方传入；
 * - 样式复用现有 `--rent-*` 令牌，不引入新依赖。
 */
export default function DataState({
  loading,
  error,
  errorKind = 'unknown',
  empty,
  filtered = false,
  loadingText,
  skeletonRows = 4,
  emptyTitle,
  emptySub,
  emptyAction,
  retryText,
  onRetry,
}: DataStateProps) {
  if (loading) {
    return (
      <div className="rent-empty rent-state rent-state--loading" role="status" aria-live="polite">
        <Skeleton active title={false} paragraph={{ rows: skeletonRows, width: '100%' }} />
        {loadingText ? <div className="rent-text-muted rent-state__sub">{loadingText}</div> : null}
      </div>
    )
  }
  if (error) {
    const icon = errorKind === 'forbidden' ? '⨯' : errorKind === 'notFound' ? '?' : '!'
    // 403/404 重试无意义，避免用「重试」把权限/地址问题伪装成临时故障
    const showRetry = onRetry && errorKind !== 'forbidden' && errorKind !== 'notFound'
    return (
      <div
        className="rent-empty rent-state rent-state--error"
        role="alert"
        data-kind={errorKind}
      >
        <div className="rent-state__icon" aria-hidden="true">
          {icon}
        </div>
        <div className="rent-state__title" style={{ color: 'var(--rent-danger)' }}>
          {error}
        </div>
        {showRetry ? (
          <button type="button" className="rent-btn rent-btn--secondary rent-state__action" onClick={onRetry}>
            {retryText}
          </button>
        ) : null}
      </div>
    )
  }
  if (!empty) return null
  return (
    <div className="rent-empty rent-state rent-state--empty" data-filtered={filtered ? 'true' : 'false'}>
      <div className="rent-state__icon" aria-hidden="true">
        {filtered ? '⌕' : '○'}
      </div>
      {emptyTitle ? <div className="rent-state__title">{emptyTitle}</div> : null}
      {emptySub ? <div className="rent-state__sub">{emptySub}</div> : null}
      {emptyAction ? <div className="rent-state__action">{emptyAction}</div> : null}
    </div>
  )
}
