/**
 * 浏览历史 —— C 端「我的 - 常用功能 - 浏览历史」。
 *
 * 历史只存本机（utils/browseHistory），不上报服务器；与 App 端同口径（最新在前、上限 50 条）。
 * 在公开房源详情页停留时写入，点行回到该房源的公开详情。
 */
import { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getHistory, clearHistory, type BrowseHistoryItem } from '@/utils/browseHistory'
import { photoUrl } from '@/lib/publicSite'
import { fmtMoney as money } from '@/utils/format'
import './index.scss'

export default function BrowseHistoryPage() {
  const [items, setItems] = useState<BrowseHistoryItem[]>([])

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title: '浏览历史' })
    setItems(getHistory())
  })

  const clearAll = () => {
    Taro.showModal({
      title: '清空浏览历史',
      content: '清空后本机不再保留浏览记录，确定继续吗？',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return
        clearHistory()
        setItems([])
      }
    })
  }

  return (
    <View className='history-page'>
      <View className='page-container'>
        {items.length > 0 && (
          <View className='history-bar' onClick={clearAll}>
            <Text className='history-bar__text'>清空历史</Text>
          </View>
        )}
        {items.length === 0 && (
          <View className='empty-tip'>
            <Text>还没有浏览记录，看过的房源会出现在这里</Text>
          </View>
        )}
        {items.map((it, idx) => {
          const cover = photoUrl(it.cover) || ''
          const title = it.title || `房源 #${String(it.id ?? '').slice(0, 8)}`
          return (
            <View
              key={it.id ?? idx}
              className='history-card'
              onClick={() => Taro.navigateTo({ url: `/pages/public/listing-detail/index?id=${it.id}` })}
            >
              {cover ? (
                <Image className='history-card__cover' src={cover} mode='aspectFill' />
              ) : (
                <View className='history-card__cover history-card__cover--empty'>
                  <Text>暂无图片</Text>
                </View>
              )}
              <View className='history-card__body'>
                <Text className='history-card__title'>{title}</Text>
                {it.address ? <Text className='history-card__sub'>{it.address}</Text> : null}
                {it.price ? (
                  <Text className='history-card__price'>
                    {money(it.price, it.currency)}
                    <Text className='history-card__unit'> /月</Text>
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}