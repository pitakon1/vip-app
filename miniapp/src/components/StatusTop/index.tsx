/**
 * 自定义导航页（Tab 列表页）的状态栏占位。
 *
 * Tab 级页面在 App 中没有原生标题栏，页面自己的大标题就是唯一标题；
 * 小程序里把这些页面改成 `navigationStyle: 'custom'` 后，需要手动让出状态栏高度，
 * 否则内容会顶到刘海/状态栏下面。
 *
 * 只占高度、不画栏：背景沿用页面自身背景，保持 App 的「内容与背景同一张画布」。
 * 另外铺一层同色固定底，避免页面滚动时正文从状态栏图标下透出来。
 */
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'

interface Props {
  /** 与页面顶部背景一致的色值；缺省用全局页面背景 */
  background?: string
}

export default function StatusTop({ background = 'var(--bg)' }: Props) {
  let height = 20
  try {
    height = Taro.getSystemInfoSync().statusBarHeight || 20
  } catch {
    // 取不到系统信息时用 20px 兜底（大多数安卓机）
  }
  return (
    <View>
      <View
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: `${height}px`,
          background,
          zIndex: 20
        }}
      />
      <View style={{ height: `${height}px` }} />
    </View>
  )
}
