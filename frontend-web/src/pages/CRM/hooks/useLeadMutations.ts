import { useRef, useState } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { leadsApi } from '@/services/api'
import type { Lead, LeadStatus } from '@/types'
import { errorText } from '@/lib/errorText'
import { emptyCreateForm } from '../constants'
import type { CreateFormValues } from '../types'
import { buildImportPayloads } from '../utils'

/** 线索写操作：新建/编辑、改阶段、删除、CSV 批量导入 */
export function useLeadMutations(fetchData: () => Promise<void>) {
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)
  const [stageModalOpen, setStageModalOpen] = useState(false)
  const [currentLead, setCurrentLead] = useState<Lead | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormValues>(emptyCreateForm)
  const [stageValue, setStageValue] = useState<LeadStatus | ''>('')
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const patchCreateForm = (patch: Partial<CreateFormValues>) => {
    setCreateForm((f) => ({ ...f, ...patch }))
  }

  const openCreate = () => {
    setCreateForm(emptyCreateForm)
    setModalOpen(true)
  }

  const openEdit = (lead: Lead) => {
    setCreateForm({
      id: String(lead.id),
      name: lead.name,
      nationality: lead.nationality || '',
      phone: lead.phone || '',
      email: lead.email || '',
      budget_max: lead.budget_max != null ? String(lead.budget_max) : '',
      assigned_to: lead.assigned_to || '',
      source: lead.source || '',
      stage: (lead.stage as LeadStatus) || 'new',
      requirement: lead.requirement || '',
      notes: lead.notes || '',
    })
    setModalOpen(true)
  }

  const openEditStage = (record: Lead) => {
    setCurrentLead(record)
    setStageValue(record.stage as LeadStatus)
    setStageModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!createForm.name.trim()) {
      message.error(t('crm.msgNameRequired'))
      return
    }
    if (!createForm.phone.trim()) {
      message.error(t('crm.msgPhoneRequired'))
      return
    }
    try {
      setSubmitting(true)
      const payload = {
        name: createForm.name,
        nationality: createForm.nationality,
        phone: createForm.phone,
        email: createForm.email,
        budget_max: createForm.budget_max ? Number(createForm.budget_max) : undefined,
        // assigned_to 是 employees.id（UUID），空值必须省略，否则空串会被 422 拒绝
        assigned_to: createForm.assigned_to || undefined,
        source: createForm.source,
        stage: createForm.stage || undefined,
        requirement: createForm.requirement,
        notes: createForm.notes,
      } as any
      if (createForm.id) {
        await leadsApi.update(createForm.id, payload)
        message.success(t('crm.msgUpdated'))
      } else {
        await leadsApi.create(payload)
        message.success(t('crm.msgCreated'))
      }
      setModalOpen(false)
      fetchData()
    } catch (err) {
      message.error(errorText(err, t('crm.errSave')))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (lead: Lead) => {
    if (!window.confirm(t('crm.confirmDelete', { name: lead.name }))) return
    try {
      await leadsApi.delete(String(lead.id))
      message.success(t('crm.msgDeleted'))
      fetchData()
    } catch (err) {
      message.error(errorText(err, t('crm.errDelete')))
    }
  }

  // 批量导入客户线索：解析 CSV 后逐条调用 POST /leads，统计成功/失败
  const handleImportFile = async (file?: File | null) => {
    if (!file) return
    setImporting(true)
    try {
      const payloads = buildImportPayloads(await file.text())
      if (payloads.length === 0) {
        message.warning(t('crm.warnCsvNoRows'))
        return
      }
      const results = await Promise.allSettled(payloads.map((row) => leadsApi.create(row)))
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.length - ok
      if (ok === 0) {
        const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        const reason = errorText(first?.reason, '')
        message.error(reason ? t('crm.importFailedWithReason', { reason }) : t('crm.importFailed'))
        return
      }
      message.success(failed > 0 ? t('crm.importSuccessPartial', { ok, failed }) : t('crm.importSuccess', { ok }))
      fetchData()
    } catch {
      message.error(t('crm.errCsvRead'))
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  const handleUpdateStage = async () => {
    if (!currentLead) return
    if (!stageValue) {
      message.error(t('crm.msgStageRequired'))
      return
    }
    try {
      setSubmitting(true)
      await leadsApi.update(String(currentLead.id), { stage: stageValue })
      message.success(t('crm.msgStageUpdated'))
      setStageModalOpen(false)
      fetchData()
    } catch (err) {
      message.error(errorText(err, t('crm.errUpdate')))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    modalOpen,
    setModalOpen,
    stageModalOpen,
    setStageModalOpen,
    creating: submitting,
    createForm,
    patchCreateForm,
    stageValue,
    setStageValue,
    importing,
    importRef,
    openCreate,
    openEdit,
    openEditStage,
    handleSubmit,
    handleDelete,
    handleUpdateStage,
    handleImportFile,
  }
}
