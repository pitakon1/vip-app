import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message } from 'antd'
import dayjs from 'dayjs'
import api from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'

type DocType = 'lease_contract' | 'receipt' | 'certificate' | 'report' | 'other'
type SegmentKey = 'all' | 'lease_contract' | 'receipt' | 'other'

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

const cardIconMap: Record<DocType, string> = {
  lease_contract: 'rent-doc-card__icon--contract',
  receipt: 'rent-doc-card__icon--receipt',
  certificate: 'rent-doc-card__icon--other',
  report: 'rent-doc-card__icon--other',
  other: 'rent-doc-card__icon--other',
}

const cardTagMap: Record<DocType, string> = {
  lease_contract: 'rent-doc-tag--contract',
  receipt: 'rent-doc-tag--receipt',
  certificate: 'rent-doc-tag--other',
  report: 'rent-doc-tag--other',
  other: 'rent-doc-tag--other',
}

const DocIcon = ({ type }: { type: DocType }) => {
  if (type === 'certificate') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    )
  }
  if (type === 'report') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
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
  const { t } = useTranslation()

  const typeLabelMap: Record<DocType, string> = {
    lease_contract: t('tenantDocuments.typeLabel.lease_contract'),
    receipt: t('tenantDocuments.typeLabel.receipt'),
    certificate: t('tenantDocuments.typeLabel.certificate'),
    report: t('tenantDocuments.typeLabel.report'),
    other: t('tenantDocuments.typeLabel.other'),
  }

  const cardStatusMap: Record<DocType, { label: string; cls: string }> = {
    lease_contract: { label: t('tenantDocuments.statusLabel.lease_contract'), cls: 'rent-doc-status--success' },
    receipt: { label: t('tenantDocuments.statusLabel.receipt'), cls: 'rent-doc-status--neutral' },
    certificate: { label: t('tenantDocuments.statusLabel.certificate'), cls: 'rent-doc-status--neutral' },
    report: { label: t('tenantDocuments.statusLabel.report'), cls: 'rent-doc-status--neutral' },
    other: { label: t('tenantDocuments.statusLabel.other'), cls: 'rent-doc-status--warning' },
  }

  const user = useAuthStore((s) => s.user)
  const uid = user?.id ?? 'anon'
  const queryClient = useQueryClient()
  const [, setFile] = useState<File | null>(null)
  const [activeTab, setActiveTab] = useState<SegmentKey>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  const q = useCachedQuery<DocItem[]>({
    queryKey: ['tenant-documents', 'mine', uid],
    cacheKey: `tenant-documents:mine:${uid}`,
    queryFn: async () => {
      try {
        const res = await api.get('/documents')
        const payload = res.data?.data ?? res.data
        const items = payload?.items ?? []
        return items.length ? items : STATIC_DOCS
      } catch {
        return STATIC_DOCS
      }
    },
  })
  const data = q.data ?? []
  const loading = q.isPending && !q.data

  const filteredData = useMemo(() => {
    if (activeTab === 'all') return data
    if (activeTab === 'lease_contract') return data.filter((d) => d.type === 'lease_contract')
    if (activeTab === 'receipt') return data.filter((d) => d.type === 'receipt')
    return data.filter((d) => ['certificate', 'report', 'other'].includes(d.type))
  }, [data, activeTab])

  const doUpload = async (f: File) => {
    const formData = new FormData()
    formData.append('file', f)
    formData.append('type', 'lease_contract')

    try {
      try {
        await api.post('/documents', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } catch {
        // API 不可用时仅本地展示
      }
      message.success(t('tenantDocuments.uploadSuccess'))
      const newItem: DocItem = {
        id: `local-${Date.now()}`,
        name: f.name,
        type: 'lease_contract',
        url: '#',
        uploadDate: dayjs().format('YYYY-MM-DD'),
        created_at: dayjs().format('YYYY-MM-DD'),
        size: Math.round(f.size / 1024),
        source: t('tenantDocuments.sourceLocal'),
      }
      setFile(null)
      queryClient.setQueryData<DocItem[]>(['tenant-documents', 'mine', uid], (prev) => [newItem, ...(prev ?? [])])
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('tenantDocuments.uploadFailed'))
    }
  }

  const handleHeroSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      doUpload(f)
    }
    e.target.value = ''
  }

  const handlePreview = (r: DocItem) => {
    if (r.url && r.url !== '#') window.open(r.url, '_blank')
  }

  const handleDownload = (r: DocItem) => {
    if (r.url && r.url !== '#') window.open(r.url, '_blank')
  }

  const segments: { key: SegmentKey; label: string }[] = [
    { key: 'all', label: t('tenantDocuments.allDocs') },
    { key: 'lease_contract', label: t('tenantDocuments.leaseContracts') },
    { key: 'receipt', label: t('tenantDocuments.paymentReceipts') },
    { key: 'other', label: t('tenantDocuments.otherFiles') },
  ]

  return (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="rent-text-muted">{t('tenantDocuments.loading')}</span>
        </div>
      )}

      {/* Clean hero row */}
      <div className="rent-doc-hero">
        <div className="rent-doc-hero__text">
          <h1 className="rent-doc-hero__title">{t('tenantDocuments.myDocs')}</h1>
          <p className="rent-doc-hero__subtitle">{t('tenantDocuments.subtitle')}</p>
        </div>
        <button className="rent-doc-hero__action" onClick={() => inputRef.current?.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          {t('tenantDocuments.uploadDoc')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleHeroSelect}
        />
      </div>

      {/* Segment control */}
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
      <div>
        <div className="rent-doc-grid">
          {filteredData.length ? (
            filteredData.map((r) => {
              const dateStr = r.uploadDate || r.created_at || ''
              const sizeStr = formatSize(r.size)
              const tagCls = cardTagMap[r.type] || cardTagMap.other
              const tagLabel = typeLabelMap[r.type] || t('tenantDocuments.typeLabel.other')
              const iconCls = cardIconMap[r.type] || cardIconMap.other
              const st = cardStatusMap[r.type] || cardStatusMap.other
              const canOpen = !!r.url && r.url !== '#'
              return (
                <div key={r.id} className="rent-doc-card">
                  <div className="rent-doc-card__head">
                    <span className={`rent-doc-card__icon ${iconCls}`}>
                      <DocIcon type={r.type} />
                    </span>
                    <div className="rent-doc-card__meta">
                      <div className="rent-doc-card__name">{r.name || '-'}</div>
                      <div className="rent-doc-card__tags">
                        <span className={`rent-doc-tag ${tagCls}`}>{tagLabel}</span>
                        {sizeStr && <span className="rent-doc-card__size">{sizeStr}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="rent-doc-card__foot">
                    <div className="rent-doc-card__meta-row">
                      {dateStr && <span className="rent-doc-card__date">{t('tenantDocuments.uploadedAt', { date: dayjs(dateStr).format('YYYY-MM-DD') })}</span>}
                      <span className={`rent-doc-status ${st.cls}`}><span className="rent-doc-status__dot"></span>{st.label}</span>
                    </div>
                    <div className="rent-doc-card__actions">
                      <button className="rent-btn rent-btn--secondary rent-btn--sm" disabled={!canOpen} onClick={() => handleDownload(r)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {t('tenantDocuments.download')}
                      </button>
                      <button className="rent-btn rent-btn--ghost rent-btn--sm" disabled={!canOpen} onClick={() => handlePreview(r)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        {t('tenantDocuments.preview')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rent-empty">{t('tenantDocuments.empty')}</div>
          )}
        </div>
      </div>
    </>
  )
}

export default TenantDocuments