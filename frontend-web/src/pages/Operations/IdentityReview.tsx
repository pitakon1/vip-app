/**
 * 实名认证人工审核队列（/operations/identity-review，仅 admin）
 *
 * 只做「看证件 → 通过 / 驳回（必填原因）」。证件图片走鉴权接口取 blob，
 * 不落公开 URL，也不在前端缓存。通过后后端会把 User.is_verified 置 true，
 * 并给提交人发站内通知。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Modal,
  Space,
  Tag,
  message,
} from 'antd'
import api, { apiErrorBody } from '@/lib/api'

interface PendingItem {
  id: string
  user_id: string
  user_name?: string | null
  user_email?: string | null
  user_phone?: string | null
  user_is_verified: boolean
  doc_type: string
  real_name: string
  id_number_masked?: string | null
  has_front: boolean
  has_back: boolean
  submitted_at: string
  consent_granted_at: string
  consent_policy_version: string
}

export default function IdentityReview() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<PendingItem | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<PendingItem[]>('/identity/pending')
      setRows(res.data)
    } catch (err) {
      const body = apiErrorBody(err)
      setError(typeof body?.detail === 'string' ? body.detail : t('publicSite.identity.reviewLoadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const viewFile = async (item: PendingItem, side: 'front' | 'back') => {
    try {
      const res = await api.get<Blob>(`/identity/${item.id}/file/${side}`, {
        responseType: 'blob',
      })
      setPreview(URL.createObjectURL(res.data))
    } catch {
      message.error(t('publicSite.identity.fileLoadError'))
    }
  }

  const approve = async (item: PendingItem) => {
    setBusy(true)
    try {
      await api.post(`/identity/${item.id}/approve`)
      message.success(t('publicSite.identity.approved'))
      await load()
    } catch (err) {
      const body = apiErrorBody(err)
      message.error(typeof body?.detail === 'string' ? body.detail : t('publicSite.identity.reviewActionError'))
    } finally {
      setBusy(false)
    }
  }

  const doReject = async () => {
    if (!rejecting) return
    if (!reason.trim()) {
      message.warning(t('publicSite.identity.reasonRequired'))
      return
    }
    setBusy(true)
    try {
      await api.post(`/identity/${rejecting.id}/reject`, { reason: reason.trim() })
      message.success(t('publicSite.identity.rejected'))
      setRejecting(null)
      setReason('')
      await load()
    } catch (err) {
      const body = apiErrorBody(err)
      message.error(typeof body?.detail === 'string' ? body.detail : t('publicSite.identity.reviewActionError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Button type="link" onClick={() => navigate(-1)} style={{ paddingLeft: 0 }}>
        {t('common.back')}
      </Button>
      <Card title={t('publicSite.identity.reviewTitle')} loading={loading}>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <Empty description={t('publicSite.identity.reviewEmpty')} />
        ) : null}
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {rows.map((item) => (
            <Card key={item.id} type="inner" title={`${item.real_name} · ${item.user_name || item.user_id}`}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label={t('publicSite.identity.docType')}>
                  {t(`publicSite.identity.doc_${item.doc_type}`)}
                </Descriptions.Item>
                <Descriptions.Item label={t('publicSite.identity.idNumber')}>
                  {item.id_number_masked || '—'}
                </Descriptions.Item>
                <Descriptions.Item label={t('publicSite.identity.userAccount')}>
                  {item.user_phone || item.user_email || item.user_id}
                </Descriptions.Item>
                <Descriptions.Item label={t('publicSite.identity.alreadyVerified')}>
                  {item.user_is_verified ? (
                    <Tag color="green">{t('publicSite.identity.status_approved')}</Tag>
                  ) : (
                    <Tag>{t('publicSite.identity.status_none')}</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={t('publicSite.identity.submittedAt')}>
                  {new Date(item.submitted_at).toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label={t('publicSite.identity.consentAt')}>
                  {new Date(item.consent_granted_at).toLocaleString()} · v
                  {item.consent_policy_version}
                </Descriptions.Item>
              </Descriptions>
              <Space wrap>
                <Button disabled={!item.has_front} onClick={() => void viewFile(item, 'front')}>
                  {t('publicSite.identity.viewFront')}
                </Button>
                <Button disabled={!item.has_back} onClick={() => void viewFile(item, 'back')}>
                  {t('publicSite.identity.viewBack')}
                </Button>
                <Button type="primary" loading={busy} onClick={() => void approve(item)}>
                  {t('publicSite.identity.approve')}
                </Button>
                <Button
                  danger
                  onClick={() => {
                    setRejecting(item)
                    setReason('')
                  }}
                >
                  {t('publicSite.identity.reject')}
                </Button>
              </Space>
            </Card>
          ))}
        </Space>
      </Card>

      <Modal
        open={preview !== null}
        footer={null}
        title={t('publicSite.identity.previewTitle')}
        onCancel={() => {
          if (preview) URL.revokeObjectURL(preview)
          setPreview(null)
        }}
      >
        {preview ? <img src={preview} alt="identity" style={{ width: '100%' }} /> : null}
      </Modal>

      <Modal
        open={rejecting !== null}
        title={t('publicSite.identity.rejectTitle')}
        confirmLoading={busy}
        onOk={() => void doReject()}
        onCancel={() => setRejecting(null)}
        okText={t('publicSite.identity.reject')}
        cancelText={t('common.cancel')}
      >
        <p className="rent-text-sm">{t('publicSite.identity.rejectHint')}</p>
        <Input.TextArea
          rows={3}
          maxLength={500}
          showCount
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('publicSite.identity.reasonPlaceholder')}
        />
      </Modal>
    </div>
  )
}
