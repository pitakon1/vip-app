/**
 * 合同报表统计条：只读展示「合同总数 / 已作废 / 已拒签 / 终止类（含占比）」。
 * 数据来自 GET /contracts/stats，字段与 contractTypes.ContractStats 一致。
 * 三态：加载中（骨架）/ 加载失败（可重试）/ 暂无数据，失败不得伪装成空数据。
 */
import { Skeleton } from 'antd'
import { useTranslation } from 'react-i18next'
import type { ContractStats } from './contractTypes'

export default function ContractStatsBar({
  stats,
  loading,
  error,
  onRetry,
}: {
  stats: ContractStats | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const rate = stats ? (stats.terminated.rate * 100).toFixed(1) : ''

  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__body">
        {loading ? (
          <Skeleton active paragraph={{ rows: 1 }} title={false} />
        ) : error ? (
          <div className="kf-stats__error">
            <span>{error}</span>
            <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={onRetry}>
              {t('common.retry')}
            </button>
          </div>
        ) : !stats ? (
          <span className="rent-text-sm rent-text-muted">{t('common.noData')}</span>
        ) : (
          <div className="kf-stats">
            <div className="kf-stats__item">
              <span className="kf-stats__label">{t('contracts.statsTotal')}</span>
              <span className="kf-stats__value">{stats.total}</span>
            </div>
            <div className="kf-stats__item">
              <span className="kf-stats__label">{t('contracts.statsVoided')}</span>
              <span className="kf-stats__value">{stats.by_status.voided ?? 0}</span>
            </div>
            <div className="kf-stats__item">
              <span className="kf-stats__label">{t('contracts.statsRejected')}</span>
              <span className="kf-stats__value">{stats.by_status.rejected ?? 0}</span>
            </div>
            <div className="kf-stats__item">
              <span className="kf-stats__label">{t('contracts.statsTerminated')}</span>
              <span className="kf-stats__value">
                {stats.terminated.count}
                <span className="kf-stats__rate">{t('contracts.statsTerminatedRate', { rate })}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
