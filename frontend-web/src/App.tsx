import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import PortalLayout from '@/layouts/PortalLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import useAuthStore from '@/stores/auth'
import NotFound from '@/pages/NotFound'

// 路由级代码分割：每个页面独立 chunk，按需加载。
// 布局与鉴权壳保持首屏即时（任何页面都要用），页面组件全部懒加载。
// 注意：antd/图表等大依赖由 vite manualChunks 拆成独立 vendor chunk，
// 首屏只加载当前页用到的 chunk。
// 匿名可访问的页面及其路由表统一在 routes/publicRoutes.tsx 声明（白名单也从那里推导）。
import { PUBLIC_ROUTES, PublicListings } from '@/routes/publicRoutes'

// 管理端页面
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Properties = lazy(() => import('@/pages/Properties'))
const PropertyDetail = lazy(() => import('@/pages/PropertyDetail'))
const CRM = lazy(() => import('@/pages/CRM'))
const Leases = lazy(() => import('@/pages/Leases'))
const Payments = lazy(() => import('@/pages/Payments'))
const Employees = lazy(() => import('@/pages/Employees'))
const Settings = lazy(() => import('@/pages/Settings'))
const AuditLogs = lazy(() => import('@/pages/AuditLogs'))
const Viewings = lazy(() => import('@/pages/Viewings'))
const Trend = lazy(() => import('@/pages/Trend'))
const CommissionRules = lazy(() => import('@/pages/CommissionRules'))
const SaleDeals = lazy(() => import('@/pages/SaleDeals'))
const Distribution = lazy(() => import('@/pages/Distribution'))
const Markets = lazy(() => import('@/pages/Markets'))
const MarketIntelligence = lazy(() => import('@/pages/MarketIntelligence'))

// 我的上架单 / 经纪人在线签约
const MyListings = lazy(() => import('@/pages/MyListings'))
const BrokerAgreements = lazy(() => import('@/pages/BrokerAgreements'))
// 运营管理：平台上架审核 / 去重审核队列 / 房产绑定审核
const ListingReview = lazy(() => import('@/pages/ListingReview'))
const DedupeReview = lazy(() => import('@/pages/DedupeReview'))
const PropertyBindingReview = lazy(() => import('@/pages/PropertyBindingReview'))

// 业主端专属页面（无租客对应）：仅换注册路径，统一挂在 /tenant/* 门户下
const OwnerProperties = lazy(() => import('@/pages/Owner/Properties'))
const OwnerIncome = lazy(() => import('@/pages/Owner/Income'))
const OwnerMarketing = lazy(() => import('@/pages/Owner/Marketing'))

// C 端页面（业主 + 租客共用同一实现，数据差异按角色自然呈现）
const TenantDashboard = lazy(() => import('@/pages/Tenant/Dashboard'))
const TenantMy = lazy(() => import('@/pages/Tenant/My'))
const TenantHelp = lazy(() => import('@/pages/Tenant/Help'))
const TenantPropertyDetail = lazy(() => import('@/pages/Tenant/PropertyDetail'))
const TenantPayments = lazy(() => import('@/pages/Tenant/Payments'))
const TenantDocuments = lazy(() => import('@/pages/Tenant/Documents'))
const TenantServices = lazy(() => import('@/pages/Tenant/Services'))
const TenantMaintenance = lazy(() => import('@/pages/Tenant/Maintenance'))
const TenantLeases = lazy(() => import('@/pages/Tenant/Leases'))
const TenantLeaseDetail = lazy(() => import('@/pages/Tenant/LeaseDetail'))
const TenantDeals = lazy(() => import('@/pages/Tenant/Deals'))
const TenantFavorites = lazy(() => import('@/pages/Tenant/Favorites'))
const TenantDealDetail = lazy(() => import('@/pages/Tenant/DealDetail'))
const TenantContracts = lazy(() => import('@/pages/Tenant/Contracts'))
const TenantPropertyBinding = lazy(() => import('@/pages/Tenant/PropertyBinding'))

// 员工端页面
const EmployeeDashboard = lazy(() => import('@/pages/Employee/Dashboard'))
const EmployeeAttendance = lazy(() => import('@/pages/Employee/Attendance'))
const EmployeePerformance = lazy(() => import('@/pages/Employee/Performance'))
const EmployeeContacts = lazy(() => import('@/pages/Employee/Contacts'))

