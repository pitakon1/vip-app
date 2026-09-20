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