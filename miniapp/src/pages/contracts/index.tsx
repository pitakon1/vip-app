import { useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { contractsApi, leasesApi } from '@/services/api'
import './index.scss'

interface Contract {
  id: number | string
  title?: string
  name?: string
  status?: string
  created_at?: string
  parties?: Array<{ id: number | string; name?: string }>
}

interface Lease {
  id: string
  status?: string
  monthly_rent?: number
  currency?: string
  start_date?: string
  end_date?: string
}

function pickList(res: any): Contract[] {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.list)) return res.list
  if (Array.isArray(res?.data?.items)) return res.data.items
  if (Array.isArray(res?.data?.list)) return res.data.list
  return []
}

export default function ContractsPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [lease, setLease] = useState<Lease | null>(null)
  const [renewing, setRenewing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    landlord_name: '',
    tenant_name: '',
    property: '',
    monthly_rent: '',
    months: '',
    currency: 'CNY'
  })

  const fetchContracts = async () => {
    setLoading(true)
    try {
      const res = await contractsApi.list()
      setContracts(pickList(res))
    } catch (error) {
      console.error('[Contracts] 获取合同列表失败', error)
      Taro.showToast({ title: '加载合同失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchLease = async () => {
    try {
      const res: any = await leasesApi.mine()
      const list = Array.isArray(res?.data) ? res.data
        : Array.isArray(res?.items) ? res.items
        : Array.isArray(res) ? res : []
      const active = list.find((l: any) => l && l.status === 'active')
      setLease(active ?? null)
    } catch (error) {
      setLease(null)
    }
  }

  const handleRenew = () => {
    if (!lease) return
    Taro.showModal({
      title: '续约确认',
      content: `将按原租金¥${lease.monthly_rent ?? '-'}继续租住 12 个月，续约后原合同自动结束。是否继续？`,
      confirmText: '确认续约',
      cancelText: '再想想'
    }).then(async (res) => {
      if (!res.confirm || !lease) return
      setRenewing(true)
      try {
        const start = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
        const endDate = new Date()
        endDate.setFullYear(endDate.getFullYear() + 1)
        const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
        await leasesApi.renew(lease.id, { start_date: start, end_date: end })
        Taro.showToast({ title: '续约成功', icon: 'success' })
        fetchLease()
        fetchContracts()
      } catch (error) {
        console.error('[Contracts] 续约失败', error)
        Taro.showToast({ title: '续约失败，请稍后重试', icon: 'none' })
      } finally {
        setRenewing(false)
      }
    })
  }

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchContracts()
    fetchLease()
  })

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleGenerate = async () => {
    if (!form.landlord_name || !form.tenant_name || !form.property) {
      Taro.showToast({ title: '请填写必填字段', icon: 'none' })
      return
    }
    try {
      const res: any = await contractsApi.generate({
        landlord_name: form.landlord_name,
        tenant_name: form.tenant_name,
        property: form.property,
        monthly_rent: Number(form.monthly_rent) || 0,
        months: Number(form.months) || 1,
        currency: form.currency
      })
      Taro.showToast({ title: '合同生成成功', icon: 'success' })
      setShowForm(false)
      setForm({
        landlord_name: '',
        tenant_name: '',
        property: '',
        monthly_rent: '',
        months: '',
        currency: 'CNY'
      })
      if (!Array.isArray(res)) {
        // refresh to show new contract
        await fetchContracts()
      } else {
        setContracts(res)
      }
    } catch (error) {
      console.error('[Contracts] 生成失败', error)
      Taro.showToast({ title: '生成失败', icon: 'none' })
    }
  }

  const handleSign = async (c: Contract) => {
    const parties = c.parties || []
    if (parties.length === 0) {
      Taro.showToast({ title: '无待签署方', icon: 'none' })
      return
    }
    try {
      for (const p of parties) {
        await contractsApi.sign(String(c.id), String(p.id))
      }
      Taro.showToast({ title: '签署成功', icon: 'success' })
      await fetchContracts()
    } catch (error) {
      console.error('[Contracts] 签署失败', error)
      Taro.showToast({ title: '签署失败', icon: 'none' })
    }
  }

  return (
    <View className='contracts-page'>
      <View className='page-container'>
        {lease && (
          <View className='lease-renew-card'>
            <View className='lease-renew-head'>
              <Text className='lease-renew-title'>我的租约<Text className='lease-renew-badge'>在租</Text></Text>
            </View>
            <Text className='lease-renew-info'>月租：{lease.currency || 'THB'} {lease.monthly_rent ?? '-'}</Text>
            <Text className='lease-renew-info'>租期至：{lease.end_date ? String(lease.end_date).slice(0, 10) : '-'}</Text>
            <View className='lease-renew-btn' onClick={handleRenew}>
              <Text className='lease-renew-btn-text'>{renewing ? '续约中...' : '一键续约'}</Text>
            </View>
          </View>
        )}

        <View className='action-bar'>
          <Text className='action-title'>电子签合同</Text>
          <Text className='action-link' onClick={() => setShowForm((v) => !v)}>
            {showForm ? '收起' : '生成合同'}
          </Text>
        </View>

        {showForm && (
          <View className='form-card'>
            <Input
              className='form-input'
              placeholder='房东姓名（landlord_name）'
              value={form.landlord_name}
              onInput={(e) => setField('landlord_name', e.detail.value)}
            />
            <Input
              className='form-input'
              placeholder='租客姓名（tenant_name）'
              value={form.tenant_name}
              onInput={(e) => setField('tenant_name', e.detail.value)}
            />
            <Input
              className='form-input'
              placeholder='房屋信息（property）'
              value={form.property}
              onInput={(e) => setField('property', e.detail.value)}
            />
            <Input
              className='form-input'
              placeholder='月租金（monthly_rent）'
              type='number'
              value={form.monthly_rent}
              onInput={(e) => setField('monthly_rent', e.detail.value)}
            />
            <Input
              className='form-input'
              placeholder='租期月数（months）'
              type='number'
              value={form.months}
              onInput={(e) => setField('months', e.detail.value)}
            />
            <Input
              className='form-input'
              placeholder='币种（currency，默认CNY）'
              value={form.currency}
              onInput={(e) => setField('currency', e.detail.value)}
            />
            <View className='submit-btn' onClick={handleGenerate}>
              <Text className='submit-text'>生成合同</Text>
            </View>
          </View>
        )}

        <ScrollView scrollY className='contract-list'>
          {loading && contracts.length === 0 && (
            <View className='empty-tip'>
              <Text>加载中...</Text>
            </View>
          )}
          {!loading && contracts.length === 0 && (
            <View className='empty-tip'>
              <Text>暂无合同</Text>
            </View>
          )}
          {contracts.map((c) => (
            <View key={c.id} className='contract-card'>
              <View className='contract-head'>
                <Text className='contract-title'>{c.title || c.name || `合同 ${c.id}`}</Text>
                <Text className='contract-status'>{c.status || '待签署'}</Text>
              </View>
              {c.created_at && <Text className='contract-date'>创建于 {c.created_at}</Text>}
              <View className='contract-op'>
                <View className='op-btn' onClick={() => handleSign(c)}>
                  <Text className='op-text'>立即签署</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}