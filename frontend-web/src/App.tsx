import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import PortalLayout from '@/layouts/PortalLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import useAuthStore from '@/stores/auth'
import NotFound from '@/pages/NotFound'

// 路由级代码分割：每个页面独立 chunk，按需加载。
// 布局与鉴权壳保持首屏即时（任何页面都要用），页面组件全部懒加载。
// 注意：antd/图表等大依赖由 vite manualChunks 拆成独立 vendor chunk，
// 首屏只加载当前页用到的 chunk。
const Home = lazy(() => import('@/pages/Home'))
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
const PublicListings = lazy(() => import('@/pages/PublicListings'))
const ListingDetail = lazy(() => import('@/pages/ListingDetail'))
const Schools = lazy(() => import('@/pages/Schools'))
const SchoolDetail = lazy(() => import('@/pages/SchoolDetail'))
const Communities = lazy(() => import('@/pages/Communities'))
const CommunityDetail = lazy(() => import('@/pages/CommunityDetail'))

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

// 房源上架 / 我的上架单 / 经纪人在线签约
const PublishListing = lazy(() => import('@/pages/PublishListing'))
const MyListings = lazy(() => import('@/pages/MyListings'))
const BrokerAgreements = lazy(() => import('@/pages/BrokerAgreements'))
// 运营管理：平台上架审核 / 去重审核队列
const ListingReview = lazy(() => import('@/pages/ListingReview'))
const DedupeReview = lazy(() => import('@/pages/DedupeReview'))

// 业主端页面
const OwnerDashboard = lazy(() => import('@/pages/Owner/Dashboard'))
const OwnerMy = lazy(() => import('@/pages/Owner/My'))
const OwnerProperties = lazy(() => import('@/pages/Owner/Properties'))
const OwnerDocuments = lazy(() => import('@/pages/Owner/Documents'))
const OwnerIncome = lazy(() => import('@/pages/Owner/Income'))
const OwnerServices = lazy(() => import('@/pages/Owner/Services'))
const OwnerPayments = lazy(() => import('@/pages/Owner/Payments'))
const OwnerMarketing = lazy(() => import('@/pages/Owner/Marketing'))

// 租客端页面
const TenantDashboard = lazy(() => import('@/pages/Tenant/Dashboard'))
const TenantMy = lazy(() => import('@/pages/Tenant/My'))
const TenantPropertyDetail = lazy(() => import('@/pages/Tenant/PropertyDetail'))
const TenantPayments = lazy(() => import('@/pages/Tenant/Payments'))
const TenantDocuments = lazy(() => import('@/pages/Tenant/Documents'))
const TenantServices = lazy(() => import('@/pages/Tenant/Services'))
const TenantMaintenance = lazy(() => import('@/pages/Tenant/Maintenance'))
const TenantLeases = lazy(() => import('@/pages/Tenant/Leases'))
const TenantLeaseDetail = lazy(() => import('@/pages/Tenant/LeaseDetail'))
const TenantDeals = lazy(() => import('@/pages/Tenant/Deals'))
const TenantDealDetail = lazy(() => import('@/pages/Tenant/DealDetail'))

// 员工端页面
const EmployeeDashboard = lazy(() => import('@/pages/Employee/Dashboard'))
const EmployeeAttendance = lazy(() => import('@/pages/Employee/Attendance'))
const EmployeePerformance = lazy(() => import('@/pages/Employee/Performance'))
const EmployeeContacts = lazy(() => import('@/pages/Employee/Contacts'))

// 系统管理（账号权限体系）
const SystemUsers = lazy(() => import('@/pages/System/Users'))
const SystemGroups = lazy(() => import('@/pages/System/Groups'))
const SystemPermissions = lazy(() => import('@/pages/System/Permissions'))
const SystemReview = lazy(() => import('@/pages/System/ReviewCenter'))
const Operations = lazy(() => import('@/pages/Operations'))

const Company = lazy(() => import('@/pages/Company'))

