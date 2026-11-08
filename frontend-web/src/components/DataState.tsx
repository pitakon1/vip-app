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

type StateIconKind = 'forbidden' | 'notFound' | 'error' | 'filtered' | 'empty'

/** 空/错状态图标：用 SVG 替代 ⨯ ? ! ⌕ ○，避免不同字体下字形与基线不一致 */
function StateIcon({ kind }: { kind: StateIconKind }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'forbidden' && (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      )}
      {kind === 'notFound' && (
        <>
          <path d="M9.09 9a3 3 0 1 1 4.6 2.5c-.9.6-1.7 1.2-1.7 2.5" />
          <path d="M12 17h.01" />
        </>
      )}
      {kind === 'error' && (
        <>
          <path d="M12 8v5" />
          <path d="M12 17h.01" />
        </>
      )}
      {kind === 'filtered' && (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.6-3.6" />
        </>
      )}
      {kind === 'empty' && (
        <>
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </>
      )}
    </svg>
  )
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
    const iconKind: StateIconKind =
      errorKind === 'forbidden' ? 'forbidden' : errorKind === 'notFound' ? 'notFound' : 'error'
    // 403/404 重试无意义，避免用「重试」把权限/地址问题伪装成临时故障
    const showRetry = onRetry && errorKind !== 'forbidden' && errorKind !== 'notFound'
    return (
      <div
        className="rent-empty rent-state rent-state--error"
        role="alert"
        data-kind={errorKind}
      >
        <div className="rent-state__icon" aria-hidden="true">
          <StateIcon kind={iconKind} />
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
        <StateIcon kind={filtered ? 'filtered' : 'empty'} />
      </div>
      {emptyTitle ? <div className="rent-state__title">{emptyTitle}</div> : null}
      {emptySub ? <div className="rent-state__sub">{emptySub}</div> : null}
      {emptyAction ? <div className="rent-state__action">{emptyAction}</div> : null}
    </div>
  )
}
