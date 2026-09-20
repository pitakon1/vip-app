import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { documentsApi, ownerApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { currentToken, documentFileUrl } from '@/lib/api'
import './index.scss'
import { iconStyle, type IconKey } from '@/utils/icons'
import BottomNav from '@/components/BottomNav'

interface Doc {
  id: string
  type?: string
  title?: string
  file_url?: string
  file_size?: number
  mime_type?: string
  created_at?: string
  property_id?: string
}

interface OwnerProp {
  id?: string | number
  room_number?: string
  display_name?: string
  address?: string
}

const pickList = (res: any): any[] => {
  if (Array.isArray(res)) return res
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.list)) return d.list
  return []
}

// 文档类型（对齐后端 DocumentType 枚举）
const TYPE_META: Record<string, { label: string; cls: string; icon: IconKey }> = {
  contract: { label: '合同', cls: 'primary', icon: 'doc' },
  receipt: { label: '收据', cls: 'success', icon: 'clipboard' },
  tax_invoice: { label: '发票', cls: 'warning', icon: 'doc' },
  wht_certificate: { label: '扣税凭证', cls: 'info', icon: 'clipboard' },
  inspection_photo: { label: '证件', cls: 'info', icon: 'card' },
  other: { label: '报表', cls: 'neutral', icon: 'chart' }
}

const metaOf = (t?: string) => TYPE_META[t || ''] || { label: '其他', cls: 'neutral', icon: 'doc' as IconKey }

const FILTERS: Array<{ key: string; label: string; types?: string[] }> = [
  { key: 'all', label: '全部' },
  { key: 'contract', label: '合同', types: ['contract'] },
  { key: 'certificate', label: '证件', types: ['inspection_photo', 'wht_certificate'] },
  { key: 'report', label: '报表', types: ['other'] },
  { key: 'invoice', label: '发票', types: ['tax_invoice'] }
]

const fmtSize = (bytes?: number) => {
  const b = Number(bytes || 0)
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '—')

// openDocument 无法从「无扩展名的临时路径」推断格式，需显式给出 fileType
type OpenableFileType = 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx' | 'pdf'

const OPENABLE_TYPES: readonly string[] = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf']

const fileTypeOf = (doc: Doc): OpenableFileType | undefined => {
  const ext = String(doc.title || '').split('.').pop()?.toLowerCase() || ''
  if (OPENABLE_TYPES.includes(ext)) return ext as OpenableFileType
  const mime = String(doc.mime_type || '')
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('word')) return 'docx'
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'xlsx'
  return undefined
}

