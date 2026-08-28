import { useState } from 'react'
import { View, Text, Button, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { documentsApi } from '@/services/api'
import type { Document } from '@/types'
import './index.scss'

const TYPE_MAP: Record<string, string> = {
  lease: '租赁合同',
  handover: '交接单',
  receipt: '收据',
  voucher: '缴费凭证',
  purchase: '购房合同',
  property: '产权证明'
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

export default function TenantDocumentsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)

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

  const handleUpload = () => {
    Taro.chooseImage({
      count: 1,
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        const fileName = tempFilePath.split('/').pop() || '未命名'
        const newDoc: Document = {
          id: Date.now(),
          name: fileName,
          type: 'voucher',
          url: tempFilePath,
          uploadDate: new Date().toISOString().split('T')[0]
        }
        // 乐观更新前端列表，真实上传应调用后端上传接口
        setDocuments([newDoc, ...documents])
        Taro.showToast({ title: '上传成功', icon: 'success' })
      },
      fail: (err) => {
        console.error('[Upload] 上传失败', err)
        Taro.showToast({ title: '上传取消', icon: 'none' })
      }
    })
  }

  const handlePreview = (doc: Document) => {
    Taro.showToast({ title: `预览：${doc.name}`, icon: 'none' })
  }

  return (
    <View className='tenant-documents-page'>
      <View className='page-container'>
        <View className='upload-section'>
          <Button className='upload-btn' onClick={handleUpload}>
            + 上传凭证
          </Button>
        </View>

        <View className='section-title'>
          <Text>我的文档（{documents.length}）</Text>
        </View>

        <ScrollView scrollY className='document-list'>
          {loading && documents.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && documents.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无文档</Text>
            </View>
          )}
          {documents.map((doc) => {
            const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(doc.name)
            return (
              <View
                key={doc.id}
                className='document-card'
                onClick={() => handlePreview(doc)}
              >
                <View className='doc-icon'>
                  {isImage && doc.url ? (
                    <Image className='doc-image' src={doc.url} mode='aspectFill' />
                  ) : (
                    <Text className='icon-text'>📄</Text>
                  )}
                </View>
                <View className='doc-info'>
                  <Text className='doc-name'>{doc.name}</Text>
                  <View className='doc-meta'>
                    <Text className='doc-type'>
                      {TYPE_MAP[doc.type] || doc.type}
                    </Text>
                    <Text className='doc-date'>{doc.uploadDate}</Text>
                  </View>
                </View>
                <Text className='doc-arrow'>›</Text>
              </View>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}
