/**
 * 路由 chunk 预取：导航项 hover / 触摸前预热对应页面代码。
 *
 * 页面组件由 App.tsx 里的 React.lazy 按需加载，首次进入某页要等 chunk 下载，
 * 这段等待发生在 Suspense 边界内，表现为「点进去先转圈」。在 hover 时提前 import
 * 同一个模块，浏览器会复用已加载的 chunk，点击时通常已就绪。
 *
 * 这里有意只登记高频入口：全量预取会把懒加载变成「一次性下载所有页面」，
 * 反而拖慢首屏。
 */
const ROUTE_LOADERS: Array<[string, () => Promise<unknown>]> = [
  // 管理端 / 员工端高频页
  ['/dashboard', () => import('@/pages/Dashboard')],
  ['/properties', () => import('@/pages/Properties')],
  ['/crm', () => import('@/pages/CRM')],
  ['/leases', () => import('@/pages/Leases')],
  ['/payments', () => import('@/pages/Payments')],
  ['/employees', () => import('@/pages/Employees')],
  ['/my-listings', () => import('@/pages/MyListings')],
  ['/chat', () => import('@/pages/Chat')],
  ['/contracts', () => import('@/pages/Contracts')],
  ['/viewings', () => import('@/pages/Viewings')],
  // C 端门户高频页
  ['/tenant/dashboard', () => import('@/pages/Tenant/Dashboard')],
  ['/tenant/my', () => import('@/pages/Tenant/My')],
  ['/tenant/my-properties', () => import('@/pages/Owner/Properties')],
  ['/tenant/income', () => import('@/pages/Owner/Income')],
  ['/tenant/listings', () => import('@/pages/PublicListings')],
  ['/tenant/documents', () => import('@/pages/Tenant/Documents')],
  ['/tenant/payments', () => import('@/pages/Tenant/Payments')],
  ['/tenant/leases', () => import('@/pages/Tenant/Leases')],
  // 公共浏览高频页
  ['/listings', () => import('@/pages/PublicListings')],
  ['/schools', () => import('@/pages/Schools')],
  ['/communities', () => import('@/pages/Communities')],
  ['/', () => import('@/pages/Home')],
]

/** 已触发过的路径，避免重复 import（import 本身有缓存，但省掉无谓调用） */
const fired = new Set<string>()

/** 预取单个路由（精确匹配或前缀匹配，覆盖 /tenant/leases/:id 这类详情页） */
export function prefetchRoute(path: string): void {
  if (!path) return
  const clean = path.split('?')[0].split('#')[0]
  for (const [prefix, loader] of ROUTE_LOADERS) {
    if (clean === prefix || clean.startsWith(prefix + '/') || (prefix === '/properties' && clean.startsWith('/properties/'))) {
      if (fired.has(prefix)) return
      fired.add(prefix)
      void loader()
      return
    }
  }
}

/** 批量预取（用于布局挂载后空闲预热底部 Tab / 顶栏入口） */
export function prefetchRoutes(paths: string[]): void {
  paths.forEach(prefetchRoute)
}
