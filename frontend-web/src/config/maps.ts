/**
 * Google Maps 前端集中配置。
 *
 * ⚠️ 当前为占位 Key，无法真正渲染地图/搜索/路线（浏览器会报 INVALID_REQUEST
 * 或 RefererNotAllowedMapError 等 key 相关警告），属预期行为。
 * 上线前请将该 Key 替换为项目真实的、且已为当前域名申请 API Key 的
 * Google Maps JavaScript API Key（需开启 Maps JavaScript API、Places API、
 * Directions API、Geocoding API），并配置好 Referrer 白名单。
 */
export const GOOGLE_MAPS_API_KEY =
  'AIzaSyPlaceholderGoogleMapsKey_ChangeMe'

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
  const key = (GOOGLE_MAPS_API_KEY || '').trim()
  if (!key) return false
  return !/placeholder|changeme|your[_-]?key|xxx/i.test(key)
}
