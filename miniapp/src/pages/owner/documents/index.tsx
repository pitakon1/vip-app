import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { documentsApi } from '@/services/api'
import type { Document } from '@/types'
import './index.scss'

const TYPE_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'purchase', label: '购房合同' },
  { key: 'property', label: '产权证明' },
  { key: 'lease', label: '租赁合同' },
  { key: 'receipt', label: '缴费凭证' }
]

const TYPE_LABEL: Record<string, string> = {
  purchase: '购房合同',
  property: '产权证明',
  lease: '租赁合同',
  receipt: '缴费凭证'
}

function pickList(res: any): Document[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function OwnerDocumentsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [documents, setDocuments] = useState<Document[]>([])
  const [activeType, setActiveType] = useState('all')
  const [loading, setLoading] = useState(false)

  const fetchDocuments = async () => {
    setLoading(true)
    try {
      const res = await documentsApi.list()
      setDocuments(pickList(res))
    } catch (error) {
      console.error('[OwnerDocs] 获取文档失败', error)
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

  const handlePreview = (doc: Document) => {
    if (doc.url) {
      Taro.showToast({ title: `预览：${doc.name}`, icon: 'none' })
    } else {
      Taro.showToast({ title: '暂无预览地址', icon: 'none' })
    }
  }

  const filteredDocuments =
    activeType === 'all'
      ? documents
      : documents.filter((d) => d.type === activeType)

  return (
    <View className='owner-documents-page'>
      <View className='page-container'>
        <ScrollView scrollX className='tab-bar' enhanced showScrollbar={false}>
          {TYPE_TABS.map((tab) => (
            <View
              key={tab.key}
              className={`tab-item ${activeType === tab.key ? 'active' : ''}`}
              onClick={() => setActiveType(tab.key)}
            >
              <Text>{tab.label}</Text>
            </View>
          ))}
        </ScrollView>

        <View className='section-title'>
          <Text>文档列表（{filteredDocuments.length}）</Text>
        </View>

        <ScrollView scrollY className='document-list'>
          {loading && filteredDocuments.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && filteredDocuments.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无文档</Text>
            </View>
          )}
          {filteredDocuments.map((doc) => (
            <View
              key={doc.id}
              className='document-card'
              onClick={() => handlePreview(doc)}
            >
              <View className='doc-icon'>
                <Text className='icon-text'>📄</Text>
              </View>
              <View className='doc-info'>
                <Text className='doc-name'>{doc.name}</Text>
                <View className='doc-meta'>
                  <Text className='doc-type'>
                    {TYPE_LABEL[doc.type] || doc.type}
                  </Text>
                  <Text className='doc-date'>{doc.uploadDate}</Text>
                </View>
              </View>
              <Text className='doc-arrow'>›</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}
