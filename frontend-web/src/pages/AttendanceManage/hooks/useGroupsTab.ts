/**
 * 「考勤组」页签的数据、表单与成员管理状态。
 *
 * 纯结构拆分自 pages/AttendanceManage/index.tsx：编辑回填字段、提交载荷、
 * 成员增删的请求参数完全保持不变。
 */
import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { attendanceApi, employeesApi } from '@/services/api'
import { OPTION_PAGE_SIZE } from '@/lib/pagination'
import { errorText } from '@/lib/errorText'
import { emptyGroupForm } from '../attendanceTypes'
import type { AttendanceTab, GroupForm } from '../attendanceTypes'

export function useGroupsTab(tab: AttendanceTab) {
  const { t } = useTranslation()

  const [groups, setGroups] = useState<any[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupModal, setGroupModal] = useState<{ id: string | null } | null>(null)
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm())
  const [membersModal, setMembersModal] = useState<any | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)
  const [empOptions, setEmpOptions] = useState<any[]>([])
  const [pickedEmployees, setPickedEmployees] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const loadGroups = useCallback(() => {
    setLoadingGroups(true)
    attendanceApi
      .groups()
      .then((res) => setGroups(res.data ?? []))
      .catch(() => message.error(t('attAdm.errGroups')))
      .finally(() => setLoadingGroups(false))
  }, [t])

  useEffect(() => {
    if (tab === 'groups') loadGroups()
  }, [tab, loadGroups])

  const loadEmployees = useCallback(() => {
    employeesApi
      .list({ page: 1, pageSize: OPTION_PAGE_SIZE })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        setEmpOptions(payload?.items ?? [])
      })
      .catch(() => setEmpOptions([]))
  }, [])

  const openGroupModal = (group?: any) => {
    if (group) {
      setGroupForm({
        name: group.name ?? '',
        description: group.description ?? '',
        department: group.department ?? '',
        office_lat: String(group.office_lat ?? ''),
        office_lng: String(group.office_lng ?? ''),
        radius_km: String(group.radius_km ?? ''),
        utc_offset_hours: String(group.utc_offset_hours ?? ''),
        work_start: group.work_start ?? '09:00',
        work_end: group.work_end ?? '18:00',
        late_grace_minutes: String(group.late_grace_minutes ?? 0),
        early_grace_minutes: String(group.early_grace_minutes ?? 0),
        is_default: !!group.is_default,
        is_active: group.is_active !== false,
      })
      setGroupModal({ id: group.id })
    } else {
      setGroupForm(emptyGroupForm())
      setGroupModal({ id: null })
    }
  }

  const submitGroup = async () => {
    if (!groupForm.name.trim()) {
      message.error(t('attAdm.errGroupName'))
      return
    }
    const body: Record<string, unknown> = {
      name: groupForm.name.trim(),
      description: groupForm.description || null,
      department: groupForm.department || null,
      office_lat: Number(groupForm.office_lat),
      office_lng: Number(groupForm.office_lng),
      radius_km: Number(groupForm.radius_km),
      utc_offset_hours: Number(groupForm.utc_offset_hours),
      work_start: groupForm.work_start,
      work_end: groupForm.work_end,
      late_grace_minutes: Number(groupForm.late_grace_minutes),
      early_grace_minutes: Number(groupForm.early_grace_minutes),
      is_default: groupForm.is_default,
      is_active: groupForm.is_active,
    }
    setSaving(true)
    try {
      if (groupModal?.id) {
        await attendanceApi.updateGroup(groupModal.id, body)
      } else {
        await attendanceApi.createGroup(body)
      }
      message.success(t('attAdm.msgGroupSaved'))
      setGroupModal(null)
      loadGroups()
    } catch (err) {
      message.error(errorText(err, t('attAdm.errGroupSave')))
    } finally {
      setSaving(false)
    }
  }

  const removeGroup = async (id: string) => {
    try {
      await attendanceApi.deleteGroup(id)
      message.success(t('attAdm.msgGroupDeleted'))
      loadGroups()
    } catch {
      message.error(t('attAdm.errGroupDelete'))
    }
  }

  const openMembers = async (group: any) => {
    setMembersModal(group)
    setPickedEmployees([])
    setMembersError(null)
    loadEmployees()
    try {
      const res = await attendanceApi.groupMembers(group.id)
      setMembers(res.data ?? [])
    } catch {
      setMembers([])
      setMembersError(t('common.loadFailed'))
    }
  }

  const addMembers = async () => {
    if (!membersModal || pickedEmployees.length === 0) return
    try {
      const res = await attendanceApi.assignGroupMembers(membersModal.id, {
        employee_ids: pickedEmployees,
      })
      setMembers(res.data ?? [])
      setPickedEmployees([])
      message.success(t('attAdm.msgMembersAdded'))
      loadGroups()
    } catch {
      message.error(t('attAdm.errMemberAdd'))
    }
  }

  const dropMember = async (employeeId: string) => {
    if (!membersModal) return
    try {
      await attendanceApi.removeGroupMember(membersModal.id, employeeId)
      setMembers((prev) => prev.filter((m) => m.employee_id !== employeeId))
      loadGroups()
    } catch {
      message.error(t('attAdm.errMemberRemove'))
    }
  }

  return {
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
    closeGroupModal: () => setGroupModal(null),
    closeMembersModal: () => setMembersModal(null),
  }
}

export type GroupsTabState = ReturnType<typeof useGroupsTab>
