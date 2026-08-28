import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '../stores/auth';
import type { UserRole } from '../types';
import ProfileScreen from '../screens/ProfileScreen';

// 业主端页面
import OwnerHomeScreen from '../screens/owner/HomeScreen';
import OwnerDocumentsScreen from '../screens/owner/DocumentsScreen';
import OwnerServicesScreen from '../screens/owner/ServicesScreen';

// 租客端页面
import TenantHomeScreen from '../screens/tenant/HomeScreen';
import TenantDocumentsScreen from '../screens/tenant/DocumentsScreen';
import TenantServicesScreen from '../screens/tenant/ServicesScreen';

// 员工端页面
import EmployeeHomeScreen from '../screens/employee/HomeScreen';
import EmployeePropertiesScreen from '../screens/employee/PropertiesScreen';
import EmployeeCRMScreen from '../screens/employee/CRMScreen';
import EmployeePerformanceScreen from '../screens/employee/PerformanceScreen';

const Tab = createBottomTabNavigator();

function OwnerTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="OwnerHome" component={OwnerHomeScreen} options={{ title: '首页' }} />
      <Tab.Screen name="OwnerDocuments" component={OwnerDocumentsScreen} options={{ title: '文档' }} />
      <Tab.Screen name="OwnerServices" component={OwnerServicesScreen} options={{ title: '服务' }} />
      <Tab.Screen name="OwnerProfile" component={ProfileScreen} options={{ title: '我的' }} />
    </Tab.Navigator>
  );
}

function TenantTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="TenantHome" component={TenantHomeScreen} options={{ title: '首页' }} />
      <Tab.Screen name="TenantDocuments" component={TenantDocumentsScreen} options={{ title: '文档' }} />
      <Tab.Screen name="TenantServices" component={TenantServicesScreen} options={{ title: '服务' }} />
      <Tab.Screen name="TenantProfile" component={ProfileScreen} options={{ title: '我的' }} />
    </Tab.Navigator>
  );
}

function EmployeeTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="EmployeeHome" component={EmployeeHomeScreen} options={{ title: '首页' }} />
      <Tab.Screen name="EmployeeProperties" component={EmployeePropertiesScreen} options={{ title: '房源' }} />
      <Tab.Screen name="EmployeeCRM" component={EmployeeCRMScreen} options={{ title: 'CRM' }} />
      <Tab.Screen name="EmployeePerformance" component={EmployeePerformanceScreen} options={{ title: '业绩' }} />
      <Tab.Screen name="EmployeeProfile" component={ProfileScreen} options={{ title: '我的' }} />
    </Tab.Navigator>
  );
}

export default function MainTabNavigator() {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.role ?? 'tenant';

  switch (role) {
    case 'owner':
    case 'admin':
      return <OwnerTabs />;
    case 'agent':
    case 'employee':
      return <EmployeeTabs />;
    case 'tenant':
    default:
      return <TenantTabs />;
  }
}
