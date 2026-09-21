import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import PortalLayout from '@/layouts/PortalLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'

// 公共页面
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import PublicListings from '@/pages/PublicListings'
// C 端公开页面（免登录可浏览）：房源详情 / 学校 / 小区
import ListingDetail from '@/pages/ListingDetail'
import Schools from '@/pages/Schools'
import SchoolDetail from '@/pages/SchoolDetail'
import Communities from '@/pages/Communities'
import CommunityDetail from '@/pages/CommunityDetail'

// 管理端页面
import Dashboard from '@/pages/Dashboard'
import Properties from '@/pages/Properties'
import PropertyDetail from '@/pages/PropertyDetail'
import CRM from '@/pages/CRM'
import Leases from '@/pages/Leases'
import Payments from '@/pages/Payments'
import Employees from '@/pages/Employees'
import Settings from '@/pages/Settings'
import AuditLogs from '@/pages/AuditLogs'
import Viewings from '@/pages/Viewings'
import Trend from '@/pages/Trend'
import CommissionRules from '@/pages/CommissionRules'
import SaleDeals from '@/pages/SaleDeals'
import Distribution from '@/pages/Distribution'
import Markets from '@/pages/Markets'
import MarketIntelligence from '@/pages/MarketIntelligence'

// 房源上架 / 我的上架单 / 经纪人在线签约
import PublishListing from '@/pages/PublishListing'
import MyListings from '@/pages/MyListings'
import BrokerAgreements from '@/pages/BrokerAgreements'
// 运营管理：平台上架审核 / 去重审核队列
import ListingReview from '@/pages/ListingReview'
import DedupeReview from '@/pages/DedupeReview'

// 业主端页面
import OwnerDashboard from '@/pages/Owner/Dashboard'
import OwnerMy from '@/pages/Owner/My'
import OwnerProperties from '@/pages/Owner/Properties'
import OwnerDocuments from '@/pages/Owner/Documents'
import OwnerIncome from '@/pages/Owner/Income'
import OwnerServices from '@/pages/Owner/Services'
import OwnerPayments from '@/pages/Owner/Payments'
import OwnerMarketing from '@/pages/Owner/Marketing'

// 租客端页面
import TenantDashboard from '@/pages/Tenant/Dashboard'
import TenantMy from '@/pages/Tenant/My'
import TenantPropertyDetail from '@/pages/Tenant/PropertyDetail'
import TenantPayments from '@/pages/Tenant/Payments'
import TenantDocuments from '@/pages/Tenant/Documents'
import TenantServices from '@/pages/Tenant/Services'
import TenantMaintenance from '@/pages/Tenant/Maintenance'
import TenantLeases from '@/pages/Tenant/Leases'
import TenantLeaseDetail from '@/pages/Tenant/LeaseDetail'
import TenantDeals from '@/pages/Tenant/Deals'
import TenantDealDetail from '@/pages/Tenant/DealDetail'

// 员工端页面
import EmployeeDashboard from '@/pages/Employee/Dashboard'
import EmployeeAttendance from '@/pages/Employee/Attendance'
import EmployeePerformance from '@/pages/Employee/Performance'
import EmployeeContacts from '@/pages/Employee/Contacts'

// 系统管理（账号权限体系）
import SystemUsers from '@/pages/System/Users'
import SystemGroups from '@/pages/System/Groups'
import SystemPermissions from '@/pages/System/Permissions'
import SystemReview from '@/pages/System/ReviewCenter'
import Operations from '@/pages/Operations'

import Company from '@/pages/Company'
import useAuthStore from '@/stores/auth'

// v1.8 增强页面
import Chat from '@/pages/Chat'
import Contracts from '@/pages/Contracts'
import NotFound from '@/pages/NotFound'

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

const App = () => {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}

export default App
