/**
 * 「按合作公司」页签：日期筛选 + 汇总表。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，类名与渲染逻辑保持不变。
 */
import { Empty, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import { useCompaniesTab } from './hooks/useCompaniesTab'
import type { AttendanceTab } from './attendanceTypes'

export default function CompaniesTab({
  tab,
  companyLabel,
}: {
  tab: AttendanceTab
  companyLabel: (name: string | null) => string
}) {
  const { t } = useTranslation()
  const { companyRange, setCompanyRange, companyRows, loadingCompanies, loadCompanies } =
    useCompaniesTab(tab)

  return (
    <>
      <div className="rent-card rent-mb-5">
        <div className="rent-card__body attAdm-filter">
          <label className="rent-label">{t('attAdm.dateRange')}</label>
          <input
            className="rent-input"
            type="date"
            value={companyRange.start}
            onChange={(e) => setCompanyRange((p) => ({ ...p, start: e.target.value }))}
          />
          <span className="attAdm-filter__sep">~</span>
          <input
            className="rent-input"
            type="date"
            value={companyRange.end}
            onChange={(e) => setCompanyRange((p) => ({ ...p, end: e.target.value }))}
          />
          <button className="rent-btn rent-btn--primary" onClick={loadCompanies}>
            {t('common.search')}
          </button>
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('attAdm.companiesTitle')}</h3>
          <span className="rent-caption">{t('attAdm.companiesHint')}</span>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('attAdm.thCompany')}</th>
                  <th>{t('attAdm.thMembers')}</th>
                  <th>{t('attendance.stPresent')}</th>
                  <th>{t('attendance.stLate')}</th>
                  <th>{t('attendance.stEarlyOut')}</th>
                  <th>{t('attendance.stAbsent')}</th>
                  <th>{t('attAdm.thAbnormal')}</th>
                  <th>{t('attAdm.kpiRate')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingCompanies ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="rent-empty">
                        <Spin size="small" style={{ marginRight: 8 }} />
                        {t('common.loading')}
                      </div>
                    </td>
                  </tr>
                ) : companyRows.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="rent-empty">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t('common.noData')}
                        />
                      </div>
                    </td>
                  </tr>
                ) : (
                  companyRows.map((row) => (
                    <tr key={row.partner_id ?? 'unassigned'}>
                      <td className="rent-text-bold">{companyLabel(row.partner_name)}</td>
                      <td>{row.member_count ?? 0}</td>
                      <td>{row.present ?? 0}</td>
                      <td>
                        {row.late > 0 ? (
                          <span className="rent-badge rent-badge--warning">{row.late}</span>
                        ) : (
                          <span className="rent-badge rent-badge--neutral">0</span>
                        )}
                      </td>
                      <td>
                        {row.early_out > 0 ? (
                          <span className="rent-badge rent-badge--warning">{row.early_out}</span>
                        ) : (
                          <span className="rent-badge rent-badge--neutral">0</span>
                        )}
                      </td>
                      <td>
                        {row.absent > 0 ? (
                          <span className="rent-badge rent-badge--error">{row.absent}</span>
                        ) : (
                          <span className="rent-badge rent-badge--neutral">0</span>
                        )}
                      </td>
                      <td>
                        {row.abnormal > 0 ? (
                          <span className="rent-badge rent-badge--warning">{row.abnormal}</span>
                        ) : (
                          <span className="rent-badge rent-badge--neutral">0</span>
                        )}
                      </td>
                      <td>{row.attendance_rate ?? 0}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
