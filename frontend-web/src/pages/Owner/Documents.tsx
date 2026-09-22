import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { message, Modal, Spin, Empty } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import './documents.css'

interface OwnerDocument {
  id: string
  name: string
  file_type?: string
  category?: string
  type?: string
  title?: string
  file_url?: string
  created_at?: string
  property_name?: string
  property?: string
  file_size?: number
  [key: string]: any
}

type DocCategory = 'all' | 'contract' | 'receipt' | 'ownership' | 'tax' | 'other'
type DocStatus = 'success' | 'neutral' | 'warning'

// 类型筛选选项（与原型 owner-documents 一致）
const TYPE_OPTIONS: { value: DocCategory; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'contract', label: '合同' },
  { value: 'receipt', label: '收据' },
  { value: 'ownership', label: '产权证明' },
  { value: 'tax', label: '税务' },
  { value: 'other', label: '其他' },
]

// 时间筛选选项（与原型一致）
const TIME_OPTIONS = ['全部时间', '近3个月', '近1年', '自定义']

// 设计稿静态演示数据（API 数据为空时兜底，字段与原型表格一致）
interface FallbackDoc {
  name: string
  category: DocCategory
  property: string
  size: string
  date: string
  status: DocStatus
  statusLabel: string
}

const FALLBACK_DOCS: FallbackDoc[] = [
  { name: 'Sunway Mesmerrra 租赁合同.pdf', category: 'contract', property: 'Sunway Mesmerrra', size: '2.4 MB', date: '2024-01-15', status: 'success', statusLabel: '有效' },
  { name: '2024年Q3租金收据.pdf', category: 'receipt', property: 'Sunway Mesmerrra', size: '856 KB', date: '2024-10-05', status: 'neutral', statusLabel: '已归档' },
  { name: '房产产权证明.jpg', category: 'ownership', property: '双威金沙国际公寓', size: '3.1 MB', date: '2023-06-20', status: 'success', statusLabel: '有效' },
  { name: '2024年度房产税申报表.xlsx', category: 'tax', property: '多处房产', size: '1.2 MB', date: '2024-03-12', status: 'neutral', statusLabel: '已归档' },
  { name: 'Sunway Rio Sintra 物业管理协议.pdf', category: 'contract', property: 'Sunway Rio Sintra', size: '1.8 MB', date: '2024-02-08', status: 'success', statusLabel: '有效' },
  { name: '2024年Q1租金收据.pdf', category: 'receipt', property: 'Sunway Rio Sintra', size: '780 KB', date: '2024-04-10', status: 'neutral', statusLabel: '已归档' },
  { name: '房屋租赁登记备案证明.pdf', category: 'ownership', property: 'Sunway Mesmerrra', size: '640 KB', date: '2023-08-15', status: 'success', statusLabel: '有效' },
  { name: '2024年物业费缴费凭证.png', category: 'other', property: 'Sunway Rio Sintra', size: '1.5 MB', date: '2024-05-22', status: 'warning', statusLabel: '待审核' },
  { name: '2024年度个人所得税清单.pdf', category: 'tax', property: '多处房产', size: '920 KB', date: '2024-06-30', status: 'neutral', statusLabel: '已归档' },
]

const categoryLabelMap: Record<string, string> = {
  contract: '合同',
  receipt: '收据',
  ownership: '产权证明',
  tax: '税务',
  other: '其他',
}

const categoryBadgeMap: Record<string, string> = {
  contract: 'rent-badge--primary',
  receipt: 'rent-badge--success',
  ownership: 'rent-badge--info',
  tax: 'rent-badge--warning',
  other: 'rent-badge--neutral',
}

const statusBadgeMap: Record<DocStatus, string> = {
  success: 'rent-badge--success',
  neutral: 'rent-badge--neutral',
  warning: 'rent-badge--warning',
}

const normalizeCategory = (c?: string): DocCategory => {
  const v = String(c || '').toLowerCase()
  if (v === 'contract') return 'contract'
  if (v === 'receipt') return 'receipt'
  if (
    v === 'ownership' ||
    v === 'deed' ||
    v === 'title' ||
    v === '产权' ||
    v === '产权证明'
  ) {
    return 'ownership'
  }
  // 后端 DocumentType 为 tax_invoice / wht_certificate，前端统一归入「税务」
  if (v === 'tax' || v === 'tax_invoice' || v === 'wht_certificate' || v === '税务') {
    return 'tax'
  }
  return 'other'
}

