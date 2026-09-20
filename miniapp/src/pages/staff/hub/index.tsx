import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { brokerApi } from '@/services/api'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

interface Entry {
  key: string
  title: string
  desc: string
  icon: string
  url: string
}

const ENTRIES: Entry[] = [
  { key: 'publish', title: '发布房源', desc: '完整信息 + 分佣配置', icon: '＋', url: '/pages/staff/listing-edit/index' },
  { key: 'mine', title: '我的上架单', desc: '状态 / 分成 / 去重 / 关闭', icon: '≡', url: '/pages/staff/listings/index' },
  { key: 'agreement', title: '经纪人协议', desc: '在线生成并签署', icon: '签', url: '/pages/staff/agreements/index' },
  { key: 'dedupe', title: '去重审核', desc: '疑似重复 · 合并/驳回', icon: '重', url: '/pages/staff/dedupe-review/index' },
  { key: 'review', title: '上架审核', desc: '通过 / 驳回', icon: '审', url: '/pages/staff/listing-review/index' }
]

export default function StaffHubPage() {
  const user = useAuthStore((s) => s.user)
  const [listingActive, setListingActive] = useState<boolean | null>(null)

  useDidShow(() => {
    brokerApi
      .me()
      .then((res: any) => {
        const b = unwrap(res)
        setListingActive(!!b.id ? !!b.listing_active : true)
      })
      .catch(() => setListingActive(true))
  })

  return (
    <View className='hub-page'>
      <View className='hub-hero'>
        <Text className='hub-hero__hi'>上架工作台</Text>
        <Text className='hub-hero__meta'>
          {user?.name || '同事'}
          {listingActive === false ? ' · 尚未签署上架协议' : ''}
        </Text>
      </View>

      {listingActive === false && (
        <View className='hub-gate' onClick={() => Taro.navigateTo({ url: '/pages/staff/agreements/index' })}>
          <Text className='hub-gate__text'>尚未签署《房源经纪人上架房源协议》→ 去签约</Text>
        </View>
      )}

      <View className='hub-grid'>
        {ENTRIES.map((en) => (
          <View key={en.key} className='hub-card' onClick={() => Taro.navigateTo({ url: en.url })}>
            <View className='hub-card__icon'><Text className='hub-card__icon-text'>{en.icon}</Text></View>
            <Text className='hub-card__title'>{en.title}</Text>
            <Text className='hub-card__desc'>{en.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}