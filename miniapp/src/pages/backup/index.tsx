import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { backupApi } from '@/services/api'
import './index.scss'

interface BackupJob {
  id: number | string
  status?: string
  size?: number | string
  created_at?: string
}

function pickList(res: any): BackupJob[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function BackupPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchJobs = async () => {
    setLoading(true)
    try {
      const res = await backupApi.jobs()
      setJobs(pickList(res))
    } catch (error) {
      console.error('[Backup] 获取备份记录失败', error)
      Taro.showToast({ title: '加载失败', icon: 'none' })
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
    fetchJobs()
  })

  const handleRun = async () => {
    if (running) return
    setRunning(true)
    try {
      await backupApi.run()
      Taro.showToast({ title: '备份已触发', icon: 'success' })
      await fetchJobs()
    } catch (error) {
      console.error('[Backup] 触发备份失败', error)
      Taro.showToast({ title: '备份失败', icon: 'none' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <View className='backup-page'>
      <View className='page-container'>
        <View className='backup-panel'>
          <Text className='panel-title'>数据备份</Text>
          <Text className='panel-desc'>备份数据库快照，轻触按钮立即执行</Text>
          <View className={`run-btn ${running ? 'disabled' : ''}`} onClick={handleRun}>
            <Text className='run-text'>{running ? '备份中...' : '立即备份'}</Text>
          </View>
        </View>

        <Text className='section-title'>备份记录（{jobs.length}）</Text>
        <ScrollView scrollY className='job-list'>
          {loading && jobs.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && jobs.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无备份记录</Text>
            </View>
          )}
          {jobs.map((j) => (
            <View key={j.id} className='job-card'>
              <View className='job-head'>
                <Text className='job-id'>备份 #{j.id}</Text>
                <Text className='job-status'>{j.status || '完成'}</Text>
              </View>
              {typeof j.size !== 'undefined' && (
                <Text className='job-meta'>大小：{j.size}</Text>
              )}
              {j.created_at && <Text className='job-meta'>时间：{j.created_at}</Text>}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}