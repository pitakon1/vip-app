import { apiErrorBody, apiErrorResponse } from '@/lib/api';
import { useRef, useState } from 'react'
import { Form, Modal, message } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { buildListingPayload } from '@/lib/listingPayload'
import { propertiesApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import type { OwnerProperty } from '../types'

interface Options {
  refresh: () => void
  queryKey: string[]
}

/** 新增/编辑/删除/一键上架 与照片上传删除（写操作全部门禁在弹窗与 confirm 内） */
export function useOwnerPropertyActions({ refresh, queryKey }: Options) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // 新增/编辑弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<OwnerProperty | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  // 照片 url 列表（仅编辑态可上传；随 handleSubmit 一并提交）
  const [photos, setPhotos] = useState<string[]>([])
  // 打开编辑时的基线照片（取消时回滚会话内新增的照片）
  const [basePhotos, setBasePhotos] = useState<string[]>([])
  const sessionUploadsRef = useRef<string[]>([])

  const openCreate = () => {
    setEditingId(null)
    setEditingRecord(null)
    setBasePhotos([])
    setPhotos([])
    setModalOpen(true)
  }

  const openEdit = (record: OwnerProperty) => {
    setEditingId(String(record.id))
    setEditingRecord(record)
    setBasePhotos(record.photos || [])
    setPhotos(record.photos || [])
    setModalOpen(true)
  }

  // 取消编辑：回滚本次会话新上传的照片（仅删除会话内新增、不属于基线的），保持服务端与展示一致
  const handleCancel = () => {
    const toRemove = sessionUploadsRef.current.filter((u) => !basePhotos.includes(u))
    if (editingId && toRemove.length) {
      toRemove.forEach((u) => {
        propertiesApi.deletePhoto(editingId!, u).catch(() => {})
      })
    }
    sessionUploadsRef.current = []
    setPhotos(basePhotos)
    setModalOpen(false)
  }

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('ownerProperties.deleteTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('ownerProperties.deleteContent'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await propertiesApi.delete(String(id))
          message.success(t('ownerProperties.msgDeleted'))
          queryClient.setQueryData<OwnerProperty[]>(queryKey, (old) =>
            (old ?? []).filter((p) => String(p.id) !== String(id)),
          )
        } catch (err) {
          message.error(errorText(err, t('ownerProperties.errDeleteFailed')))
        }
      },
    })
  }

  // 一键上架（唯一上架入口）：直接按该房源档案生成上架单
  const handlePublish = (item: OwnerProperty) => {
    if (Number(item.monthly_rent || 0) <= 0) {
      message.warning(t('listing.listManualRent'))
      return
    }
    Modal.confirm({
      title: t('listing.confirmListTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('listing.confirmListBody'),
      okText: t('listing.actionList'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await api.post('/listings', buildListingPayload(item))
          message.success(t('listing.listedOk'))
        } catch (err) {
          message.error(errorText(err, t('ownerProperties.errSaveFailed')))
        }
      },
    })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      // 照片仅在编辑态存在；构建提交载荷时按 editingId 合并照片 url 列表
      const payload = editingId ? { ...values, photos } : values
      if (editingId) {
        await propertiesApi.update(editingId, payload)
        message.success(t('ownerProperties.msgUpdated'))
      } else {
        await propertiesApi.create(payload)
        message.success(t('ownerProperties.msgCreated'))
      }
      setModalOpen(false)
      refresh()
    } catch (err) {
      if (apiErrorBody(err)?.errorFields) {
        form.scrollToField(apiErrorBody(err)?.errorFields?.[0]?.name ?? '')
        return
      }
      message.error(errorText(err, t('ownerProperties.errSaveFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  // 照片上传/删除（仅编辑态）
  const uploadPhoto = async (file: File) => {
    if (!editingId) { message.warning(t('ownerProperties.warnSaveFirst')); return }
    try {
      const res = await propertiesApi.uploadPhotos(editingId, [file])
      const d = res.data?.data ?? res.data
      const next = Array.isArray(d?.photos) ? d.photos : []
      setPhotos((prev) => {
        const added = next.filter((u: string) => !prev.includes(u))
        sessionUploadsRef.current.push(...added)
        return next
      })
    } catch (err) {
      message.error(errorText(err, t('ownerProperties.errPhotoUpload')))
    }
  }

  const removePhoto = async (url: string) => {
    if (!editingId) return
    try {
      const res = await propertiesApi.deletePhoto(editingId, url)
      const d = res.data?.data ?? res.data
      setPhotos(Array.isArray(d?.photos) ? d.photos : [])
    } catch (err) {
      message.error(errorText(err, t('ownerProperties.errPhotoDelete')))
    }
  }

  const photoFileList = photos.map((url, idx) => ({
    uid: `photo-${idx}`,
    name: url.split('/').pop() || `photo-${idx}`,
    status: 'done' as const,
    url,
  }))

  return {
    t,
    modalOpen,
    editingId,
    editingRecord,
    submitting,
    form,
    photos,
    photoFileList,
    openCreate,
    openEdit,
    handleCancel,
    handleDelete,
    handlePublish,
    handleSubmit,
    uploadPhoto,
    removePhoto,
  }
}
