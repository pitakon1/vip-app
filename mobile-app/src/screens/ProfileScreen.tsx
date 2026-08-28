import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/stores/auth';
import Card from '@/components/Card';
import colors from '@/theme/colors';
import type { UserRole } from '@/types';

const roleLabels: Record<UserRole, string> = {
  owner: '业主',
  tenant: '租客',
  agent: '经纪人',
  employee: '员工',
  admin: '管理员',
};

const LANGUAGES = [
  { id: 'zh', label: '简体中文' },
  { id: 'en', label: 'English' },
];

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [langVisible, setLangVisible] = useState(false);
  const [lang, setLang] = useState('zh');
  const navigation = useNavigation<any>();

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const currentLang = LANGUAGES.find((l) => l.id === lang) ?? LANGUAGES[0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card title="个人信息">
        <View style={styles.row}>
          <Text style={styles.label}>姓名</Text>
          <Text style={styles.value}>{user?.name ?? '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>邮箱</Text>
          <Text style={styles.value}>{user?.email ?? '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>角色</Text>
          <Text style={styles.value}>{user ? roleLabels[user.role] : '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>用户名</Text>
          <Text style={styles.value}>{user?.username ?? '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>手机</Text>
          <Text style={styles.value}>{user?.phone ?? '-'}</Text>
        </View>
      </Card>

      <Card title="设置">
        <TouchableOpacity style={styles.settingRow} onPress={() => setLangVisible(true)}>
          <Text style={styles.settingLabel}>语言</Text>
          <View style={styles.settingRight}>
            <Text style={styles.settingValue}>{currentLang.label}</Text>
            <Text style={styles.arrow}>›</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => navigation.navigate('Test')}
        >
          <Text style={styles.settingLabel}>测试调试面板</Text>
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
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.id}
                style={styles.langRow}
                onPress={() => {
                  setLang(l.id);
                  setLangVisible(false);
                }}
              >
                <Text style={styles.langText}>{l.label}</Text>
                {lang === l.id ? <Text style={styles.check}>✓</Text> : null}
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 14,
    color: '#999',
  },
  value: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingLabel: {
    fontSize: 14,
    color: colors.text,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  arrow: {
    fontSize: 20,
    color: '#ccc',
  },
  logoutButton: {
    backgroundColor: '#fff',
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
    backgroundColor: '#fff',
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
    borderBottomColor: '#eee',
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