// 前端展示分类 -> 后端 DocumentType（后端无「产权证明」枚举，归入 other）
type BackendDocType =
  | 'contract'
  | 'receipt'
  | 'inspection_photo'
  | 'tax_invoice'
  | 'wht_certificate'
  | 'other'

const CATEGORY_TO_TYPE: Record<Exclude<DocCategory, 'all'>, BackendDocType> = {
  contract: 'contract',
  receipt: 'receipt',
  ownership: 'other',
  tax: 'tax_invoice',
  other: 'other',
}

// 上传白名单（与后端 ALLOWED_DOCUMENT_TYPES 保持一致）
const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx'

// 表格每页条数（/owners/me/documents 一次性返回全部，分页在前端做）
const PAGE_SIZE = 10

// 存储配额：原型固定 5 GB，用量按文档真实 file_size 汇总
const STORAGE_QUOTA_BYTES = 5 * 1024 ** 3

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 KB'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// 按文件扩展名选择图标类型
const docIconType = (name: string): 'pdf' | 'img' | 'xls' | 'doc' => {
  const n = String(name || '').toLowerCase()
  if (n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png') || n.endsWith('.gif') || n.endsWith('.webp')) {
    return 'img'
  }
  if (n.endsWith('.xls') || n.endsWith('.xlsx') || n.endsWith('.csv')) {
    return 'xls'
  }
  if (n.endsWith('.doc') || n.endsWith('.docx')) {
    return 'doc'
  }
  return 'pdf'
}

const FILE_ICONS: Record<string, ReactNode> = {
  pdf: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  img: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  xls: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  doc: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
}

const uploadIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const searchIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const chevronLeft = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const chevronRight = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

interface DisplayDoc {
  id: string
  name: string
  category: DocCategory
  categoryLabel: string
  property: string
  size: string
  date: string
  status: DocStatus
  statusLabel: string
  file_url: string
  iconType: 'pdf' | 'img' | 'xls' | 'doc'
  /** 是否来自接口（false 为演示兜底数据，不可删除） */
  fromApi: boolean
}

