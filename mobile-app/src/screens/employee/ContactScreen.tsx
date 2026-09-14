/**
 * 同事通讯录：同事列表 + 部门筛选 + 复制电话 + 紧急联系人
 * 数据源：/employees，接口失败或为空时回退静态示例（与 Web 端一致）
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { employeesApi } from '@/services/api';

type Tone = 'primary' | 'success' | 'info' | 'warning';

interface Colleague {
  id: string;
  full_name?: string | null;
  position?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  _tone?: Tone;
}

// 部门 → 徽章/头像色调
const DEPT_TONE: Record<string, Tone> = {
  销售部: 'primary',
  运营部: 'success',
  技术部: 'info',
  财务部: 'warning',
};

const TONE_COLOR: Record<Tone, string> = {
  primary: colors.primary,
  success: colors.success,
  info: colors.info,
  warning: colors.warning,
};

const DEPARTMENTS = ['全部', '销售部', '运营部', '技术部', '财务部'];

// 接口不可用/为空时回退的示例同事（与 Web 端风格一致）
const STATIC_CONTACTS: Colleague[] = [
  { id: 's1', full_name: '王明华', position: '销售经理', department: '销售部', phone: '+60 12-345 6789', _tone: 'primary' },
  { id: 's2', full_name: '李婷婷', position: '销售代表', department: '销售部', phone: '+60 12-888 2233', _tone: 'success' },
  { id: 's3', full_name: '张伟强', position: '运营主管', department: '运营部', phone: '+60 16-220 4455', _tone: 'info' },
  { id: 's4', full_name: '陈晓琳', position: '运营专员', department: '运营部', phone: '+60 11-557 8899', _tone: 'warning' },
  { id: 's5', full_name: '刘建国', position: '技术总监', department: '技术部', phone: '+60 18-332 1100', _tone: 'primary' },
  { id: 's6', full_name: '黄思琪', position: '前端工程师', department: '技术部', phone: '+60 17-661 2456', _tone: 'success' },
  { id: 's7', full_name: '周建华', position: '财务主管', department: '财务部', phone: '+60 15-778 9900', _tone: 'info' },
  { id: 's8', full_name: '吴美玲', position: '会计', department: '财务部', phone: '+60 13-229 6677', _tone: 'warning' },
];

const EMERGENCY_CONTACTS = [
  { name: '赵国栋', position: '总经理', phone: '+60 12-999 0001', tone: 'primary' as Tone },
  { name: '孙慧敏', position: '人力资源主管', phone: '+60 12-999 0002', tone: 'success' as Tone },
  { name: '周凯文', position: 'IT 技术支持', phone: '+60 12-999 0003', tone: 'info' as Tone },
];

const getTone = (e: Colleague): Tone => {
  if (e._tone) return e._tone;
  if (e.department && DEPT_TONE[e.department]) return DEPT_TONE[e.department];
  return 'primary';
};

const copyText = async (text: string, label: string) => {
  try {
    const nc = (globalThis as any).navigator;
    if (nc?.clipboard?.writeText) {
      await nc.clipboard.writeText(text);
      Alert.alert('已复制', `${label}：${text}`);
      return;
    }
  } catch {
    // 走兜底
  }
  Alert.alert(label, text);
};

export default function ContactScreen() {
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [department, setDepartment] = useState('全部');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await employeesApi.list({ pageSize: 500 });
      const raw = res?.data ?? res;
      const items = Array.isArray(raw) ? raw : raw?.items ?? [];
      setColleagues(items.length ? items : STATIC_CONTACTS);
    } catch {
      // 接口不可用时用静态示例，不影响查看
      setColleagues(STATIC_CONTACTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return colleagues.filter((e) => {
      if (department !== '全部' && (e.department || '') !== department) return false;
      if (!kw) return true;
      const name = (e.full_name || '').toLowerCase();
      const pos = (e.position || '').toLowerCase();
      const phone = (e.phone || '').toLowerCase();
      return name.includes(kw) || pos.includes(kw) || phone.includes(kw);
    });
  }, [colleagues, keyword, department]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 搜索 + 部门筛选 */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <TextInput
          style={styles.searchInput}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="按姓名、职位或电话搜索"
          placeholderTextColor={colors.ink3}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.depRow}
        style={styles.depScroll}
      >
        {DEPARTMENTS.map((d) => (
          <TouchableOpacity
            key={d}
            activeOpacity={0.7}
            onPress={() => setDepartment(d)}
            style={[styles.depChip, department === d && styles.depChipActive]}
          >
            <Text style={[styles.depChipText, department === d && styles.depChipTextActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.countRow}>
        共 {visible.length} 位同事
      </Text>

      {loading ? (
        <LoadingState label="正在加载通讯录…" />
      ) : visible.length === 0 ? (
        <EmptyState icon="people-outline" title="没有找到同事" sub="换个关键词或部门试试" />
      ) : (
        <View style={styles.list}>
          {visible.map((e) => {
            const tone = getTone(e);
            const initial = (e.full_name || '?').charAt(0);
            return (
              <View key={e.id} style={styles.card}>
                <View style={[styles.avatar, { backgroundColor: `${TONE_COLOR[tone]}1f` }]}>
                  <Text style={[styles.avatarText, { color: TONE_COLOR[tone] }]}>{initial}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={styles.name} numberOfLines={1}>{e.full_name || '-'}</Text>
                    {e.department ? (
                      <View style={[styles.deptBadge, { backgroundColor: `${TONE_COLOR[tone]}1a` }]}>
                        <Text style={[styles.deptBadgeText, { color: TONE_COLOR[tone] }]}>{e.department}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.position}>{e.position || '同事'}</Text>
                  {e.phone ? (
                    <TouchableOpacity style={styles.phoneRow} activeOpacity={0.6} onPress={() => copyText(e.phone!, '手机号')}>
                      <Text style={styles.phone}>{e.phone}</Text>
                      <Text style={styles.copy}>复制</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* 紧急联系人 */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionIcon}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.error} />
          </View>
          <Text style={styles.sectionTitle}>紧急联系人</Text>
        </View>
        <View style={styles.emergencyBadge}>
          <Text style={styles.emergencyBadgeText}>7×24 应急</Text>
        </View>
      </View>
      <View style={styles.list}>
        {EMERGENCY_CONTACTS.map((c) => (
          <View key={c.name} style={styles.card}>
            <View style={[styles.avatar, { backgroundColor: `${TONE_COLOR[c.tone]}1f` }]}>
              <Text style={[styles.avatarText, { color: TONE_COLOR[c.tone] }]}>{c.name.charAt(0)}</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.position}>{c.position}</Text>
              </View>
              <TouchableOpacity style={styles.phoneRow} activeOpacity={0.6} onPress={() => copyText(c.phone, '电话')}>
                <Text style={styles.phone}>{c.phone}</Text>
                <Text style={styles.copy}>复制</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },

  depScroll: { marginHorizontal: -16, marginBottom: 2 },
  depRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  depChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  depChipActive: { backgroundColor: colors.primary },
  depChipText: { fontSize: 13, color: colors.ink2, fontWeight: '500' },
  depChipTextActive: { color: colors.primaryForeground, fontWeight: '600' },

  countRow: { fontSize: 12, color: colors.ink3, marginTop: 8, marginBottom: 10 },

  list: { gap: 10, marginBottom: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...colors.shadow.sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  deptBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  deptBadgeText: { fontSize: 10, fontWeight: '600' },
  position: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  phone: { fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] },
  copy: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(220,38,38,0.1)', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  emergencyBadge: { backgroundColor: 'rgba(220,38,38,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  emergencyBadgeText: { fontSize: 11, fontWeight: '600', color: colors.error },
});