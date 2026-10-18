import { useEffect } from 'react'
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'

/**
 * 业主首页转发页。
 *
 * C 端「业主 / 租客功能一致」后，首页统一为 `/pages/tenant/home/index`（所有人一致）。
 * 本页保留仅为兼容微信群分享卡片与历史路径：落地后立即转发到统一首页，避免白屏。
 */
export default function OwnerHomePage() {
  useEffect(() => {
    Taro.redirectTo({ url: '/pages/tenant/home/index' })
  }, [])

  return <View />
}
