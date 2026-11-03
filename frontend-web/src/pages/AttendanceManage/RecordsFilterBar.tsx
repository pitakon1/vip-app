/**
 * 「核对」页签的筛选栏。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，类名、控件顺序与查询动作保持不变。
 */
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

type DateRange = { start: string; end: string }

export default function RecordsFilterBar({
  range,
  setRange,
  recordsDept,
  setRecordsDept,
  recordsPartner,
  setRecordsPartner,
  deptOptions,
  companyOptions,
  companyLabel,
  showCompanyPicker,
  onSearch,
}: {
  range: DateRange
  setRange: Dispatch<SetStateAction<DateRange>>
  recordsDept: string
  setRecordsDept: Dispatch<SetStateAction<string>>
  recordsPartner: string
  setRecordsPartner: Dispatch<SetStateAction<string>>
  deptOptions: string[]
  companyOptions: { id: string; name: string | null }[]
  companyLabel: (name: string | null) => string
  showCompanyPicker: boolean
  onSearch: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rent-card rent-mb-5">
      <div className="rent-card__body attAdm-filter">
        <label className="rent-label">{t('attAdm.dateRange')}</label>
        <input
          className="rent-input"
          type="date"
          value={range.start}
          onChange={(e) => setRange((p) => ({ ...p, start: e.target.value }))}
        />
        <span className="attAdm-filter__sep">~</span>
        <input
          className="rent-input"
          type="date"
          value={range.end}
          onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))}
        />
        <label className="rent-label">{t('attAdm.department')}</label>
        <input
          className="rent-input"
          list="attAdm-depts"
          placeholder={t('common.all')}
          value={recordsDept}
          onChange={(e) => setRecordsDept(e.target.value)}
        />
        <datalist id="attAdm-depts">
          {deptOptions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        {showCompanyPicker && (
          <>
            <label className="rent-label">{t('attAdm.company')}</label>
            <select
              className="rent-input"
              value={recordsPartner}
              onChange={(e) => setRecordsPartner(e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {companyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {companyLabel(c.name)}
                </option>
              ))}
            </select>
          </>
        )}
        <button className="rent-btn rent-btn--primary" onClick={onSearch}>
          {t('common.search')}
        </button>
        {(recordsDept || recordsPartner) && (
          <button
            className="rent-btn rent-btn--ghost"
            onClick={() => {
              setRecordsDept('')
              setRecordsPartner('')
            }}
          >
            {t('common.reset')}
          </button>
        )}
      </div>
    </div>
  )
}