// v1.8 增强页面
const Chat = lazy(() => import('@/pages/Chat'))
const Contracts = lazy(() => import('@/pages/Contracts'))

// 根据角色重定向到对应首页
const RoleRedirect = () => {
  const user = useAuthStore((s) => s.user)
  switch (user?.role) {
    case 'owner':
      return <Navigate to="/owner/dashboard" replace />
    case 'tenant':
      return <Navigate to="/tenant/dashboard" replace />
    case 'employee':
    case 'agent':
      return <Navigate to="/employee/dashboard" replace />
    default:
      return <Navigate to="/dashboard" replace />
  }
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
        borderTopColor: '#14b8a6',
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
              需要「身份」的动作上才要求登录。内容资产必须先能被匿名看到。 */}
          <Route path="/" element={<Home />} />
          <Route path="/listings" element={<PublicListings />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          <Route path="/schools" element={<Schools />} />
          <Route path="/school/:id" element={<SchoolDetail />} />
          <Route path="/communities" element={<Communities />} />
          <Route path="/community/:id" element={<CommunityDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

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
            <Route path="/dashboard" element={<ProtectedRoute denyRoles={['tenant']}><Dashboard /></ProtectedRoute>} />
            {/* 房源库/详情属 B 端，租客走门户壳（/tenant/listings、/tenant/properties/:id） */}
            <Route path="/properties" element={<ProtectedRoute denyRoles={['tenant']}><Properties /></ProtectedRoute>} />
            <Route path="/properties/detail/:id" element={<ProtectedRoute denyRoles={['tenant']}><PropertyDetail /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute denyRoles={['tenant']}><CRM /></ProtectedRoute>} />
            <Route path="/leases" element={<ProtectedRoute denyRoles={['tenant']}><Leases /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute denyRoles={['tenant']}><Payments /></ProtectedRoute>} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/contracts" element={<ProtectedRoute denyRoles={['tenant']}><Contracts /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute denyRoles={['tenant']}><Employees /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute denyRoles={['tenant']}><Settings /></ProtectedRoute>} />
            <Route path="/viewings" element={<ProtectedRoute denyRoles={['tenant']}><Viewings /></ProtectedRoute>} />
            <Route path="/trend" element={<ProtectedRoute denyRoles={['tenant']}><Trend /></ProtectedRoute>} />
            <Route path="/commission-rules" element={<ProtectedRoute denyRoles={['tenant']}><CommissionRules /></ProtectedRoute>} />
            <Route path="/audit-logs" element={<ProtectedRoute denyRoles={['tenant']}><AuditLogs /></ProtectedRoute>} />
            <Route path="/sale-deals" element={<ProtectedRoute denyRoles={['tenant']}><SaleDeals /></ProtectedRoute>} />
            <Route path="/distribution" element={<ProtectedRoute denyRoles={['tenant']}><Distribution /></ProtectedRoute>} />
            <Route path="/markets" element={<ProtectedRoute denyRoles={['tenant']}><Markets /></ProtectedRoute>} />
            <Route path="/market-intelligence" element={<ProtectedRoute denyRoles={['tenant']}><MarketIntelligence /></ProtectedRoute>} />
            <Route path="/company" element={<ProtectedRoute denyRoles={['tenant']}><Company /></ProtectedRoute>} />

            {/* 业主端路由：仅业主/管理员 */}
            <Route path="/owner/dashboard" element={<ProtectedRoute denyRoles={['tenant','employee','agent']}><OwnerDashboard /></ProtectedRoute>} />
            <Route path="/owner/properties" element={<ProtectedRoute denyRoles={['tenant','employee','agent']}><OwnerProperties /></ProtectedRoute>} />
            <Route path="/owner/income" element={<ProtectedRoute denyRoles={['tenant','employee','agent']}><OwnerIncome /></ProtectedRoute>} />
            <Route path="/owner/documents" element={<ProtectedRoute denyRoles={['tenant','employee','agent']}><OwnerDocuments /></ProtectedRoute>} />
            <Route path="/owner/services" element={<ProtectedRoute denyRoles={['tenant','employee','agent']}><OwnerServices /></ProtectedRoute>} />
            <Route path="/owner/payments" element={<ProtectedRoute denyRoles={['tenant','employee','agent']}><OwnerPayments /></ProtectedRoute>} />
            <Route path="/owner/marketing" element={<ProtectedRoute denyRoles={['tenant','employee','agent']}><OwnerMarketing /></ProtectedRoute>} />
            <Route path="/owner/my" element={<ProtectedRoute denyRoles={['tenant','employee','agent']}><OwnerMy /></ProtectedRoute>} />

            {/* 员工端路由：仅员工/管理员 */}
            <Route path="/employee/dashboard" element={<ProtectedRoute denyRoles={['tenant','owner','agent']}><EmployeeDashboard /></ProtectedRoute>} />
            <Route path="/employee/attendance" element={<ProtectedRoute denyRoles={['tenant','owner','agent']}><EmployeeAttendance /></ProtectedRoute>} />
            <Route path="/employee/performance" element={<ProtectedRoute denyRoles={['tenant','owner','agent']}><EmployeePerformance /></ProtectedRoute>} />
            <Route path="/employee/contacts" element={<ProtectedRoute denyRoles={['tenant','owner','agent']}><EmployeeContacts /></ProtectedRoute>} />

            {/* 系统管理：仅管理员（工单审核/账号管理需 admin 角色） */}
            <Route path="/system/users" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent']}><SystemUsers /></ProtectedRoute>} />
            <Route path="/system/groups" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent']}><SystemGroups /></ProtectedRoute>} />
            <Route path="/system/permissions" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent']}><SystemPermissions /></ProtectedRoute>} />
            <Route path="/system/review-center" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent']}><SystemReview /></ProtectedRoute>} />
            <Route path="/operations" element={<ProtectedRoute denyRoles={['tenant','owner','employee','agent']}><Operations /></ProtectedRoute>} />

            {/* 房源上架 / 我的上架单 / 经纪人在线签约（经纪人/业主/员工） */}
            <Route path="/publish-listing" element={<ProtectedRoute denyRoles={['tenant']}><PublishListing /></ProtectedRoute>} />
            <Route path="/my-listings" element={<ProtectedRoute denyRoles={['tenant']}><MyListings /></ProtectedRoute>} />
            <Route path="/broker-agreements" element={<ProtectedRoute denyRoles={['tenant','owner']}><BrokerAgreements /></ProtectedRoute>} />

            {/* 运营管理：平台上架审核 / 去重审核（仅 staff：admin/employee/agent） */}
            <Route path="/operations/listing-review" element={<ProtectedRoute denyRoles={['tenant','owner']}><ListingReview /></ProtectedRoute>} />
            <Route path="/operations/dedupe-review" element={<ProtectedRoute denyRoles={['tenant','owner']}><DedupeReview /></ProtectedRoute>} />
          </Route>

          {/* ===== 租客端（C端 · 顶栏门户 PortalLayout，无侧边栏）===== */}
          <Route
            element={
              <ProtectedRoute>
                <PortalLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/tenant/dashboard" element={<TenantDashboard />} />
            <Route path="/tenant/my" element={<TenantMy />} />
            <Route path="/tenant/properties/:id" element={<TenantPropertyDetail />} />
            <Route path="/tenant/listings" element={<PublicListings compact />} />
            <Route path="/tenant/payments" element={<TenantPayments />} />
            <Route path="/tenant/documents" element={<TenantDocuments />} />
            <Route path="/tenant/services" element={<TenantServices />} />
            <Route path="/tenant/maintenance" element={<TenantMaintenance />} />
            <Route path="/tenant/leases" element={<TenantLeases />} />
            <Route path="/tenant/leases/:id" element={<TenantLeaseDetail />} />
            <Route path="/tenant/deals" element={<TenantDeals />} />
            <Route path="/tenant/deals/:id" element={<TenantDealDetail />} />
          </Route>

          {/* ===== 404 兜底（未匹配路径）===== */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
