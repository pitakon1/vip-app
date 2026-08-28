export default {
  pages: [
    'pages/index/index',
    'pages/login/index',
    'pages/owner/home/index',
    'pages/owner/documents/index',
    'pages/owner/services/index',
    'pages/owner/income/index',
    'pages/tenant/home/index',
    'pages/tenant/documents/index',
    'pages/tenant/services/index',
    'pages/tenant/maintenance/index',
    'pages/profile/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1677ff',
    navigationBarTitleText: 'VIP Rental',
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#1677ff',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/profile/index', text: '我的' }
    ]
  }
}
