import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth';
import { useI18n } from '../i18n';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: undefined;
  Test: undefined;
  ChatDetail: { conversationId: string; title?: string };
  ChatList: undefined;
  Attendance: undefined;
  PropertyDetail: { id: string } | undefined;
  PropertySearch: undefined;
  Documents: undefined;
  TenantMaintenance: undefined;
  TenantServices: undefined;
  OwnerServices: undefined;
  Payments: undefined;
  CRM: undefined;
  AdminCRM: undefined;
  CommissionRules: undefined;
  Performance: undefined;
  EmployeeProperties: undefined;
  Contacts: undefined;
  Calendar: undefined;
  OwnerHome: undefined;
  OwnerIncome: undefined;
  OwnerPayments: undefined;
  OwnerMarketing: undefined;
  AdminUsers: undefined;
  AdminPermissions: undefined;
  AdminPropertyDetail: { id: string };
  // mode: 'create' 为新增房源；带 id/initial 为编辑
  PropertyEdit:
    | { id?: string; initial?: any; mode?: 'create' }
    | undefined;
  AdminLeases: undefined;
  EmployeePropertyBrowse: undefined;
  OwnerPropertyDetail: { id: string };
  OwnerProperties: undefined;
  OwnerDocuments: undefined;
  FeatureNotAvailable: { feature?: string; hint?: string } | undefined;
  ListingPublish: { id?: string } | undefined;
  MyListings: undefined;
  PublicListings: undefined;
  /** 全局定位选择页（国家 → 城市，全屏页面，对齐贝壳移动端） */
  LocationPicker: undefined;
  /** ===== C 端公开页（未登录也能进）===== */
  PublicTabs: undefined;
  PublicListingDetail: { id: string };
  PublicSchoolDetail: { id: string };
  PublicCommunityDetail: { id: string };
  /** 登录态下的 C 端内容入口（从首页「国际学校 / 小区」快捷入口推入） */
  PublicSchools: undefined;
  PublicCommunities: undefined;
  BrokerAgreement: undefined;
  SettingsLanguage: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  NotificationPrefs: undefined;
  AdminBusinessSettings: undefined;
  MyLease: undefined;
  MyLeaseDetail: { lease_id: string };
  MyOrders: undefined;
  MyOrderDetail: { deal_id: string };
  Favorites: undefined;
  History: undefined;
  PriceAlerts: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ScreenFallback() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

/**
 * 按需加载栈页：页面模块只在首次导航到该页时才加载。
 *
 * 此前所有页面在文件顶部静态 import，导致启动时首屏必须下载并执行完整 bundle
 * （含管理端、员工端等当前角色根本用不到的页面）才能渲染登录页，冷启动明显变慢。
 * 每个页面单独包裹 Suspense，导航到未加载页面时只有新页面显示占位，
 * 不会让整个导航器闪回占位页。
 */
function lazyScreen(loader: () => Promise<{ default: React.ComponentType<any> }>) {
  const Lazy = React.lazy(loader);
  return function LazyScreenWrapper(props: any) {
    return (
      <React.Suspense fallback={<ScreenFallback />}>
        <Lazy {...props} />
      </React.Suspense>
    );
  };
}

