import { useMemo, useState } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { documentsApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import type { Document } from '@/types'
import './index.scss'
import { iconStyle } from '@/utils/icons'
import { useI18n } from '@/i18n'

const buildTypeMap = (
  t: (k: string, p?: Record<string, string | number>) => string
): Record<string, string> => ({
  contract: t('doc.type.contract'),
  receipt: t('doc.type.receipt'),
  inspection_photo: t('doc.type.inspectionPhoto'),
  tax_invoice: t('doc.type.taxInvoice'),
  wht_certificate: t('doc.type.whtCertificate'),
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
  const [tab, setTab] = useState('all')
  const TYPE_MAP = buildTypeMap(t)
  const TABS = buildTabs(t)

  const { data, loading, refresh } = useSwrCache<Document[]>({
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
   * 小程序后端未提供文档上传接口（documentsApi 仅有 list），
   * 对齐 App 上传能力需后端开放上传 API。此处不做本地假数据，
   * 保留引导走线上流程；待后端补上传接口后再接入。
   */
  const handleUpload = () => {
    Taro.showModal({
      title: t('tenantDocs.uploadTitle'),
      content: t('tenantDocs.uploadNote'),
      showCancel: false,
      confirmText: t('common.gotIt')
    })
  }

  const handlePreview = (doc: Document) => {
    if (isImageName(doc.name) && doc.url) {
      Taro.previewImage({ urls: [doc.url], current: doc.url })
      return
    }
    Taro.showToast({ title: `${t('tenantDocs.preview')}${doc.name}`, icon: 'none' })
  }

  const handleDownload = async (doc: Document) => {
    if (!doc.url) {
      Taro.showToast({ title: t('tenantDocs.urlUnavailable'), icon: 'none' })
      return
    }
    Taro.showLoading({ title: t('tenantDocs.downloading'), mask: true })
    try {
      const res = await Taro.downloadFile({ url: doc.url })
      Taro.hideLoading()
      if (res.statusCode !== 200) {
        Taro.showToast({ title: t('common.downloadFailed'), icon: 'none' })
        return
      }
      if (isImageName(doc.name)) {
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
            <View className='empty-state'>
              <Text>{t('common.loading')}</Text>
            </View>
          )}
          {!loading && visibleDocs.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('doc', 80)} />
              <Text>{t('tenantDocs.empty')}</Text>
            </View>
          )}
          {visibleDocs.map((doc) => (
            <View key={doc.id} className='document-card'>
              <View className='doc-head' onClick={() => handlePreview(doc)}>
                <View className={`doc-icon ${typeIcon(doc.type)}`}>
                  {isImageName(doc.name) && doc.url ? (
                    <Image className='doc-image' src={doc.url} mode='aspectFill' />
                  ) : (
                    <View className='icon-svg' style={iconStyle('doc', 36)} />
                  )}
                </View>
                <View className='doc-info'>
                  <Text className='doc-name'>{doc.name}</Text>
                  <View className='doc-meta'>
                    <Text className={`badge doc-type ${typeBadge(doc.type)}`}>
                      {TYPE_MAP[doc.type] || doc.type}
                    </Text>
                    {!!doc.uploadDate && <Text className='doc-date'>{doc.uploadDate}</Text>}
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

      <View className='doc-fab' onClick={handleUpload}>
        <Text className='doc-fab-text'>＋</Text>
      </View>
    </View>
  )
}