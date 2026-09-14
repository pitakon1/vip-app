import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { contractsApi } from '@/services/api'
import './index.scss'

interface Contract {
  id: string
  title?: string
  status?: string
  document_hash?: string
  created_at?: string
  signed_at?: string | null
  language?: string
}

interface ContractDetail {
  id: string
  title?: string
  status?: string
  created_at?: string
  parties?: Array<{ name?: string; role?: string; signed?: boolean }>
}

// 合同状态映射
const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'ct-badge--neutral' },
  sent: { label: '待签', cls: 'ct-badge--warning' },
  partially_signed: { label: '待签', cls: 'ct-badge--warning' },
  signed: { label: '已签', cls: 'ct-badge--success' },
  completed: { label: '已完成', cls: 'ct-badge--success' },
  voided: { label: '已作废', cls: 'ct-badge--error' }
}
const getStatus = (s?: string) =>
  STATUS_META[s ?? ''] ?? { label: s || '未知', cls: 'ct-badge--neutral' }

const ROLE_LABEL: Record<string, string> = {
  landlord: '房东',
  tenant: '租客',
  agent: '经纪',
  witness: '见证'
}

function pickList(res: any): Contract[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

const fmtTime = (iso?: string) => {
  if (!iso) return '-'
  return String(iso).replace('T', ' ').slice(0, 10)
}

export default function ContractsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchContracts = async () => {
    setLoading(true)
    setError(false)
    try {
      const res: any = await contractsApi.list()
      setContracts(pickList(res))
    } catch (err) {
      console.error('[Contracts] 获取合同失败', err)
      setError(true)
      Taro.showToast({ title: '加载合同失败', icon: 'none' })
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
    fetchContracts()
  })

  const onCardTap = async (c: Contract) => {
    try {
      const res: ContractDetail = (await contractsApi.get(c.id)) as any
      const detail = res?.data ?? res
      const parties = detail?.parties || []
      const partyText = parties.length
        ? parties
            .map(
              (p) =>
                `${ROLE_LABEL[p.role || 'tenant'] || p.role}：${
                  p.name || '未署名'
                }${p.signed ? '（已签）' : ''}`
            )
            .join('\n')
        : '暂无签署方'
      Taro.showModal({
        title: c.title || '合同详情',
        content: `状态 ${getStatus(detail?.status || c.status).label}\n${partyText}`,
        showCancel: false,
        confirmText: '知道了'
      })
    } catch (err) {
      Taro.showToast({ title: '获取详情失败', icon: 'none' })
    }
  }

  const openGenerate = () => {
    Taro.showToast({ title: '请在 Web 管理后台生成合同', icon: 'none' })
  }

  return (
    <View className='ct-page'>
      <View className='page-container'>
        <View className='ct-bar'>
          <Text className='ct-bar__title'>电子合同</Text>
          <Text
            className='ct-bar__link'
            onClick={openGenerate}
          >
            新建合同
          </Text>
        </View>

        {loading && contracts.length === 0 ? (
          <View className='ct-state ct-state--loading'>
            <View className='ct-state__spinner' />
            <Text className='ct-state__title'>正在加载合同</Text>
          </View>
        ) : error ? (
          <View className='ct-state'>
            <Text className='ct-state__icon'>!</Text>
            <Text className='ct-state__title'>加载失败</Text>
            <View className='ct-retry' onClick={fetchContracts}>
              <Text className='ct-retry__text'>点击重试</Text>
            </View>
          </View>
        ) : contracts.length === 0 ? (
          <View className='ct-state'>
            <Text className='ct-state__icon'>签</Text>
            <Text className='ct-state__title'>暂无合同</Text>
            <Text className='ct-state__desc'>生成的合同将汇总在这里</Text>
          </View>
        ) : (
          <View className='ct-list'>
            {contracts.map((c) => {
              const st = getStatus(c.status)
              const ref = (c.document_hash || c.id).slice(0, 8).toUpperCase()
              return (
                <View
                  key={c.id}
                  className='ct-card'
                  hoverClass='ct-card--hover'
                  onClick={() => onCardTap(c)}
                >
                  <View className='ct-card__head'>
                    <Text className='ct-card__title'>{c.title || '未命名合同'}</Text>
                    <View className={`ct-badge ${st.cls}`}>
                      <Text>{st.label}</Text>
                    </View>
                  </View>
                  <Text className='ct-card__no'>合同编号 {ref}</Text>
                  <View className='ct-card__foot'>
                    <Text className='ct-card__lang'>
                      语言 {c.language === 'zh' ? '中文' : c.language || '-'}
                    </Text>
                    <Text className='ct-card__time'>创建于 {fmtTime(c.created_at)}</Text>
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