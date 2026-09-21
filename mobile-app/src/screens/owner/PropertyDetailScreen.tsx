import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { documentsApi, paymentsApi, propertiesApi } from '@/services/api';
import { fmtMoney as money } from '@/utils/format';
import { documentFileUrl } from '@/lib/api';
import { useCachedQuery } from '@/lib/useCachedQuery';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** 业主房源详情参数：主 agent 需在 RootNavigator 注册 OwnerPropertyDetail: { id: string } */
type OwnerDetailParamList = {
  OwnerPropertyDetail: { id: string };
};

const formatDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '-');

interface PropertyDetail {
  id: string;
  room_number?: string;
  project_name?: string;
  address?: string;
  building?: string;
  status?: string;
  monthly_rent?: number;
  currency?: string;
  deposit_amount?: number;
  deposit_months?: number;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  /** 项目经纬度（取自所属项目，未维护时为缺省） */
  lat?: number;
  lng?: number;
}

interface PropertyLease {
  id: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  monthly_rent?: number;
  currency?: string;
  tenant_id?: string;
  tenant_name?: string;
}

interface OwnerPayment {
  id: string;
  property_id?: string;
  lease_id?: string;
  amount?: number;
  currency?: string;
  payment_type?: string;
  status?: string;
  due_date?: string;
  paid_at?: string;
  description?: string;
}

interface OwnerDocument {
  id: string;
  title?: string;
  type?: string;
  created_at?: string;
  [key: string]: any;
}

/* 文档类型映射（与 DocumentsScreen 一致） */
const DOC_TYPE_META: Record<
  string,
  { label: string; color: string; bg: string; icon: IoniconName }
> = {
  contract: { label: '合同', color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.1), icon: 'document-text-outline' },
  receipt: { label: '收据', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1), icon: 'receipt-outline' },
  inspection_photo: { label: '验房照片', color: colors.success, bg: colors.alpha(colors.successRgb, 0.1), icon: 'image-outline' },
  tax_invoice: { label: '税务发票', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1), icon: 'document-outline' },
  wht_certificate: { label: '代扣税凭证', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.1), icon: 'document-outline' },
  other: { label: '其他', color: colors.ink3, bg: colors.surface2, icon: 'folder-outline' },
};

const docMetaOf = (type?: string) => DOC_TYPE_META[type ?? ''] ?? DOC_TYPE_META.other;

const PAY_TYPE_LABEL: Record<string, string> = {
  rent: '租金',
  deposit: '押金',
  utility: '水电费',
  management: '物业费',
  maintenance: '维修费',
  other: '其他',
};

const payStatusMeta = (status?: string) => {
  const s = String(status || '').toLowerCase();
  if (s === 'paid' || s === 'succeeded') {
    return { label: '已到账', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) };
  }
  if (s === 'overdue') {
    return { label: '逾期', color: colors.error, bg: colors.alpha(colors.errorRgb, 0.12) };
  }
  if (s === 'pending' || s === 'processing') {
    return { label: '待确认', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) };
  }
  return { label: s || '未知', color: colors.ink3, bg: colors.surface2 };
};

const propStatusMeta = (status?: string) => {
  const s = String(status || '').toLowerCase();
  if (s === 'rented' || s === 'active') {
    return { label: '在租', color: colors.success, bg: colors.alpha(colors.successRgb, 0.12) };
  }
  if (s === 'vacant' || s === 'available') {
    return { label: '空置', color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) };
  }
  if (s === 'renewing') {
    return { label: '续约中', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.12) };
  }
  if (s === 'maintenance') {
    return { label: '维护中', color: colors.ink3, bg: colors.surface2 };
  }
  return { label: s || '未知', color: colors.ink3, bg: colors.surface2 };
};

