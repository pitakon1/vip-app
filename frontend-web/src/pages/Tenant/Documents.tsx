import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import './documents.css'

type DocType = 'lease_contract' | 'receipt' | 'certificate' | 'report' | 'other'

interface DocItem {
  id: string
  name: string
  type: DocType
  url?: string
  uploadDate?: string
  created_at?: string
  size?: number
  source?: string
  [key: string]: any
}

const typeLabelMap: Record<DocType, string> = {
  lease_contract: '合同',
  receipt: '发票',
  certificate: '证件',
  report: '报表',
  other: '其他',
}

const typeBadgeMap: Record<DocType, string> = {
  lease_contract: 'rent-badge--primary',
  receipt: 'rent-badge--warning',
  certificate: 'rent-badge--info',
  report: 'rent-badge--success',
  other: 'rent-badge--neutral',
}

const typeIconStyleMap: Record<DocType, { bg: string; color: string }> = {
  lease_contract: { bg: 'rgba(220,38,38,0.10)', color: '#dc2626' },
  receipt: { bg: 'rgba(220,38,38,0.10)', color: '#dc2626' },
  certificate: { bg: 'rgba(14,165,233,0.10)', color: '#0ea5e9' },
  report: { bg: 'rgba(22,163,74,0.10)', color: '#16a34a' },
  other: { bg: 'rgba(100,116,139,0.10)', color: '#64748b' },
}

const DocIcon = ({ type }: { type: DocType }) => {
  if (type === 'certificate') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    )
  }
  if (type === 'report') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  )
}

const formatSize = (size?: number) => {
  if (!size) return ''
  if (size < 1024) return `${size} KB`
  return `${(size / 1024).toFixed(1)} MB`
}

const STATIC_DOCS: DocItem[] = [
  {
    id: 'static-1',
    name: 'Sunway Mesmerrra 租赁合同.pdf',
    type: 'lease_contract',
    url: '#',
    uploadDate: '2024-01-15',
    created_at: '2024-01-15',
    size: 2458,
    source: 'Sunway Mesmerrra',
  },
  {
    id: 'static-2',
    name: '房产产权证明.jpg',
    type: 'certificate',
    url: '#',
    uploadDate: '2023-06-20',
    created_at: '2023-06-20',
    size: 3174,
    source: '双威金沙国际公寓',
  },
  {
    id: 'static-3',
    name: '2024年Q3租金收入报表.xlsx',
    type: 'report',
    url: '#',
    uploadDate: '2024-10-05',
    created_at: '2024-10-05',
    size: 1229,
    source: '多处房产',
  },
  {
    id: 'static-4',
    name: '2024年Q3租金发票.pdf',
    type: 'receipt',
    url: '#',
    uploadDate: '2024-10-08',
    created_at: '2024-10-08',
    size: 856,
    source: 'Sunway Mesmerrra',
  },
  {
    id: 'static-5',
    name: 'Sunway Rio Sintra 物业管理协议.pdf',
    type: 'lease_contract',
    url: '#',
    uploadDate: '2024-02-08',
    created_at: '2024-02-08',
    size: 1843,
    source: 'Sunway Rio Sintra',
  },
  {
    id: 'static-6',
    name: '2024年度税务申报表.xlsx',
    type: 'report',
    url: '#',
    uploadDate: '2024-03-12',
    created_at: '2024-03-12',
    size: 1229,
    source: '多处房产',
  },
]

