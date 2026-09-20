import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
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
import OwnerHomeScreen from '../screens/owner/HomeScreen';
import OwnerPropertiesScreen from '../screens/owner/PropertiesScreen';
import OwnerDocumentsScreen from '../screens/tenant/DocumentsScreen';
import ContactScreen from '../screens/employee/ContactScreen';
import OwnerMarketingScreen from '../screens/owner/MarketingScreen';
import ListingPublishScreen from '../screens/listing/ListingPublishScreen';
import MyListingsScreen from '../screens/listing/MyListingsScreen';
import PublicListingsScreen from '../screens/listing/PublicListingsScreen';
import BrokerAgreementScreen from '../screens/broker/BrokerAgreementScreen';
import SettingsLanguageScreen from '../screens/settings/SettingsLanguageScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import NotificationPrefsScreen from '../screens/settings/NotificationPrefsScreen';
import MyLeaseScreen from '../screens/settings/MyLeaseScreen';
import MyOrdersScreen from '../screens/settings/MyOrdersScreen';

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
  ListingPublish: { id?: string } | undefined;
  MyListings: undefined;
  PublicListings: undefined;
  BrokerAgreement: undefined;
  SettingsLanguage: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  NotificationPrefs: undefined;
  MyLease: { activeLease?: any };
  MyOrders: { deals?: any[] };
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
          <Stack.Screen name="OwnerServices" component={ServicesScreen} options={{ headerShown: true, title: '增值服务' }} />
          <Stack.Screen name="Payments" component={PaymentsScreen} options={{ headerShown: true, title: '缴费中心' }} />
          <Stack.Screen name="CRM" component={CRMScreen} options={{ headerShown: true, title: '客户与租约跟进' }} />
          <Stack.Screen name="AdminCRM" component={AdminCRMScreen} options={{ headerShown: true, title: '客户管理' }} />
          <Stack.Screen name="CommissionRules" component={CommissionRulesScreen} options={{ headerShown: true, title: '佣金设置' }} />
          <Stack.Screen name="Performance" component={PerformanceScreen} options={{ headerShown: true, title: '我的业绩' }} />
          <Stack.Screen name="EmployeeProperties" component={PropertiesScreen} options={{ headerShown: true, title: '房源管理' }} />
          <Stack.Screen name="Calendar" component={CalendarScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ headerShown: true, title: '账号管理' }} />
          <Stack.Screen name="Contacts" component={ContactScreen} options={{ headerShown: true, title: '同事通讯录' }} />
          <Stack.Screen name="OwnerHome" component={OwnerHomeScreen} options={{ headerShown: true, title: '资产管理' }} />
          <Stack.Screen name="OwnerPayments" component={PaymentsScreen} options={{ headerShown: true, title: '我的付款' }} />
          <Stack.Screen name="OwnerMarketing" component={OwnerMarketingScreen} options={{ headerShown: true, title: '委托挂牌与营销' }} />
          <Stack.Screen name="OwnerDocuments" component={OwnerDocumentsScreen} options={{ headerShown: true, title: '我的文档' }} />
          <Stack.Screen name="OwnerProperties" component={OwnerPropertiesScreen} options={{ headerShown: true, title: '房源管理' }} />
          <Stack.Screen name="OwnerPropertyDetail" component={OwnerPropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
          <Stack.Screen name="ListingPublish" component={ListingPublishScreen} options={{ headerShown: true, title: '发布房源' }} />
          <Stack.Screen name="MyListings" component={MyListingsScreen} options={{ headerShown: true, title: '我的上架单' }} />
          <Stack.Screen name="PublicListings" component={PublicListingsScreen} options={{ headerShown: true, title: '上架房源' }} />
          <Stack.Screen name="BrokerAgreement" component={BrokerAgreementScreen} options={{ headerShown: true, title: '协议签约' }} />
          <Stack.Screen name="EmployeePropertyBrowse" component={EmployeePropertyBrowseScreen} options={{ headerShown: true, title: '房源浏览' }} />
          <Stack.Screen name="AdminPropertyDetail" component={AdminPropertyDetailScreen} options={{ headerShown: true, title: '房源详情' }} />
          <Stack.Screen name="PropertyEdit" component={PropertyEditScreen} options={{ headerShown: true, title: '编辑房源' }} />
          <Stack.Screen name="AdminLeases" component={AdminLeasesScreen} options={{ headerShown: true, title: '合同管理' }} />
          <Stack.Screen name="SettingsLanguage" component={SettingsLanguageScreen} options={{ headerShown: true, title: '语言' }} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: true, title: '编辑资料' }} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ headerShown: true, title: '修改密码' }} />
          <Stack.Screen name="NotificationPrefs" component={NotificationPrefsScreen} options={{ headerShown: true, title: '通知设置' }} />
          <Stack.Screen name="MyLease" component={MyLeaseScreen} options={{ headerShown: true, title: '我的租约' }} />
          <Stack.Screen name="MyOrders" component={MyOrdersScreen} options={{ headerShown: true, title: '我的订单' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
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