export default function OwnerPropertyDetailScreen() {
  const route = useRoute<RouteProp<OwnerDetailParamList, 'OwnerPropertyDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<OwnerDetailParamList>>();
  const propertyId = String(route.params?.id ?? '');

  interface DetailPayload {
    prop: PropertyDetail | null;
    leases: PropertyLease[];
    payments: OwnerPayment[];
    docs: OwnerDocument[];
  }

  const q = useCachedQuery<DetailPayload>({
    queryKey: ['owner-prop-detail', propertyId],
    cacheKey: `owner-prop-detail:${propertyId}`,
    enabled: !!propertyId,
    queryFn: async () => {
      const [propRes, leaseRes, payRes, docRes] = await Promise.allSettled([
        propertiesApi.get(propertyId),
        propertiesApi.leases(propertyId),
        paymentsApi.mine(),
        documentsApi.list({ property_id: propertyId }),
      ]);

      const pickItems = <T,>(res: PromiseSettledResult<any>): T[] => {
        if (res.status !== 'fulfilled') return [];
        const data = res.value?.data;
        const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
        return Array.isArray(items) ? (items as T[]) : [];
      };

      return {
        prop: propRes.status === 'fulfilled' ? ((propRes.value?.data as PropertyDetail) ?? null) : null,
        leases: pickItems<PropertyLease>(leaseRes),
        payments: pickItems<OwnerPayment>(payRes),
        docs: pickItems<OwnerDocument>(docRes),
      };
    },
  });

  const payload = q.data;
  const prop = payload?.prop ?? null;
  const leases = payload?.leases ?? [];
  const payments = payload?.payments ?? [];
  const docs = payload?.docs ?? [];
  const loading = q.isPending && !q.data;
  const refreshing = q.isRefetching;
  const onRefresh = useCallback(() => {
    void q.refetch({ cancelRefetch: false });
  }, [q]);

  const go = (target: string) => navigation.navigate(target as any);

  /* 打开文档：与 DocumentsScreen 一致，经带鉴权的 /documents/{id}/file?token= 取件 */
  const openDoc = useCallback(async (docId?: string) => {
    const url = docId ? await documentFileUrl(docId, 'file') : null;
    if (!url) {
      Alert.alert('无法打开', '登录状态已失效，请重新登录');
      return;
    }
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      Alert.alert('无法打开', '当前设备不支持打开该类型文件');
      return;
    }
    Linking.openURL(url);
  }, []);

  const currency = prop?.currency || leases[0]?.currency || 'THB';

  const propTitle =
    prop?.project_name
      ? `${prop.project_name} ${prop.room_number ?? ''}`.trim()
      : prop?.room_number || prop?.address || '房源';

  /* 当前租约：优先取生效中的租约 */
  const activeLease = useMemo(
    () =>
      leases.find((l) => ['active', 'pending'].includes(String(l.status || '').toLowerCase())) ??
      leases[0] ??
      null,
    [leases],
  );

  /* 租期进度：按租约起止真实时间计算 */
  const leaseProgress = useMemo(() => {
    if (!activeLease?.start_date || !activeLease?.end_date) return null;
    const start = new Date(activeLease.start_date).getTime();
    const end = new Date(activeLease.end_date).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
    const total = end - start;
    const elapsed = Math.min(Math.max(Date.now() - start, 0), total);
    return {
      pct: Math.round((elapsed / total) * 100),
      daysLeft: Math.ceil((end - Date.now()) / 86400000),
    };
  }, [activeLease]);

  /* 本房源相关流水：按 property_id 归属，缺失时回退按租约归属 */
  const propertyPayments = useMemo(() => {
    const leaseIds = leases.map((l) => String(l.id));
    return payments
      .filter(
        (p) =>
          String(p.property_id || '') === propertyId ||
          (!!p.lease_id && leaseIds.includes(String(p.lease_id))),
      )
      .sort((a, b) => {
        const da = new Date(String(a.paid_at || a.due_date || '')).getTime() || 0;
        const db = new Date(String(b.paid_at || b.due_date || '')).getTime() || 0;
        return db - da;
      });
  }, [payments, leases, propertyId]);

  /* 本月收益：本月账单口径 */
  const monthIncome = useMemo(() => {
    const now = new Date();
    const inMonth = (x?: string) => {
      if (!x) return false;
      const d = new Date(String(x));
      return (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    };
    const rows = propertyPayments.filter((p) => inMonth(p.paid_at || p.due_date));
    const due = rows.reduce((s, p) => s + Number(p.amount || 0), 0);
    const received = rows
      .filter((p) => ['paid', 'succeeded'].includes(String(p.status || '').toLowerCase()))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    return {
      hasData: rows.length > 0 && due > 0,
      due,
      received,
      rate: due > 0 ? Math.round((received / due) * 100) : 0,
    };
  }, [propertyPayments]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载房源详情…" />
      </View>
    );
  }

  if (!prop) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="home-outline"
          title="房源不存在或无权限查看"
          sub="请返回上一页重新选择名下房源"
        />
      </View>
    );
  }

  const statusMeta = propStatusMeta(prop.status);

  const QUICK_ACTIONS: {
    key: string;
    label: string;
    icon: IoniconName;
    color: string;
    bg: string;
    route: string;
  }[] = [
    {
      key: 'receipt',
      label: '发起收款',
      icon: 'card-outline',
      color: colors.success,
      bg: colors.alpha(colors.successRgb, 0.1),
      route: 'OwnerPayments',
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ===== 房源信息卡 ===== */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="business-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.infoBody}>
              <View style={styles.infoTitleRow}>
                <Text style={styles.infoTitle} numberOfLines={1}>{propTitle}</Text>
                <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
                  <Text style={[styles.badgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                </View>
              </View>
              <View style={styles.infoAddrRow}>
                <Ionicons name="location-outline" size={13} color={colors.ink3} />
                <Text style={styles.infoAddr} numberOfLines={1}>
                  {prop.address || '地址未登记'}
                </Text>
              </View>
              <Text style={styles.infoMeta} numberOfLines={1}>
                {prop.bedrooms ?? 0}室{prop.bathrooms ?? 0}厅 · {prop.size_sqm ?? 0}㎡
              </Text>
            </View>
          </View>

          <View style={styles.rentRow}>
            <View>
              <Text style={styles.mutedSm}>月租金</Text>
              <Text style={styles.rentValue}>{money(prop.monthly_rent, currency)}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.badgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
            </View>
          </View>
        </View>

        {/* ===== 在租状态 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>在租状态</Text>
          <Text style={styles.sectionHint}>{activeLease ? formatDate(activeLease.end_date) : '暂无租约'}</Text>
        </View>
        <View style={styles.card}>
          {!activeLease ? (
            <EmptyState
              icon="key-outline"
              title="暂无在租租约"
              sub="房源出租并签约后，租客与租期信息会显示在这里"
            />
          ) : (
            <>
              <View style={styles.metricGrid}>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>当前租客</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>
                    {activeLease.tenant_name || '—'}
                  </Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>租约到期日</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>
                    {formatDate(activeLease.end_date)}
                  </Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricLabel}>押金</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>
                    {prop.deposit_amount ? money(prop.deposit_amount, currency) : '—'}
                  </Text>
                </View>
              </View>

              {leaseProgress && (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressBar, { width: `${leaseProgress.pct}%` }]} />
                  </View>
                  <View style={styles.progressFoot}>
                    <Text style={styles.mutedSm}>租期进度</Text>
                    <Text
                      style={[
                        styles.progressRate,
                        { color: leaseProgress.daysLeft <= 60 ? colors.warning : colors.ink2 },
                      ]}
                    >
                      {leaseProgress.daysLeft >= 0
                        ? `剩余 ${leaseProgress.daysLeft} 天`
                        : `已到期 ${Math.abs(leaseProgress.daysLeft)} 天`}
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* ===== 本月收益 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>本月收益</Text>
          <Text style={styles.sectionHint}>按本房源账单口径</Text>
        </View>
        <View style={styles.card}>
          {monthIncome.hasData ? (
            <>
              <View style={styles.incomeGrid}>
                <View style={styles.incomeCell}>
                  <Text style={styles.mutedSm}>本月应收</Text>
                  <Text style={styles.incomeValue}>{money(monthIncome.due, currency)}</Text>
                </View>
                <View style={[styles.incomeCell, styles.incomeCellPaid]}>
                  <Text style={styles.mutedSm}>已收</Text>
                  <Text style={[styles.incomeValue, { color: colors.success }]}>
                    {money(monthIncome.received, currency)}
                  </Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${monthIncome.rate}%` }]} />
              </View>
              <View style={styles.progressFoot}>
                <Text style={styles.mutedSm}>本月收款进度</Text>
                <Text style={[styles.progressRate, { color: colors.primary }]}>
                  已收 {monthIncome.rate}%
                </Text>
              </View>
            </>
          ) : (
            <EmptyState
              icon="wallet-outline"
              title="本月暂无账单"
              sub="本房源本月租金账单生成后，这里会显示应收与已收"
            />
          )}
        </View>

        {/* ===== 相关文档 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>相关文档</Text>
          <Text style={styles.sectionHint}>{docs.length} 份</Text>
        </View>
        <View style={styles.card}>
          {docs.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="暂无相关文档"
              sub="该房源暂无上传的合同或证件文件"
            />
          ) : (
            docs.map((d, idx, arr) => {
              const meta = docMetaOf(d.type);
              return (
                <TouchableOpacity
                  key={d.id || String(idx)}
                  style={[styles.flowRow, idx === arr.length - 1 && styles.flowRowLast]}
                  activeOpacity={0.7}
                  onPress={() => openDoc(d.id)}
                >
                  <View style={[styles.flowIcon, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={styles.flowBody}>
                    <Text style={styles.flowTitle} numberOfLines={1}>
                      {d.title || '未命名文档'}
                    </Text>
                    <Text style={styles.flowMeta} numberOfLines={1}>
                      {formatDate(d.created_at)}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ===== 历史流水 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>历史流水</Text>
          <Text style={styles.sectionHint}>{propertyPayments.length} 笔</Text>
        </View>
        <View style={styles.card}>
          {propertyPayments.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="暂无流水记录"
              sub="租金收付记录会按时间倒序显示在这里"
            />
          ) : (
            propertyPayments.slice(0, 10).map((p, idx, arr) => {
              const st = payStatusMeta(p.status);
              const month = Number(String(p.paid_at || p.due_date || '').slice(5, 7));
              const isPaid = ['paid', 'succeeded'].includes(String(p.status || '').toLowerCase());
              return (
                <View
                  key={p.id || String(idx)}
                  style={[styles.flowRow, idx === arr.length - 1 && styles.flowRowLast]}
                >
                  <View style={[styles.flowIcon, { backgroundColor: st.bg }]}>
                    <Ionicons
                      name={isPaid ? 'cash-outline' : 'time-outline'}
                      size={18}
                      color={st.color}
                    />
                  </View>
                  <View style={styles.flowBody}>
                    <Text style={styles.flowTitle} numberOfLines={1}>
                      {month ? `${month} 月` : ''}
                      {PAY_TYPE_LABEL[p.payment_type ?? ''] || '账单'}
                      {activeLease?.tenant_name ? ` · ${activeLease.tenant_name}` : ''}
                    </Text>
                    <Text style={styles.flowMeta} numberOfLines={1}>
                      {formatDate(p.paid_at || p.due_date)}
                      {p.description ? ` · ${p.description}` : ''}
                    </Text>
                  </View>
                  <View style={styles.flowRight}>
                    <Text style={[styles.flowAmount, { color: st.color }]}>
                      {isPaid ? '+' : ''}
                      {money(p.amount, p.currency || currency)}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ===== 快捷操作 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>快捷操作</Text>
        </View>
        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={styles.action}
              activeOpacity={0.8}
              onPress={() => go(a.route)}
            >
              <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon} size={20} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  content: { paddingTop: colors.spacing.md, paddingBottom: 32 },

  card: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  mutedSm: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: colors.radius.full },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  mapCard: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    borderRadius: colors.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },

  /* 房源信息卡 */
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  infoIcon: {
    width: 52,
    height: 52,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBody: { flex: 1, minWidth: 0 },
  infoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoTitle: { flex: 1, fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  infoAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  infoAddr: { flex: 1, fontSize: colors.fontSize.sm, color: colors.ink3 },
  infoMeta: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 3 },
  rentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: colors.spacing.lg,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderStyle: 'dashed',
  },
  rentValue: {
    fontSize: colors.fontSize['2xl'],
    fontWeight: '800',
    color: colors.ink,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  /* 区块标题 */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.xl,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },

  /* 在租状态三格 */
  metricGrid: { flexDirection: 'row', gap: 10 },
  metricCell: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  /* 进度条 */
  progressTrack: {
    height: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: colors.spacing.lg,
  },
  progressBar: { height: 8, borderRadius: colors.radius.full, backgroundColor: colors.primary },
  progressFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressRate: { fontSize: colors.fontSize.sm, fontWeight: '700' },

  /* 本月收益 */
  incomeGrid: { flexDirection: 'row', gap: 12 },
  incomeCell: {
    flex: 1,
    padding: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  incomeCellPaid: {
    borderColor: colors.alpha(colors.successRgb, 0.35),
    backgroundColor: colors.alpha(colors.successRgb, 0.06),
  },
  incomeValue: {
    fontSize: colors.fontSize['2xl'],
    fontWeight: '700',
    color: colors.ink,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  /* 历史流水 */
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  flowRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  flowIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowBody: { flex: 1, minWidth: 0 },
  flowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  flowMeta: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  flowRight: { alignItems: 'flex-end', gap: 3 },
  flowAmount: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  /* 快捷操作 */
  actionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: colors.spacing.lg },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: colors.fontSize.sm, fontWeight: '600', color: colors.ink2 },
});