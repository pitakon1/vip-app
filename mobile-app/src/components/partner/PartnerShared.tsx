/**
 * 合作公司控制台（PartnerHubScreen 新增 Tab）共用的小组件与工具。
 * 仅承载跨 6 个 Tab 复用的样式/格式化/选择器，不包含业务请求。
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';

export interface PartnerMemberLite {
  id: string;
  /** 员工档案 id（排班/分配接口按它校验；管理员账号没有员工档案，为空） */
  employee_id?: string | null;
  full_name?: string | null;
  email?: string | null;
}

/** axios 响应体可能被包一层 { data: ... } */
export const unwrapBody = <T,>(body: any): T => (body?.data ?? body) as T;

export const symOf = (c?: string | null) =>
  c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : c === 'EUR' ? '€' : '฿';

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO 时间 → YYYY-MM-DD */
export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** ISO 时间 → YYYY-MM-DD HH:mm */
export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const currentMonthKey = () => todayKey().slice(0, 7);

export const shiftMonthKey = (key: string, delta: number) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** YYYY-MM → { start: YYYY-MM-01, end: YYYY-MM-末 } */
export const monthRange = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${key}-01`, end: `${key}-${pad(last)}` };
};

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

const TONE: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surface2, fg: colors.ink2 },
  success: { bg: colors.alpha(colors.successRgb, 0.12), fg: colors.successInk },
  warning: { bg: colors.alpha(colors.warningRgb, 0.12), fg: colors.warningInk },
  error: { bg: colors.alpha(colors.errorRgb, 0.12), fg: colors.errorInk },
  info: { bg: colors.alpha(colors.infoRgb, 0.12), fg: colors.infoInk },
};

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: BadgeTone }) {
  const c = TONE[tone];
  return (
    <View style={[shared.badge, { backgroundColor: c.bg }]}>
      <Text style={[shared.badgeText, { color: c.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** 语义化状态 → 翻译；翻译缺失时回退原始英文值。prefix 如 partner.status / lease.status */
export function statusText(
  t: (key: string, params?: Record<string, string | number>) => string,
  prefix: string,
  status?: string | null,
) {
  if (!status) return '—';
  const key = `${prefix}.${status}`;
  const val = t(key);
  return val === key ? status : val;
}

export function statusTone(status?: string | null): BadgeTone {
  if (!status) return 'neutral';
  if (['paid', 'approved', 'completed', 'succeeded', 'active', 'signed'].includes(status)) return 'success';
  if (['rejected', 'failed', 'cancelled', 'terminated', 'voided', 'revoked', 'no_show'].includes(status)) return 'error';
  if (['pending', 'processing', 'pending_approval', 'sent', 'partially_signed', 'confirmed'].includes(status)) return 'warning';
  return 'neutral';
}

/** 月份切换：‹ 2026-11 › */
export function MonthSwitcher({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={shared.monthBar}>
      <TouchableOpacity
        style={shared.monthBtn}
        activeOpacity={0.7}
        hitSlop={colors.touch.hitSlop}
        onPress={() => onChange(shiftMonthKey(value, -1))}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={16} color={colors.ink2} />
      </TouchableOpacity>
      <Text style={shared.monthText}>{value}</Text>
      <TouchableOpacity
        style={shared.monthBtn}
        activeOpacity={0.7}
        hitSlop={colors.touch.hitSlop}
        onPress={() => onChange(shiftMonthKey(value, 1))}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-forward" size={16} color={colors.ink2} />
      </TouchableOpacity>
    </View>
  );
}

export interface SubTabItem<K extends string> {
  key: K;
  label: string;
}

/** 二级 Tab（横向胶囊） */
export function SubTabs<K extends string>({
  items,
  value,
  onChange,
}: {
  items: SubTabItem<K>[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={shared.subTabScroll}
      contentContainerStyle={shared.subTabRow}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <TouchableOpacity
            key={it.key}
            style={[shared.subTab, active && shared.subTabActive]}
            activeOpacity={0.7}
            onPress={() => onChange(it.key)}
          >
            <Text style={[shared.subTabText, active && shared.subTabTextActive]} numberOfLines={1}>
              {it.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** 从本公司成员中挑选（分配线索 / 派发带看 / 新建排班共用） */
export function EmployeePickerModal({
  visible,
  title,
  members,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  members: PartnerMemberLite[];
  onClose: () => void;
  onPick: (member: PartnerMemberLite) => void;
}) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={shared.modalMask}>
        <View style={shared.modalCard}>
          <Text style={shared.modalTitle}>{title}</Text>
          {members.length === 0 ? (
            <Text style={shared.modalEmpty}>{t('partner.ld.noMembers')}</Text>
          ) : (
            <FlatList
              data={members}
              keyExtractor={(m) => String(m.id)}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={shared.pickRow} activeOpacity={0.7} onPress={() => onPick(item)}>
                  <Text style={shared.pickName} numberOfLines={1}>
                    {item.full_name || t('acc.unnamed')}
                  </Text>
                  {!!item.email && (
                    <Text style={shared.pickSub} numberOfLines={1}>
                      {item.email}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity
            style={[shared.modalBtn, shared.modalCancel, { marginTop: 12 }]}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Text style={shared.modalCancelText}>{t('acc.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** 文本输入弹层（客户报备 / 排班共用） */
export function FormModal({
  visible,
  title,
  children,
  saving,
  submitLabel,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  saving?: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={shared.modalMask}>
        <View style={shared.modalCard}>
          <Text style={shared.modalTitle}>{title}</Text>
          {children}
          <View style={shared.modalActions}>
            <TouchableOpacity
              style={[shared.modalBtn, shared.modalCancel]}
              activeOpacity={0.7}
              onPress={onClose}
            >
              <Text style={shared.modalCancelText}>{t('acc.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[shared.modalBtn, shared.modalOk, saving && shared.modalBtnDisabled]}
              activeOpacity={0.7}
              disabled={saving}
              onPress={onSubmit}
            >
              <Text style={shared.modalOkText}>{saving ? t('acc.saving') : submitLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const shared = StyleSheet.create({
  // 通用区块
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.xs, color: colors.ink3, lineHeight: colors.lineHeight.tight },
  errorText: { marginHorizontal: 20, marginTop: 12, fontSize: colors.fontSize.sm, color: colors.error },

  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  cardOverdue: { borderColor: colors.error, backgroundColor: colors.errorLight },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  rowSub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 3, lineHeight: colors.lineHeight.tight },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  chipLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, fontWeight: '500', lineHeight: colors.lineHeight.tight },
  chipValue: { fontSize: colors.fontSize.caption, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 10 },

  // 统计卡
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 20, marginTop: 12 },
  statCard: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 12,
    ...colors.shadow.sm,
  },
  statLabel: { fontSize: colors.fontSize.xs, color: colors.ink3, marginBottom: 6 },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },

  // 月份切换
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    gap: 10,
  },
  monthBtn: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },

  // 二级 Tab
  subTabScroll: { flexGrow: 0, marginTop: 10 },
  subTabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  subTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subTabActive: { backgroundColor: colors.surface, borderColor: colors.primary },
  subTabText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  subTabTextActive: { color: colors.primary, fontWeight: '700' },

  // 徽标
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.full, maxWidth: 120 },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '700', lineHeight: colors.lineHeight.tight },

  // 弹层
  modalMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 28 },
  modalCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 14 },
  modalEmpty: { fontSize: colors.fontSize.sm, color: colors.ink3, paddingVertical: 16 },
  pickRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickName: { fontSize: colors.fontSize.sm, fontWeight: '600', color: colors.ink },
  pickSub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 2 },
  modalLabel: { fontSize: 12, color: colors.ink2, marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 16,
  },
  modalInputError: { borderColor: colors.error },
  fieldError: { fontSize: 12, color: colors.error, marginTop: -10, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12 },
  modalCancel: { backgroundColor: colors.surface2 },
  modalCancelText: { color: colors.ink2, fontWeight: '600' },
  modalOk: { backgroundColor: colors.primary },
  modalOkText: { color: colors.primaryForeground, fontWeight: '700' },
  modalBtnDisabled: { opacity: 0.6 },
});
