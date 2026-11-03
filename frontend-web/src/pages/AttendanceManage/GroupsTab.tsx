/**
 * 「考勤组」页签：分组列表 + 新增/编辑弹窗 + 成员管理弹窗。
 * 纯结构拆分自 pages/AttendanceManage/index.tsx，类名与交互保持不变。
 */
import { Empty, Popconfirm, Spin } from 'antd'
import { useTranslation } from 'react-i18next'
import { useGroupsTab } from './hooks/useGroupsTab'
import GroupFormModal from './GroupFormModal'
import GroupMembersModal from './GroupMembersModal'
import type { AttendanceTab } from './attendanceTypes'

export default function GroupsTab({ tab }: { tab: AttendanceTab }) {
  const { t } = useTranslation()
  const state = useGroupsTab(tab)
  const {
    groups,
    loadingGroups,
    groupModal,
    groupForm,
    setGroupForm,
    membersModal,
    members,
    membersError,
    empOptions,
    pickedEmployees,
    setPickedEmployees,
    saving,
    openGroupModal,
    submitGroup,
    removeGroup,
    openMembers,
    addMembers,
    dropMember,
    closeGroupModal,
    closeMembersModal,
  } = state

  return (
    <>
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('attAdm.groupsTitle')}</h3>
          <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openGroupModal()}>
            {t('attAdm.newGroup')}
          </button>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('attAdm.thGroupName')}</th>
                  <th>{t('attAdm.thDepartment')}</th>
                  <th>{t('attAdm.thOffice')}</th>
                  <th>{t('attAdm.thRadius')}</th>
                  <th>{t('attAdm.thShift')}</th>
                  <th>{t('attAdm.thGrace')}</th>
                  <th>{t('attAdm.thMembers')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingGroups ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="rent-empty">
                        <Spin size="small" style={{ marginRight: 8 }} />
                        {t('common.loading')}
                      </div>
                    </td>
                  </tr>
                ) : groups.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="rent-empty">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t('attAdm.noGroups')}
                        />
                      </div>
                    </td>
                  </tr>
                ) : (
                  groups.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <div className="rent-text-bold">
                          {g.name}
                          {g.is_default && (
                            <span className="rent-badge rent-badge--primary attAdm-inline-badge">
                              {t('attAdm.isDefault')}
                            </span>
                          )}
                          {g.is_active === false && (
                            <span className="rent-badge rent-badge--neutral attAdm-inline-badge">
                              {t('attAdm.inactive')}
                            </span>
                          )}
                        </div>
                        {g.description && (
                          <div className="rent-text-sm rent-text-muted">{g.description}</div>
                        )}
                      </td>
                      <td>{g.department || '—'}</td>
                      <td className="rent-table__mono">
                        {g.office_lat}, {g.office_lng}
                      </td>
                      <td>{t('attAdm.km', { km: g.radius_km })}</td>
                      <td className="rent-table__mono">
                        {g.work_start} - {g.work_end}
                      </td>
                      <td>
                        {t('attAdm.graceText', {
                          late: g.late_grace_minutes,
                          early: g.early_grace_minutes,
                        })}
                      </td>
                      <td>{g.member_count ?? 0}</td>
                      <td>
                        <button
                          className="rent-btn rent-btn--ghost rent-btn--sm"
                          onClick={() => openMembers(g)}
                        >
                          {t('attAdm.manageMembers')}
                        </button>
                        <button
                          className="rent-btn rent-btn--ghost rent-btn--sm"
                          onClick={() => openGroupModal(g)}
                        >
                          {t('common.edit')}
                        </button>
                        <Popconfirm
                          title={t('attAdm.confirmDeleteGroup')}
                          okText={t('common.confirm')}
                          cancelText={t('common.cancel')}
                          onConfirm={() => removeGroup(g.id)}
                        >
                          <button className="rent-btn rent-btn--ghost rent-btn--sm attAdm-danger">
                            {t('common.delete')}
                          </button>
                        </Popconfirm>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="rent-card">
        <div className="rent-card__body rent-text-sm rent-text-muted">{t('attAdm.groupRuleHint')}</div>
      </div>

      <GroupFormModal
        open={!!groupModal}
        isEdit={!!groupModal?.id}
        form={groupForm}
        setForm={setGroupForm}
        saving={saving}
        onCancel={closeGroupModal}
        onSubmit={submitGroup}
      />

      <GroupMembersModal
        open={!!membersModal}
        group={membersModal}
        empOptions={empOptions}
        pickedEmployees={pickedEmployees}
        setPickedEmployees={setPickedEmployees}
        members={members}
        membersError={membersError}
        onClose={closeMembersModal}
        onAdd={addMembers}
        onRemove={dropMember}
        onRetry={() => {
          void openMembers(membersModal)
        }}
      />
    </>
  )
}