// 管理端考勤管理（P0 考勤核对 + P1 考勤组/假勤审批/异常报表）
const AttendanceManage = lazy(() => import('@/pages/AttendanceManage'))

// 系统管理（账号权限体系）
const SystemUsers = lazy(() => import('@/pages/System/Users'))
const SystemPartners = lazy(() => import('@/pages/System/Partners'))
const SystemGroups = lazy(() => import('@/pages/System/Groups'))
const SystemPermissions = lazy(() => import('@/pages/System/Permissions'))
const SystemDepartments = lazy(() => import('@/pages/System/Departments'))
const SystemDataScopes = lazy(() => import('@/pages/System/DataScopes'))
const SystemOptions = lazy(() => import('@/pages/System/Options'))
const SystemReview = lazy(() => import('@/pages/System/ReviewCenter'))
const Operations = lazy(() => import('@/pages/Operations'))

// 合作公司（partner_admin）页面：本公司成员视图
const PartnerMembers = lazy(() => import('@/pages/Partner/Members'))

const Company = lazy(() => import('@/pages/Company'))

// v1.8 增强页面
const Chat = lazy(() => import('@/pages/Chat'))
const Contracts = lazy(() => import('@/pages/Contracts'))
// 合同验签页（员工查看验签报告；公开 token 亦可在登录态下核验）
const Verify = lazy(() => import('@/pages/Verify'))

// 根据角色重定向到对应首页
// 业主与租客统一到同一个 C 端门户首页 /tenant/dashboard
const RoleRedirect = () => {
  const user = useAuthStore((s) => s.user)
  switch (user?.role) {
    case 'owner':
    case 'tenant':
      return <Navigate to="/tenant/dashboard" replace />
    case 'employee':
    case 'agent':
      return <Navigate to="/employee/dashboard" replace />
    case 'partner_admin':
      return <Navigate to="/partner/members" replace />
    default:
      return <Navigate to="/dashboard" replace />
  }
}

// 业主端旧路径 → C 端门户路径（显式改写表 + 前缀兜底），保证老链/收藏不 404
const OWNER_ALIAS: Record<string, string> = {
  '/owner/dashboard': '/tenant/dashboard',
  '/owner/properties': '/tenant/my-properties',
  '/owner/income': '/tenant/income',
  '/owner/documents': '/tenant/documents',
  '/owner/services': '/tenant/services',
  '/owner/payments': '/tenant/payments',
  '/owner/marketing': '/tenant/marketing',
  '/owner/my': '/tenant/my',
  '/owner/contracts': '/tenant/contracts',
}

const OwnerAliasRedirect = () => {
  const location = useLocation()
  const target =
    OWNER_ALIAS[location.pathname] ?? location.pathname.replace(/^\/owner\//, '/tenant/')
  return <Navigate to={target + location.search} replace />
}

// 懒加载 chunk 下载期间的统一占位（品牌色转圈，避免白屏跳动）
const PageFallback = () => (
  <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        border: '3px solid rgba(20,184,166,0.2)',
        borderTopColor: 'var(--rent-primary)',
        animation: 'vipp-spin 0.8s linear infinite',
      }}
    />
    <style>{'@keyframes vipp-spin { to { transform: rotate(360deg); } }'}</style>
  </div>
)

