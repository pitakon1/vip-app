export default {
  pages: [
    'pages/index/index',
    'pages/login/index',
    // ===== C 端公开页（匿名可进，不需要 token）=====
    // 放在登录页之后、业务页之前：这是访客的第一落点。
    'pages/public/listings/index',
    'pages/public/schools/index',
    'pages/public/school-detail/index',
    'pages/public/communities/index',
    'pages/public/community-detail/index',
    'pages/public/listing-detail/index',
    'pages/owner/home/index',
    'pages/owner/properties/index',
    'pages/owner/income/index',
    'pages/owner/marketing/index',
    'pages/owner/property-detail/index',
    'pages/employee/home/index',
    'pages/employee/performance/index',
    'pages/employee/calendar/index',
    'pages/employee/properties/index',
    'pages/employee/property-edit/index',
    'pages/employee/property-browse/index',
    'pages/employee/crm/index',
    'pages/employee/contacts/index',
    'pages/admin/home/index',
    'pages/admin/properties/index',
    'pages/admin/property-detail/index',
    'pages/admin/crm/index',
    'pages/admin/payments/index',
    'pages/admin/leases/index',
    'pages/admin/accounts/index',
    'pages/admin/permissions/index',
    'pages/admin/commission-rules/index',
    // 管理端「待审核」→ 工单审核中心（对齐 Web /system/review-center）
    'pages/admin/review-center/index',
    'pages/tenant/home/index',
    'pages/tenant/documents/index',
    'pages/tenant/services/index',
    'pages/tenant/maintenance/index',
    'pages/tenant/payments/index',
    'pages/tenant/listings/index',
    // C 端「我的 - 常用功能」里的关注 / 浏览历史 / 降价提醒（登录即可用，不按业主租客门槛）
    'pages/tenant/favorites/index',
    'pages/tenant/history/index',
    'pages/tenant/price-alerts/index',
    'pages/location/index',
    'pages/tenant/property-detail/index',
    'pages/tenant/leases/index',
    'pages/tenant/leases/detail',
    'pages/tenant/deals/index',
    'pages/tenant/deals/detail',
    'pages/profile/index',
    'pages/chat/list/index',
    'pages/chat/detail/index',
    'pages/attendance/index',
    'pages/staff/listing-edit/index',
    'pages/staff/listings/index',
    'pages/staff/contract/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#14b8a6',
    navigationBarTitleText: 'VIP Rental',
    navigationBarTextStyle: 'white'
  },
  permission: {
    'scope.userLocation': {
      desc: '你的位置信息将用于租房考勤GPS定位打卡与地图找房'
    }
  }
}
