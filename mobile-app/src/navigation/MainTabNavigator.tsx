import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuthStore } from '../stores/auth';
import type { UserRole } from '../types';
import colors from '../theme/colors';
import ProfileScreen from '../screens/ProfileScreen';
import { useI18n } from '../i18n';

// 公共 C 端页面（业主/租客合并后的统一端：首页/找房/消息/我的）
import HomeScreen from '../screens/tenant/HomeScreen';
import TenantListingsScreen from '../screens/tenant/ListingsScreen';

// 员工端页面
import EmployeeHomeScreen from '../screens/employee/HomeScreen';
import EmployeePropertyBrowseScreen from '../screens/employee/PropertyBrowseScreen';
import CRMScreen from '../screens/employee/CRMScreen';

// 管理端页面
import AdminHomeScreen from '../screens/admin/HomeScreen';
import AdminPropertiesScreen from '../screens/admin/PropertiesScreen';
import AdminPaymentsScreen from '../screens/admin/PaymentsScreen';
import AdminCRMScreen from '../screens/admin/CRMScreen';

// 公共：消息（聊天）
import ChatListScreen from '../screens/chat/ChatListScreen';

const Tab = createBottomTabNavigator();

type IoniconName = keyof typeof Ionicons.glyphMap;

// 底部导航按原型对齐（rental-full-draft/pages/*-mobile-*.html 的 data-nav-key）。
// 角色 -> Tab 列表作为本端单一配置源，供下方统一渲染，去除各角色重复的 Tab.Screen 结构。
interface TabDef {
  name: string;
  component: React.ComponentType<any>;
  icon: IoniconName;
  /** i18n key，文案取自 src/i18n 的 tab.* */
  labelKey: string;
}

// 公共 C 端 Tab 定义（首页=统一找房/推荐首页；找房=Listings；消息=ChatList；我的=Profile）
// 单一配置源：owner 与 tenant 共用，差异仅在「我的/首页」内部按角色渲染。
const C_TABS: TabDef[] = [
  { name: 'Home', component: HomeScreen, icon: 'home', labelKey: 'tab.home' },
  { name: 'Listings', component: TenantListingsScreen, icon: 'search', labelKey: 'tab.listings' },
  { name: 'Messages', component: ChatListScreen, icon: 'chatbubbles', labelKey: 'tab.messages' },
  { name: 'Profile', component: ProfileScreen, icon: 'person', labelKey: 'tab.profile' },
];

const ROLE_TABS: Record<UserRole, TabDef[]> = {
  // 管理端 首页 / 房源 / 客户 / 收款 / 我的
  admin: [
    { name: 'AdminHome', component: AdminHomeScreen, icon: 'home', labelKey: 'tab.home' },
    { name: 'AdminProperties', component: AdminPropertiesScreen, icon: 'business', labelKey: 'tab.properties' },
    { name: 'AdminCRM', component: AdminCRMScreen, icon: 'people', labelKey: 'tab.customers' },
    { name: 'AdminPayments', component: AdminPaymentsScreen, icon: 'card', labelKey: 'tab.payments' },
    { name: 'AdminProfile', component: ProfileScreen, icon: 'person', labelKey: 'tab.profile' },
  ],
  // 员工/经纪端 首页 / 房源 / 客户 / 消息 / 我的（业绩已并入首页图表，通讯录移至「我的」内）
  employee: [
    { name: 'EmployeeHome', component: EmployeeHomeScreen, icon: 'home', labelKey: 'tab.home' },
    { name: 'EmployeePropertyBrowse', component: EmployeePropertyBrowseScreen, icon: 'business', labelKey: 'tab.properties' },
    { name: 'EmployeeCRM', component: CRMScreen, icon: 'people', labelKey: 'tab.customers' },
    { name: 'EmployeeChat', component: ChatListScreen, icon: 'chatbubbles', labelKey: 'tab.messages' },
    { name: 'EmployeeProfile', component: ProfileScreen, icon: 'person', labelKey: 'tab.profile' },
  ],
  agent: [
    { name: 'EmployeeHome', component: EmployeeHomeScreen, icon: 'home', labelKey: 'tab.home' },
    { name: 'EmployeePropertyBrowse', component: EmployeePropertyBrowseScreen, icon: 'business', labelKey: 'tab.properties' },
    { name: 'EmployeeCRM', component: CRMScreen, icon: 'people', labelKey: 'tab.customers' },
    { name: 'EmployeeChat', component: ChatListScreen, icon: 'chatbubbles', labelKey: 'tab.messages' },
    { name: 'EmployeeProfile', component: ProfileScreen, icon: 'person', labelKey: 'tab.profile' },
  ],
  // 业主/租客 合并为同一套 C 端（首页/找房/消息/我的），对齐贝壳"一个App按行为/资产动态显示"心智。
  // 业主经营能力通过「我的-资产」区块与栈页进入，不作独立经营首页。
  owner: C_TABS,
  tenant: C_TABS,
};

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
  headerShown: false, // 底部 Tab 页面不套同名标题栏，顶部由各页面自绘（对齐贝壳：首页是搜索/定位，我的是头像卡片）
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.ink3,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
  },
  tabBarLabelStyle: { fontSize: 11 },
};

// 统一按 ROLE_TABS 渲染底部导航，消除各角色重复的 Tab.Screen 结构。
function RoleTabs({ defs }: { defs: TabDef[] }) {
  const { t } = useI18n();
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      {defs.map((d) => (
        <Tab.Screen
          key={d.name}
          name={d.name}
          component={d.component}
          options={makeTabOptions(d.icon, t(d.labelKey))}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function MainTabNavigator() {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.role ?? 'tenant';

  return <RoleTabs defs={ROLE_TABS[role]} />;
}