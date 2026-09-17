import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth';
import LoginScreen from '../screens/LoginScreen';
import MainTabNavigator from './MainTabNavigator';
import TestScreen from '../screens/TestScreen';
import ChatDetailScreen from '../screens/chat/ChatDetailScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import PropertyDetailScreen from '../screens/tenant/PropertyDetailScreen';
import TenantListingsScreen from '../screens/tenant/ListingsScreen';
import DocumentsScreen from '../screens/tenant/DocumentsScreen';
import MaintenanceScreen from '../screens/tenant/MaintenanceScreen';
import ServicesScreen from '../screens/tenant/ServicesScreen';
import PaymentsScreen from '../screens/tenant/PaymentsScreen';
import CRMScreen from '../screens/employee/CRMScreen';
import AdminCRMScreen from '../screens/admin/CRMScreen';
import CommissionRulesScreen from '../screens/admin/CommissionRulesScreen';
import PerformanceScreen from '../screens/employee/PerformanceScreen';
import PropertiesScreen from '../screens/employee/PropertiesScreen';
import CalendarScreen from '../screens/employee/CalendarScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminPropertyDetailScreen from '../screens/admin/PropertyDetailScreen';
import PropertyEditScreen from '../screens/admin/PropertyEditScreen';
import AdminLeasesScreen from '../screens/admin/LeasesScreen';
import EmployeePropertyBrowseScreen from '../screens/employee/PropertyBrowseScreen';
import OwnerPropertyDetailScreen from '../screens/owner/PropertyDetailScreen';
import OwnerPropertiesScreen from '../screens/owner/PropertiesScreen';
import OwnerDocumentsScreen from '../screens/owner/DocumentsScreen';
import ContactScreen from '../screens/employee/ContactScreen';
import OwnerPaymentsScreen from '../screens/owner/PaymentsScreen';
import OwnerMarketingScreen from '../screens/owner/MarketingScreen';

export type RootStackParamList = {
  Login: undefined;
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
  Payments: undefined;
  CRM: undefined;
  AdminCRM: undefined;
  CommissionRules: undefined;
  Performance: undefined;
  EmployeeProperties: undefined;
  Contacts: undefined;
  Calendar: undefined;
  OwnerPayments: undefined;
  OwnerMarketing: undefined;
  AdminUsers: undefined;
  AdminPropertyDetail: { id: string };
  PropertyEdit: { id?: string } | { initial?: any } | undefined;
  AdminLeases: undefined;
  EmployeePropertyBrowse: undefined;
  OwnerPropertyDetail: { id: string };
  OwnerProperties: undefined;
  OwnerDocuments: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen name="Test" component={TestScreen} options={{ headerShown: true, title: '测试调试面板' }} />
          <Stack.Screen name="ChatDetail" component={ChatDetailScreen} options={{ headerShown: true, title: '会话' }} />
          <Stack.Screen name="ChatList" component={ChatListScreen} options={{ headerShown: true, title: '消息' }} />
          <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ headerShown: true, title: '考勤打卡' }} />
          <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
          <Stack.Screen name="PropertySearch" component={TenantListingsScreen} options={{ headerShown: true, title: '房源搜索' }} />
          <Stack.Screen name="Documents" component={DocumentsScreen} options={{ headerShown: true, title: '我的文档' }} />
          <Stack.Screen name="TenantMaintenance" component={MaintenanceScreen} options={{ headerShown: true, title: '报修工单' }} />
          <Stack.Screen name="TenantServices" component={ServicesScreen} options={{ headerShown: true, title: '增值服务' }} />
          <Stack.Screen name="Payments" component={PaymentsScreen} options={{ headerShown: true, title: '缴费中心' }} />
          <Stack.Screen name="CRM" component={CRMScreen} options={{ headerShown: true, title: '客户与租约跟进' }} />
          <Stack.Screen name="AdminCRM" component={AdminCRMScreen} options={{ headerShown: true, title: '客户管理' }} />
          <Stack.Screen name="CommissionRules" component={CommissionRulesScreen} options={{ headerShown: true, title: '佣金设置' }} />
          <Stack.Screen name="Performance" component={PerformanceScreen} options={{ headerShown: true, title: '我的业绩' }} />
          <Stack.Screen name="EmployeeProperties" component={PropertiesScreen} options={{ headerShown: true, title: '房源管理' }} />
          <Stack.Screen name="Calendar" component={CalendarScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ headerShown: true, title: '账号管理' }} />
          <Stack.Screen name="Contacts" component={ContactScreen} options={{ headerShown: true, title: '同事通讯录' }} />
          <Stack.Screen name="OwnerPayments" component={OwnerPaymentsScreen} options={{ headerShown: true, title: '我的付款' }} />
          <Stack.Screen name="OwnerMarketing" component={OwnerMarketingScreen} options={{ headerShown: true, title: '委托挂牌与营销' }} />
          <Stack.Screen name="OwnerDocuments" component={OwnerDocumentsScreen} options={{ headerShown: true, title: '租房文档' }} />
          <Stack.Screen name="OwnerProperties" component={OwnerPropertiesScreen} options={{ headerShown: true, title: '房源管理' }} />
          <Stack.Screen name="OwnerPropertyDetail" component={OwnerPropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
          <Stack.Screen name="EmployeePropertyBrowse" component={EmployeePropertyBrowseScreen} options={{ headerShown: true, title: '房源浏览' }} />
          <Stack.Screen name="AdminPropertyDetail" component={AdminPropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
          <Stack.Screen name="PropertyEdit" component={PropertyEditScreen} options={{ headerShown: true, title: '编辑房源' }} />
          <Stack.Screen name="AdminLeases" component={AdminLeasesScreen} options={{ headerShown: true, title: '合同管理' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Test" component={TestScreen} options={{ headerShown: true, title: '测试调试面板' }} />
        </>
      )}
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
