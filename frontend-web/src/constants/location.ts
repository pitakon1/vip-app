/**
 * 地理坐标常量（Web）。
 *
 * 地图兜底中心、考勤默认办公点等多处都按曼谷市中心取值，统一收在这里，
 * 页面不要再手写经纬度。
 */
export const BANGKOK_CENTER = { lat: 13.7563, lng: 100.5018 } as const
/** 后端 haversine 距离计算使用的地球半径（公里），前后端保持一致。 */
export const EARTH_RADIUS_KM = 6371
