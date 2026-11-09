import { useMemo, useState } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { documentsApi } from '@/services/api'
import { extractErrorMessage, unwrapUploadResult } from '@/lib/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import type { Document } from '@/types'
import './index.scss'
import StateBlock from '@/components/StateBlock'
import { iconStyle } from '@/utils/icons'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import { errorText } from '@/lib/errorText'

const buildTypeMap = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, string> => ({
  contract: t('doc.type.contract'),
  receipt: t('doc.type.receipt'),
  inspection_photo: t('doc.type.inspectionPhoto'),
  tax_invoice: t('doc.type.taxInvoice'),
  wht_certificate: t('doc.type.whtCertificate'),
  property_certificate: t('doc.type.propertyCertificate'),
  owner_id_card: t('doc.type.ownerIdCard'),
  other: t('common.other')
})

// 标签归类（用于 Tabs 与统计）
const CONTRACT_TYPES = ['contract']
const RECEIPT_TYPES = ['receipt']

/** 文档类型对应的徽标配色（对齐 App 的 TYPE_META 配色） */
const typeBadge = (type: string) => {
  switch (type) {
    case 'contract':
      return 'badge--primary'
    case 'receipt':
      return 'badge--info'
    case 'inspection_photo':
      return 'badge--success'
    case 'tax_invoice':
      return 'badge--warning'
    case 'wht_certificate':
      return 'badge--error'
    case 'property_certificate':
      return 'badge--primary'
    case 'owner_id_card':
      return 'badge--info'
    default:
      return 'badge--neutral'
  }
}

/** 文档类型对应的图标底色 */
const typeIcon = (type: string) => {
  if (type === 'contract') return 'doc-icon--primary'
  if (type === 'receipt') return 'doc-icon--info'
  return 'doc-icon--neutral'
}

const buildTabs = (
  t: (k: string, p?: Record<string, string | number>) => string
): Array<{ key: string; label: string }> => [
  { key: 'all', label: t('common.all') },
  { key: 'contract', label: t('doc.type.contract') },
  { key: 'receipt', label: t('doc.type.receipt') },
  { key: 'other', label: t('common.other') }
]

const isImageName = (name?: string) => /\.(png|jpg|jpeg|gif|webp)$/i.test(name || '')

/** 与后端 documents.py 的 ALLOWED_DOCUMENT_TYPES 保持一致（扩展名白名单） */
const UPLOAD_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx']

