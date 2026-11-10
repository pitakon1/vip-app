/**
 * 公开路由的唯一来源。
 *
 * 这里同时承担两件事：
 * 1. `App.tsx` 渲染匿名可访问的页面（找房、学校库、地图、公共签署页等）；
 * 2. `lib/api.ts` 的 401 拦截器据此判断「是否把访客踢回登录页」。
 *
 * 白名单不再手写，而是由下面的路由表自动推导：新增公开页只需在
 * `PUBLIC_ROUTES` 加一行，不会再出现「页面公开、清单漏配、访客被登出」。
 */
import { lazy, type ReactNode } from 'react'

const Home = lazy(() => import('@/pages/Home'))
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
// /tenant/listings 复用同一份懒加载组件，避免重复声明
export const PublicListings = lazy(() => import('@/pages/PublicListings'))
const ListingDetail = lazy(() => import('@/pages/ListingDetail'))
const Schools = lazy(() => import('@/pages/Schools'))
const SchoolDetail = lazy(() => import('@/pages/SchoolDetail'))
const Communities = lazy(() => import('@/pages/Communities'))
const CommunityDetail = lazy(() => import('@/pages/CommunityDetail'))
// 公共签署页（客户用 H5，匿名可访问）
const Sign = lazy(() => import('@/pages/Sign'))
// C 端贝壳式分类页（租房 / 新房 / 二手房 / 商铺办公 / 厂房 / 酒店 / 土地）
const RentCategory = lazy(() => import('@/pages/category/RentCategory'))
const NewHouse = lazy(() => import('@/pages/category/NewHouse'))
const Resale = lazy(() => import('@/pages/category/Resale'))
const Commercial = lazy(() => import('@/pages/category/Commercial'))
const Factory = lazy(() => import('@/pages/category/Factory'))
const Hotel = lazy(() => import('@/pages/category/Hotel'))
const Land = lazy(() => import('@/pages/category/Land'))
// 地图找房（匿名公开，按视野拉取点位）
const MapFind = lazy(() => import('@/pages/MapFind'))

export interface PublicRoute {
  path: string
  element: ReactNode
}

/** 匿名可访问的路由（顺序即渲染顺序）。 */
export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', element: <Home /> },
  { path: '/listings', element: <PublicListings /> },
  { path: '/listing/:id', element: <ListingDetail /> },
  { path: '/schools', element: <Schools /> },
  { path: '/school/:id', element: <SchoolDetail /> },
  { path: '/communities', element: <Communities /> },
  { path: '/community/:id', element: <CommunityDetail /> },
  { path: '/category/rent', element: <RentCategory /> },
  { path: '/category/new', element: <NewHouse /> },
  { path: '/category/resale', element: <Resale /> },
  { path: '/category/commercial', element: <Commercial /> },
  { path: '/category/factory', element: <Factory /> },
  { path: '/category/hotel', element: <Hotel /> },
  { path: '/category/land', element: <Land /> },
  { path: '/map', element: <MapFind /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/sign/:token', element: <Sign /> },
]

export interface PublicRouteRule {
  path: string
  match: 'exact' | 'prefix'
}

/**
 * 由路由表推导出的匿名白名单。
 *
 * 含动态段（`/:id`、`/:token`）的路径按前缀匹配：`/listing` 命中
 * `/listing/xxx`，但不会误命中 `/listings-other`；静态路径精确匹配。
 */
export const PUBLIC_ROUTE_RULES: PublicRouteRule[] = Array.from(
  new Map(
    PUBLIC_ROUTES.map(({ path }) => {
      const dynamicAt = path.indexOf('/:')
      const rule: PublicRouteRule = dynamicAt >= 0
        ? { path: path.slice(0, dynamicAt), match: 'prefix' }
        : { path, match: 'exact' }
      return [rule.path, rule]
    }),
  ).values(),
)

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
