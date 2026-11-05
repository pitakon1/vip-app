import React from 'react';
import ListState from './ListState';
import { useI18n } from '@/i18n';

export type DataStateErrorKind = 'forbidden' | 'notFound' | 'server' | 'network' | 'unknown';

interface DataStateProps {
  loading?: boolean;
  /** 失败文案；非空即渲染失败态 */
  error?: string | null;
  /** 失败类型：403/404 不提供重试（重试也不会成功） */
  errorKind?: DataStateErrorKind;
  empty?: boolean;
  filtered?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptySub?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

/**
 * 统一数据状态（loading / empty / error / forbidden）。
 *
 * App 端此前各页把请求失败 catch 成「0 / 暂无数据」，用户无法分辨是没数据还是加载失败。
 * 这里按 403 / 404 / 5xx / 网络错误区分文案：403 与 404 不显示重试按钮。
 */
export default function DataState({
  loading,
  error,
  errorKind = 'unknown',
  empty,
  filtered,
  loadingLabel,
  emptyTitle,
  emptySub,
  retryLabel,
  onRetry,
}: DataStateProps) {
  const { t } = useI18n();

  if (loading) return <ListState loading loadingLabel={loadingLabel} />;
  if (error) {
    const noRetry = errorKind === 'forbidden' || errorKind === 'notFound';
    const title =
      errorKind === 'forbidden'
        ? t('error.noPermission')
        : errorKind === 'notFound'
          ? t('error.notFound')
          : error;
    return (
      <ListState
        error={title}
        retryLabel={noRetry ? undefined : retryLabel ?? t('common.retry')}
        onRetry={noRetry ? undefined : onRetry}
      />
    );
  }
  if (empty) {
    return <ListState empty filtered={filtered} emptyTitle={emptyTitle} emptySub={emptySub} retryLabel={retryLabel} onRetry={onRetry} />;
  }
  return null;
}
