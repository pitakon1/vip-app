import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { message, Modal, Spin, Empty } from 'antd'
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
  if (v === 'tax' || v === '税务') return 'tax'
  return 'other'
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
}

const Documents = () => {
  const [activeTab, setActiveTab] = useState<DocCategory>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [timeFilter, setTimeFilter] = useState(TIME_OPTIONS[0])
  const [loading, setLoading] = useState(false)
  const [documents, setDocuments] = useState<OwnerDocument[]>([])

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      // 业主专属接口：返回当前业主的全部文档
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
      setDocuments(mapped)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取文档列表失败')
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

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

  const handleDelete = (name: string) => {
    Modal.confirm({
      title: '删除文档',
      content: `确定要删除文档「${name}」吗？删除后无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        message.success(`文档「${name}」已删除`)
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
          <button type="button" className="rent-btn rent-btn--primary" onClick={handleUpload}>
            {uploadIcon}
            上传文档
          </button>
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
              <strong>1.2 GB</strong> / 5 GB
            </span>
          </div>
          <div className="rent-progress rent-storage__bar">
            <div className="rent-progress__bar" style={{ width: '24%' }} />
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
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="rent-form-select"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as DocCategory)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="rent-form-select"
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
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
              visibleDocs.map((doc) => (
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
                        onClick={() => handleDelete(doc.name)}
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
        <span className="rent-pagination__info">共 {visibleDocs.length} 条记录</span>
        <button type="button" className="rent-pagination__btn" aria-label="上一页">{chevronLeft}</button>
        <button type="button" className="rent-pagination__btn" data-active="true">1</button>
        <button type="button" className="rent-pagination__btn">2</button>
        <button type="button" className="rent-pagination__btn">3</button>
        <button type="button" className="rent-pagination__btn" aria-label="下一页">{chevronRight}</button>
      </div>
    </div>
  )
}

export default Documents