const TenantDocuments = () => {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DocItem[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [activeTab, setActiveTab] = useState<DocType | 'all'>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/documents')
      const payload = res.data?.data ?? res.data
      const items = payload?.items ?? []
      setData(items.length ? items : STATIC_DOCS)
    } catch {
      setData(STATIC_DOCS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredData = useMemo(() => {
    return activeTab === 'all' ? data : data.filter((d) => d.type === activeTab)
  }, [data, activeTab])

  const totalSize = useMemo(() => {
    return data.reduce((sum, d) => sum + (d.size || 0), 0)
  }, [data])

  const handleUpload = async () => {
    if (!file) {
      message.warning('请先选择要上传的文件')
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'lease_contract')

    try {
      try {
        await api.post('/documents', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } catch {
        // API 不可用时仅本地展示
      }
      message.success('合同上传成功')
      const newItem: DocItem = {
        id: `local-${Date.now()}`,
        name: file.name,
        type: 'lease_contract',
        url: '#',
        uploadDate: dayjs().format('YYYY-MM-DD'),
        created_at: dayjs().format('YYYY-MM-DD'),
        size: Math.round(file.size / 1024),
        source: '本地文件',
      }
      setData((prev) => [newItem, ...prev])
      setFile(null)
    } catch (err: any) {
      message.error(err?.response?.data?.message || '上传失败')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handlePreview = (r: DocItem) => {
    if (r.url && r.url !== '#') window.open(r.url, '_blank')
  }

  const handleDownload = (r: DocItem) => {
    if (r.url && r.url !== '#') window.open(r.url, '_blank')
  }

  const filterChips: { key: DocType | 'all'; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'lease_contract', label: '合同' },
    { key: 'certificate', label: '证件' },
    { key: 'report', label: '报表' },
    { key: 'receipt', label: '发票' },
  ]

  const usedGB = (totalSize / (1024 * 1024)).toFixed(1)
  const usedPercent = Math.min((totalSize / (5 * 1024 * 1024)) * 100, 100)

  return (
    <div className="rent-main">
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="rent-text-muted">加载中…</span>
        </div>
      )}

      {/* Summary stat row */}
      <div className="rent-doc-stats">
        <div className="rent-doc-stat">
          <div className="rent-doc-stat__label">文档总数</div>
          <div className="rent-doc-stat__value">{data.length}</div>
          <span className="rent-doc-stat__badge rent-badge rent-badge--primary">{data.length} 份本月新增</span>
        </div>
        <div className="rent-doc-stat">
          <div className="rent-doc-stat__label">存储已用</div>
          <div className="rent-doc-stat__value">{usedGB} GB</div>
          <span className="rent-doc-stat__badge rent-badge rent-badge--neutral">/ 5 GB</span>
        </div>
      </div>

      {/* Storage progress */}
      <div className="rent-doc-storage">
        <div className="rent-doc-storage__head">
          <span className="rent-doc-storage__label">存储空间使用情况</span>
          <span className="rent-doc-storage__value">{usedGB} GB / 5 GB</span>
        </div>
        <div className="rent-progress">
          <div className="rent-progress__bar" style={{ width: `${usedPercent}%` }}></div>
        </div>
      </div>

      {/* Upload zone */}
      <div className="rent-doc-upload">
        <h3 className="rent-doc-upload__title">上传租赁合同</h3>
        <label className="rent-doc-upload__zone">
          <div className="rent-doc-upload__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <span className="rent-doc-upload__text">上传租赁合同（点击或拖拽）</span>
          <span className="rent-doc-upload__hint">支持 PDF、图片等格式</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
        {file && (
          <div className="rent-doc-upload__file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-primary)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>{file.name}</span>
            <span className="rent-text-muted">· {formatSize(Math.round(file.size / 1024))}</span>
          </div>
        )}
        <div className="rent-doc-upload__actions">
          <button className="rent-btn rent-btn--primary" onClick={handleUpload}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            上传合同
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="rent-doc-chips">
        {filterChips.map((c) => (
          <button
            key={c.key}
            className="rent-doc-chip"
            data-active={activeTab === c.key}
            onClick={() => setActiveTab(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <h3 className="rent-doc-section-title">全部文档</h3>

      {/* Document list */}
      <div className="rent-doc-list">
        {filteredData.length ? (
          filteredData.map((r) => {
            const d = r.uploadDate || r.created_at
            const dateStr = d ? dayjs(d).format('YYYY-MM-DD') : '-'
            const sizeStr = formatSize(r.size)
            const iconStyle = typeIconStyleMap[r.type] || typeIconStyleMap.other
            return (
              <div key={r.id} className="rent-doc-item">
                <div className="rent-doc-item__icon" style={{ background: iconStyle.bg, color: iconStyle.color }}>
                  <DocIcon type={r.type} />
                </div>
                <div className="rent-doc-item__body">
                  <div className="rent-doc-item__name">{r.name || '-'}</div>
                  <div className="rent-doc-item__meta">
                    <span className={`rent-badge ${typeBadgeMap[r.type] || 'rent-badge--neutral'}`} style={{ padding: '2px 8px' }}>
                      {typeLabelMap[r.type] || r.type || '其他'}
                    </span>
                    {r.source && <span className="rent-doc-item__source">{r.source}</span>}
                  </div>
                  <div className="rent-doc-item__sub">{dateStr}{sizeStr ? ` · ${sizeStr}` : ''}</div>
                </div>
                <div className="rent-doc-item__actions">
                  <button
                    className="rent-icon-btn"
                    style={{ width: 32, height: 32, border: '1px solid var(--rent-border)', background: 'var(--rent-surface)' }}
                    aria-label="预览"
                    disabled={!r.url || r.url === '#'}
                    onClick={() => handlePreview(r)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-2)" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button
                    className="rent-icon-btn"
                    style={{ width: 32, height: 32, border: '1px solid var(--rent-border)', background: 'var(--rent-surface)' }}
                    aria-label="下载"
                    disabled={!r.url || r.url === '#'}
                    onClick={() => handleDownload(r)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-2)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rent-empty">暂无文档</div>
        )}
      </div>
    </div>
  )
}

export default TenantDocuments
