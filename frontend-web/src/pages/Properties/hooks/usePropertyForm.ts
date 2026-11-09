﻿import { apiErrorBody, apiErrorResponse } from '@/lib/api';
/**
 * 房源新增/编辑表单状态（弹窗开关、表单实例、照片列表与提交/上传动作）。
 *
 * 纯结构拆分自 pages/Properties/index.tsx：请求参数与提交载荷的构造完全保持不变。
 */
import { useState } from 'react'
import { Form, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { propertiesApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import type { Property } from '@/types'

export function usePropertyForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const { t } = useTranslation()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // 编辑态原始记录：由弹窗在 Form 挂载后回填（Modal destroyOnHidden 每次重建）
  const [editingRecord, setEditingRecord] = useState<Property | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  // 照片 url 列表（仅编辑态可上传；随 handleSubmit 一并提交）
  const [photos, setPhotos] = useState<string[]>([])

  const openCreate = () => {
    setEditingId(null)
    setEditingRecord(null)
    setPhotos([])
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: Property) => {
    setEditingId(String(record.id))
    setEditingRecord(record)
    setPhotos(record.photos || [])
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      // 照片仅在编辑态存在；构建提交载荷时按 editingId 合并照片 url 列表
      const payload = editingId ? { ...values, photos } : values
      if (editingId) { await propertiesApi.update(editingId, payload); message.success(t('property.updateSuccess')) }
      else { await propertiesApi.create(payload); message.success(t('property.createSuccess')) }
      setModalOpen(false)
      void onSaved()
    } catch (err) {
      if (apiErrorBody(err)?.errorFields) {
        form.scrollToField(apiErrorBody(err)?.errorFields?.[0]?.name ?? '')
        return
      }
      message.error(errorText(err, t('property.saveFailed')))
    } finally { setSubmitting(false) }
  }

  const uploadPhoto = async (file: File) => {
    if (!editingId) { message.warning(t('property.saveFirst')); return }
    try {
      const res = await propertiesApi.uploadPhotos(editingId, [file])
      const d = res.data?.data ?? res.data
      setPhotos(Array.isArray(d?.photos) ? d.photos : [])
    } catch (err) {
      message.error(errorText(err, t('property.uploadFailed')))
    }
  }

  const removePhoto = async (url: string) => {
    if (!editingId) return
    try {
      const res = await propertiesApi.deletePhoto(editingId, url)
      const d = res.data?.data ?? res.data
      setPhotos(Array.isArray(d?.photos) ? d.photos : [])
    } catch (err) {
      message.error(errorText(err, t('property.deletePhotoFailed')))
    }
  }

  return {
    modalOpen,
    editingId,
    editingRecord,
    submitting,
    form,
    photos,
    openCreate,
    openEdit,
    handleSubmit,
    uploadPhoto,
    removePhoto,
    close: () => setModalOpen(false),
  }
}