function pickList(res: any): Document[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function TenantDocumentsPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'
  // 后端上传归属：业主自动挂到本人名下；租客 403、员工/管理员需显式 owner_id，
  // 本页没有业主选择器，因此上传入口仅对业主展示（避免必然失败的按钮）。
  const role = useAuthStore((state) => state.user?.role)
  const canUpload = role === 'owner'
  const [tab, setTab] = useState('all')
  const [uploading, setUploading] = useState(false)
  const TYPE_MAP = buildTypeMap(t)
  const TABS = buildTabs(t)

  const { data, loading, error, refresh } = useSwrCache<Document[]>({
    key: `tenant:documents:${uid}`,
    fetcher: async () => {
      const res = await documentsApi.list()
      return pickList(res)
    },
  })
  const documents = data ?? []

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void refresh()
  })

  const contractCount = documents.filter((d) => CONTRACT_TYPES.includes(d.type)).length
  const receiptCount = documents.filter((d) => RECEIPT_TYPES.includes(d.type)).length

  const visibleDocs = useMemo(() => {
    if (tab === 'contract') return documents.filter((d) => CONTRACT_TYPES.includes(d.type))
    if (tab === 'receipt') return documents.filter((d) => RECEIPT_TYPES.includes(d.type))
    if (tab === 'other') {
      return documents.filter(
        (d) => !CONTRACT_TYPES.includes(d.type) && !RECEIPT_TYPES.includes(d.type)
      )
    }
    return documents
  }, [documents, tab])

  /**
   * 上传文档：后端已提供 `POST /documents/upload`（multipart，字段名 file）。
   * 小程序端走 `documentsApi.uploadDocument`，内部使用绝对地址（Taro.uploadFile
   * 不经过统一 request，相对路径会被微信域名白名单拦截）。
   * 上传成功后刷新列表，新文档归入当前 Tab 对应的类型。
   */
  const handleUpload = async () => {
    if (uploading) return
    try {
      const picked = await Taro.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: UPLOAD_EXTENSIONS
      })
      const file = picked.tempFiles?.[0]
      if (!file?.path) return
      setUploading(true)
      Taro.showLoading({ title: t('common.loading'), mask: true })
      const uploadType = tab === 'contract' ? 'contract' : tab === 'receipt' ? 'receipt' : 'other'
      const res: any = await documentsApi.uploadDocument(file.path, {
        type: uploadType,
        // 标题取文件名（去扩展名）；后端取不到标题时也会以文件名兜底
        title: (file.name || 'document').replace(/\.[^.]+$/, '')
      })
      Taro.hideLoading()
      if (res?.statusCode && res.statusCode >= 400) {
        throw new Error(
          extractErrorMessage(unwrapUploadResult(res), `上传失败，状态码：${res.statusCode}`)
        )
      }
      Taro.showToast({ title: t('common.uploaded'), icon: 'success' })
      await refresh(true)
    } catch (err: any) {
      Taro.hideLoading()
      // 用户取消选文件不算失败，不弹错误提示
      if (String(err?.errMsg || err?.message || '').includes('cancel')) return
      Taro.showToast({ title:errorText(err, t('common.uploadFailed')), icon: 'none' })
    } finally {
      setUploading(false)
    }
  }

  const handlePreview = (doc: Document) => {
    if (isImageName(doc.file_url) && doc.file_url) {
      Taro.previewImage({ urls: [doc.file_url], current: doc.file_url })
      return
    }
    Taro.showToast({ title: `${t('tenantDocs.preview')}${doc.title}`, icon: 'none' })
  }

  const handleDownload = async (doc: Document) => {
    if (!doc.file_url) {
      Taro.showToast({ title: t('tenantDocs.urlUnavailable'), icon: 'none' })
      return
    }
    Taro.showLoading({ title: t('tenantDocs.downloading'), mask: true })
    try {
      const res = await Taro.downloadFile({ url: doc.file_url })
      Taro.hideLoading()
      if (res.statusCode !== 200) {
        Taro.showToast({ title: t('common.downloadFailed'), icon: 'none' })
        return
      }
      if (isImageName(doc.file_url)) {
        await Taro.saveImageToPhotosAlbum({ filePath: res.tempFilePath })
        Taro.showToast({ title: t('tenantDocs.savedToAlbum'), icon: 'success' })
      } else {
        await Taro.openDocument({ filePath: res.tempFilePath, showMenu: true })
      }
    } catch (error) {
      Taro.hideLoading()
      console.error('[TenantDocs] 下载失败', error)
      Taro.showToast({ title: t('tenantDocs.downloadFailedRetry'), icon: 'none' })
    }
  }

  return (
    <View className='tenant-documents-page'>
      <ShellHeader title={t('nav.documents')} />
      <View className='page-container'>
        <ScrollView scrollX className='doc-tabs'>
          <View className='doc-tabs-inner'>
            {TABS.map((tabItem) => (
              <View
                key={tabItem.key}
                className={`doc-tab ${tab === tabItem.key ? 'doc-tab--active' : ''}`}
                onClick={() => setTab(tabItem.key)}
              >
                <Text className='doc-tab-text'>{tabItem.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View className='stat-row'>
          <View className='stat-item'>
            <Text className='stat-label'>{t('doc.type.contract')}</Text>
            <Text className='stat-value'>{t('common.copyCount', { n: contractCount })}</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-label'>{t('doc.type.receipt')}</Text>
            <Text className='stat-value'>{t('common.copyCount', { n: receiptCount })}</Text>
          </View>
        </View>

        <View className='section-title'>
          <Text>{t('tenantDocs.listTitle')}</Text>
        </View>

        <ScrollView scrollY className='document-list'>
          {loading && documents.length === 0 && (
            <StateBlock loading text={t('common.loading')} />
          )}
          {!loading && error && documents.length === 0 && (
            <StateBlock
              error
              text={t('common.loadFailedTapRetry')}
              retryText={t('common.tapRetry')}
              onRetry={() => refresh(true)}
            />
          )}
          {!loading && !error && visibleDocs.length === 0 && (
            <StateBlock empty text={t('tenantDocs.empty')} />
          )}
          {visibleDocs.map((doc) => (
            <View key={doc.id} className='document-card'>
              <View className='doc-head' onClick={() => handlePreview(doc)}>
                <View className={`doc-icon ${typeIcon(doc.type)}`}>
                  {isImageName(doc.file_url) && doc.file_url ? (
                    <Image className='doc-image' src={doc.file_url} mode='aspectFill' />
                  ) : (
                    <View className='icon-svg' style={iconStyle('doc', 36)} />
                  )}
                </View>
                <View className='doc-info'>
                  <Text className='doc-name'>{doc.title}</Text>
                  <View className='doc-meta'>
                    <Text className={`badge doc-type ${typeBadge(doc.type)}`}>
                      {TYPE_MAP[doc.type] || doc.type}
                    </Text>
                    {!!doc.created_at && (
                      <Text className='doc-date'>{doc.created_at.slice(0, 10)}</Text>
                    )}
                  </View>
                </View>
              </View>
              <View className='doc-download' onClick={() => handleDownload(doc)}>
                <Text className='doc-download-text'>{t('common.download')}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {canUpload && (
        <View className={`doc-fab ${uploading ? 'doc-fab--disabled' : ''}`} onClick={handleUpload}>
          <Text className='doc-fab-text'>＋</Text>
        </View>
      )}
    </View>
  )
}