/**
 * 匿名可访问的 Web 路由清单（唯一来源）。
 *
 * 401 拦截器据此判断「是否把访客踢回登录页」。此前这份清单手写在 `lib/api.ts`，
 * 新增公开路由（如分类页 / 地图找房 / 公共签署页）时极易漏配，且漏配只在
 * 未登录态复现，最难被登录态测试发现。
 *
 * 约定：新增公开页面时**只改这里**。`match` 为 `prefix` 时按路径段匹配
 * （`/listing` 命中 `/listing/:id`，但不会误命中 `/listings-other`）。
 */
export interface PublicRouteRule {
  path: string
  match: 'exact' | 'prefix'
}

export const PUBLIC_ROUTE_RULES: PublicRouteRule[] = [
  { path: '/', match: 'exact' },
  { path: '/login', match: 'exact' },
  { path: '/register', match: 'exact' },
  // 找房列表 / 房源详情
  { path: '/listings', match: 'prefix' },
  { path: '/listing', match: 'prefix' },
  // 学校库 / 小区库
  { path: '/schools', match: 'prefix' },
  { path: '/school', match: 'prefix' },
  { path: '/communities', match: 'prefix' },
  { path: '/community', match: 'prefix' },
  // C 端贝壳式分类页（/category/*）
  { path: '/category', match: 'prefix' },
  // 地图找房（匿名可浏览，点位接口 /public/map-points 免登录）
  { path: '/map', match: 'prefix' },
  // 公共签署页（客户持 /sign/:token 匿名访问，token 即访客身份）
  { path: '/sign', match: 'prefix' },
]

const stripTrailingSlash = (path: string) =>
  path.length > 1 && path.endsWith('/') ? path.replace(/\/+$/, '') : path

/** 当前浏览器路径是否允许匿名访问（不触发 401 全局登出）。 */
export function isPublicPath(pathname: string): boolean {
  const current = stripTrailingSlash(pathname || '/')
  return PUBLIC_ROUTE_RULES.some(({ path, match }) => {
    const target = stripTrailingSlash(path)
    if (target === '/') return current === '/'
    return match === 'exact'
      ? current === target
      : current === target || current.startsWith(`${target}/`)
  })
}
