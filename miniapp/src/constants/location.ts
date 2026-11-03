/**
 * 地理坐标常量（小程序）。
 *
 * 地图兜底中心、考勤默认办公点等多处都按曼谷市中心取值，统一收在这里，
 * 页面不要再手写经纬度。
 */
export const BANGKOK_CENTER: { lat: number; lng: number } = { lat: 13.7563, lng: 100.5018 }

/** 地球平均半径（km），Haversine 球面距离计算用。 */
export const EARTH_RADIUS_KM = 6371
