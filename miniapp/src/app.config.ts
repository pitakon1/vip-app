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
    // ===== 主包只留首屏 + 高频 C 端页（冷启动体积），低频作业页全部走分包 =====
    'pages/owner/home/index',
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
    'pages/profile/index',
    'pages/attendance/index'
  ],
  subPackages: [
    // 业主低频页：房源管理 / 收益 / 委托挂牌 / 房源详情
    {
      root: 'pages/owner',
      pages: ['properties/index', 'income/index', 'marketing/index', 'property-detail/index']
    },
    // 员工作业页：业绩 / 日历 / 房源管理 / 客源线索 / 联系方式
    {
      root: 'pages/employee',
      pages: ['home/index', 'performance/index', 'calendar/index', 'properties/index', 'property-edit/index', 'property-browse/index', 'crm/index', 'contacts/index']
    },
    // 管理端后台：全部低频，独立分包
    {
      root: 'pages/admin',
      pages: ['home/index', 'properties/index', 'property-detail/index', 'crm/index', 'payments/index', 'leases/index', 'accounts/index', 'permissions/index', 'commission-rules/index', 'review-center/index']
    },
    // 内部/渠道上架作业
    {
      root: 'pages/staff',
      pages: ['listing-edit/index', 'listings/index', 'contract/index']
    },
    // 聊天
    {
      root: 'pages/chat',
      pages: ['list/index', 'detail/index']
    },
    // 租客低频：租约详情 / 交易订单
    {
      root: 'pages/tenant',
      pages: ['leases/detail', 'deals/index', 'deals/detail']
    }
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
