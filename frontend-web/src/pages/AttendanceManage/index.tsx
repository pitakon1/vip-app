import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { attendanceApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import './attendanceAdmin.css'
import type { AttendanceTab } from './attendanceTypes'
import { useAttendanceLabels } from './hooks/useAttendanceLabels'
import { useRecordsTab } from './hooks/useRecordsTab'
import RecordsTab from './RecordsTab'
import CalibrateModal from './CalibrateModal'
import CompaniesTab from './CompaniesTab'
import GroupsTab from './GroupsTab'
import LeaveTab from './LeaveTab'
import AppealTab from './AppealTab'
import ReportTab from './ReportTab'

/**
 * 管理端「考勤管理」（对标企业微信考勤应用，四个页签）：
 *   核对   —— P0：全员考勤明细 + 行内校准（改状态/补上下班时间/改备注）
 *   考勤组 —— P1-a：多办公点/多班次规则与成员分配
 *   请假   —— P1-b：假勤审批（通过与后端考勤联动）
 *   报表   —— P1-c：异常分类统计与逐日趋势
 *
 * 纯结构拆分：本文件只保留页签编排与共享（公司选项）状态，
 * 各页签的列表 / 筛选栏 / 弹窗 / 数据逻辑落在本页面目录内。
 */

const AttendanceManage = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<AttendanceTab>('records')

  // 合作公司管理员的作用域由后端强制为「本公司」（partner_id 参数被服务端覆盖）。
  // 后端仅对 partner_admin 放开 records / report / companies 三个端点，考勤组 / 假勤
  // / 申诉仍是 require_admin，因此这里同步隐藏其无权访问的 tab 与校准操作。
  const isPartnerAdmin = useAuthStore((s) => s.user?.role) === 'partner_admin'

  const tabs = useMemo(
    () =>
      [
        { key: 'records' as const, label: t('attAdm.tabRecords') },
        { key: 'companies' as const, label: t('attAdm.tabCompanies') },
        { key: 'groups' as const, label: t('attAdm.tabGroups') },
        { key: 'leave' as const, label: t('attAdm.tabLeave') },
        { key: 'report' as const, label: t('attAdm.tabReport') },
        { key: 'appeal' as const, label: t('attAdm.appealReview') },
      ].filter(
        (item) =>
          !isPartnerAdmin ||
          item.key === 'records' ||
          item.key === 'companies' ||
          item.key === 'report',
      ),
    [t, isPartnerAdmin],
  )

  // ------------------------------------------- 合作公司（分组维度，共用）
  // 数据源用 /attendance/admin/companies：平台管理员拿到全部启用公司，
  // 合作公司管理员只拿到本公司（后端强制作用域），因此下拉天然权限安全。
  const [companyOptions, setCompanyOptions] = useState<
    { id: string; name: string | null }[]
  >([])

  useEffect(() => {
    attendanceApi
      .adminCompanies()
      .then((res) => {
        const rows: any[] = res.data?.companies ?? []
        setCompanyOptions(
          rows
            .filter((r) => r.partner_id)
            .map((r) => ({ id: r.partner_id as string, name: r.partner_name as string | null })),
        )
      })
      .catch(() => {
        /* 无合作公司权限时忽略，不阻塞页面 */
      })
  }, [])

  const companyLabel = useCallback(
    (name: string | null) => name || t('attAdm.unassignedCompany'),
    [t],
  )

  // 合作公司管理员的作用域由后端强制为「本公司」，无需再提供公司筛选
  const showCompanyPicker = !isPartnerAdmin && companyOptions.length > 0

  // 核对页签的数据与校准弹窗（导出按钮位于页头，故由此处持有）
  const recordsTab = useRecordsTab(tab)
  const { statusLabel } = useAttendanceLabels()

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('attAdm.title')}</h2>
          <p className="rent-page-header__subtitle">{t('attAdm.subtitle')}</p>
        </div>
        {tab === 'records' && (
          <div className="rent-page-header__actions">
            <button className="rent-btn rent-btn--secondary" onClick={recordsTab.handleExportRecords}>
              {t('attendance.export')}
            </button>
          </div>
        )}
      </div>

      <div className="rent-tabs">
        {tabs.map((item) => (
          <div
            key={item.key}
            className="rent-tab"
            data-active={tab === item.key ? 'true' : 'false'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------ 核对 */}
      {tab === 'records' && (
        <RecordsTab
          state={recordsTab}
          isPartnerAdmin={isPartnerAdmin}
          companyOptions={companyOptions}
          companyLabel={companyLabel}
          showCompanyPicker={showCompanyPicker}
        />
      )}

      {/* ------------------------------------------------ 按合作公司 */}
      {tab === 'companies' && <CompaniesTab tab={tab} companyLabel={companyLabel} />}

      {/* ------------------------------------------------ 考勤组 */}
      {tab === 'groups' && <GroupsTab tab={tab} />}

      {/* ------------------------------------------------ 请假 */}
      {tab === 'leave' && <LeaveTab tab={tab} />}

      {/* ------------------------------------------------ 申诉审批 */}
      {tab === 'appeal' && <AppealTab tab={tab} />}

      {/* ------------------------------------------------ 报表 */}
      {tab === 'report' && (
        <ReportTab
          tab={tab}
          companyOptions={companyOptions}
          companyLabel={companyLabel}
          showCompanyPicker={showCompanyPicker}
        />
      )}

      {/* 校准弹窗 */}
      <CalibrateModal
        calib={recordsTab.calib}
        form={recordsTab.calibForm}
        setForm={recordsTab.setCalibForm}
        saving={recordsTab.saving}
        rangeStart={recordsTab.range.start}
        statusLabel={statusLabel}
        onCancel={recordsTab.closeCalibrate}
        onSubmit={recordsTab.submitCalibrate}
      />
    </div>
  )
}

export default AttendanceManage