export default function OwnerDocumentsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  const [activeType, setActiveType] = useState('all')
  const [error, setError] = useState(false)

  interface DocPayload {
    documents: Doc[]
    properties: OwnerProp[]
  }

  const { data, loading, refresh } = useSwrCache<DocPayload>({
    key: `owner:documents:${uid}`,
    fetcher: async (): Promise<DocPayload> => {
      const [docRes, propRes]: [any, any] = await Promise.all([
        documentsApi.list(),
        ownerApi.properties().catch(() => null)
      ])
      return {
        documents: pickList(docRes) as Doc[],
        properties: pickList(propRes) as OwnerProp[]
      }
    },
  })
  const documents = data?.documents ?? []
  const properties = data?.properties ?? []

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  const propertyName = (id?: string) => {
    if (!id) return ''
    const p = properties.find((x) => String(x.id) === String(id))
    return p?.display_name || p?.room_number || p?.address || ''
  }

  /**
   * 取件并打开文档。
   *
   * `uploads/documents` 已不对静态服务开放，不能再拿落库的 `file_url` 直接
   * 预览/复制；且 previewImage 无法附加请求头，所以先用 downloadFile（可带
   * Authorization 头）落到本地临时文件，再交给 previewImage / openDocument。
   * `showMenu` 为 true 时系统菜单提供保存/转发入口，即小程序侧的「下载」。
   */
  const handleOpenDoc = async (doc: Doc, showMenu: boolean) => {
    if (!doc.id) {
      Taro.showToast({ title: '暂无文件', icon: 'none' })
      return
    }
    Taro.showLoading({ title: '加载中', mask: true })
    let localPath = ''
    try {
      const token = currentToken()
      const res = await Taro.downloadFile({
        url: documentFileUrl(doc.id, 'download'),
        header: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (res.statusCode !== 200 || !res.tempFilePath) {
        throw new Error(`HTTP ${res.statusCode}`)
      }
      localPath = res.tempFilePath
    } catch (e) {
      console.error('[OwnerDocs] 取件失败', e)
      Taro.hideLoading()
      Taro.showToast({ title: '文件加载失败', icon: 'none' })
      return
    }
    Taro.hideLoading()

    if (String(doc.mime_type || '').startsWith('image/')) {
      Taro.previewImage({ urls: [localPath] })
      return
    }
    const fileType = fileTypeOf(doc)
    if (!fileType) {
      Taro.showToast({ title: '该类型暂不支持在小程序内打开', icon: 'none' })
      return
    }
    try {
      await Taro.openDocument({ filePath: localPath, fileType, showMenu })
    } catch (e) {
      console.error('[OwnerDocs] 打开失败', e)
      Taro.showToast({ title: '文件打开失败', icon: 'none' })
    }
  }

  const handlePreview = (doc: Doc) => {
    void handleOpenDoc(doc, false)
  }

  const handleDownload = (doc: Doc) => {
    void handleOpenDoc(doc, true)
  }

  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthAdded = documents.filter((d) => String(d.created_at || '').slice(0, 7) === thisMonth).length
  const usedBytes = documents.reduce((sum, d) => sum + Number(d.file_size || 0), 0)

  const activeTypes = FILTERS.find((f) => f.key === activeType)?.types
  const filtered = activeTypes ? documents.filter((d) => activeTypes.includes(String(d.type || ''))) : documents

  return (
    <View className='owner-documents-page'>
      <View className='page-container'>
        {/* 概览 stat row */}
        <View className='stat-row'>
          <View className='stat'>
            <Text className='stat__label'>文档总数</Text>
            <Text className='stat__value'>{documents.length}</Text>
            {monthAdded > 0 && <Text className='stat__badge stat__badge--primary'>{monthAdded} 份本月新增</Text>}
          </View>
          <View className='stat'>
            <Text className='stat__label'>存储已用</Text>
            <Text className='stat__value'>{fmtSize(usedBytes)}</Text>
            <Text className='stat__badge stat__badge--neutral'>{documents.length} 个文件</Text>
          </View>
        </View>

        {/* 筛选 */}
        <View className='chips'>
          {FILTERS.map((f) => (
            <View
              key={f.key}
              className={`chips__item ${activeType === f.key ? 'chips__item--active' : ''}`}
              onClick={() => setActiveType(f.key)}
            >
              <Text>{f.label}</Text>
            </View>
          ))}
        </View>

        <View className='section-title'>
          <Text>全部文档</Text>
          <Text className='section-hint'>{filtered.length} 份</Text>
        </View>

        {loading && documents.length === 0 && (
          <View className='empty-tip'>
            <Text>加载中...</Text>
          </View>
        )}

        {!loading && error && documents.length === 0 && (
          <View className='empty-tip'>
            <Text>加载失败，请重试</Text>
            <View className='retry-btn' onClick={() => refresh(true)} hoverClass='retry-btn--hover'>
              <Text>重新加载</Text>
            </View>
          </View>
        )}

        {!loading && !error && filtered.length === 0 && (
          <View className='empty-tip'>
            <View className='empty-tip__icon icon-svg' style={iconStyle('doc', 48)} />
            <Text>{documents.length === 0 ? '暂无文档' : '该类型下暂无文档'}</Text>
          </View>
        )}

        {!loading && filtered.length > 0 && (
          <View className='doc-list'>
            {filtered.map((doc) => {
              const meta = metaOf(doc.type)
              const prop = propertyName(doc.property_id)
              return (
                <View key={doc.id} className='doc'>
                  <View className={`doc__icon doc__icon--${meta.cls}`}>
                    <View className='icon-svg' style={iconStyle(meta.icon, 40)} />
                  </View>
                  <View className='doc__body'>
                    <Text className='doc__name'>{doc.title || '未命名文档'}</Text>
                    <View className='doc__meta'>
                      <Text className={`doc__badge doc__badge--${meta.cls}`}>{meta.label}</Text>
                      <Text className='doc__prop'>{prop || '多处房产'}</Text>
                    </View>
                    <Text className='doc__info'>
                      {fmtDate(doc.created_at)} · {fmtSize(doc.file_size)}
                    </Text>
                  </View>
                  <View className='doc__actions'>
                    <View className='doc__btn' hoverClass='doc__btn--hover' onClick={() => handlePreview(doc)}>
                      <Text>预览</Text>
                    </View>
                    <View className='doc__btn' hoverClass='doc__btn--hover' onClick={() => handleDownload(doc)}>
                      <Text>下载</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      <BottomNav role='owner' active='dashboard' />
    </View>
  )
}