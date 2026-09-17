export default {
  pages: [
    'pages/index/index',
    'pages/login/index',
    'pages/owner/home/index',
    'pages/owner/documents/index',
    'pages/owner/services/index',
    'pages/owner/income/index',
    'pages/owner/marketing/index',
    'pages/owner/property-detail/index',
    'pages/employee/home/index',
    'pages/employee/performance/index',
    'pages/employee/properties/index',
    'pages/employee/property-edit/index',
    'pages/employee/property-browse/index',
    'pages/employee/crm/index',
    'pages/employee/calendar/index',
    'pages/employee/contacts/index',
    'pages/admin/home/index',
    'pages/admin/properties/index',
    'pages/admin/property-detail/index',
    'pages/admin/crm/index',
    'pages/admin/payments/index',
    'pages/admin/leases/index',
    'pages/admin/accounts/index',
    'pages/admin/commission-rules/index',
    'pages/owner/payments/index',
    'pages/tenant/home/index',
    'pages/tenant/documents/index',
    'pages/tenant/services/index',
    'pages/tenant/maintenance/index',
    'pages/tenant/payments/index',
    'pages/tenant/listings/index',
    'pages/tenant/property-detail/index',
    'pages/profile/index',
    'pages/chat/list/index',
    'pages/chat/detail/index',
    'pages/attendance/index'
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
