import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/stores/auth';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import { useI18n, LANG_LABELS, LANGS, type AppLang } from '@/i18n';
import type { UserRole } from '@/types';

const roleLabels: Record<UserRole, string> = {
  owner: '业主',
  tenant: '租客',
  agent: '经纪人',
  employee: '员工',
  admin: '管理员',
};

interface FuncEntry {
  key: string;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  navigate: string;
}

// 各角色「我的」常用功能（按角色差异化；路由必须已在 RootNavigator 注册）
const FUNC_BY_ROLE: Record<UserRole, FuncEntry[]> = {
  // 业主：资产相关
  owner: [
    { key: 'properties', labelKey: 'profile.myProperties', icon: 'business', navigate: 'OwnerPortal' },
    { key: 'income', labelKey: 'profile.income', icon: 'wallet', navigate: 'OwnerIncome' },
    { key: 'services', labelKey: 'profile.services', icon: 'sparkles', navigate: 'OwnerServices' },
    { key: 'documents', labelKey: 'profile.docs', icon: 'folder-open', navigate: 'OwnerDocuments' },
  ],
  // 租客：租约/缴费/报修/看房
  tenant: [
    { key: 'payments', labelKey: 'profile.payments', icon: 'card', navigate: 'Payments' },
    { key: 'documents', labelKey: 'profile.docs', icon: 'folder-open', navigate: 'Documents' },
    { key: 'maintenance', labelKey: 'profile.maintenance', icon: 'construct', navigate: 'TenantMaintenance' },
    { key: 'viewings', labelKey: 'profile.viewings', icon: 'eye', navigate: 'Viewings' },
  ],
  // 经纪/员工：销售工作台
  agent: [
    { key: 'properties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'EmployeeProperties' },
    { key: 'crm', labelKey: 'profile.crm', icon: 'people', navigate: 'CRM' },
    { key: 'performance', labelKey: 'profile.performance', icon: 'stats-chart', navigate: 'Performance' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
  ],
  employee: [
    { key: 'properties', labelKey: 'profile.manageProperties', icon: 'business', navigate: 'EmployeeProperties' },
    { key: 'crm', labelKey: 'profile.crm', icon: 'people', navigate: 'CRM' },
    { key: 'performance', labelKey: 'profile.performance', icon: 'stats-chart', navigate: 'Performance' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
  ],
  // 管理员：系统管理（员工/考勤/备份/地图；员工管理在管理员工作台内）
  admin: [
    { key: 'employees', labelKey: 'profile.employees', icon: 'people', navigate: 'Main' },
    { key: 'attendance', labelKey: 'profile.attendance', icon: 'location', navigate: 'Attendance' },
    { key: 'backup', labelKey: 'profile.backup', icon: 'cloud-upload', navigate: 'Backup' },
    { key: 'map', labelKey: 'profile.map', icon: 'map', navigate: 'Map' },
  ],
};

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [langVisible, setLangVisible] = useState(false);
  const { lang, setLang, t } = useI18n();
  const navigation = useNavigation<any>();

  const handleLogout = () => {
    const doLogout = () => logout();
    // react-native-web 下 Alert.alert 是空实现，需用浏览器原生 confirm
    if (Platform.OS === 'web') {
      if (window.confirm('确定要退出登录吗？')) {
        doLogout();
      }
      return;
    }
    Alert.alert('退出登录', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定', style: 'destructive', onPress: doLogout },
    ]);
  };

  const currentLang = LANG_LABELS[lang];

  // 当前角色的常用功能；未登录/未知角色给通用兜底
  const entries = user ? FUNC_BY_ROLE[user.role] ?? FUNC_BY_ROLE.tenant : FUNC_BY_ROLE.tenant;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 个人信息 */}
      <View style={styles.userHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? user?.full_name ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.name ?? user?.full_name ?? '未知用户'}</Text>
          <Text style={styles.userMeta}>
            {user ? roleLabels[user.role] : '未登录'} · {user?.email ?? '-'}
          </Text>
        </View>
      </View>

      {/* 常用功能（按角色差异化） */}
      <Card title="常用功能">
        {entries.map((entry, idx) => (
          <TouchableOpacity
            key={entry.key}
            style={[styles.settingRow, idx < entries.length - 1 && styles.settingRowBorder]}
            onPress={() => navigation.navigate(entry.navigate)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.sidebarActive }]}>
                <Ionicons name={entry.icon} size={17} color={colors.primary} />
              </View>
              <Text style={styles.settingLabel}>{t(entry.labelKey)}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}
      </Card>

      <Card title={t('profile.settings')}>
        <TouchableOpacity style={styles.settingRow} onPress={() => setLangVisible(true)}>
          <Text style={styles.settingLabel}>{t('profile.language')}</Text>
          <View style={styles.settingRight}>
            <Text style={styles.settingValue}>{currentLang}</Text>
            <Text style={styles.arrow}>›</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => navigation.navigate('Test')}
        >
          <Text style={styles.settingLabel}>{t('profile.testPanel')}</Text>
          <View style={styles.settingRight}>
            <Text style={styles.arrow}>›</Text>
          </View>
        </TouchableOpacity>
      </Card>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>

      <Modal
        visible={langVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>选择语言</Text>
            {LANGS.map((id: AppLang) => (
              <TouchableOpacity
                key={id}
                style={styles.langRow}
                onPress={() => {
                  setLang(id);
                  setLangVisible(false);
                }}
              >
                <Text style={styles.langText}>{LANG_LABELS[id]}</Text>
                {lang === id ? <Text style={styles.check}>✓</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingVertical: 16,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primaryForeground,
    fontSize: 24,
    fontWeight: '700',
  },
  userInfo: {
    marginLeft: 14,
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  userMeta: {
    fontSize: 13,
    color: colors.ink3,
    marginTop: 4,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  settingRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: colors.ink2,
    marginRight: 8,
  },
  arrow: {
    fontSize: 20,
    color: colors.ink3,
  },
  logoutButton: {
    backgroundColor: colors.surface,
    marginHorizontal: 12,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  langText: {
    fontSize: 15,
    color: colors.text,
  },
  check: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '600',
  },
});