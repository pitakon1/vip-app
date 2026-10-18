import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Modal } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import './documents.css'

/**
 * C 端「文档中心」：业主与租客共用同一页面实现。
 * - 数据：GET /documents（后端按角色返回本人相关文档）
 * - 业主独有数据块：存储空间用量、上传文档、删除文档（后端禁止租客上传/删除，故按角色渲染）
 */

type DocCategory = 'all' | 'contract' | 'receipt' | 'ownership' | 'tax' | 'other'
type CatKey = Exclude<DocCategory, 'all'>
type DocStatus = 'success' | 'neutral' | 'warning'

interface DocItem {
  id: string
  name: string
  category: CatKey
  property: string
  /** 文件大小（字节） */
  size: number
  date: string
  status: DocStatus
  statusLabel: string
  url: string
  /** 是否来自接口（false 为演示兜底数据，不可下载/删除） */
  fromApi: boolean
}

const catLabelKey: Record<CatKey, string> = {
  contract: 'ownerDocuments.catContract',
  receipt: 'ownerDocuments.catReceipt',
  ownership: 'ownerDocuments.catOwnership',
  tax: 'ownerDocuments.catTax',
  other: 'ownerDocuments.catOther',
}

const catTagCls: Record<CatKey, string> = {
  contract: 'rent-doc-tag--contract',
  receipt: 'rent-doc-tag--receipt',
  ownership: 'rent-doc-tag--other',
  tax: 'rent-doc-tag--other',
  other: 'rent-doc-tag--other',
}

const catIconCls: Record<CatKey, string> = {
  contract: 'rent-doc-card__icon--contract',
  receipt: 'rent-doc-card__icon--receipt',
  ownership: 'rent-doc-card__icon--other',
  tax: 'rent-doc-card__icon--other',
  other: 'rent-doc-card__icon--other',
}

const statusCls: Record<DocStatus, string> = {
  success: 'rent-doc-status--success',
  neutral: 'rent-doc-status--neutral',
  warning: 'rent-doc-status--warning',
}

// 后端 DocumentType（contract / receipt / inspection_photo / tax_invoice / wht_certificate / other）
// 归入前端展示分类；后端无「产权证明」枚举，归入 other
const normalizeCategory = (c?: string): CatKey => {
  const v = String(c || '').toLowerCase()
  if (v === 'contract') return 'contract'
  if (v === 'receipt') return 'receipt'
  if (v === 'ownership' || v === 'deed' || v === 'title' || v === '产权' || v === '产权证明') return 'ownership'
  if (v === 'tax' || v === 'tax_invoice' || v === 'wht_certificate' || v === '税务') return 'tax'
  return 'other'
}

// 前端展示分类 -> 后端 DocumentType（上传时使用）
type BackendDocType = 'contract' | 'receipt' | 'inspection_photo' | 'tax_invoice' | 'wht_certificate' | 'other'
const CATEGORY_TO_TYPE: Record<CatKey, BackendDocType> = {
  contract: 'contract',
  receipt: 'receipt',
  ownership: 'other',
  tax: 'tax_invoice',
  other: 'other',
}

// 上传白名单（与后端 ALLOWED_DOCUMENT_TYPES 保持一致）
const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx'
// 存储配额：固定 5 GB，用量按文档真实 file_size 汇总
const STORAGE_QUOTA_BYTES = 5 * 1024 ** 3
const TIME_OPTIONS = ['ownerDocuments.timeAll', 'ownerDocuments.timeLast3m', 'ownerDocuments.timeLast1y', 'ownerDocuments.timeCustom']

