import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth';
import type { UserRole } from '../types';
import colors from '../theme/colors';
import ProfileScreen from '../screens/ProfileScreen';
import { useI18n } from '../i18n';

// 租客端页面
import TenantHomeScreen from '../screens/tenant/HomeScreen';
import TenantListingsScreen from '../screens/tenant/ListingsScreen';

// 业主端页面
import OwnerHomeScreen from '../screens/owner/HomeScreen';
import OwnerIncomeScreen from '../screens/owner/IncomeScreen';
import OwnerServicesScreen from '../screens/owner/ServicesScreen';

// 员工端页面
import EmployeeHomeScreen from '../screens/employee/HomeScreen';
import EmployeePropertyBrowseScreen from '../screens/employee/PropertyBrowseScreen';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import PerformanceScreen from '../screens/employee/PerformanceScreen';
import ContactScreen from '../screens/employee/ContactScreen';

// 管理端页面
import AdminHomeScreen from '../screens/admin/HomeScreen';
import AdminPropertiesScreen from '../screens/admin/PropertiesScreen';
import AdminPaymentsScreen from '../screens/admin/PaymentsScreen';
import AdminCRMScreen from '../screens/admin/CRMScreen';

// 公共：消息（聊天）
import ChatListScreen from '../screens/chat/ChatListScreen';

const Tab = createBottomTabNavigator();

type IoniconName = keyof typeof Ionicons.glyphMap;

const makeTabOptions = (icon: IoniconName, title: string) => ({
  title,
  tabBarIcon: ({
    color,
    size,
    focused,
  }: {
    color: string;
    size: number;
    focused: boolean;
  }) => (
    <Ionicons
      name={(focused ? icon : `${icon}-outline`) as IoniconName}
      size={size}
      color={color}
    />
  ),
});

const screenOptions = {
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.ink3,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
  },
  tabBarLabelStyle: { fontSize: 11 },
};

// 底部导航按原型对齐（rental-full-draft/pages/*-mobile-*.html 的 data-nav-key）：
//   管理端 首页 / 房源 / 客户 / 收款 / 我的
//   员工端 首页 / 房源 / 考勤 / 业绩 / 通讯录
//   业主端 首页 / 收益 / 服务 / 我的
//   租客端 首页 / 找房 / 消息 / 我的
// 原型未覆盖的页面（OwnerDocuments / AdminOps / EmployeeChat 等）保留为 RootNavigator 的 Stack 路由。

function OwnerTabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="OwnerHome" component={OwnerHomeScreen} options={makeTabOptions('home', t('tab.home'))} />
      <Tab.Screen name="OwnerIncome" component={OwnerIncomeScreen} options={makeTabOptions('wallet', t('tab.income'))} />
      <Tab.Screen name="OwnerServices" component={OwnerServicesScreen} options={makeTabOptions('hammer', t('tab.services'))} />
      <Tab.Screen name="OwnerProfile" component={ProfileScreen} options={makeTabOptions('person', t('tab.profile'))} />
    </Tab.Navigator>
  );
}

function TenantTabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="TenantHome" component={TenantHomeScreen} options={makeTabOptions('home', t('tab.home'))} />
      <Tab.Screen name="TenantListings" component={TenantListingsScreen} options={makeTabOptions('search', t('tab.listings'))} />
      <Tab.Screen name="TenantChat" component={ChatListScreen} options={makeTabOptions('chatbubbles', t('tab.messages'))} />
      <Tab.Screen name="TenantProfile" component={ProfileScreen} options={makeTabOptions('person', t('tab.profile'))} />
    </Tab.Navigator>
  );
}

function EmployeeTabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="EmployeeHome" component={EmployeeHomeScreen} options={makeTabOptions('home', t('tab.home'))} />
      <Tab.Screen name="EmployeePropertyBrowse" component={EmployeePropertyBrowseScreen} options={makeTabOptions('business', t('tab.properties'))} />
      <Tab.Screen name="EmployeeAttendance" component={AttendanceScreen} options={makeTabOptions('finger-print', t('tab.attendance'))} />
      <Tab.Screen name="EmployeePerformance" component={PerformanceScreen} options={makeTabOptions('stats-chart', t('tab.performance'))} />
      <Tab.Screen name="EmployeeContacts" component={ContactScreen} options={makeTabOptions('people', t('tab.contacts'))} />
    </Tab.Navigator>
  );
}

function AdminTabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="AdminHome" component={AdminHomeScreen} options={makeTabOptions('home', t('tab.home'))} />
      <Tab.Screen name="AdminProperties" component={AdminPropertiesScreen} options={makeTabOptions('business', t('tab.properties'))} />
      <Tab.Screen name="AdminCRM" component={AdminCRMScreen} options={makeTabOptions('people', t('tab.customers'))} />
      <Tab.Screen name="AdminPayments" component={AdminPaymentsScreen} options={makeTabOptions('card', t('tab.payments'))} />
      <Tab.Screen name="AdminProfile" component={ProfileScreen} options={makeTabOptions('person', t('tab.profile'))} />
    </Tab.Navigator>
  );
}

export default function MainTabNavigator() {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.role ?? 'tenant';

  switch (role) {
    case 'admin':
      return <AdminTabs />;
    case 'owner':
      return <OwnerTabs />;
    case 'agent':
    case 'employee':
      return <EmployeeTabs />;
    case 'tenant':
    default:
      return <TenantTabs />;
  }
}