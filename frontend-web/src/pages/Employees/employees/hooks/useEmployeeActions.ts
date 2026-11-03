import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import api from '@/lib/api'
import { downloadReport } from '@/lib/download'
import { errorText } from '@/lib/errorText'
import { emptyEmployeeForm } from '../constants'
import type { DemoEmployee, EmployeeFormValues, QueryParams } from '../types'

interface ActionsOptions {
  queryParams: QueryParams
  fetchData: () => Promise<void>
  fetchDepartments: () => Promise<void>
}

/** 员工写操作 + 弹窗状态：导出 / 新增 / 编辑 / 查看 / 绩效明细 */
export const useEmployeeActions = ({ queryParams, fetchData, fetchDepartments }: ActionsOptions) => {
  const { t } = useTranslation()

  const [detailEmp, setDetailEmp] = useState<DemoEmployee | null>(null)
  const [editEmp, setEditEmp] = useState<DemoEmployee | null>(null)
  const [editForm, setEditForm] = useState<EmployeeFormValues>(emptyEmployeeForm)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<EmployeeFormValues>(emptyEmployeeForm)
  const [perfEmp, setPerfEmp] = useState<DemoEmployee | null>(null)
  const [perfRows, setPerfRows] = useState<any[]>([])
  const [perfLoading, setPerfLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    try {
      setExporting(true)
      await downloadReport(
        '/exports/employees',
        { department: queryParams.department },
        'employees.csv',
      )
    } catch {
      message.error(t('employees.errExport'))
    } finally {
      setExporting(false)
    }
  }

  const openCreate = () => {
    setCreateForm(emptyEmployeeForm)
    setCreateOpen(true)
  }

  const openEdit = (emp: DemoEmployee) => {
    setEditForm({
      fullName: emp.full_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department: emp.department || '',
      position: emp.position || '',
      password: '',
      isActive: (emp.status || 'active') === 'active',
    })
    setEditEmp(emp)
  }

  // 查看 / 编辑共用「员工档案 + 账号」两表数据，缺少 user_id 时只能只读
  const handleCreate = async () => {
    if (!createForm.fullName.trim()) {
      message.error(t('employees.errNameRequired'))
      return
    }
    if (!createForm.email.trim()) {
      message.error(t('employees.errEmailRequired'))
      return
    }
    if (!createForm.password || createForm.password.length < 6) {
      message.error(t('employees.errPasswordMin'))
      return
    }
    try {
      setSubmitting(true)
      await api.post('/admin/users', {
        email: createForm.email.trim(),
        full_name: createForm.fullName.trim(),
        password: createForm.password,
        role: 'employee',
        phone: createForm.phone || undefined,
        department: createForm.department || undefined,
        position: createForm.position || undefined,
      })
      message.success(t('employees.msgCreated'))
      setCreateOpen(false)
      fetchData()
      fetchDepartments()
    } catch (err) {
      message.error(errorText(err, t('employees.errCreateFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editEmp?.user_id) {
      message.error(t('employees.errNoAccount'))
      return
    }
    if (!editForm.fullName.trim() || !editForm.email.trim()) {
      message.error(t('employees.errNameEmailRequired'))
      return
    }
    try {
      setSubmitting(true)
      await api.patch(`/admin/users/${editEmp.user_id}`, {
        full_name: editForm.fullName.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone || undefined,
        department: editForm.department || undefined,
        position: editForm.position || undefined,
        is_active: editForm.isActive,
      })
      message.success(t('employees.msgSaved'))
      setEditEmp(null)
      fetchData()
      fetchDepartments()
    } catch (err) {
      message.error(errorText(err, t('employees.errSaveFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  const openPerf = async (emp: DemoEmployee) => {
    setPerfEmp(emp)
    setPerfRows([])
    if (!emp.id) return
    try {
      setPerfLoading(true)
      const res = await api.get(`/employees/${emp.id}/performance`)
      const payload = res.data?.data ?? res.data
      setPerfRows(Array.isArray(payload) ? payload : [])
    } catch {
      message.error(t('employees.errPerfFetch'))
    } finally {
      setPerfLoading(false)
    }
  }

  return {
    exporting,
    handleExport,
    detailEmp,
    setDetailEmp,
    editEmp,
    setEditEmp,
    editForm,
    setEditForm,
    createOpen,
    setCreateOpen,
    createForm,
    setCreateForm,
    perfEmp,
    setPerfEmp,
    perfRows,
    perfLoading,
    submitting,
    openCreate,
    openEdit,
    handleCreate,
    handleUpdate,
    openPerf,
  }
}