const formatBytes = (bytes: number): string => {
  if (!bytes) return ''
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// 设计稿静态演示数据（接口无数据时兜底，字段与卡片展示一致）
const FALLBACK_DOCS: DocItem[] = [
  { id: 'fb-1', name: 'Sunway Mesmerrra 租赁合同.pdf', category: 'contract', property: 'Sunway Mesmerrra', size: 2.4 * 1024 ** 2, date: '2024-01-15', status: 'success', statusLabel: 'ownerDocuments.stValid', url: '', fromApi: false },
  { id: 'fb-2', name: '2024年Q3租金收据.pdf', category: 'receipt', property: 'Sunway Mesmerrra', size: 856 * 1024, date: '2024-10-05', status: 'neutral', statusLabel: 'ownerDocuments.stArchived', url: '', fromApi: false },
  { id: 'fb-3', name: '房产产权证明.jpg', category: 'ownership', property: '双威金沙国际公寓', size: 3.1 * 1024 ** 2, date: '2023-06-20', status: 'success', statusLabel: 'ownerDocuments.stValid', url: '', fromApi: false },
  { id: 'fb-4', name: '2024年度房产税申报表.xlsx', category: 'tax', property: '多处房产', size: 1.2 * 1024 ** 2, date: '2024-03-12', status: 'neutral', statusLabel: 'ownerDocuments.stArchived', url: '', fromApi: false },
  { id: 'fb-5', name: 'Sunway Rio Sintra 物业管理协议.pdf', category: 'contract', property: 'Sunway Rio Sintra', size: 1.8 * 1024 ** 2, date: '2024-02-08', status: 'success', statusLabel: 'ownerDocuments.stValid', url: '', fromApi: false },
  { id: 'fb-6', name: '2024年Q1租金收据.pdf', category: 'receipt', property: 'Sunway Rio Sintra', size: 780 * 1024, date: '2024-04-10', status: 'neutral', statusLabel: 'ownerDocuments.stArchived', url: '', fromApi: false },
  { id: 'fb-7', name: '房屋租赁登记备案证明.pdf', category: 'ownership', property: 'Sunway Mesmerrra', size: 640 * 1024, date: '2023-08-15', status: 'success', statusLabel: 'ownerDocuments.stValid', url: '', fromApi: false },
  { id: 'fb-8', name: '2024年物业费缴费凭证.png', category: 'other', property: 'Sunway Rio Sintra', size: 1.5 * 1024 ** 2, date: '2024-05-22', status: 'warning', statusLabel: 'ownerDocuments.stPendingReview', url: '', fromApi: false },
  { id: 'fb-9', name: '2024年度个人所得税清单.pdf', category: 'tax', property: '多处房产', size: 920 * 1024, date: '2024-06-30', status: 'neutral', statusLabel: 'ownerDocuments.stArchived', url: '', fromApi: false },
]

const DocIcon = ({ cat }: { cat: CatKey }) => {
  if (cat === 'ownership') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    )
  }
  if (cat === 'tax') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  )
}

const uploadIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const searchIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const TenantDocuments = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  // 上传 / 删除由后端按角色收口（租客 403），故这两块数据仅业主渲染
  const isOwner = user?.role === 'owner'

  const queryClient = useQueryClient()
  const docsQueryKey = ['tenant-documents', 'mine', uid]
  const [activeTab, setActiveTab] = useState<DocCategory>('all')
  const [keyword, setKeyword] = useState('')
  const [timeFilter, setTimeFilter] = useState(TIME_OPTIONS[0])
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingCategory, setPendingCategory] = useState<CatKey>('other')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const q = useCachedQuery<DocItem[]>({
    queryKey: docsQueryKey,
    cacheKey: `tenant-documents:mine:${uid}`,
    queryFn: async () => {
      try {
        const res = await api.get('/documents')
        const payload = res.data?.data ?? res.data
        const items: any[] = payload?.items ?? []
        // 接口无数据时回落到演示数据（保留原租客端行为）
        if (!items.length) return FALLBACK_DOCS
        return items.map((d) => ({
          id: String(d.id),
          name: d.title || d.name || '',
          category: normalizeCategory(d.type || d.category),
          property: d.property_name || d.property || '-',
          size: Number(d.file_size || 0),
          date: d.created_at ? dayjs(d.created_at).format('YYYY-MM-DD') : '',
          status: 'neutral' as DocStatus,
          statusLabel: 'ownerDocuments.stArchived',
          url: d.file_url || '',
          fromApi: true,
        }))
      } catch {
        return FALLBACK_DOCS
      }
    },
  })
  const data = q.data ?? []
  const loading = q.isPending && !q.data
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  // 证件、合同等敏感文档由鉴权接口取件（/documents/{id}/file 预览、/download 下载）。
  // 用 blob 中转而不是把 token 拼进 URL：URL 会留在历史记录、日志与 Referer 里。
  const openDocument = async (doc: DocItem, download: boolean) => {
    if (!doc.fromApi || !doc.url) {
      message.error(t('ownerDocuments.errNoFileUrl'))
      return
    }
    try {
      const res = await api.get(
        `/documents/${doc.id}/${download ? 'download' : 'file'}`,
        { responseType: 'blob' },
      )
      const blobUrl = URL.createObjectURL(res.data as Blob)
      if (download) {
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = doc.name || 'document'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        window.open(blobUrl, '_blank')
      }
      // 浏览器读取完才回收：过早 revoke 会让预览页/下载拿到空内容
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch {
      message.error(download ? t('ownerDocuments.errDownloadFailed') : t('ownerDocuments.errPreviewFailed'))
    }
  }

  // 选择文件后先确认分类，再上传（分类是必填项，静默默认会让类型筛选失真）
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    // 清空 value，保证连续上传同一个文件也能触发 change
    e.target.value = ''
    if (!f) return
    setPendingCategory(activeTab === 'all' ? 'other' : activeTab)
    setPendingFile(f)
  }

  const handleUploadConfirm = async () => {
    if (!pendingFile) return
    const formData = new FormData()
    formData.append('file', pendingFile)
    formData.append('type', CATEGORY_TO_TYPE[pendingCategory])
    // 标题取文件名（去掉扩展名），后端在取不到标题时也会这样兜底
    formData.append('title', pendingFile.name.replace(/\.[^.]+$/, ''))
    setUploading(true)
    try {
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      message.success(t('ownerDocuments.msgUploaded'))
      setPendingFile(null)
      refresh()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('ownerDocuments.errUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = (doc: DocItem) => {
    if (!doc.fromApi) {
      message.warning(t('ownerDocuments.warnDemoNoDelete'))
      return
    }
    Modal.confirm({
      title: t('ownerDocuments.modalDeleteTitle'),
      content: t('ownerDocuments.modalDeleteContent', { name: doc.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await api.delete(`/documents/${doc.id}`)
          message.success(t('ownerDocuments.msgDeleted', { name: doc.name }))
          queryClient.setQueryData<DocItem[]>(docsQueryKey, (old) =>
            (old ?? []).filter((d) => String(d.id) !== String(doc.id)),
          )
        } catch (err: any) {
          message.error(err?.response?.data?.detail || t('ownerDocuments.errDeleteFailed'))
        }
      },
    })
  }

  // 分类 + 搜索 + 时间 三级筛选
  const filteredData = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let list = data
    if (activeTab !== 'all') list = list.filter((d) => d.category === activeTab)
    if (kw) list = list.filter((d) => (d.name || '').toLowerCase().includes(kw))
    if (timeFilter === 'ownerDocuments.timeLast3m') {
      list = list.filter((d) => !!d.date && dayjs(d.date).isAfter(dayjs().subtract(3, 'month')))
    } else if (timeFilter === 'ownerDocuments.timeLast1y') {
      list = list.filter((d) => !!d.date && dayjs(d.date).isAfter(dayjs().subtract(1, 'year')))
    }
    return list
  }, [data, activeTab, keyword, timeFilter])

  // 存储用量（真实 file_size 汇总；演示兜底数据不计入）
  const usedBytes = useMemo(
    () => data.filter((d) => d.fromApi).reduce((sum, d) => sum + Number(d.size || 0), 0),
    [data],
  )
  const usedPercent = Math.min(100, (usedBytes / STORAGE_QUOTA_BYTES) * 100)

  const segments: { key: DocCategory; label: string }[] = [
    { key: 'all', label: t('ownerDocuments.optAllTypes') },
    { key: 'contract', label: t('ownerDocuments.catContract') },
    { key: 'receipt', label: t('ownerDocuments.catReceipt') },
    { key: 'ownership', label: t('ownerDocuments.catOwnership') },
    { key: 'tax', label: t('ownerDocuments.catTax') },
    { key: 'other', label: t('ownerDocuments.catOther') },
  ]

  return (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="rent-text-muted">{t('tenantDocuments.loading')}</span>
        </div>
      )}

      {/* Hero */}
      <div className="rent-doc-hero">
        <div className="rent-doc-hero__text">
          <h1 className="rent-doc-hero__title">{t('tenantDocuments.myDocs')}</h1>
          <p className="rent-doc-hero__subtitle">{t('tenantDocuments.subtitle')}</p>
        </div>
        {isOwner && (
          <>
            <button type="button" className="rent-doc-hero__action" onClick={() => fileInputRef.current?.click()}>
              {uploadIcon}
              {t('ownerDocuments.uploadDoc')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              style={{ display: 'none' }}
              onChange={handleFilePicked}
            />
          </>
        )}
      </div>

      {/* 存储空间用量（业主独有数据块） */}
      {isOwner && (
        <div className="rent-storage">
          <div className="rent-storage__icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12H2" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </div>
          <div className="rent-storage__body">
            <div className="rent-storage__text">
              <span>{t('ownerDocuments.storageUsage')}</span>
              <span>
                <strong>{formatBytes(usedBytes) || '0 KB'}</strong> / 5 GB
              </span>
            </div>
            <div className="rent-progress rent-storage__bar">
              <div className="rent-progress__bar" style={{ width: `${usedPercent}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* 搜索 + 时间筛选 */}
      <div className="rent-filter-bar">
        <div className="rent-search rent-filter-bar__search">
          {searchIcon}
          <input
            type="text"
            placeholder={t('ownerDocuments.searchPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <select
          className="rent-form-select"
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
        >
          {TIME_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{t(opt)}</option>
          ))}
        </select>
      </div>

      {/* 分类分段控件 */}
      <div className="rent-segment">
        {segments.map((s) => (
          <button
            key={s.key}
            className="rent-segment__item"
            data-active={activeTab === s.key}
            onClick={() => setActiveTab(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="rent-doc-count" dangerouslySetInnerHTML={{ __html: t('tenantDocuments.count', { count: filteredData.length }) }} />

      {/* Document grid */}
      <div className="rent-doc-grid">
        {filteredData.length ? (
          filteredData.map((d) => {
            const sizeStr = formatBytes(Number(d.size || 0))
            const canOpen = d.fromApi && !!d.url
            return (
              <div key={d.id} className="rent-doc-card">
                <div className="rent-doc-card__head">
                  <span className={`rent-doc-card__icon ${catIconCls[d.category]}`}>
                    <DocIcon cat={d.category} />
                  </span>
                  <div className="rent-doc-card__meta">
                    <div className="rent-doc-card__name">{d.name || '-'}</div>
                    <div className="rent-doc-card__tags">
                      <span className={`rent-doc-tag ${catTagCls[d.category]}`}>{t(catLabelKey[d.category])}</span>
                      {sizeStr && <span className="rent-doc-card__size">{sizeStr}</span>}
                      {d.property && d.property !== '-' && <span className="rent-doc-card__size">{d.property}</span>}
                    </div>
                  </div>
                </div>
                <div className="rent-doc-card__foot">
                  <div className="rent-doc-card__meta-row">
                    {d.date && <span className="rent-doc-card__date">{t('tenantDocuments.uploadedAt', { date: d.date })}</span>}
                    <span className={`rent-doc-status ${statusCls[d.status]}`}><span className="rent-doc-status__dot"></span>{t(d.statusLabel)}</span>
                  </div>
                  <div className="rent-doc-card__actions">
                    <button className="rent-btn rent-btn--secondary rent-btn--sm" disabled={!canOpen} onClick={() => void openDocument(d, true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      {t('tenantDocuments.download')}
                    </button>
                    <button className="rent-btn rent-btn--ghost rent-btn--sm" disabled={!canOpen} onClick={() => void openDocument(d, false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      {t('tenantDocuments.preview')}
                    </button>
                    {isOwner && (
                      <button className="rent-btn rent-btn--danger-ghost rent-btn--sm" onClick={() => handleDelete(d)}>
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rent-empty">{t('tenantDocuments.empty')}</div>
        )}
      </div>

      {/* 上传确认：确认文件与分类后再提交（业主独有） */}
      <Modal
        open={!!pendingFile}
        title={t('ownerDocuments.modalUploadTitle')}
        okText={t('ownerDocuments.upload')}
        cancelText={t('common.cancel')}
        confirmLoading={uploading}
        onOk={handleUploadConfirm}
        onCancel={() => !uploading && setPendingFile(null)}
      >
        <div className="owner-upload-modal">
          <div className="owner-upload-modal__file">{pendingFile?.name}</div>
          <label className="owner-upload-modal__label" htmlFor="doc-upload-category">
            {t('ownerDocuments.docCategory')}
          </label>
          <select
            id="doc-upload-category"
            className="rent-form-select"
            value={pendingCategory}
            onChange={(e) => setPendingCategory(e.target.value as CatKey)}
          >
            {segments.filter((s) => s.key !== 'all').map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </Modal>
    </>
  )
}

export default TenantDocuments
