/**
 * 同事通讯录：搜索 + 按部门分组的同事卡片（消息 / 电话）
 * 数据源：/employees/directory（全体员工可见，仅返回协作所需联系方式）
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Tone = 'primary' | 'success' | 'info' | 'warning';

interface Colleague {
  id: string;
  employee_no?: string | null;
  full_name?: string | null;
  position?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  wechat?: string | null;
  line?: string | null;
}

const TONE_ORDER: Tone[] = ['primary', 'success', 'info', 'warning'];

const TONE_COLOR: Record<Tone, string> = {
  primary: colors.primary,
  success: colors.success,
  info: colors.info,
  warning: colors.warning,
};

const TONE_RGB: Record<Tone, string> = {
  primary: colors.primaryRgb,
  success: colors.successRgb,
  info: colors.infoRgb,
  warning: colors.warningRgb,
};

export default function ContactScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/employees/directory');
      const data = res.data as { items?: Colleague[]; departments?: string[] };
      setColleagues(data?.items ?? []);
      setDepartments(data?.departments ?? []);
      setFailed(false);
    } catch {
      setColleagues([]);
      setDepartments([]);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // 部门分组（顺序沿用后端返回的部门清单，过滤后仍保留出现顺序）
  const groups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const visible = colleagues.filter((e) => {
      if (!kw) return true;
      return [e.full_name, e.position, e.department, e.phone, e.employee_no]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(kw);
    });
    const byDept = new Map<string, Colleague[]>();
    visible.forEach((e) => {
      const key = e.department || '其他';
      if (!byDept.has(key)) byDept.set(key, []);
      byDept.get(key)!.push(e);
    });
    const order = departments.filter((d) => byDept.has(d));
    const rest = [...byDept.keys()].filter((k) => !order.includes(k)).sort();
    return [...order, ...rest].map((dept, idx) => ({
      dept,
      tone: TONE_ORDER[idx % TONE_ORDER.length],
      members: byDept.get(dept) ?? [],
    }));
  }, [colleagues, departments, keyword]);

  const total = groups.reduce((sum, g) => sum + g.members.length, 0);

  const callPhone = async (phone?: string | null, name?: string | null) => {
    if (!phone) {
      Alert.alert('暂无电话', `${name || '该同事'}未登记联系电话`);
      return;
    }
    try {
      await Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
    } catch {
      Alert.alert(name || '联系电话', phone);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingState label="正在加载通讯录…" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* 搜索 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索姓名/部门"
          placeholderTextColor={colors.ink3}
        />
        {keyword ? (
          <TouchableOpacity onPress={() => setKeyword('')} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={16} color={colors.ink3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {failed ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="通讯录加载失败"
          sub="请检查网络后下拉刷新重试"
          actionLabel="重新加载"
          onAction={() => load()}
        />
      ) : total === 0 ? (
        <EmptyState
          icon="people-outline"
          title={keyword ? '没有找到同事' : '暂无同事信息'}
          sub={keyword ? '换个关键词试试' : '组织内同事登记后会展示在这里'}
        />
      ) : (
        groups.map((g) => (
          <View key={g.dept} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{g.dept}</Text>
              <View style={[styles.countBadge, { backgroundColor: colors.alpha(TONE_RGB[g.tone], 0.12) }]}>
                <Text style={[styles.countBadgeText, { color: TONE_COLOR[g.tone] }]}>
                  {g.members.length} 人
                </Text>
              </View>
            </View>
            {g.members.map((e, idx) => {
              const tone = TONE_ORDER[idx % TONE_ORDER.length];
              return (
                <View
                  key={e.id}
                  style={[styles.row, idx === 0 && styles.rowFirst]}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.alpha(TONE_RGB[tone], 0.12) }]}>
                    <Text style={[styles.avatarText, { color: TONE_COLOR[tone] }]}>
                      {(e.full_name || '?').charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={1}>
                      {e.full_name || '—'}
                    </Text>
                    <Text style={styles.position} numberOfLines={1}>
                      {e.position || e.employee_no || '同事'}
                    </Text>
                    <Text style={styles.phone} numberOfLines={1}>
                      {e.phone || '未登记电话'}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.iconBtnGhost}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('ChatList')}
                    >
                      <Ionicons name="chatbubble-outline" size={15} color={colors.ink2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtnPrimary}
                      activeOpacity={0.7}
                      onPress={() => callPhone(e.phone, e.full_name)}
                    >
                      <Ionicons name="call-outline" size={15} color={colors.primaryForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: colors.spacing.lg, paddingBottom: 32 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: colors.spacing.lg,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.md,
    ...colors.shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: colors.spacing.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  countBadge: { borderRadius: colors.radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  countBadgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: colors.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  rowFirst: { borderTopWidth: 0 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: colors.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: colors.spacing.md,
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  position: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  phone: {
    fontSize: 13,
    color: colors.ink2,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  actions: { flexDirection: 'row', gap: 6, marginLeft: colors.spacing.sm },
  iconBtnGhost: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPrimary: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});