const Documents = () => {
  const [activeTab, setActiveTab] = useState<DocCategory>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [timeFilter, setTimeFilter] = useState(TIME_OPTIONS[0])
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingCategory, setPendingCategory] = useState<Exclude<DocCategory, 'all'>>('other')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const docsQueryKey: string[] = ['owner-documents', 'mine', uid]

  const q = useCachedQuery<OwnerDocument[]>({
    queryKey: docsQueryKey,
    cacheKey: `owner-documents:mine:${uid}`,
    queryFn: async () => {
      try {
        // 业主专属接口：返回当前业主的全部文档
        const res = await api.get('/owners/me/documents')
        const items: OwnerDocument[] = Array.isArray(res.data)
          ? res.data
          : (res.data?.items ?? [])
        // 后端字段为 type/title，映射到 category/name
        return items.map((d) => ({
          ...d,
          category: String(d.category || d.type || 'other').toLowerCase(),
          name: d.title || d.name,
        }))
      } catch (err: any) {
        message.error(err?.response?.data?.message || '获取文档列表失败')
        return []
      }
    },
  })
  const documents = q.data ?? []
  const loading = q.isPending && !q.data
  const refresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false })
  }, [q])

  // 证件、合同等敏感文档已不再由 /uploads 静态服务托管，必须带 Authorization
  // 头走鉴权接口 /documents/{id}/file（预览）或 /download（下载）取件。
  // 这里用 blob 中转而不是把 token 拼进 URL：URL 会留在历史记录、日志与 Referer 里。
  const openDocument = async (doc: OwnerDocument, download: boolean) => {
    if (!doc.file_url || !doc.id) {
      message.error('文件地址不存在')
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
      message.error(download ? '下载文件失败' : '预览文件失败')
    }
  }

  const handleDownload = (doc: OwnerDocument) => {
    void openDocument(doc, true)
  }

  const handlePreview = (doc: OwnerDocument) => {
    void openDocument(doc, false)
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
      message.success('文档上传成功')
      setPendingFile(null)
      refresh()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(detail || '上传失败，请稍后重试')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = (doc: DisplayDoc) => {
    if (!doc.fromApi) {
      message.warning('演示数据不支持删除')
      return
    }
    Modal.confirm({
      title: '删除文档',
      content: `确定要删除文档「${doc.name}」吗？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/documents/${doc.id}`)
          message.success(`文档「${doc.name}」已删除`)
          queryClient.setQueryData<OwnerDocument[]>(docsQueryKey, (old) =>
            (old ?? []).filter((d) => String(d.id) !== String(doc.id)),
          )
        } catch (err: any) {
          const detail = err?.response?.data?.detail
          message.error(detail || '删除失败，请稍后重试')
        }
      },
    })
  }

  // 统一文档展示数据：API 有数据则映射，否则用兜底
  const displayDocs: DisplayDoc[] = useMemo(() => {
    const rows: DisplayDoc[] = []
    if (documents.length) {
      documents.forEach((d, i) => {
        const cat = normalizeCategory(d.category || d.type)
        const name = d.name || d.title || ''
        rows.push({
          id: d.id || `api-${i}`,
          name,
          category: cat,
          categoryLabel: categoryLabelMap[cat] || '其他',
          property: d.property_name || d.property || '-',
          size: d.file_size
            ? d.file_size > 1024 * 1024
              ? `${(d.file_size / 1024 / 1024).toFixed(1)} MB`
              : `${Math.max(1, Math.round(d.file_size / 1024))} KB`
            : '—',
          date: d.created_at ? dayjs(d.created_at).format('YYYY-MM-DD') : '-',
          status: 'neutral' as DocStatus,
          statusLabel: '已归档',
          file_url: d.file_url || '',
          iconType: docIconType(name),
          fromApi: true,
        })
      })
    } else {
      FALLBACK_DOCS.forEach((d, i) => {
        rows.push({
          id: `fb-${i}`,
          name: d.name,
          category: d.category,
          categoryLabel: categoryLabelMap[d.category] || '其他',
          property: d.property,
          size: d.size,
          date: d.date,
          status: d.status,
          statusLabel: d.statusLabel,
          file_url: '',
          iconType: docIconType(d.name),
          fromApi: false,
        })
      })
    }
    return rows
  }, [documents])

  // 类型 + 搜索 + 时间 三级筛选
  const visibleDocs = useMemo(() => {
    const kw = searchTerm.trim().toLowerCase()
    let list = displayDocs
    if (activeTab !== 'all') {
      list = list.filter((d) => d.category === activeTab)
    }
    if (kw) {
      list = list.filter((d) => d.name.toLowerCase().includes(kw))
    }
    if (timeFilter === '近3个月') {
      list = list.filter((d) => d.date !== '-' && dayjs(d.date).isAfter(dayjs().subtract(3, 'month')))
    } else if (timeFilter === '近1年') {
      list = list.filter((d) => d.date !== '-' && dayjs(d.date).isAfter(dayjs().subtract(1, 'year')))
    }
    return list
  }, [displayDocs, activeTab, searchTerm, timeFilter])

  // 存储用量（真实 file_size 汇总；演示兜底数据不计入）
  const usedBytes = useMemo(
    () => documents.reduce((sum, d) => sum + Number(d.file_size || 0), 0),
    [documents],
  )
  const usedPercent = Math.min(100, (usedBytes / STORAGE_QUOTA_BYTES) * 100)

  // 分页（筛选条件变化时回到第 1 页，见各筛选控件的 onChange）
  const pageCount = Math.max(1, Math.ceil(visibleDocs.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedDocs = visibleDocs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="rent-main">
      {loading && (
        <div className="owner-loading-bar">
          <Spin size="small" style={{ marginRight: 8 }} />
          数据加载中…
        </div>
      )}

      {/* Page header */}
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">我的文档</h2>
          <p className="rent-page-header__subtitle">查看和管理您的房产相关文档</p>
        </div>
        <div className="rent-page-header__actions">
          <button
            type="button"
            className="rent-btn rent-btn--primary"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadIcon}
            上传文档
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            style={{ display: 'none' }}
            onChange={handleFilePicked}
          />
        </div>
      </div>

      {/* Storage indicator */}
      <div className="rent-storage">
        <div className="rent-storage__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </div>
        <div className="rent-storage__body">
          <div className="rent-storage__text">
            <span>存储空间使用情况</span>
            <span>
              <strong>{formatBytes(usedBytes)}</strong> / 5 GB
            </span>
          </div>
          <div className="rent-progress rent-storage__bar">
            <div className="rent-progress__bar" style={{ width: `${usedPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rent-filter-bar">
        <div className="rent-search rent-filter-bar__search">
          {searchIcon}
          <input
            type="text"
            placeholder="搜索文档名称..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          className="rent-form-select"
          value={activeTab}
          onChange={(e) => {
            setActiveTab(e.target.value as DocCategory)
            setPage(1)
          }}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="rent-form-select"
          value={timeFilter}
          onChange={(e) => {
            setTimeFilter(e.target.value)
            setPage(1)
          }}
        >
          {TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Documents table */}
      <div className="rent-table-wrap">
        <table className="rent-table">
          <thead>
            <tr>
              <th>文档名称</th>
              <th>类型</th>
              <th>关联房产</th>
              <th>上传日期</th>
              <th>大小</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleDocs.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文档" />
                </td>
              </tr>
            ) : (
              pagedDocs.map((doc) => (
                <tr key={doc.id}>
                  <td className="rent-cell-name">
                    <div className="rent-doc-name">
                      <span className={`rent-doc-icon rent-doc-icon--${doc.iconType}`}>
                        {FILE_ICONS[doc.iconType]}
                      </span>
                      <span className="rent-doc-name__text">{doc.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`rent-badge ${categoryBadgeMap[doc.category] || 'rent-badge--neutral'}`}>
                      {doc.categoryLabel}
                    </span>
                  </td>
                  <td>{doc.property}</td>
                  <td className="rent-table__mono">{doc.date}</td>
                  <td className="rent-table__mono">{doc.size}</td>
                  <td>
                    <span className={`rent-badge ${statusBadgeMap[doc.status]}`}>{doc.statusLabel}</span>
                  </td>
                  <td>
                    <div className="rent-act-group">
                      <button
                        type="button"
                        className="rent-btn rent-btn--ghost rent-btn--sm"
                        onClick={() => handleDownload({ id: doc.id, name: doc.name, file_url: doc.file_url } as OwnerDocument)}
                      >
                        下载
                      </button>
                      <button
                        type="button"
                        className="rent-btn rent-btn--ghost rent-btn--sm"
                        onClick={() => handlePreview({ id: doc.id, name: doc.name, file_url: doc.file_url } as OwnerDocument)}
                      >
                        预览
                      </button>
                      <button
                        type="button"
                        className="rent-btn rent-btn--danger-ghost rent-btn--sm"
                        onClick={() => handleDelete(doc)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="rent-pagination">
        <span className="rent-pagination__info">
          共 {visibleDocs.length} 条记录 · 每页 {PAGE_SIZE} 条
        </span>
        <button
          type="button"
          className="rent-pagination__btn"
          aria-label="上一页"
          disabled={safePage <= 1}
          onClick={() => setPage(Math.max(1, safePage - 1))}
        >
          {chevronLeft}
        </button>
        <span className="rent-pagination__info">
          {safePage} / {pageCount}
        </span>
        <button
          type="button"
          className="rent-pagination__btn"
          aria-label="下一页"
          disabled={safePage >= pageCount}
          onClick={() => setPage(Math.min(pageCount, safePage + 1))}
        >
          {chevronRight}
        </button>
      </div>

      {/* 上传确认：确认文件与分类后再提交 */}
      <Modal
        open={!!pendingFile}
        title="上传文档"
        okText="上传"
        cancelText="取消"
        confirmLoading={uploading}
        onOk={handleUploadConfirm}
        onCancel={() => !uploading && setPendingFile(null)}
      >
        <div className="owner-upload-modal">
          <div className="owner-upload-modal__file">{pendingFile?.name}</div>
          <label className="owner-upload-modal__label" htmlFor="owner-upload-category">
            文档分类
          </label>
          <select
            id="owner-upload-category"
            className="rent-form-select"
            value={pendingCategory}
            onChange={(e) => setPendingCategory(e.target.value as Exclude<DocCategory, 'all'>)}
          >
            {TYPE_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  )
}

export default Documents