const MainTabNavigator = lazyScreen(() => import('./MainTabNavigator'));
const LoginScreen = lazyScreen(() => import('../screens/LoginScreen'));
const RegisterScreen = lazyScreen(() => import('../screens/RegisterScreen'));
const TestScreen = lazyScreen(() => import('../screens/TestScreen'));
const LocationPickerScreen = lazyScreen(() => import('../screens/LocationPickerScreen'));
const ChatDetailScreen = lazyScreen(() => import('../screens/chat/ChatDetailScreen'));
const ChatListScreen = lazyScreen(() => import('../screens/chat/ChatListScreen'));
const AttendanceScreen = lazyScreen(() => import('../screens/attendance/AttendanceScreen'));
const PropertyDetailScreen = lazyScreen(() => import('../screens/tenant/PropertyDetailScreen'));
const TenantListingsScreen = lazyScreen(() => import('../screens/tenant/ListingsScreen'));
const DocumentsScreen = lazyScreen(() => import('../screens/tenant/DocumentsScreen'));
const MaintenanceScreen = lazyScreen(() => import('../screens/tenant/MaintenanceScreen'));
const ServicesScreen = lazyScreen(() => import('../screens/tenant/ServicesScreen'));
const PaymentsScreen = lazyScreen(() => import('../screens/tenant/PaymentsScreen'));
const CRMScreen = lazyScreen(() => import('../screens/employee/CRMScreen'));
const AdminCRMScreen = lazyScreen(() => import('../screens/admin/CRMScreen'));
const CommissionRulesScreen = lazyScreen(() => import('../screens/admin/CommissionRulesScreen'));
const PerformanceScreen = lazyScreen(() => import('../screens/employee/PerformanceScreen'));
const PropertiesScreen = lazyScreen(() => import('../screens/employee/PropertiesScreen'));
const CalendarScreen = lazyScreen(() => import('../screens/employee/CalendarScreen'));
const AdminUsersScreen = lazyScreen(() => import('../screens/admin/AdminUsersScreen'));
const AdminPermissionsScreen = lazyScreen(() => import('../screens/admin/PermissionsScreen'));
const AdminPropertyDetailScreen = lazyScreen(() => import('../screens/admin/PropertyDetailScreen'));
const PropertyEditScreen = lazyScreen(() => import('../screens/admin/PropertyEditScreen'));
const AdminLeasesScreen = lazyScreen(() => import('../screens/admin/LeasesScreen'));
const EmployeePropertyBrowseScreen = lazyScreen(() => import('../screens/employee/PropertyBrowseScreen'));
const OwnerPropertyDetailScreen = lazyScreen(() => import('../screens/owner/PropertyDetailScreen'));
const OwnerHomeScreen = lazyScreen(() => import('../screens/owner/HomeScreen'));
const OwnerPropertiesScreen = lazyScreen(() => import('../screens/owner/PropertiesScreen'));
const OwnerIncomeScreen = lazyScreen(() => import('../screens/owner/IncomeScreen'));
const ContactScreen = lazyScreen(() => import('../screens/employee/ContactScreen'));
const OwnerMarketingScreen = lazyScreen(() => import('../screens/owner/MarketingScreen'));
const ListingPublishScreen = lazyScreen(() => import('../screens/listing/ListingPublishScreen'));
const MyListingsScreen = lazyScreen(() => import('../screens/listing/MyListingsScreen'));
// ⚠️ C 端公开页从 `screens/public/` 加载。旧的 `screens/listing/PublicListingsScreen`
// 调的是**需要鉴权**的 `/listings`，匿名必 401 —— 那正是「未登录看不到房源」的根因，
// 已废弃并在原文件处留下跳转说明。
const PublicListingsScreen = lazyScreen(() => import('../screens/public/PublicListingsScreen'));
const PublicSchoolsScreen = lazyScreen(() => import('../screens/public/PublicSchoolsScreen'));
const PublicCommunitiesScreen = lazyScreen(() => import('../screens/public/PublicCommunitiesScreen'));
const PublicListingDetailScreen = lazyScreen(() => import('../screens/public/PublicListingDetailScreen'));
const PublicSchoolDetailScreen = lazyScreen(() => import('../screens/public/PublicSchoolDetailScreen'));
const PublicCommunityDetailScreen = lazyScreen(() => import('../screens/public/PublicCommunityDetailScreen'));
const BrokerAgreementScreen = lazyScreen(() => import('../screens/broker/BrokerAgreementScreen'));
const FeatureNotAvailableScreen = lazyScreen(() => import('../screens/FeatureNotAvailableScreen'));
const SettingsLanguageScreen = lazyScreen(() => import('../screens/settings/SettingsLanguageScreen'));
const EditProfileScreen = lazyScreen(() => import('../screens/settings/EditProfileScreen'));
const ChangePasswordScreen = lazyScreen(() => import('../screens/settings/ChangePasswordScreen'));
const NotificationPrefsScreen = lazyScreen(() => import('../screens/settings/NotificationPrefsScreen'));
const AdminBusinessSettingsScreen = lazyScreen(() => import('../screens/settings/AdminBusinessSettingsScreen'));
const MyLeaseScreen = lazyScreen(() => import('../screens/settings/MyLeaseScreen'));
const MyLeaseDetailScreen = lazyScreen(() => import('../screens/settings/MyLeaseDetailScreen'));
const MyOrdersScreen = lazyScreen(() => import('../screens/settings/MyOrdersScreen'));
const MyOrderDetailScreen = lazyScreen(() => import('../screens/settings/MyOrderDetailScreen'));
const FavoritesScreen = lazyScreen(() => import('../screens/tenant/FavoritesScreen'));
const HistoryScreen = lazyScreen(() => import('../screens/tenant/HistoryScreen'));
const PriceAlertsScreen = lazyScreen(() => import('../screens/tenant/PriceAlertsScreen'));

