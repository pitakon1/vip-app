import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import PortalLayout from '@/layouts/PortalLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'

// 公共页面
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import PublicListings from '@/pages/PublicListings'

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
import Reconciliation from '@/pages/Reconciliation'
import Trend from '@/pages/Trend'
import CommissionRules from '@/pages/CommissionRules'
import SaleDeals from '@/pages/SaleDeals'
import Distribution from '@/pages/Distribution'
import Markets from '@/pages/Markets'
import MarketIntelligence from '@/pages/MarketIntelligence'

// 业主端页面
import OwnerDashboard from '@/pages/Owner/Dashboard'
import OwnerDocuments from '@/pages/Owner/Documents'
import OwnerIncome from '@/pages/Owner/Income'
import OwnerServices from '@/pages/Owner/Services'
import OwnerPayments from '@/pages/Owner/Payments'
import OwnerMarketing from '@/pages/Owner/Marketing'

// 租客端页面
import TenantDashboard from '@/pages/Tenant/Dashboard'
import TenantPayments from '@/pages/Tenant/Payments'
import TenantDocuments from '@/pages/Tenant/Documents'
import TenantServices from '@/pages/Tenant/Services'
import TenantMaintenance from '@/pages/Tenant/Maintenance'

// 员工端页面
import EmployeeDashboard from '@/pages/Employee/Dashboard'
import EmployeeAttendance from '@/pages/Employee/Attendance'
import EmployeePerformance from '@/pages/Employee/Performance'
import EmployeeContacts from '@/pages/Employee/Contacts'

import Company from '@/pages/Company'
import useAuthStore from '@/stores/auth'

// v1.8 增强页面
import Chat from '@/pages/Chat'
import Contracts from '@/pages/Contracts'

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
        {/* ===== 公共路由（无需登录）===== */}
        <Route path="/" element={<Home />} />
        <Route path="/listings" element={<PublicListings />} />
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

          {/* 管理端路由 */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/detail/:id" element={<PropertyDetail />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="/leases" element={<Leases />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/viewings" element={<Viewings />} />
          <Route path="/reconciliation" element={<Reconciliation />} />
          <Route path="/trend" element={<Trend />} />
          <Route path="/commission-rules" element={<CommissionRules />} />
          <Route path="/audit-logs" element={<AuditLogs />} />
          <Route path="/sale-deals" element={<SaleDeals />} />
          <Route path="/distribution" element={<Distribution />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/market-intelligence" element={<MarketIntelligence />} />
          <Route path="/company" element={<Company />} />

          {/* 业主端路由 */}
          <Route path="/owner/dashboard" element={<OwnerDashboard />} />
          <Route path="/owner/properties" element={<OwnerDashboard />} />
          <Route path="/owner/income" element={<OwnerIncome />} />
          <Route path="/owner/documents" element={<OwnerDocuments />} />
          <Route path="/owner/services" element={<OwnerServices />} />
          <Route path="/owner/payments" element={<OwnerPayments />} />
          <Route path="/owner/marketing" element={<OwnerMarketing />} />

          {/* 员工端路由 */}
          <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
          <Route path="/employee/attendance" element={<EmployeeAttendance />} />
          <Route path="/employee/performance" element={<EmployeePerformance />} />
          <Route path="/employee/contacts" element={<EmployeeContacts />} />
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
          <Route path="/tenant/listings" element={<PublicListings compact />} />
          <Route path="/tenant/payments" element={<TenantPayments />} />
          <Route path="/tenant/documents" element={<TenantDocuments />} />
          <Route path="/tenant/services" element={<TenantServices />} />
          <Route path="/tenant/maintenance" element={<TenantMaintenance />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
