import { useTranslation } from 'react-i18next'
import { Empty } from 'antd'
import type { MonthlyRecord } from '../types'

interface Props {
  records: MonthlyRecord[]
}

/** 系统核算的月度业绩记录（时间线） */
export const MonthlyRecordsCard = ({ records }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-card">
      <div className="rent-card__header">
        <h3 className="rent-card__title">{t('employeePerformance.recordsTitle')}</h3>
        {/* 原「查看全部」是 href="#" 死入口：项目里没有独立的业绩记录页，
            本页就是该数据的完整视图，故移除假控件。 */}
      </div>
      <div className="rent-card__body">
        {records.length === 0 ? (
          <div className="rent-empty" style={{ padding: '32px 0' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeePerformance.emptyRecords')} />
          </div>
        ) : (
          <div className="rent-timeline">
            {records.map((item) => (
              <div key={item.month} className="rent-timeline__item">
                <div className={`rent-timeline__dot rent-timeline__dot--${item.tone}`} />
                <div className="rent-flex rent-flex--between">
                  <div>
                    <div className="rent-mb-2">
                      <span className="rent-text-bold">{item.month}</span>
                      <span className={`rent-badge rent-badge--${item.tone}`} style={{ marginLeft: 8 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {item.tone === 'warning' ? (
                            <>
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </>
                          ) : (
                            <path d="M20 6L9 17l-5-5" />
                          )}
                        </svg>
                        {item.statusText}
                      </span>
                    </div>
                    <div className="rent-text-sm rent-text-muted">{item.desc}</div>
                  </div>
                  <span className="rent-text-sm rent-text-muted">{item.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
