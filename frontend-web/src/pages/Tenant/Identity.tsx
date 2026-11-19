/**
 * 实名认证（/tenant/identity）
 *
 * 过渡方案：证件上传 + 人工审核，不接人脸识别、不做第三方自动核验。
 * - 提交前必须勾选 PDPA 同意（后端同样强校验，前端只是少走一趟）；
 * - 状态回显：未提交 / 审核中 / 已通过 / 已驳回（含驳回原因，可重新提交）；
 * - 审核队列在后台 `/operations/identity-review`（仅 admin 能操作）。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Select,
  Tag,
  Upload,
  message,
} from 'antd'
import type { UploadFile } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import api, { apiErrorBody } from '@/lib/api'
import '@/styles/public-site.css'

interface IdentityStatus {
  status: 'none' | 'pending' | 'approved' | 'rejected'
  doc_type?: string | null
  real_name?: string | null
  id_number_masked?: string | null
  submitted_at?: string | null
  reviewed_at?: string | null
  rejection_reason?: string | null
  consent_policy_version?: string | null
  is_verified?: boolean
}

const DOC_TYPES = ['passport', 'national_id', 'driver_license'] as const

export default function TenantIdentity() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState<IdentityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [consent, setConsent] = useState(false)
  const [frontList, setFrontList] = useState<UploadFile[]>([])
  const [backList, setBackList] = useState<UploadFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get<IdentityStatus>('/identity/me')
      setState(res.data)
    } catch {
      setError(t('publicSite.identity.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (values: {
    doc_type: string
    real_name: string
    id_number?: string
  }) => {
    if (!consent) {
      setError(t('publicSite.identity.consentRequired'))
      return
    }
    if (!frontList.length) {
      setError(t('publicSite.identity.fileRequired'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('doc_type', values.doc_type)
      fd.append('real_name', values.real_name.trim())
      if (values.id_number) fd.append('id_number', values.id_number.trim())
      fd.append('consent', 'true')
      fd.append('policy_version', '2026-11')
      fd.append('front', frontList[0].originFileObj as File)
      if (backList.length) fd.append('back', backList[0].originFileObj as File)
      const res = await api.post<IdentityStatus>('/identity/submit', fd)
      setState(res.data)
      setFrontList([])
      setBackList([])
      setConsent(false)
      form.resetFields()
      message.success(t('publicSite.identity.submitted'))
    } catch (err) {
      const body = apiErrorBody(err)
      const detail = typeof body?.detail === 'string' ? body.detail : null
      setError(detail || t('publicSite.identity.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  const statusTag = () => {
    const s = state?.status || 'none'
    const color = s === 'approved' ? 'green' : s === 'rejected' ? 'red' : s === 'pending' ? 'gold' : 'default'
    return <Tag color={color}>{t(`publicSite.identity.status_${s}`)}</Tag>
  }

  if (loading) return <div style={{ padding: 24 }}>{t('common.loading')}</div>

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <Button type="link" onClick={() => navigate(-1)} style={{ paddingLeft: 0 }}>
        {t('common.back')}
      </Button>
      <Card
        title={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {t('publicSite.identity.title')} {statusTag()}
          </span>
        }
      >
        <p className="rent-text-sm" style={{ marginTop: 0 }}>
          {t('publicSite.identity.sub')}
        </p>

        {state?.status === 'pending' ? (
          <Alert
            type="info"
            showIcon
            message={t('publicSite.identity.pendingTitle')}
            description={t('publicSite.identity.pendingDesc')}
          />
        ) : null}

        {state?.status === 'approved' ? (
          <Alert
            type="success"
            showIcon
            message={t('publicSite.identity.approvedTitle')}
            description={t('publicSite.identity.approvedDesc', {
              name: state.real_name || '',
              masked: state.id_number_masked || '—',
            })}
          />
        ) : null}

        {state?.status === 'rejected' ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('publicSite.identity.rejectedTitle')}
            description={
              <>
                <div>{state.rejection_reason || t('publicSite.identity.rejectedNoReason')}</div>
                <div className="rent-text-sm">{t('publicSite.identity.reuploadHint')}</div>
              </>
            }
          />
        ) : null}

        {state?.status !== 'pending' && state?.status !== 'approved' ? (
          <Form
            form={form}
            layout="vertical"
            initialValues={{ doc_type: 'passport' }}
            onFinish={submit}
            style={{ marginTop: 16 }}
          >
            <Form.Item
              name="doc_type"
              label={t('publicSite.identity.docType')}
              rules={[{ required: true }]}
            >
              <Select
                options={DOC_TYPES.map((v) => ({
                  value: v,
                  label: t(`publicSite.identity.doc_${v}`),
                }))}
              />
            </Form.Item>
            <Form.Item
              name="real_name"
              label={t('publicSite.identity.realName')}
              rules={[{ required: true, message: t('publicSite.identity.realNameRequired') }]}
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item name="id_number" label={t('publicSite.identity.idNumber')}>
              <Input maxLength={64} />
            </Form.Item>

            <Form.Item label={t('publicSite.identity.front')} required>
              <Upload
                accept="image/jpeg,image/png,image/webp"
                maxCount={1}
                listType="picture"
                beforeUpload={() => false}
                fileList={frontList}
                onChange={({ fileList }) => setFrontList(fileList.slice(-1))}
              >
                <Button icon={<UploadOutlined />}>{t('publicSite.identity.pickImage')}</Button>
              </Upload>
              <div className="rent-text-sm">{t('publicSite.identity.imageHint')}</div>
            </Form.Item>
            <Form.Item label={t('publicSite.identity.backOptional')}>
              <Upload
                accept="image/jpeg,image/png,image/webp"
                maxCount={1}
                listType="picture"
                beforeUpload={() => false}
                fileList={backList}
                onChange={({ fileList }) => setBackList(fileList.slice(-1))}
              >
                <Button icon={<UploadOutlined />}>{t('publicSite.identity.pickImage')}</Button>
              </Upload>
            </Form.Item>

            <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)}>
              {t('publicSite.identity.consent')}
            </Checkbox>

            {error ? (
              <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />
            ) : null}

            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              style={{ marginTop: 16 }}
              block
            >
              {submitting ? t('publicSite.identity.submitting') : t('publicSite.identity.submit')}
            </Button>
          </Form>
        ) : null}
      </Card>
    </div>
  )
}
