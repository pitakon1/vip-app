import { useTranslation } from 'react-i18next'
import { Empty } from 'antd'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { MonthPerf } from '../types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
)

interface Props {
  monthly: MonthPerf[]
  data: ChartData<'line'>
  options: ChartOptions<'line'>
}

/** 最近 12 个月营收 / 佣金趋势 */
export const TrendChartCard = ({ monthly, data, options }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employeePerformance.trendTitle')}</h3>
        <span className="rent-text-sm rent-text-muted">{t('employeePerformance.trendSubtitle')}</span>
      </div>
      <div className="rent-card__body">
        {monthly.length === 0 ? (
          <div className="rent-empty" style={{ padding: '32px 0' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyRecords')} />
          </div>
        ) : (
          <div style={{ height: 260 }}>
            <Line data={data} options={options} />
          </div>
        )}
      </div>
    </div>
  )
}
