import React from 'react';
import LoadingState from './LoadingState';
import EmptyState from './EmptyState';

interface ListStateProps {
  loading?: boolean;
  /** 失败文案；非空即渲染失败态 */
  error?: string | null;
  /** 数据为空时为 true */
  empty?: boolean;
  /** 空态是否由筛选条件导致，用于区分「真的没有」与「筛选无结果」 */
  filtered?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptySub?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

/**
 * 列表统一三态：加载中 / 加载失败（可重试）/ 空数据。
 * 底层复用 LoadingState 与 EmptyState，页面不再各自拼装状态块。
 */
export default function ListState({
  loading,
  error,
  empty,
  filtered = false,
  loadingLabel,
  emptyTitle,
  emptySub,
  retryLabel,
  onRetry,
}: ListStateProps) {
  if (loading) return <LoadingState label={loadingLabel} />;
  if (error) {
    return <EmptyState tone="error" title={error} actionLabel={retryLabel} onAction={onRetry} />;
  }
  if (empty) {
    return (
      <EmptyState
        tone="empty"
        icon={filtered ? 'search-outline' : 'file-tray-outline'}
        title={emptyTitle ?? ''}
        sub={emptySub}
        actionLabel={retryLabel && onRetry ? retryLabel : undefined}
        onAction={onRetry}
      />
    );
  }
  return null;
}
