import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { auditApi } from '@/services/api'
import './index.scss'

interface AuditRow {
  id: string
  action?: string
  resource_type?: string
  actor_name?: string
  occurred_at?: string
}

const pickItems = (res: any): AuditRow[] => {
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

const pickSummary = (res: any): { by_action: { action: string; count: number }[] } => {
  const d = res?.data ?? res ?? {}
  const by_action = Array.isArray(d?.by_action) ? d.by_action : []
  return { by_action }
}

// 敏感动作：删除 / 导出 / 权限变更等
const SENSITIVE = /delete|remove|export|permission|role|grant|revoke|reset|terminate|refund/i

const isSensitive = (action?: string) => !!action && SENSITIVE.test(action)

const fmtTime = (x?: string) => (x ? x.replace('T', ' ').slice(0, 19) : '—').replace(/:(00)?$/, '')

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [summary, setSummary] = useState({ by_action: [] as { action: string; count: number }[] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetch = async () => {
    setLoading(true)
    setError(false)
    try {
      const [listRes, summaryRes] = await Promise.all([
        auditApi.list({}),
        auditApi.summary()
      ])
      setLogs(pickItems(listRes))
      setSummary(pickSummary(summaryRes))
    } catch (e) {
      console.error('[Audit] 加载审计失败', e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetch()
  })

  const totalOps = summary.by_action.reduce((s, a) => s + Number(a.count || 0), 0)
  const sensitiveOps = summary.by_action
    .filter((a) => isSensitive(a.action))
    .reduce((s, a) => s + Number(a.count || 0), 0)

  return (
    <View className='admin-page'>
      <View className='page-container'>
        <View className='section-header'>
          <Text className='section-header__title'>审计日志</Text>
          <Text className='section-header__hint'>操作留痕</Text>
        </View>

        {/* 摘要卡 */}
        <View className='audit-summary'>
          <View className='audit-summary__item'>
            <Text className='audit-summary__num'>{totalOps.toLocaleString()}</Text>
            <Text className='audit-summary__label'>操作总数</Text>
          </View>
          <View className='audit-summary__item audit-summary__item--sense'>
            <Text className='audit-summary__num'>{sensitiveOps.toLocaleString()}</Text>
            <Text className='audit-summary__label'>敏感操作</Text>
          </View>
        </View>

        <View className='section-header audit-section-head'>
          <Text className='section-header__title'>操作记录</Text>
        </View>

        {loading && logs.length === 0 && (
          <View className='state state--loading'>
            <View className='state__spinner' />
            <Text className='state__title'>正在加载</Text>
          </View>
        )}

        {!loading && error && logs.length === 0 && (
          <View className='state'>
            <View className='state__icon'>!</View>
            <Text className='state__title'>加载失败</Text>
            <Text className='state__desc'>未能获取审计记录，请重试</Text>
            <View className='state__btn' onClick={fetch} hoverClass='state__btn--hover'>
              <Text>重新加载</Text>
            </View>
          </View>
        )}

        {!loading && !error && logs.length === 0 && (
          <View className='state'>
            <View className='state__icon'>📝</View>
            <Text className='state__title'>暂无操作记录</Text>
            <Text className='state__desc'>系统操作记录将在此展示</Text>
          </View>
        )}

        {!loading && logs.length > 0 && (
          <View className='audit-list'>
            {logs.map((a) => {
              const sense = isSensitive(a.action)
              return (
                <View key={a.id} className='audit-item'>
                  <View className={`audit-item__dot ${sense ? 'audit-item__dot--sense' : ''}`} />
                  <View className='audit-item__body'>
                    <View className='audit-item__top'>
                      <Text className={`audit-item__action ${sense ? 'audit-item__action--sense' : ''}`}>
                        {a.action || '-'}
                      </Text>
                      <View className={`badge ${sense ? 'badge--error' : 'badge--info'}`}>
                        <Text>{a.resource_type || 'global'}</Text>
                      </View>
                    </View>
                    <View className='audit-item__meta'>
                      <Text className='audit-item__actor'>{a.actor_name || '系统'}</Text>
                      <Text className='audit-item__time'>{fmtTime(a.occurred_at)}</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </View>
  )
}