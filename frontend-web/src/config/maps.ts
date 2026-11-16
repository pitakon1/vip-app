/**
 * Google Maps 前端集中配置。
 *
 * Key 从 `VITE_GOOGLE_MAPS_WEB_API_KEY` 读取（构建期注入，仅浏览器端可用）。
 * 该 Key 在 Google Cloud 控制台做了 **HTTP 来源（Referer）限制**，不要复用到
 * App / 小程序 / 服务端，也不要把 Android/iOS Key 写进这里。
 *
 * 需要的 8 个接口（与 Vip App 项目已启用的范围一致）：
 * Maps JavaScript / Places / Directions / Geocoding / Maps Static /
 * Places Details / Distance Matrix / Elevation（按实际调用取用）。
 *
 * 未配置或仍是占位值时，[GoogleMap.tsx] 只渲染占位块，不挂载任何 Google 组件，
 * 避免脚本未加载时 `window.google` 不存在导致整页白屏。
 */
const readKey = (value: string | undefined): string => (value || '').trim()

export const GOOGLE_MAPS_API_KEY = readKey(
  import.meta.env.VITE_GOOGLE_MAPS_WEB_API_KEY,
)

/**
 * 是否配置了**可用的** Google Maps Key。
 *
 * 占位 Key 会让脚本拒绝加载，`window.google` 永远不存在。此时任何
 * `<Autocomplete>` / `<GoogleMap>` 一旦 mount 就会抛 `google is not defined`，
 * 未捕获的话 React 会卸载整棵树——整页白屏。
 *
 * 所以调用方必须先用这个标记决定「要不要挂载地图」，而不是无脑渲染。
 */
export const isGoogleMapsConfigured = (): boolean => {
  const key = GOOGLE_MAPS_API_KEY
  if (!key) return false
  return !/placeholder|changeme|your[_-]?key|xxx/i.test(key)
}
