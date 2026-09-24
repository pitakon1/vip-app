/**
 * 角色权限配置（管理端「我的 → 角色权限」全屏下钻子页）。
 *
 * 对齐 Web 端 `/system/permissions`：选角色 → 按类目勾选权限点 → 保存后即时生效。
 * 后端 RBAC 读写（GET/PUT `/admin/permissions/roles/{role}`）早已就绪，但 App 端
 * 一直没有入口，管理员在手机上无法调整任何角色的权限，只能回到 Web 操作。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { notify, notifyError } from '@/utils/feedback';
import { permissionsAdminApi } from '@/services/api';
import { useI18n } from '@/i18n';

interface PermissionItem {
  code: string;
  name: string;
  description?: string | null;
}

/** 角色顺序与文案对齐 Web 端 System/Permissions.tsx（文案走 i18n：perm.role.*） */
const ROLE_KEYS = ['admin', 'agent', 'employee', 'owner', 'tenant'] as const;

/** 权限点 code → i18n key（system:settings → perm.system.settings），缺失时回落后端中文 */
const permKey = (code: string) => `perm.${code.replace(/:/g, '.')}`;

export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [categories, setCategories] = useState<Record<string, PermissionItem[]>>({});
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [role, setRole] = useState('admin');
  const [checked, setChecked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /** 类目文案（后端 Permission.category 取值） */
  const catLabel = (cat: string) => {
    const label = t(`perm.cat.${cat}`);
    return label === `perm.cat.${cat}` ? cat : label;
  };
  /** 权限点名 / 描述：优先 i18n，缺失时回落后端返回的中文 */
  const permName = (p: PermissionItem) => {
    const label = t(permKey(p.code));
    return label === permKey(p.code) ? p.name : label;
  };
  const permDesc = (p: PermissionItem) => {
    if (!p.description) return '';
    const desc = t(`${permKey(p.code)}.desc`);
    return desc === `${permKey(p.code)}.desc` ? p.description : desc;
  };

  // 一次拉全量（权限点分组 + 各角色分配），切换角色只做本地切换，不重复请求
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await permissionsAdminApi.list();
      const d = data?.data ?? data;
      setCategories(d?.categories ?? {});
      setRoles(d?.roles ?? {});
    } catch (e) {
      notifyError(t('perm.loadFailed'), e);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // 切换角色 / 重新拉取 / 保存成功后，勾选态回到该角色的最新分配
  useEffect(() => {
    setChecked(roles[role] ?? []);
  }, [role, roles]);

  const total = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);

  const toggle = (code: string) =>
    setChecked((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );

  const toggleCat = (codes: string[]) => {
    const allOn = codes.length > 0 && codes.every((c) => checked.includes(c));
    setChecked((prev) =>
      allOn
        ? prev.filter((c) => !codes.includes(c))
        : Array.from(new Set([...prev, ...codes])),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await permissionsAdminApi.setRole(role, checked);
      const d = data?.data ?? data;
      const saved: string[] = d?.permissions ?? checked;
      setRoles((prev) => ({ ...prev, [role]: saved }));
      notify(t('perm.savedTitle'), t('perm.savedMsg', { label: t(`perm.role.${role}`) }));
    } catch (e) {
      notifyError(t('perm.saveFailed'), e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 角色切换 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.roleRow}
        >
          {ROLE_KEYS.map((key) => {
            const active = role === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.roleChip, active && styles.roleChipActive]}
                activeOpacity={0.8}
                onPress={() => setRole(key)}
              >
                <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                  {t(`perm.role.${key}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : (
          <>
            <Text style={styles.summary}>
              {t('perm.selectedCount', { n: checked.length, total })}
            </Text>

            {/* 按类目一键全选 */}
            <View style={styles.quickRow}>
              {Object.entries(categories).map(([cat, perms]) => {
                const codes = perms.map((p) => p.code);
                const allOn = codes.length > 0 && codes.every((c) => checked.includes(c));
                const someOn = codes.some((c) => checked.includes(c));
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.quickChip, allOn && styles.quickChipOn]}
                    activeOpacity={0.8}
                    onPress={() => toggleCat(codes)}
                  >
                    <View style={styles.quickChipInner}>
                      <Ionicons
                        name={allOn ? 'checkbox' : someOn ? 'remove-circle-outline' : 'add-circle-outline'}
                        size={13}
                        color={allOn || someOn ? colors.primary : colors.ink3}
                      />
                      <Text
                        style={[
                          styles.quickChipText,
                          (allOn || someOn) && styles.quickChipTextOn,
                        ]}
                      >
                        {t('perm.selectAll')} · {catLabel(cat)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 权限点分组勾选 */}
            {Object.entries(categories).map(([cat, perms]) => (
              <View key={cat} style={styles.card}>
                <Text style={styles.cardTitle}>{catLabel(cat)}</Text>
                {perms.map((p) => {
                  const on = checked.includes(p.code);
                  return (
                    <TouchableOpacity
                      key={p.code}
                      style={styles.permRow}
                      activeOpacity={0.7}
                      onPress={() => toggle(p.code)}
                    >
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={on ? colors.primary : colors.ink3}
                      />
                      <View style={styles.permText}>
                        <Text style={styles.permName}>{permName(p)}</Text>
                        {p.description ? (
                          <Text style={styles.permDesc}>{permDesc(p)}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.saveBtn, (saving || loading) && styles.saveBtnDisabled]}
          activeOpacity={0.8}
          disabled={saving || loading}
          onPress={save}
        >
          <Text style={styles.saveText}>{saving ? t('perm.saving') : t('perm.save')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  loading: {
    marginTop: 40,
  },
  roleRow: {
    gap: 8,
    paddingBottom: 4,
  },
  roleChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  roleChipActive: {
    backgroundColor: colors.sidebarActive,
    borderColor: colors.primary,
  },
  roleChipText: {
    fontSize: 14,
    color: colors.ink2,
  },
  roleChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  summary: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink2,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickChipOn: {
    backgroundColor: colors.sidebarActive,
    borderColor: colors.primary,
  },
  quickChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickChipText: {
    fontSize: 12,
    color: colors.ink3,
  },
  quickChipTextOn: {
    color: colors.primary,
    fontWeight: '600',
  },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 10,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
  },
  permText: {
    flex: 1,
    minWidth: 0,
  },
  permName: {
    fontSize: 14,
    color: colors.text,
  },
  permDesc: {
    marginTop: 2,
    fontSize: 12,
    color: colors.ink3,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  saveBtn: {
    paddingVertical: 13,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primaryForeground,
  },
});