export function RootNavigator() {
  const isLoading = useAuthStore((state) => state.isLoading);
  const { t } = useI18n();

  if (isLoading) {
    return <ScreenFallback />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/*
        未登录与登录共用同一套导航：Main（底部 Tab）恒在，首页/找房等浏览内容
        对所有人开放；只有点击需要身份的动作（收藏/消息/我的业务）才由页面自行
        拦截并 push Login / Register。登录成功后返回原页面继续操作。
        对齐贝壳：浏览/搜索无需注册，需要登录的动作点进去才要求登录。
      */}
      <Stack.Screen name="Main" component={MainTabNavigator} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Test" component={TestScreen} options={{ headerShown: true, title: '测试调试面板' }} />
      <Stack.Screen name="ChatDetail" component={ChatDetailScreen} options={{ headerShown: true, title: '会话' }} />
      <Stack.Screen name="ChatList" component={ChatListScreen} options={{ headerShown: true, title: '消息' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ headerShown: true, title: '考勤打卡' }} />
      <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
      <Stack.Screen name="PropertySearch" component={TenantListingsScreen} options={{ headerShown: true, title: '房源搜索' }} />
      <Stack.Screen name="Documents" component={DocumentsScreen} options={{ headerShown: true, title: '文档中心' }} />
      <Stack.Screen name="TenantMaintenance" component={MaintenanceScreen} options={{ headerShown: true, title: '服务工单' }} />
      <Stack.Screen name="TenantServices" component={ServicesScreen} options={{ headerShown: true, title: '增值服务' }} />
      <Stack.Screen name="OwnerServices" component={ServicesScreen} options={{ headerShown: true, title: '增值服务' }} />
      <Stack.Screen name="Payments" component={PaymentsScreen} options={{ headerShown: true, title: '缴费中心' }} />
      <Stack.Screen name="CRM" component={CRMScreen} options={{ headerShown: true, title: '客户与租约跟进' }} />
      <Stack.Screen name="AdminCRM" component={AdminCRMScreen} options={{ headerShown: true, title: '客户管理' }} />
      <Stack.Screen name="CommissionRules" component={CommissionRulesScreen} options={{ headerShown: true, title: '佣金设置' }} />
      <Stack.Screen name="Performance" component={PerformanceScreen} options={{ headerShown: true, title: '我的业绩' }} />
      <Stack.Screen name="EmployeeProperties" component={PropertiesScreen} options={{ headerShown: true, title: '房源管理' }} />
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ headerShown: true, title: t('acc.title') }} />
      <Stack.Screen name="AdminPermissions" component={AdminPermissionsScreen} options={{ headerShown: true, title: t('perm.entry') }} />
      <Stack.Screen name="Contacts" component={ContactScreen} options={{ headerShown: true, title: '同事通讯录' }} />
      <Stack.Screen name="OwnerHome" component={OwnerHomeScreen} options={{ headerShown: true, title: '资产管理' }} />
      <Stack.Screen name="OwnerIncome" component={OwnerIncomeScreen} options={{ headerShown: true, title: '收益明细' }} />
      <Stack.Screen name="OwnerPayments" component={PaymentsScreen} options={{ headerShown: true, title: '我的付款' }} />
      <Stack.Screen name="OwnerMarketing" component={OwnerMarketingScreen} options={{ headerShown: true, title: '委托挂牌与营销' }} />
      <Stack.Screen name="OwnerDocuments" component={DocumentsScreen} options={{ headerShown: true, title: '文档中心' }} />
      <Stack.Screen name="OwnerProperties" component={OwnerPropertiesScreen} options={{ headerShown: true, title: '房源管理' }} />
      <Stack.Screen name="FeatureNotAvailable" component={FeatureNotAvailableScreen} options={{ headerShown: true, title: '' }} />
      <Stack.Screen name="OwnerPropertyDetail" component={OwnerPropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
      <Stack.Screen name="ListingPublish" component={ListingPublishScreen} options={{ headerShown: true, title: '发布房源' }} />
      <Stack.Screen name="MyListings" component={MyListingsScreen} options={{ headerShown: true, title: '我的上架单' }} />
      <Stack.Screen name="PublicListings" component={PublicListingsScreen} options={{ headerShown: true, title: '上架房源' }} />
      <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ headerShown: true, title: '' }} />
      {/* C 端公开页：登录/未登录都可进（从学校/小区/详情里互相跳转） */}
      <Stack.Screen name="PublicSchools" component={PublicSchoolsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PublicCommunities" component={PublicCommunitiesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PublicListingDetail" component={PublicListingDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PublicSchoolDetail" component={PublicSchoolDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PublicCommunityDetail" component={PublicCommunityDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BrokerAgreement" component={BrokerAgreementScreen} options={{ headerShown: true, title: '协议签约' }} />
      <Stack.Screen name="EmployeePropertyBrowse" component={EmployeePropertyBrowseScreen} options={{ headerShown: true, title: '房源浏览' }} />
      <Stack.Screen name="AdminPropertyDetail" component={AdminPropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
      <Stack.Screen
        name="PropertyEdit"
        component={PropertyEditScreen}
        // 同一屏兼作新增与编辑，标题随进入方式切换（mode=create 为新增）
        options={({ route }: any) => ({
          headerShown: true,
          title: route?.params?.mode === 'create' ? '新增房源' : '编辑房源',
        })}
      />
      <Stack.Screen name="AdminLeases" component={AdminLeasesScreen} options={{ headerShown: true, title: '合同管理' }} />
      <Stack.Screen name="SettingsLanguage" component={SettingsLanguageScreen} options={{ headerShown: true, title: '语言' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: true, title: '编辑资料' }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ headerShown: true, title: '修改密码' }} />
      <Stack.Screen name="NotificationPrefs" component={NotificationPrefsScreen} options={{ headerShown: true, title: '通知设置' }} />
      <Stack.Screen name="AdminBusinessSettings" component={AdminBusinessSettingsScreen} options={{ headerShown: true, title: '业务设置' }} />
      <Stack.Screen name="MyLease" component={MyLeaseScreen} options={{ headerShown: true, title: '我的租约' }} />
      <Stack.Screen name="MyLeaseDetail" component={MyLeaseDetailScreen} options={{ headerShown: true, title: '租约详情' }} />
      <Stack.Screen name="MyOrders" component={MyOrdersScreen} options={{ headerShown: true, title: '我的交易订单' }} />
      <Stack.Screen name="MyOrderDetail" component={MyOrderDetailScreen} options={{ headerShown: true, title: '订单详情' }} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ headerShown: true, title: '我的关注' }} />
      <Stack.Screen name="History" component={HistoryScreen} options={{ headerShown: true, title: '浏览历史' }} />
      <Stack.Screen name="PriceAlerts" component={PriceAlertsScreen} options={{ headerShown: true, title: '降价提醒' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