const App = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* ===== 公共路由（无需登录，浏览全开放）=====
              产品原则：浏览不需要注册，只在收藏 / 发布 / 进入作业系统这类
              需要「身份」的动作上才要求登录。内容资产必须先能被匿名看到。
              路由与 401 白名单共用 routes/publicRoutes.tsx 的同一份表。 */}
          {PUBLIC_ROUTES.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}

          {/* 业主端旧路径别名：/owner/* → /tenant/*（统一 C 端门户后，老链接/收藏不 404） */}
          <Route path="/owner/*" element={<OwnerAliasRedirect />} />

          {/* ===== 管理端 + 员工端（B端 · 侧边栏后台）===== */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/portal" element={<RoleRedirect />} />

            {/* 管理端路由：MainLayout 属 B 端后台，租客(C端)一律拦回 /portal */}
            {/* 数据总览隶属管理层：业主/员工不该进入（员工走 /employee/dashboard 工作台） */}
            <Route path="/dashboard" element={<ProtectedRoute denyRoles={['tenant', 'owner', 'employee']}><Dashboard /></ProtectedRoute>} />
            {/* 房源库/详情属 B 端，租客走门户壳（/tenant/listings、/tenant/properties/:id） */}
            <Route path="/properties" element={<ProtectedRoute denyRoles={['tenant']}><Properties /></ProtectedRoute>} />
            <Route path="/properties/detail/:id" element={<ProtectedRoute denyRoles={['tenant']}><PropertyDetail /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute denyRoles={['tenant', 'owner']}><CRM /></ProtectedRoute>} />
            <Route path="/leases" element={<ProtectedRoute denyRoles={['tenant']}><Leases /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute denyRoles={['tenant']}><Payments /></ProtectedRoute>} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/contracts" element={<ProtectedRoute denyRoles={['tenant']}><Contracts /></ProtectedRoute>} />
            <Route path="/verify" element={<ProtectedRoute denyRoles={['tenant']}><Verify /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute denyRoles={['tenant', 'owner', 'employee', 'agent', 'partner_admin']}><Employees /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute denyRoles={['tenant', 'owner', 'employee', 'agent', 'partner_admin']}><Settings /></ProtectedRoute>} />
            <Route path="/viewings" element={<ProtectedRoute denyRoles={['tenant', 'owner']}><Viewings /></ProtectedRoute>} />
            <Route path="/trend" element={<ProtectedRoute denyRoles={['tenant', 'owner', 'employee', 'agent', 'partner_admin']}><Trend /></ProtectedRoute>} />
            <Route path="/commission-rules" element={<ProtectedRoute denyRoles={['tenant', 'owner', 'employee', 'agent', 'partner_admin']}><CommissionRules /></ProtectedRoute>} />
            <Route path="/audit-logs" element={<ProtectedRoute denyRoles={['tenant', 'owner', 'employee', 'agent', 'partner_admin']}><AuditLogs /></ProtectedRoute>} />
            <Route path="/sale-deals" element={<ProtectedRoute denyRoles={['tenant']}><SaleDeals /></ProtectedRoute>} />
            <Route path="/distribution" element={<ProtectedRoute denyRoles={['tenant', 'owner']}><Distribution /></ProtectedRoute>} />
            <Route path="/markets" element={<ProtectedRoute denyRoles={['tenant']}><Markets /></ProtectedRoute>} />
            <Route path="/market-intelligence" element={<ProtectedRoute denyRoles={['tenant']}><MarketIntelligence /></ProtectedRoute>} />
            <Route path="/company" element={<ProtectedRoute denyRoles={['tenant']}><Company /></ProtectedRoute>} />

            {/* 员工端路由：仅员工/管理员 */}
            <Route path="/employee/dashboard" element={<ProtectedRoute denyRoles={['tenant','owner']}><EmployeeDashboard /></ProtectedRoute>} />
            <Route path="/employee/attendance" element={<ProtectedRoute denyRoles={['tenant','owner']}><EmployeeAttendance /></ProtectedRoute>} />
            <Route path="/employee/performance" element={<ProtectedRoute denyRoles={['tenant','owner']}><EmployeePerformance /></ProtectedRoute>} />
            <Route path="/employee/contacts" element={<ProtectedRoute denyRoles={['tenant','owner']}><EmployeeContacts /></ProtectedRoute>} />

            {/* 系统管理：仅管理员（工单审核/账号管理需 admin 角色） */}
            <Route path="/system/users" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><SystemUsers /></ProtectedRoute>} />
            <Route path="/system/partners" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><SystemPartners /></ProtectedRoute>} />
            <Route path="/system/groups" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><SystemGroups /></ProtectedRoute>} />
            <Route path="/system/permissions" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><SystemPermissions /></ProtectedRoute>} />
            {/* 组织架构 / 数据范围 / 数据字典（权限点 department:manage、data:scope:manage、option:manage） */}
            <Route path="/system/departments" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><SystemDepartments /></ProtectedRoute>} />
            <Route path="/system/data-scopes" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><SystemDataScopes /></ProtectedRoute>} />
            <Route path="/system/options" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><SystemOptions /></ProtectedRoute>} />
            <Route path="/system/review-center" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><SystemReview /></ProtectedRoute>} />
            <Route path="/operations" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','partner_admin']}><Operations /></ProtectedRoute>} />
            {/* 考勤管理：管理员看全量；合作公司管理员看本公司（后端按 partner 作用域强制收敛） */}
            <Route path="/attendance-manage" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent']}><AttendanceManage /></ProtectedRoute>} />

            {/* 合作公司成员管理：仅 partner_admin（本公司成员/绩效/房源，不走平台全量接口） */}
            <Route path="/partner/members" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','admin']}><PartnerMembers /></ProtectedRoute>} />
            {/* 合作公司考勤：仅 partner_admin（本公司考勤汇总，复用考勤管理页的公司作用域模式） */}
            <Route path="/partner/attendance" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent','admin']}><AttendanceManage /></ProtectedRoute>} />

            {/* 我的上架单 / 经纪人在线签约（staff/agent 作业流；C 端走 /tenant/*） */}
            <Route path="/my-listings" element={<ProtectedRoute denyRoles={['tenant','owner']}><MyListings /></ProtectedRoute>} />
            <Route path="/broker-agreements" element={<ProtectedRoute denyRoles={['tenant','owner']}><BrokerAgreements /></ProtectedRoute>} />

            {/* 运营管理：平台上架审核 / 去重审核 / 房产绑定审核（仅 staff：admin/employee/agent） */}
            <Route path="/operations/listing-review" element={<ProtectedRoute denyRoles={['tenant','owner']}><ListingReview /></ProtectedRoute>} />
            <Route path="/operations/dedupe-review" element={<ProtectedRoute denyRoles={['tenant','owner']}><DedupeReview /></ProtectedRoute>} />
            <Route path="/operations/property-binding-review" element={<ProtectedRoute denyRoles={['tenant','owner']}><PropertyBindingReview /></ProtectedRoute>} />
          </Route>

          {/* ===== C 端（业主 + 租客）门户 PortalLayout，无侧边栏 ===== */}
          <Route
            element={
              <ProtectedRoute>
                <PortalLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/tenant/dashboard" element={<TenantDashboard />} />
            <Route path="/tenant/my" element={<TenantMy />} />
            <Route path="/tenant/help" element={<TenantHelp />} />
            <Route path="/tenant/properties/:id" element={<TenantPropertyDetail />} />
            <Route path="/tenant/listings" element={<PublicListings compact />} />
            {/* 我的收藏：与 App / 小程序的收藏页对齐，避免 Web 只能收藏、无处查看 */}
            <Route path="/tenant/favorites" element={<TenantFavorites />} />
            <Route path="/tenant/payments" element={<TenantPayments />} />
            <Route path="/tenant/documents" element={<TenantDocuments />} />
            <Route path="/tenant/services" element={<TenantServices />} />
            <Route path="/tenant/maintenance" element={<TenantMaintenance />} />
            <Route path="/tenant/leases" element={<TenantLeases />} />
            <Route path="/tenant/leases/:id" element={<TenantLeaseDetail />} />
            <Route path="/tenant/deals" element={<TenantDeals />} />
            <Route path="/tenant/deals/:id" element={<TenantDealDetail />} />
            <Route path="/tenant/contracts" element={<TenantContracts />} />
            {/* 签署方（租客/业主）也可对本人参与的合同验签 */}
            <Route path="/tenant/contracts/verify" element={<Verify />} />
            {/* 业主功能页：C 端所有入口对全部登录用户可见（产品模型：只有一种 C 端用户）；
                没有绑定房产时页面给空态 + 引导，写操作仍由后端按资源权限判权。 */}
            <Route path="/tenant/my-properties" element={<OwnerProperties />} />
            <Route path="/tenant/income" element={<OwnerIncome />} />
            <Route path="/tenant/marketing" element={<OwnerMarketing />} />
            <Route path="/tenant/my-listings" element={<MyListings />} />
            {/* 添加我的房产：自助提交绑定申请，后台审核通过后才建立用户与房源关联 */}
            <Route path="/tenant/property-binding" element={<TenantPropertyBinding />} />
          </Route>

          {/* ===== 404 兜底（未匹配路径）===== */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
