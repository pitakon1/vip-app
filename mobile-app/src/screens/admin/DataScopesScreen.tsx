/**
 * 数据范围（管理端「我的 → 系统管理 → 数据范围」全屏子页）。
 *
 * 对齐 Web 端 `/system/data-scopes`：按角色配置默认可见范围，并查看/清除个别用户的
 * 例外覆盖（用户级优先于角色级）。App 端聚焦角色级配置与既有用户覆盖的查看/清除。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { notify, notifyError } from '@/utils/feedback';
import { dataScopeAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';

interface RoleScope {
  role: string;
  scope: string;
  configured: boolean;
}

interface UserScope {
  user_id: string;
  full_name?: string;
  email?: string;
  role?: string;
  scope: string;
}

interface ScopeView {
  roles: RoleScope[];
  users: UserScope[];
  values: string[];
}

const SCOPE_LABEL: Record<string, string> = {
  self: 'scope.self',
  department: 'scope.department',
  department_and_below: 'scope.departmentAndBelow',
  all: 'scope.all',
};

export default function DataScopesScreen() {
  const { t } = useI18n();
  const [data, setData] = useState<ScopeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const scopeLabel = useCallback(
    (v: string) => {
      const key = SCOPE_LABEL[v];
      const label = key ? t(key) : v;
      return label === key ? v : label;
    },
    [t],
  );

  const roleLabel = useCallback(
    (r: string) => {
      const key = `perm.role.${r}`;
      const label = t(key);
      return label === key ? r : label;
    },
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await dataScopeAdminApi.get();
      setData(res?.data ?? res);
    } catch (e) {
      notifyError(t('scope.loadFailed'), e);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const values = useMemo(
    () => data?.values ?? ['self', 'department', 'department_and_below', 'all'],
    [data],
  );

  const setRoleScope = async (role: string, scope: string) => {
    setSaving(true);
    try {
      await dataScopeAdminApi.setRole(role, scope);
      notify(t('scope.title'), t('scope.saved'));
      load();
    } catch (e) {
      notifyError(t('scope.saveFailed'), e);
    } finally {
      setSaving(false);
    }
  };

  const clearUser = (u: UserScope) => {
    Alert.alert(t('scope.clear'), t('scope.clearConfirm'), [
      { text: t('scope.cancel'), style: 'cancel' },
      {
        text: t('scope.clear'),
        style: 'destructive',
        onPress: async () => {
          try {
            await dataScopeAdminApi.clearUser(u.user_id);
            notify(t('scope.title'), t('scope.cleared'));
            load();
          } catch (e) {
            notifyError(t('scope.clearFailed'), e);
          }
        },
      },
    ]);
  };

  if (loading || !data) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>{t('scope.roleSection')}</Text>
        {data.roles.map((r) => (
          <View key={r.role} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.name}>{roleLabel(r.role)}</Text>
              <Text style={[styles.sourceTag, r.configured ? styles.sourceOn : styles.sourceOff]}>
                {r.configured ? t('scope.configured') : t('scope.builtinDefault')}
              </Text>
            </View>
            <View style={styles.chipRow}>
              {values.map((v) => {
                const on = r.scope === v;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[styles.chip, on && styles.chipOn]}
                    activeOpacity={0.8}
                    disabled={saving}
                    onPress={() => setRoleScope(r.role, v)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{scopeLabel(v)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={[styles.section, { marginTop: 20 }]}>{t('scope.userSection')}</Text>
        {data.users.length === 0 ? (
          <Text style={styles.empty}>{t('scope.userEmpty')}</Text>
        ) : (
          data.users.map((u) => (
            <View key={u.user_id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.name}>{u.full_name || u.email || u.user_id}</Text>
                <TouchableOpacity onPress={() => clearUser(u)} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
              <Text style={styles.meta}>
                {u.role ? roleLabel(u.role) : ''} · {scopeLabel(u.scope)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  loading: { marginTop: 40 },
  section: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  empty: { fontSize: 13, color: colors.ink3, paddingVertical: 8 },
  card: {
    padding: 14,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 10,
    ...colors.shadow.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { marginTop: 6, fontSize: 12, color: colors.ink3 },
  sourceTag: { fontSize: 11, fontWeight: '600' },
  sourceOn: { color: colors.primary },
  sourceOff: { color: colors.ink3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.sidebarActive, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.ink2 },
  chipTextOn: { color: colors.primary, fontWeight: '700' },
});
