import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth';
import LoginScreen from '../screens/LoginScreen';
import MainTabNavigator from './MainTabNavigator';
import TestScreen from '../screens/TestScreen';
import ChatDetailScreen from '../screens/chat/ChatDetailScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import ContractsScreen from '../screens/contracts/ContractsScreen';
import ContractDetailScreen from '../screens/contracts/ContractDetailScreen';
import BackupScreen from '../screens/backup/BackupScreen';
import MapScreen from '../screens/map/MapScreen';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import AttendanceReviewScreen from '../screens/attendance/AttendanceReviewScreen';
import PropertyDetailScreen from '../screens/tenant/PropertyDetailScreen';
import TenantListingsScreen from '../screens/tenant/ListingsScreen';
import DocumentsScreen from '../screens/tenant/DocumentsScreen';
import MaintenanceScreen from '../screens/tenant/MaintenanceScreen';
import ServicesScreen from '../screens/tenant/ServicesScreen';
import PaymentsScreen from '../screens/tenant/PaymentsScreen';
import ViewingsScreen from '../screens/tenant/ViewingsScreen';
import OwnerPortalScreen from '../screens/tenant/OwnerPortalScreen';
import SaleDealsScreen from '../screens/admin/SaleDealsScreen';
import DistributionScreen from '../screens/admin/DistributionScreen';
import MarketsScreen from '../screens/admin/MarketsScreen';
import MarketIntelScreen from '../screens/admin/MarketIntelScreen';
import CRMScreen from '../screens/employee/CRMScreen';
import PerformanceScreen from '../screens/employee/PerformanceScreen';
import PropertiesScreen from '../screens/employee/PropertiesScreen';
import CalendarScreen from '../screens/employee/CalendarScreen';
import AdminReviewScreen from '../screens/admin/AdminReviewScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminOpsScreen from '../screens/admin/AdminOpsScreen';
import ContactScreen from '../screens/employee/ContactScreen';
import OwnerPaymentsScreen from '../screens/owner/PaymentsScreen';
import OwnerMarketingScreen from '../screens/owner/MarketingScreen';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Test: undefined;
  ChatDetail: { conversationId: string; title?: string };
  ChatList: undefined;
  Contracts: undefined;
  ContractDetail: { id: string };
  Backup: undefined;
  Map: undefined;
  Attendance: undefined;
  PropertyDetail: { id: string } | undefined;
  PropertySearch: undefined;
  Documents: undefined;
  TenantMaintenance: undefined;
  TenantServices: undefined;
  Payments: undefined;
  Viewings: undefined;
  OwnerPortal: undefined;
  SaleDeals: undefined;
  Distribution: undefined;
  Markets: undefined;
  MarketIntel: undefined;
  CRM: undefined;
  Performance: undefined;
  EmployeeProperties: undefined;
  Contacts: undefined;
  Calendar: undefined;
  OwnerPayments: undefined;
  OwnerMarketing: undefined;
  AdminReview: undefined;
  AdminUsers: undefined;
  AdminOps: undefined;
  AttendanceReview: undefined;
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
          <Stack.Screen name="Contracts" component={ContractsScreen} options={{ headerShown: true, title: '电子签合同' }} />
          <Stack.Screen name="ContractDetail" component={ContractDetailScreen} options={{ headerShown: true, title: '合同详情' }} />
          <Stack.Screen name="Backup" component={BackupScreen} options={{ headerShown: true, title: '数据备份' }} />
          <Stack.Screen name="Map" component={MapScreen} options={{ headerShown: true, title: '地图找房' }} />
          <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ headerShown: true, title: '考勤打卡' }} />
          <Stack.Screen name="AttendanceReview" component={AttendanceReviewScreen} options={{ headerShown: true, title: '考勤核对' }} />
          <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
          <Stack.Screen name="PropertySearch" component={TenantListingsScreen} options={{ headerShown: true, title: '房源搜索' }} />
          <Stack.Screen name="Documents" component={DocumentsScreen} options={{ headerShown: true, title: '我的文档' }} />
          <Stack.Screen name="TenantMaintenance" component={MaintenanceScreen} options={{ headerShown: true, title: '报修工单' }} />
          <Stack.Screen name="TenantServices" component={ServicesScreen} options={{ headerShown: true, title: '增值服务' }} />
          <Stack.Screen name="Payments" component={PaymentsScreen} options={{ headerShown: true, title: '缴费中心' }} />
          <Stack.Screen name="Viewings" component={ViewingsScreen} options={{ headerShown: true, title: '预约看房' }} />
          <Stack.Screen name="OwnerPortal" component={OwnerPortalScreen} options={{ headerShown: true, title: '房东工作台' }} />
          <Stack.Screen name="SaleDeals" component={SaleDealsScreen} options={{ headerShown: true, title: '买卖交易闭环' }} />
          <Stack.Screen name="Distribution" component={DistributionScreen} options={{ headerShown: true, title: '分销体系' }} />
          <Stack.Screen name="Markets" component={MarketsScreen} options={{ headerShown: true, title: '多国市场' }} />
          <Stack.Screen name="MarketIntel" component={MarketIntelScreen} options={{ headerShown: true, title: '数据决策' }} />
          <Stack.Screen name="CRM" component={CRMScreen} options={{ headerShown: true, title: '客户与租约跟进' }} />
          <Stack.Screen name="Performance" component={PerformanceScreen} options={{ headerShown: true, title: '我的业绩' }} />
          <Stack.Screen name="EmployeeProperties" component={PropertiesScreen} options={{ headerShown: true, title: '房源管理' }} />
          <Stack.Screen name="Calendar" component={CalendarScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AdminReview" component={AdminReviewScreen} options={{ headerShown: true, title: '工单审核' }} />
          <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ headerShown: true, title: '账号管理' }} />
          <Stack.Screen name="AdminOps" component={AdminOpsScreen} options={{ headerShown: true, title: '运营数据看板' }} />
          <Stack.Screen name="Contacts" component={ContactScreen} options={{ headerShown: true, title: '同事通讯录' }} />
          <Stack.Screen name="OwnerPayments" component={OwnerPaymentsScreen} options={{ headerShown: true, title: '我的付款' }} />
          <Stack.Screen name="OwnerMarketing" component={OwnerMarketingScreen} options={{ headerShown: true, title: '委托挂牌与营销' }} />
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
