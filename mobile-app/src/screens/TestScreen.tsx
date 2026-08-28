/**
 * App 测试页面
 * 用于开发调试：API 连通性测试、快速登录、各模块接口测试、响应查看
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import colors from '@/theme/colors';
import { useAuthStore } from '@/stores/auth';
import { authApi, propertiesApi, leasesApi, paymentsApi, notificationsApi, ownerApi, employeesApi, documentsApi, serviceOrdersApi, maintenanceApi } from '@/services/api';
import apiClient from '@/lib/api';

// ==================== 类型 ====================
interface TestResult {
  name: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: any;
  error?: string;
  duration?: number;
}

// ==================== 测试账号 ====================
const TEST_ACCOUNTS = [
  { label: '管理员', email: 'admin@viprental.com', password: 'admin123', role: 'admin' },
  { label: '经纪', email: 'agent@viprental.com', password: 'agent123', role: 'agent' },
  { label: '业主', email: 'owner@viprental.com', password: 'owner123', role: 'owner' },
  { label: '租客', email: 'tenant@viprental.com', password: 'tenant123', role: 'tenant' },
  { label: '员工', email: 'employee@viprental.com', password: 'emp123', role: 'employee' },
];

// ==================== API 测试项 ====================
const API_TESTS = [
  { key: 'health', label: '健康检查 GET /health', method: 'GET', path: '/health' },
  { key: 'authMe', label: '当前用户 GET /auth/me', fn: () => authApi.me() },
  { key: 'properties', label: '房源列表 GET /properties', fn: () => propertiesApi.list({ page: 1, page_size: 5 }) },
  { key: 'leases', label: '租约列表 GET /leases', fn: () => leasesApi.list({ page: 1, page_size: 5 }) },
  { key: 'payments', label: '我的付款 GET /payments/me', fn: () => paymentsApi.mine() },
  { key: 'notifications', label: '我的通知 GET /notifications/me', fn: () => notificationsApi.mine() },
  { key: 'documents', label: '文档列表 GET /documents', fn: () => documentsApi.list({ page: 1 }) },
  { key: 'ownerProperties', label: '业主房源 GET /owners/me/properties', fn: () => ownerApi.properties() },
  { key: 'ownerIncome', label: '业主收入 GET /owners/me/income', fn: () => ownerApi.income() },
  { key: 'leaderboard', label: '员工排行 GET /employees/leaderboard', fn: () => employeesApi.leaderboard() },
];

// ==================== 组件 ====================
export default function TestScreen() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [activeResult, setActiveResult] = useState<string | null>(null);
  const [autoLogin, setAutoLogin] = useState(true);
  const [serverUrl, setServerUrl] = useState('http://localhost:8000');
  const [token, setToken] = useState<string | null>(null);
  const [expandedJson, setExpandedJson] = useState(true);

  const { user, login, logout } = useAuthStore();

  // 更新单个测试结果
  const updateResult = useCallback((key: string, partial: Partial<TestResult>) => {
    setResults((prev) => ({
      ...prev,
      [key]: { name: key, status: 'idle', ...prev[key], ...partial },
    }));
  }, []);

  // 执行单个 API 测试
  const runTest = useCallback(async (test: typeof API_TESTS[0]) => {
    const start = Date.now();
    updateResult(test.key, { status: 'loading', error: undefined, data: undefined });
    setActiveResult(test.key);

    try {
      let response;
      if (test.key === 'health') {
        // 健康检查不走 /api/v1 前缀
        response = await apiClient.get('/health', { baseURL: serverUrl });
      } else if (test.fn) {
        response = await test.fn();
      }
      const duration = Date.now() - start;
      const data = response?.data;
      updateResult(test.key, { status: 'success', data, duration });
    } catch (err: any) {
      const duration = Date.now() - start;
      const errorMsg = err?.response?.data?.detail || err?.message || 'Unknown error';
      const errorData = err?.response?.data || err?.message;
      updateResult(test.key, { status: 'error', error: errorMsg, data: errorData, duration });
    }
  }, [serverUrl, updateResult]);

  // 批量执行所有测试
  const runAllTests = useCallback(async () => {
    for (const test of API_TESTS) {
      await runTest(test);
    }
  }, [runTest]);

  // 快速登录
  const quickLogin = useCallback(async (account: typeof TEST_ACCOUNTS[0]) => {
    updateResult('login', { status: 'loading' });
    try {
      await login(account.email, account.password);
      const t = await SecureStore.getItemAsync('auth_token');
      setToken(t);
      updateResult('login', { status: 'success', data: { email: account.email, role: account.role, token: t?.slice(0, 20) + '...' } });
      Alert.alert('登录成功', `${account.label} (${account.email})`);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || err?.message || 'Login failed';
      updateResult('login', { status: 'error', error: errorMsg });
      Alert.alert('登录失败', errorMsg);
    }
  }, [login, updateResult]);

  // 退出登录
  const handleLogout = useCallback(async () => {
    await logout();
    setToken(null);
    Alert.alert('已退出登录');
  }, [logout]);

  // 清除所有存储
  const clearStorage = useCallback(async () => {
    await SecureStore.deleteItemAsync('auth_token');
    setToken(null);
    setResults({});
    setActiveResult(null);
    Alert.alert('已清除本地存储');
  }, []);

  // 读取当前 token
  const refreshToken = useCallback(async () => {
    const t = await SecureStore.getItemAsync('auth_token');
    setToken(t);
  }, []);

  // 格式化 JSON
  const formatJson = (data: any): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  // 渲染状态标签
  const renderStatusTag = (status: TestResult['status']) => {
    const config = {
      idle: { bg: '#e8e8e8', text: '#999' },
      loading: { bg: '#e6f4ff', text: '#1677ff' },
      success: { bg: '#f6ffed', text: '#52c41a' },
      error: { bg: '#fff2f0', text: '#ff4d4f' },
    };
    const c = config[status];
    const labels = { idle: '待测试', loading: '测试中', success: '成功', error: '失败' };
    return (
      <View style={[styles.tag, { backgroundColor: c.bg }]}>
        <Text style={[styles.tagText, { color: c.text }]}>{labels[status]}</Text>
      </View>
    );
  };

  // 当前选中的结果
  const activeData = activeResult ? results[activeResult] : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>测试调试面板</Text>
        <TouchableOpacity onPress={clearStorage} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>清除存储</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* ==================== 服务器配置 ==================== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>服务器配置</Text>
          <View style={styles.row}>
            <Text style={styles.label}>API 地址</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://localhost:8000"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>实际 baseURL</Text>
            <Text style={styles.valueText}>{apiClient.defaults.baseURL}</Text>
          </View>
        </View>

        {/* ==================== 快速登录 ==================== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>快速登录</Text>
          {user ? (
            <View style={styles.userInfoBox}>
              <Text style={styles.userInfoText}>当前用户: {user.full_name}</Text>
              <Text style={styles.userInfoText}>邮箱: {user.email}</Text>
              <Text style={styles.userInfoText}>角色: {user.role}</Text>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                <Text style={styles.logoutBtnText}>退出登录</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.accountGrid}>
              {TEST_ACCOUNTS.map((acc) => (
                <TouchableOpacity
                  key={acc.email}
                  style={styles.accountBtn}
                  onPress={() => quickLogin(acc)}
                >
                  <Text style={styles.accountBtnText}>{acc.label}</Text>
                  <Text style={styles.accountBtnSub}>{acc.email}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {results.login?.status === 'loading' && (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} />
          )}
        </View>

        {/* ==================== Token 信息 ==================== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Token 信息</Text>
            <TouchableOpacity onPress={refreshToken}>
              <Text style={styles.linkBtn}>刷新</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.tokenText}>
            {token ? token.slice(0, 50) + '...' : '(无 token，未登录)'}
          </Text>
        </View>

        {/* ==================== API 测试 ==================== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>API 接口测试</Text>
            <TouchableOpacity onPress={runAllTests} style={styles.runAllBtn}>
              <Text style={styles.runAllBtnText}>全部测试</Text>
            </TouchableOpacity>
          </View>

          {API_TESTS.map((test) => {
            const r = results[test.key];
            return (
              <TouchableOpacity
                key={test.key}
                style={[
                  styles.testItem,
                  activeResult === test.key && styles.testItemActive,
                ]}
                onPress={() => runTest(test)}
              >
                <View style={styles.testItemLeft}>
                  {r?.status === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    renderStatusTag(r?.status || 'idle')
                  )}
                  <Text style={styles.testItemLabel}>{test.label}</Text>
                </View>
                <View style={styles.testItemRight}>
                  {r?.duration != null && (
                    <Text style={styles.durationText}>{r.duration}ms</Text>
                  )}
                  {r && (r.status === 'success' || r.status === 'error') && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setActiveResult(test.key);
                      }}
                    >
                      <Text style={styles.linkBtn}>查看</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ==================== 响应查看器 ==================== */}
        {activeData && (activeData.status === 'success' || activeData.status === 'error') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                响应详情 - {activeData.status === 'success' ? '✅ 成功' : '❌ 失败'}
                {activeData.duration ? ` (${activeData.duration}ms)` : ''}
              </Text>
              <TouchableOpacity onPress={() => setExpandedJson(!expandedJson)}>
                <Text style={styles.linkBtn}>{expandedJson ? '折叠' : '展开'}</Text>
              </TouchableOpacity>
            </View>
            {activeData.error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>错误: {activeData.error}</Text>
              </View>
            )}
            <ScrollView
              style={styles.jsonViewer}
              horizontal={false}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.jsonText}>
                {expandedJson
                  ? formatJson(activeData.data)
                  : formatJson(activeData.data).slice(0, 200) + '...'}
              </Text>
            </ScrollView>
          </View>
        )}

        {/* ==================== UI 组件预览 ==================== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>UI 组件预览</Text>

          <Text style={styles.subLabel}>颜色主题</Text>
          <View style={styles.colorRow}>
            {Object.entries(colors).map(([name, color]) => (
              <View key={name} style={styles.colorItem}>
                <View style={[styles.colorSwatch, { backgroundColor: color }]} />
                <Text style={styles.colorName}>{name}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.subLabel}>按钮样式</Text>
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.previewBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.previewBtnText}>主要按钮</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.previewBtn, { backgroundColor: colors.success }]}>
              <Text style={styles.previewBtnText}>成功按钮</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.previewBtn, { backgroundColor: colors.error }]}>
              <Text style={styles.previewBtnText}>危险按钮</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subLabel}>Switch 开关</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>自动登录后执行测试</Text>
            <Switch
              value={autoLogin}
              onValueChange={setAutoLogin}
              trackColor={{ false: '#d9d9d9', true: colors.primary }}
            />
          </View>
        </View>

        {/* ==================== 环境信息 ==================== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>环境信息</Text>
          <Text style={styles.envText}>API baseURL: {apiClient.defaults.baseURL}</Text>
          <Text style={styles.envText}>Timeout: {apiClient.defaults.timeout}ms</Text>
          <Text style={styles.envText}>Content-Type: {apiClient.defaults.headers['Content-Type']}</Text>
          <Text style={styles.envText}>已登录: {user ? '是' : '否'}</Text>
          <Text style={styles.envText}>Token 存储: SecureStore (expo-secure-store)</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ==================== 样式 ====================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.error,
    borderRadius: 6,
  },
  clearBtnText: {
    color: '#fff',
    fontSize: 12,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    width: 100,
    fontSize: 14,
    color: '#666',
  },
  valueText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.text,
  },
  accountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accountBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f0f5ff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#adc6ff',
  },
  accountBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.primary,
  },
  accountBtnSub: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  userInfoBox: {
    backgroundColor: '#f6ffed',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#b7eb8f',
  },
  userInfoText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  logoutBtn: {
    marginTop: 8,
    backgroundColor: colors.error,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#fff',
    fontSize: 14,
  },
  tokenText: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  runAllBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  runAllBtnText: {
    color: '#fff',
    fontSize: 13,
  },
  testItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 6,
  },
  testItemActive: {
    borderColor: colors.primary,
    backgroundColor: '#f0f5ff',
  },
  testItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  testItemLabel: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  testItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationText: {
    fontSize: 11,
    color: '#999',
  },
  linkBtn: {
    color: colors.primary,
    fontSize: 13,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  errorBox: {
    backgroundColor: '#fff2f0',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ffccc7',
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
  },
  jsonViewer: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 10,
    maxHeight: 400,
  },
  jsonText: {
    fontSize: 11,
    color: '#d4d4d4',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  subLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 10,
    marginBottom: 6,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorItem: {
    alignItems: 'center',
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginBottom: 4,
  },
  colorName: {
    fontSize: 10,
    color: '#999',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  previewBtnText: {
    color: '#fff',
    fontSize: 13,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 14,
    color: colors.text,
  },
  envText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 20,
    fontFamily: 'monospace',
  },
});
