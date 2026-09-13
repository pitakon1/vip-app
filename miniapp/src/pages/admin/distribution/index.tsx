import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { brokerApi } from '@/services/api'
import '../_shared.scss'
import './index.scss'

type Tab = 'partner' | 'referral'

interface Partner {
  id: string
  partner_name?: string
  broker_type?: string
  level?: string
  status?: string
  invite_code?: string
  base_rate?: number
}

interface Referral {
  id: string
  referrer_partner_id?: string
  referrer_user_id?: string
  status?: string
  created_at?: string
}

const PARTNER_TYPE: Record<string, string> = {
  individual: '独立经纪人',
  agency: '中介机构',
  franchise: '加盟商',
  affiliate: '影响者'
}
const LEVEL: Record<string, string> = {
  silver: '银牌',
  gold: '金牌',
  platinum: '白金'
}
const STATUS: Record<string, string> = {
  pending: '待审核',
  active: '已启用',
  suspended: '已停用'
}

const pick = (res: any): any[] => {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  return Array.isArray(d?.items) ? d.items : []
}

export default function DistributionPage() {
  const [tab, setTab] = useState<Tab>('partner')
  const [partners, setPartners] = useState<Partner[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(false)

  const fetchPartners = async () => {
    setLoading(true)
    try {
      const res: any = await brokerApi.list({ page_size: 100 })
      setPartners(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载渠道商失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchReferrals = async () => {
    setLoading(true)
    try {
      const res: any = await brokerApi.myReferrals()
      setReferrals(pick(res))
    } catch (e) {
      Taro.showToast({ title: '加载转介绍失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    if (t === 'partner' && partners.length === 0) fetchPartners()
    if (t === 'referral' && referrals.length === 0) fetchReferrals()
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchPartners()
  })

  const toggleApprove = async (p: Partner) => {
    try {
      if (p.status === 'pending') {
        await brokerApi.approve(p.id, {})
        Taro.showToast({ title: '已启用', icon: 'success' })
      } else if (p.status === 'active') {
        await brokerApi.suspend(p.id)
        Taro.showToast({ title: '已停用', icon: 'success' })
      }
      fetchPartners()
    } catch (e) {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'partner', label: '渠道商管理' },
    { key: 'referral', label: '转介绍' }
  ]

  return (
    <View className='admin-page'>
      <View className='page-container'>
        <Text className='page-title'>分销体系</Text>

        <View className='tab-row'>
          {TABS.map((t) => (
            <View
              key={t.key}
              className={`tab-chip ${tab === t.key ? 'tab-chip--active' : ''}`}
              onClick={() => switchTab(t.key)}
            >
              <Text>{t.label}</Text>
            </View>
          ))}
        </View>

        {tab === 'partner' && (
          <View>
            <View className='section-title'><Text>渠道商（开放分销）</Text></View>
            {partners.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无渠道商'}</Text></View>
            ) : (
              partners.map((p) => (
                <View key={p.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>{p.partner_name}</Text>
                    <View className='badge badge--ok'>
                      <Text>{STATUS[p.status || ''] || p.status}</Text>
                    </View>
                  </View>
                  <Text className='card-item__sub'>
                    {PARTNER_TYPE[p.broker_type || ''] || p.broker_type} · {LEVEL[p.level || ''] || p.level} · 分成 {p.base_rate ?? 0}%
                  </Text>
                  <Text className='card-item__sub'>邀请码：{p.invite_code || '-'}</Text>
                  <View className='action-row'>
                    {p.status === 'pending' && (
                      <Text className='mini-btn mini-btn--primary' onClick={() => toggleApprove(p)}>审批通过</Text>
                    )}
                    {p.status === 'active' && (
                      <Text className='mini-btn mini-btn--warn' onClick={() => toggleApprove(p)}>停用</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'referral' && (
          <View>
            <View className='section-title'><Text>我的转介绍记录</Text></View>
            {referrals.length === 0 ? (
              <View className='empty-tip'><Text>{loading ? '加载中...' : '暂无转介绍记录，可在 App / Web 端发起'}</Text></View>
            ) : (
              referrals.map((r) => (
                <View key={r.id} className='card-item'>
                  <View className='card-item__head'>
                    <Text className='card-item__title'>转介绍</Text>
                    <View className='badge badge--ok'><Text>{r.status || '-'}</Text></View>
                  </View>
                  <Text className='card-item__sub'>来源：{r.referrer_partner_id || r.referrer_user_id || '-'}</Text>
                  <Text className='card-item__sub'>
                    {r.created_at ? String(r.created_at).replace('T', ' ').slice(0, 19) : ''}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  )
}