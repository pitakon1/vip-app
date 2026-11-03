/**
 * 「核对」页签：筛选栏 + 汇总 + 明细表。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，组合顺序与 DOM 结构保持不变。
 */
import { useAttendanceLabels } from './hooks/useAttendanceLabels'
import type { RecordsTabState } from './hooks/useRecordsTab'
import RecordsFilterBar from './RecordsFilterBar'
import RecordsList from './RecordsList'

export default function RecordsTab({
  state,
  isPartnerAdmin,
  companyOptions,
  companyLabel,
  showCompanyPicker,
}: {
  state: RecordsTabState
  isPartnerAdmin: boolean
  companyOptions: { id: string; name: string | null }[]
  companyLabel: (name: string | null) => string
  showCompanyPicker: boolean
}) {
  const { statusLabel, leaveTypeLabel } = useAttendanceLabels()
  const {
    range,
    setRange,
    recordsDept,
    setRecordsDept,
    recordsPartner,
    setRecordsPartner,
    deptOptions,
    summary,
    records,
    loadingRecords,
    recordsError,
    expanded,
    loadRecords,
    toggleExpanded,
    openCalibrate,
  } = state

  return (
    <>
      <RecordsFilterBar
        range={range}
        setRange={setRange}
        recordsDept={recordsDept}
        setRecordsDept={setRecordsDept}
        recordsPartner={recordsPartner}
        setRecordsPartner={setRecordsPartner}
        deptOptions={deptOptions}
        companyOptions={companyOptions}
        companyLabel={companyLabel}
        showCompanyPicker={showCompanyPicker}
        onSearch={loadRecords}
      />

      <RecordsList
        records={records}
        summary={summary}
        loading={loadingRecords}
        error={recordsError}
        expanded={expanded}
        isFiltering={!!(recordsDept || recordsPartner)}
        isPartnerAdmin={isPartnerAdmin}
        statusLabel={statusLabel}
        leaveTypeLabel={leaveTypeLabel}
        onRetry={loadRecords}
        onToggleExpand={toggleExpanded}
        onCalibrate={openCalibrate}
      />
    </>
  )
}
