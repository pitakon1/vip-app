import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import type { IncomeSummary } from '@/types'
import './index.scss'

const EMPTY_INCOME: IncomeSummary = {
  totalIncome: 0,
  monthlyIncome: 0,
  pendingIncome: 0,
  overdueIncome: 0,
  details: []
}

function pickIncome(res: any): IncomeSummary {
  const data = res?.data ?? res ?? {}
  return {
    totalIncome: Number(data.totalIncome ?? 0),
    monthlyIncome: Number(data.monthlyIncome ?? 0),
    pendingIncome: Number(data.pendingIncome ?? 0),
    overdueIncome: Number(data.overdueIncome ?? 0),
    details: Array.isArray(data.details) ? data.details : []
  }
}

export default function OwnerIncomePage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [income, setIncome] = useState<IncomeSummary>(EMPTY_INCOME)
  const [loading, setLoading] = useState(false)

  const fetchIncome = async () => {
    setLoading(true)
    try {
      const res = await ownerApi.income()
      setIncome(pickIncome(res))
    } catch (error) {
      console.error('[OwnerIncome] 获取收入失败', error)
      Taro.showToast({ title: '加载收入失败', icon: 'none' })
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
    fetchIncome()
  })

  const formatMoney = (num: number) => {
    return num.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  return (
    <View className='owner-income-page'>
      <View className='page-container'>
        <View className='summary-header'>
          <Text className='summary-label'>本月收入</Text>
          <Text className='summary-amount'>฿{formatMoney(income.monthlyIncome)}</Text>
        </View>

        <View className='stats-row'>
          <View className='stat-item'>
            <Text className='stat-label'>总收入</Text>
            <Text className='stat-value'>฿{formatMoney(income.totalIncome)}</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-label'>待收</Text>
            <Text className='stat-value text-warning'>฿{formatMoney(income.pendingIncome)}</Text>
          </View>
          <View className='stat-item'>
            <Text className='stat-label'>逾期</Text>
            <Text className='stat-value text-danger'>฿{formatMoney(income.overdueIncome)}</Text>
          </View>
        </View>

        <View className='section-title'>
          <Text>收入明细</Text>
        </View>

        <ScrollView scrollY className='income-list'>
          {loading && income.details.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && income.details.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无收入明细</Text>
            </View>
          )}
          {income.details.map((detail) => (
            <View key={detail.month} className='income-card'>
              <View className='income-month'>
                <Text className='month-text'>{detail.month}</Text>
                <Text className='property-count'>{detail.propertyCount}套房产</Text>
              </View>
              <Text className='income-amount'>฿{formatMoney(detail.income)}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}
