import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
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
  [key: string]: any
}

type DocCategory = 'all' | 'contract' | 'receipt' | 'other'

interface DocSegment {
  key: DocCategory
  label: string
}

const segments: DocSegment[] = [
  { key: 'all', label: '全部文档' },
  { key: 'contract', label: '租赁合同' },
  { key: 'receipt', label: '付款收据' },
  { key: 'other', label: '其他文件' },
]

// 设计稿静态演示数据（API 数据为空时兜底）
interface FallbackDoc {
  name: string
  category: 'contract' | 'receipt' | 'other'
  size: string
  date: string
  status: 'success' | 'neutral' | 'warning'
  statusLabel: string
}

const FALLBACK_DOCS: FallbackDoc[] = [
  { name: '2025-2026年度租赁合同.pdf', category: 'contract', size: '2.3 MB', date: '2025-08-15', status: 'success', statusLabel: '已签署' },
  { name: '2026年7月租金收据.pdf', category: 'receipt', size: '1.1 MB', date: '2026-08-01', status: 'neutral', statusLabel: '已归档' },
  { name: '入住检查报告.pdf', category: 'other', size: '3.2 MB', date: '2025-08-20', status: 'neutral', statusLabel: '已归档' },
  { name: '2026年6月租金收据.pdf', category: 'receipt', size: '1.0 MB', date: '2026-07-03', status: 'neutral', statusLabel: '已归档' },
  { name: '租赁合同附件-房屋设备清单.pdf', category: 'contract', size: '880 KB', date: '2025-08-15', status: 'success', statusLabel: '已签署' },
  { name: '押金支付凭证.pdf', category: 'other', size: '540 KB', date: '2025-08-10', status: 'warning', statusLabel: '待审核' },
  { name: '2026年5月租金收据.pdf', category: 'receipt', size: '1.2 MB', date: '2026-06-05', status: 'neutral', statusLabel: '已归档' },
]

const categoryLabelMap: Record<string, string> = {
  contract: '合同',
  receipt: '收据',
  other: '其他',
  inspection: '其他',
}

const normalizeCategory = (c?: string): 'contract' | 'receipt' | 'other' => {
  const v = String(c || '').toLowerCase()
  if (v === 'contract') return 'contract'
  if (v === 'receipt') return 'receipt'
  return 'other'
}

const fileIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)

const downloadIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const previewIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const uploadIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const Documents = () => {
  const [activeTab, setActiveTab] = useState<DocCategory>('all')
  const [loading, setLoading] = useState(false)
  const [documents, setDocuments] = useState<OwnerDocument[]>([])

  const fetchDocuments = useCallback(async (category: DocCategory) => {
    setLoading(true)
    try {
      // 业主专属接口：返回当前业主的文档列表
      const res = await api.get('/owners/me/documents')
      const items: OwnerDocument[] = Array.isArray(res.data)
        ? res.data
        : (res.data?.items ?? [])
      // 后端字段为 type/title，映射到 category/name
      const mapped = items.map((d) => ({
        ...d,
        category: String(d.category || d.type || 'other').toLowerCase(),
        name: d.title || d.name,
      }))
      const filtered = mapped.filter((d) => {
        if (category === 'all') return true
        const c = String(d.category || '').toLowerCase()
        return c === category
      })
      setDocuments(filtered.length ? filtered : mapped)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取文档列表失败')
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDocuments(activeTab)
  }, [activeTab, fetchDocuments])

  const handleDownload = (doc: OwnerDocument) => {
    if (!doc.file_url) {
      message.error('文件地址不存在')
      return
    }
    window.open(doc.file_url, '_blank')
  }

  const handlePreview = (doc: OwnerDocument) => {
    if (!doc.file_url) {
      message.error('文件地址不存在')
      return
    }
    window.open(doc.file_url, '_blank')
  }

  const handleUpload = () => {
    message.info('上传功能即将上线')
  }

  // 统一文档展示数据：API 有数据则映射，否则用兜底
  const displayDocs = useMemo(() => {
    if (documents.length) {
      return documents.map((d, i) => {
        const cat = normalizeCategory(d.category || d.type)
        return {
          id: d.id || `api-${i}`,
          name: d.name || d.title,
          category: cat,
          categoryLabel: categoryLabelMap[cat] || '其他',
          size: d.file_size
            ? d.file_size > 1024 * 1024
              ? `${(d.file_size / 1024 / 1024).toFixed(1)} MB`
              : `${Math.max(1, Math.round(d.file_size / 1024))} KB`
            : '—',
          date: d.created_at ? dayjs(d.created_at).format('YYYY-MM-DD') : '-',
          status: 'neutral' as 'success' | 'neutral' | 'warning',
          statusLabel: '已归档',
          file_url: d.file_url,
        }
      })
    }
    return FALLBACK_DOCS.map((d, i) => ({
      id: `fb-${i}`,
      ...d,
      categoryLabel: categoryLabelMap[d.category] || '其他',
      file_url: '',
    }))
  }, [documents])

  const visibleDocs = useMemo(() => {
    if (activeTab === 'all') return displayDocs
    return displayDocs.filter((d) => d.category === activeTab)
  }, [displayDocs, activeTab])

  return (
    <div className="rent-main">
      {loading && <div className="owner-loading-bar">数据加载中…</div>}

      {/* Clean hero row */}
      <div className="rent-doc-hero">
        <div className="rent-doc-hero__text">
          <h1 className="rent-doc-hero__title">我的文档</h1>
          <p className="rent-doc-hero__subtitle">查看和管理您的租赁文件</p>
        </div>
        <button type="button" className="rent-doc-hero__action" onClick={handleUpload}>
          {uploadIcon}
          上传文档
        </button>
      </div>

      {/* Segment control */}
      <div className="rent-segment">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            className="rent-segment__item"
            data-active={activeTab === s.key}
            onClick={() => setActiveTab(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="rent-doc-count">
        共 <span className="rent-doc-count__num">{visibleDocs.length}</span> 份文档
      </div>

      {/* Document grid */}
      <div className="rent-doc-grid">
        {visibleDocs.map((doc) => {
          const iconCls = `rent-doc-card__icon rent-doc-card__icon--${doc.category}`
          const tagCls = `rent-doc-tag rent-doc-tag--${doc.category}`
          const statusCls = `rent-doc-status rent-doc-status--${doc.status}`
          return (
            <div className="rent-doc-card" key={doc.id}>
              <div className="rent-doc-card__head">
                <span className={iconCls}>{fileIcon}</span>
                <div className="rent-doc-card__meta">
                  <div className="rent-doc-card__name">{doc.name}</div>
                  <div className="rent-doc-card__tags">
                    <span className={tagCls}>{doc.categoryLabel}</span>
                    <span className="rent-doc-card__size">{doc.size}</span>
                  </div>
                </div>
              </div>
              <div className="rent-doc-card__foot">
                <div className="rent-doc-card__meta-row">
                  <span className="rent-doc-card__date">上传于 {doc.date}</span>
                  <span className={statusCls}>
                    <span className="rent-doc-status__dot" />
                    {doc.statusLabel}
                  </span>
                </div>
                <div className="rent-doc-card__actions">
                  <button
                    type="button"
                    className="rent-btn rent-btn--secondary rent-btn--sm"
                    onClick={() => handleDownload({ id: doc.id, name: doc.name, file_url: doc.file_url } as OwnerDocument)}
                  >
                    {downloadIcon}
                    下载
                  </button>
                  <button
                    type="button"
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    onClick={() => handlePreview({ id: doc.id, name: doc.name, file_url: doc.file_url } as OwnerDocument)}
                  >
                    {previewIcon}
                    预览
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {visibleDocs.length === 0 && !loading && (
        <div className="rent-empty">暂无文档</div>
      )}
    </div>
  )
}

export default Documents
