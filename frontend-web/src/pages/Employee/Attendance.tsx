import { Alert, Button } from 'antd'
import { useTranslation } from 'react-i18next'
import './attendance.css'
import { useAttendanceLabels } from './Attendance/hooks/useAttendanceLabels'
import { useNowTick } from './Attendance/hooks/useNowTick'
import { useAttendanceRecords } from './Attendance/hooks/useAttendanceRecords'
import { useMyRule } from './Attendance/hooks/useMyRule'
import { useLeaveFlow } from './Attendance/hooks/useLeaveFlow'
import { useAppealFlow } from './Attendance/hooks/useAppealFlow'
import { useAttendanceClock } from './Attendance/hooks/useAttendanceClock'
import { useAttendanceSummary } from './Attendance/hooks/useAttendanceSummary'
import { useAttendanceExport } from './Attendance/hooks/useAttendanceExport'
import PageHeader from './Attendance/components/PageHeader'
import ClockCard from './Attendance/components/ClockCard'
import StatsCards from './Attendance/components/StatsCards'
import AttendanceCalendar from './Attendance/components/AttendanceCalendar'
import RecordsTable from './Attendance/components/RecordsTable'
import OutingForm from './Attendance/components/OutingForm'
import MyRuleCard from './Attendance/components/MyRuleCard'
import LeaveApplyForm from './Attendance/components/LeaveApplyForm'
import LeavesTable from './Attendance/components/LeavesTable'
import AppealForm from './Attendance/components/AppealForm'
import AppealTable from './Attendance/components/AppealTable'

/**
 * 员工考勤页：今日打卡、本月日历/统计、考勤明细、外勤登记、我的规则、请假与申诉。
 *
 * 纯结构拆分：本文件只保留编排与页面级挂载，
 * 数据查询、派生统计、打卡/外勤/请假/申诉流程与各区块视图均落在本页面私有目录内。
 */

const Attendance = () => {
  const { t } = useTranslation()

  const labels = useAttendanceLabels()
  const now = useNowTick()
  const recordsState = useAttendanceRecords()
  const rule = useMyRule()
  const leave = useLeaveFlow()
  const appeal = useAppealFlow()
  const clock = useAttendanceClock(recordsState.loadRecords)
  const summary = useAttendanceSummary(recordsState.records, labels.statusLabelMap)
  const handleExport = useAttendanceExport()

  return (
    <div className="rent-main">
      <PageHeader onExport={handleExport} />

      {recordsState.loadFailed && !recordsState.loading && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('attendance.errLoadShort')}
          action={<Button size="small" onClick={() => recordsState.loadRecords()}>{t('common.retry')}</Button>}
        />
      )}

      <ClockCard
        now={now}
        weekdays={labels.weekdays}
        todayLabelMap={labels.todayLabelMap}
        todayStatus={clock.todayStatus}
        checkInTime={clock.checkInTime}
        checkOutTime={clock.checkOutTime}
        submitting={clock.submitting}
        gpsStatus={clock.gpsStatus}
        geoInfo={clock.geoInfo}
        onCheckIn={clock.handleCheckIn}
        onCheckOut={clock.handleCheckOut}
        onScrollToOuting={clock.handleScrollToOuting}
      />

      <StatsCards
        stats={summary.stats}
        dueDays={summary.dueDays}
        monthRecordsCount={summary.monthRecords.length}
        attendanceRate={summary.attendanceRate}
      />

      <div className="rent-grid rent-grid--2 rent-mb-5">
        <AttendanceCalendar cells={summary.calendarCells} />
        <RecordsTable
          loading={recordsState.loading}
          records={summary.recentRecords}
          weekdays={labels.weekdays}
          statusLabelMap={labels.statusLabelMap}
        />
      </div>

      <OutingForm
        formRef={clock.outingFormRef}
        location={clock.outingLocation}
        onLocationChange={clock.setOutingLocation}
        returnTime={clock.outingReturn}
        onReturnChange={clock.setOutingReturn}
        reason={clock.outingReason}
        onReasonChange={clock.setOutingReason}
        onReset={clock.resetOuting}
        onSubmit={clock.handleOutingSubmit}
      />

      <MyRuleCard myRule={rule.myRule} items={rule.ruleItems} />

      <div className="rent-grid rent-grid--2">
        <LeaveApplyForm
          form={leave.leaveForm}
          leaveTypeLabelMap={labels.leaveTypeLabelMap}
          daysPreview={leave.leaveDaysPreview}
          submitting={leave.leaveSubmitting}
          onPatch={leave.patchLeaveForm}
          onSubmit={leave.handleLeaveSubmit}
        />
        <LeavesTable
          leaves={leave.leaves}
          leaveTypeLabelMap={labels.leaveTypeLabelMap}
          leaveStatusLabelMap={labels.leaveStatusLabelMap}
          onCancelLeave={leave.handleLeaveCancel}
        />
      </div>

      <div className="rent-grid rent-grid--2">
        <AppealForm
          date={appeal.appealDate}
          onDateChange={appeal.setAppealDate}
          reason={appeal.appealReason}
          onReasonChange={appeal.setAppealReason}
          submitting={appeal.appealSubmitting}
          onSubmit={appeal.handleAppealSubmit}
        />
        <AppealTable
          appeals={appeal.appeals}
          loading={appeal.appealsLoading}
          leaveStatusLabelMap={labels.leaveStatusLabelMap}
        />
      </div>
    </div>
  )
}

export default Attendance
