export default {
  pages: [
    'pages/index/index',
    'pages/login/index',
    'pages/owner/home/index',
    'pages/owner/documents/index',
    'pages/owner/services/index',
    'pages/owner/income/index',
    'pages/owner/marketing/index',
    'pages/employee/home/index',
    'pages/employee/performance/index',
    'pages/employee/search/index',
    'pages/employee/properties/index',
    'pages/employee/leads/index',
    'pages/employee/contacts/index',
    'pages/admin/home/index',
    'pages/admin/sale-deals/index',
    'pages/admin/distribution/index',
    'pages/admin/markets/index',
    'pages/admin/market-intel/index',
    'pages/admin/reconciliation/index',
    'pages/admin/trend/index',
    'pages/admin/audit/index',
    'pages/owner/payments/index',
    'pages/tenant/home/index',
    'pages/tenant/documents/index',
    'pages/tenant/services/index',
    'pages/tenant/maintenance/index',
    'pages/tenant/payments/index',
    'pages/tenant/listings/index',
    'pages/tenant/viewings/index',
    'pages/tenant/favorites/index',
    'pages/profile/index',
    'pages/chat/list/index',
    'pages/chat/detail/index',
    'pages/contracts/index',
    'pages/backup/index',
    'pages/map/search/index',
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
  },
  tabBar: {
    color: '#8a919c',
    selectedColor: '#14b8a6',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/profile/index', text: '我的' }
    ]
  }
}
