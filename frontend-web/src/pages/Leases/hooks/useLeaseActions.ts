import { useState } from 'react'
import { message, Modal } from 'antd'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { leasesApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import type { Lease } from '@/types'
import { emptyCreateForm, emptyRenewForm } from '../constants'
import type { CreateFormValues, RenewFormValues } from '../types'

interface Options {
  fetchData: () => Promise<void>
}

/** 租约写操作：新建 / 续约 / 退租，以及详情弹窗 */
export function useLeaseActions({ fetchData }: Options) {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [renewOpen, setRenewOpen] = useState(false)
  const [currentLease, setCurrentLease] = useState<Lease | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormValues>(emptyCreateForm)
  const [renewForm, setRenewForm] = useState<RenewFormValues>(emptyRenewForm)
  const [detailLease, setDetailLease] = useState<Lease | null>(null)

  const setCreateField = <K extends keyof CreateFormValues>(key: K, value: CreateFormValues[K]) => {
    setCreateForm((f) => ({ ...f, [key]: value }))
  }
  const setRenewField = <K extends keyof RenewFormValues>(key: K, value: RenewFormValues[K]) => {
    setRenewForm((f) => ({ ...f, [key]: value }))
  }

  const openCreate = () => {
    setCreateForm(emptyCreateForm)
    setCreateOpen(true)
  }

  const closeCreate = () => setCreateOpen(false)

  const openRenew = (record: Lease) => {
    setCurrentLease(record)
    const startDate = dayjs(record.end_date).add(1, 'day').format('YYYY-MM-DD')
    const endDate = dayjs(record.end_date).add(1, 'year').format('YYYY-MM-DD')
    setRenewForm({
      startDate,
      endDate,
      monthlyRent: String(record.monthly_rent || ''),
    })
    setRenewOpen(true)
  }

  const closeRenew = () => setRenewOpen(false)

  const handleCreate = async () => {
    if (!createForm.propertyId) {
      message.error(t('leases.errSelectProperty'))
      return
    }
    if (!createForm.tenantName.trim()) {
      message.error(t('leases.errTenantName'))
      return
    }
    if (!createForm.tenantPhone.trim()) {
      message.error(t('leases.errTenantPhone'))
      return
    }
    if (!createForm.startDate || !createForm.endDate) {
      message.error(t('leases.errLeaseTerm'))
      return
    }
    if (!createForm.monthlyRent) {
      message.error(t('leases.errMonthlyRent'))
      return
    }
    if (!createForm.deposit) {
      message.error(t('leases.errDeposit'))
      return
    }
    try {
      setSubmitting(true)
      await leasesApi.create({
        property_id: createForm.propertyId,
        tenant_name: createForm.tenantName,
        tenant_phone: createForm.tenantPhone,
        start_date: createForm.startDate,
        end_date: createForm.endDate,
        monthly_rent: Number(createForm.monthlyRent),
        deposit_amount: Number(createForm.deposit),
      })
      message.success(t('leases.msgCreated'))
      setCreateOpen(false)
      fetchData()
    } catch (err) {
      message.error(errorText(err, t('leases.errCreateFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRenew = async () => {
    if (!currentLease) return
    if (!renewForm.startDate || !renewForm.endDate) {
      message.error(t('leases.errRenewTerm'))
      return
    }
    if (!renewForm.monthlyRent) {
      message.error(t('leases.errMonthlyRent'))
      return
    }
    try {
      setSubmitting(true)
      await leasesApi.renew(String(currentLease.id), {
        startDate: renewForm.startDate,
        endDate: renewForm.endDate,
        monthlyRent: Number(renewForm.monthlyRent),
      })
      message.success(t('leases.msgRenewed'))
      setRenewOpen(false)
      fetchData()
    } catch (err) {
      message.error(errorText(err, t('leases.errRenewFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  const handleTerminate = (record: Lease) => {
    Modal.confirm({
      title: t('leases.terminateTitle'),
      content: t('leases.terminateContent', { code: record.contract_no || record.id }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await leasesApi.terminate(String(record.id), {
            terminateDate: dayjs().format('YYYY-MM-DD'),
          })
          message.success(t('leases.msgTerminated'))
          fetchData()
        } catch (err) {
          message.error(errorText(err, t('leases.errTerminateFailed')))
        }
      },
    })
  }

  return {
    createOpen,
    renewOpen,
    submitting,
    createForm,
    renewForm,
    detailLease,
    setDetailLease,
    openCreate,
    closeCreate,
    openRenew,
    closeRenew,
    handleCreate,
    handleRenew,
    handleTerminate,
    setCreateField,
    setRenewField,
  }
}
