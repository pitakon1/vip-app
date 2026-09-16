import { useMemo, useState } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { documentsApi } from '@/services/api'
import type { Document } from '@/types'
import './index.scss'
import { iconStyle } from '@/utils/icons'

const TYPE_MAP: Record<string, string> = {
  lease: '租赁合同',
  handover: '交接单',
  receipt: '收据',
  voucher: '缴费凭证',
  purchase: '购房合同',
  property: '产权证明'
}

// 合同类与收据类文档归类，用于 Tabs 与统计
const CONTRACT_TYPES = ['lease', 'purchase', 'property', 'handover']
const RECEIPT_TYPES = ['receipt', 'voucher']

/** 文档类型对应的徽标配色 */
const typeBadge = (type: string) => {
  if (CONTRACT_TYPES.includes(type)) return 'badge--primary'
  if (RECEIPT_TYPES.includes(type)) return 'badge--info'
  return 'badge--neutral'
}

/** 文档类型对应的图标底色（合同=主色 / 收据=信息色 / 其他=中性） */
const typeIcon = (type: string) => {
  if (CONTRACT_TYPES.includes(type)) return 'doc-icon--primary'
  if (RECEIPT_TYPES.includes(type)) return 'doc-icon--info'
  return 'doc-icon--neutral'
}

const TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'contract', label: '合同' },
  { key: 'receipt', label: '收据' },
  { key: 'other', label: '其他' }
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
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('all')

  const fetchDocuments = async () => {
    setLoading(true)
    try {
      const res = await documentsApi.list()
      setDocuments(pickList(res))
    } catch (error) {
      console.error('[TenantDocs] 获取文档失败', error)
      Taro.showToast({ title: '加载文档失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchDocuments()
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

  /** 小程序未提供文档上传接口，此处不做本地假数据，改为引导走线上流程 */
  const handleUpload = () => {
    Taro.showModal({
      title: '上传文档',
      content: '小程序暂不支持直接上传文档，请在缴费或报修流程中提交凭证，或联系客服协助上传。',
      showCancel: false,
      confirmText: '知道了'
    })
  }

  const handlePreview = (doc: Document) => {
    if (isImageName(doc.name) && doc.url) {
      Taro.previewImage({ urls: [doc.url], current: doc.url })
      return
    }
    Taro.showToast({ title: `预览：${doc.name}`, icon: 'none' })
  }

  const handleDownload = async (doc: Document) => {
    if (!doc.url) {
      Taro.showToast({ title: '文件地址不可用', icon: 'none' })
      return
    }
    Taro.showLoading({ title: '下载中...', mask: true })
    try {
      const res = await Taro.downloadFile({ url: doc.url })
      Taro.hideLoading()
      if (res.statusCode !== 200) {
        Taro.showToast({ title: '下载失败', icon: 'none' })
        return
      }
      if (isImageName(doc.name)) {
        await Taro.saveImageToPhotosAlbum({ filePath: res.tempFilePath })
        Taro.showToast({ title: '已保存到相册', icon: 'success' })
      } else {
        await Taro.openDocument({ filePath: res.tempFilePath, showMenu: true })
      }
    } catch (error) {
      Taro.hideLoading()
      console.error('[TenantDocs] 下载失败', error)
      Taro.showToast({ title: '下载失败，请重试', icon: 'none' })
    }
  }

  return (
    <View className='tenant-documents-page'>
      <View className='page-container'>
        <ScrollView scrollX className='doc-tabs'>
          <View className='doc-tabs-inner'>
            {TABS.map((t) => (
              <View
                key={t.key}
                className={`doc-tab ${tab === t.key ? 'doc-tab--active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <Text className='doc-tab-text'>{t.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View className='stat-row'>
          <View className='stat-item'>
            <Text className='stat-label'>合同</Text>
            <Text className='stat-value'>{contractCount} 份</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-label'>收据</Text>
            <Text className='stat-value'>{receiptCount} 份</Text>
          </View>
        </View>

        <View className='section-title'>
          <Text>文档列表</Text>
        </View>

        <ScrollView scrollY className='document-list'>
          {loading && documents.length === 0 && (
            <View className='empty-state'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && visibleDocs.length === 0 && (
            <View className='empty-state'>
              <View className='empty-state__icon icon-svg' style={iconStyle('doc', 80)} />
              <Text>暂无文档</Text>
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
                <Text className='doc-download-text'>下载</Text>
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