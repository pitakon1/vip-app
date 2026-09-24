/**
 * 房源详情（管理端）
 * 原型：admin-mobile-property-detail.html
 * 区块：房源头部（类型/状态）→ 名称与地址 → 关键指标（月租/面积/户型/状态）→ 房源信息
 *      → 操作区（编辑房源/查看合同/维修工单）→ 当前租客 → 维修记录
 * 数据源：/properties/{id}、/properties/{id}/leases（含租客姓名）、/maintenance、/payments
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import api from '@/lib/api';
import { propertiesApi, paymentsApi } from '@/services/api';
import { useI18n } from '@/i18n';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

interface PropertyDetail {
  id: string;
  room_number?: string | null;
  building?: string | null;
  address?: string | null;
  property_type?: string | null;
  monthly_rent?: number;
  currency?: string;
  deposit_amount?: number;
  deposit_months?: number;
  size_sqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floor?: number | null;
  status?: string | null;
  furnished?: boolean;
  available_from?: string | null;
  video_url?: string | null;
  description?: string | null;
}

interface LeaseRow {
  id: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  monthly_rent?: number;
  currency?: string;
  tenant_id?: string | null;
  tenant_name?: string | null;
}

interface TicketRow {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  created_at?: string | null;
}

const TYPE_KEYS: Record<string, string> = {
  apartment: 'prop.type.apartment',
  condo: 'prop.type.condo',
  house: 'prop.type.house',
  commercial: 'prop.type.commercial',
  office: 'prop.type.office',
};

const STATUS_META = (
  t: TFunc,
): Record<string, { label: string; color: string; rgb: string }> => ({
  vacant: { label: t('adm.psStatusVacant'), color: colors.warning, rgb: colors.warningRgb },
  rented: { label: t('apd.stRented'), color: colors.success, rgb: colors.successRgb },
  maintenance: { label: t('opd.stMaintenance'), color: colors.info, rgb: colors.infoRgb },
  renewing: { label: t('prop.status.renewing'), color: colors.primary, rgb: colors.primaryRgb },
});

const LEASE_STATUS = (
  t: TFunc,
): Record<string, { label: string; color: string; rgb: string }> => ({
  active: { label: t('apd.lsActive'), color: colors.success, rgb: colors.successRgb },
  pending: { label: t('apd.lsPending'), color: colors.info, rgb: colors.infoRgb },
  expired: { label: t('apd.lsExpired'), color: colors.ink2, rgb: colors.primaryRgb },
  terminated: { label: t('apd.lsTerminated'), color: colors.error, rgb: colors.errorRgb },
});

const TICKET_STATUS = (
  t: TFunc,
): Record<string, { label: string; color: string; rgb: string }> => ({
  open: { label: t('ticket.status.open'), color: colors.warning, rgb: colors.warningRgb },
  assigned: { label: t('apd.ticketAssigned'), color: colors.info, rgb: colors.infoRgb },
  in_progress: { label: t('common.processing'), color: colors.info, rgb: colors.infoRgb },
  resolved: { label: t('ticket.status.resolved'), color: colors.success, rgb: colors.successRgb },
  closed: { label: t('ticket.status.closed'), color: colors.ink2, rgb: colors.primaryRgb },
});

const fmtDate = (v?: string | null) => (v ? String(v).slice(0, 10) : '-');
const symOf = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿');

export default function AdminPropertyDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const propertyId: string | undefined = route?.params?.id;

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [leases, setLeases] = useState<LeaseRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) {
      setLoading(false);
      return;
    }
    const [propRes, leaseRes, ticketRes] = await Promise.allSettled([
      propertiesApi.get(propertyId),
      propertiesApi.leases(propertyId),
      api.get('/maintenance-tickets', { params: { property_id: propertyId, page_size: 20 } }),
    ]);

    if (propRes.status === 'fulfilled') {
      setProperty(((propRes.value as any)?.data ?? null) as PropertyDetail | null);
    }
    if (leaseRes.status === 'fulfilled') {
      const d = (leaseRes.value as any)?.data ?? {};
      const rows = (Array.isArray(d) ? d : d.items ?? []) as LeaseRow[];
      setLeases(rows);

      // 当前租客的租金状态：取该租约下待支付/逾期的笔数
      const current = rows.find((l) => l.status === 'active') ?? rows[0];
      if (current?.id) {
        try {
          const payRes: any = await paymentsApi.list({ lease_id: current.id, page_size: 20 });
          const payRows = ((payRes?.data?.items ?? []) as { status?: string }[]) ?? [];
          setPendingPayments(
            payRows.filter((p) => p.status === 'pending' || p.status === 'expired').length,
          );
        } catch {
          setPendingPayments(null);
        }
      }
    }
    if (ticketRes.status === 'fulfilled') {
      const d = (ticketRes.value as any)?.data ?? {};
      setTickets(((Array.isArray(d) ? d : d.items ?? []) as TicketRow[]).slice(0, 10));
    }

    setLoading(false);
    setRefreshing(false);
  }, [propertyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.center}>
        <EmptyState icon="business-outline" title={t('apd.notFoundTitle')} sub={t('apd.notFoundSub')} />
      </View>
    );
  }

  const statusMeta = STATUS_META(t)[property.status ?? 'vacant'] ?? {
    label: property.status ?? t('common.unknown'),
    color: colors.ink2,
    rgb: colors.primaryRgb,
  };
  const currentLease = leases.find((l) => l.status === 'active') ?? leases[0] ?? null;
  const leaseMeta = currentLease
    ? LEASE_STATUS(t)[currentLease.status ?? ''] ?? {
        label: currentLease.status ?? t('common.unknown'),
        color: colors.ink2,
        rgb: colors.primaryRgb,
      }
    : null;

  const typeKey = TYPE_KEYS[property.property_type ?? 'apartment'];
  const typeLabel = typeKey ? t(typeKey) : property.property_type ?? t('apd.propFallback');

  const infoRows: { label: string; value: string; wide?: boolean }[] = [
    { label: t('listing.fFloor'), value: property.floor != null ? t('apd.floorN', { n: property.floor }) : '-' },
    { label: t('apd.decorLabel'), value: property.furnished ? t('pub.decoration.standard') : t('pub.decoration.simple') },
    {
      label: t('opd.deposit'),
      value: `${symOf(property.currency)}${Number(property.deposit_amount || 0).toLocaleString()}${
        property.deposit_months ? ` / ${t('apd.monthsN', { n: property.deposit_months })}` : ''
      }`,
    },
    { label: t('apd.availableDate'), value: fmtDate(property.available_from) },
    {
      label: t('apd.leaseTerm'),
      value: currentLease
        ? t('apd.dateRange', { a: fmtDate(currentLease.start_date), b: fmtDate(currentLease.end_date) })
        : t('apd.noActiveLease'),
      wide: true,
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* 房源图（无照片时用类型图标占位） */}
      <View style={styles.banner}>
        <Ionicons name="business" size={44} color={colors.primaryForeground} />
        <View style={[styles.typeBadge, { backgroundColor: colors.surface }]}>
          <Text style={styles.typeBadgeText}>
            {typeLabel}
          </Text>
        </View>
      </View>

      {/* 名称与地址 */}
      <View style={styles.headCard}>
        <View style={styles.headTop}>
          <Text style={styles.name} numberOfLines={2}>
            {[property.room_number, property.building].filter(Boolean).join(' · ') || t('apd.unnamedProperty')}
          </Text>
          <View style={styles.badgeWrap}>
            <View style={[styles.badge, { backgroundColor: colors.alpha(statusMeta.rgb, 0.12) }]}>
              <View style={[styles.dot, { backgroundColor: statusMeta.color }]} />
              <Text style={[styles.badgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
            </View>
          </View>
        </View>
        <View style={styles.addrRow}>
          <Ionicons name="location-outline" size={14} color={colors.ink3} />
          <Text style={styles.addr}>{property.address || t('apd.noAddress')}</Text>
        </View>
      </View>

      {/* 关键指标 */}
      <View style={styles.keyRow}>
        <View style={styles.keyCell}>
          <Text style={styles.keyLabel}>{t('edit.labelRent')}</Text>
          <Text style={[styles.keyValue, { color: colors.primary }]}>
            {symOf(property.currency)}
            {Number(property.monthly_rent || 0).toLocaleString()}
          </Text>
        </View>
        <View style={styles.keyCell}>
          <Text style={styles.keyLabel}>{t('pub.size')}</Text>
          <Text style={styles.keyValue}>{property.size_sqm ? `${property.size_sqm}㎡` : '-'}</Text>
        </View>
        <View style={styles.keyCell}>
          <Text style={styles.keyLabel}>{t('pub.layout')}</Text>
          <Text style={styles.keyValue}>
            {property.bedrooms ? t('adm.psSpecBed', { n: property.bedrooms }) : '-'}
            {property.bathrooms ? ` ${t('adm.psSpecBath', { n: property.bathrooms })}` : ''}
          </Text>
        </View>
        <View style={styles.keyCell}>
          <Text style={styles.keyLabel}>{t('apd.statusLabel')}</Text>
          <Text style={[styles.keyValue, { color: statusMeta.color }]}>{statusMeta.label}</Text>
        </View>
      </View>

      {/* 房源信息 */}
      <Text style={styles.sectionTitle}>{t('listing.propInfo')}</Text>
      <View style={styles.infoCard}>
        {infoRows.map((row) => (
          <View key={row.label} style={[styles.infoItem, row.wide && styles.infoItemWide]}>
            <Text style={styles.infoLabel}>{row.label}</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{row.value}</Text>
          </View>
        ))}
      </View>

      {/* 操作区 */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionCell}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('PropertyEdit', { id: property.id })}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.alpha(colors.primaryRgb, 0.12) }]}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
          </View>
          <Text style={styles.actionLabel}>{t('prop.editTitle')}</Text>
        </TouchableOpacity>
      </View>

      {/* 当前租客 */}
      <Text style={styles.sectionTitle}>{t('opd.currentTenant')}</Text>
      {!currentLease ? (
        <EmptyState icon="person-outline" title={t('apd.noTenantTitle')} sub={t('apd.noTenantSub')} />
      ) : (
        <View style={styles.tenantCard}>
          <View style={styles.tenantTop}>
            <View style={styles.tenantAvatar}>
              <Text style={styles.tenantAvatarText}>
                {(currentLease.tenant_name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.tenantInfo}>
              <Text style={styles.tenantName} numberOfLines={1}>
                {currentLease.tenant_name || t('apd.unnamedTenant')}
              </Text>
              <Text style={styles.tenantMeta} numberOfLines={1}>
                {t('perm.role.tenant')} · {currentLease.tenant_id ? currentLease.tenant_id.slice(0, 8).toUpperCase() : '-'}
              </Text>
            </View>
            {leaseMeta && (
              <View style={[styles.badge, { backgroundColor: colors.alpha(leaseMeta.rgb, 0.12) }]}>
                <Text style={[styles.badgeText, { color: leaseMeta.color }]}>{leaseMeta.label}</Text>
              </View>
            )}
          </View>

          <View style={styles.tenantRow}>
            <Text style={styles.tenantRowLabel}>{t('apd.leaseTerm')}</Text>
            <Text style={styles.tenantRowValue}>
              {t('apd.dateRange', { a: fmtDate(currentLease.start_date), b: fmtDate(currentLease.end_date) })}
            </Text>
          </View>
          <View style={styles.tenantRow}>
            <Text style={styles.tenantRowLabel}>{t('opd.monthlyRent')}</Text>
            <Text style={styles.tenantRowValue}>
              {symOf(currentLease.currency)}
              {Number(currentLease.monthly_rent || 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.tenantRow}>
            <Text style={styles.tenantRowLabel}>{t('apd.rentStatus')}</Text>
            {pendingPayments === null ? (
              <Text style={styles.tenantRowValue}>-</Text>
            ) : pendingPayments > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.alpha(colors.warningRgb, 0.12) }]}>
                <Text style={[styles.badgeText, { color: colors.warning }]}>
                  {t('apd.pendingN', { n: pendingPayments })}
                </Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: colors.alpha(colors.successRgb, 0.12) }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>{t('apd.noArrears')}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 维修记录 */}
      <Text style={styles.sectionTitle}>{t('apd.maintRecords')}</Text>
      {tickets.length === 0 ? (
        <EmptyState icon="construct-outline" title={t('apd.noMaintTitle')} sub={t('apd.noMaintSub')} />
      ) : (
        tickets.map((ticket) => {
          const meta = TICKET_STATUS(t)[ticket.status ?? 'open'] ?? {
            label: ticket.status ?? t('common.unknown'),
            color: colors.ink2,
            rgb: colors.primaryRgb,
          };
          return (
            <View key={ticket.id} style={styles.ticketCard}>
              <View style={[styles.ticketDot, { backgroundColor: meta.color }]} />
              <View style={styles.ticketBody}>
                <View style={styles.ticketHead}>
                  <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title || t('apd.repairTicket')}</Text>
                  <Text style={styles.ticketDate}>{fmtDate(ticket.created_at)}</Text>
                </View>
                {!!ticket.description && (
                  <Text style={styles.ticketDesc} numberOfLines={2}>{ticket.description}</Text>
                )}
              </View>
              <View style={[styles.badge, { backgroundColor: colors.alpha(meta.rgb, 0.12) }]}>
                <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  banner: {
    height: 180,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {
    position: 'absolute',
    left: 16,
    bottom: 14,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },

  headCard: {
    marginHorizontal: 20,
    marginTop: -18,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 16,
    ...colors.shadow.card,
  },
  headTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  badgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.ink },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  addr: { flex: 1, fontSize: 12, color: colors.ink3 },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: colors.radius.full,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },

  keyRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginTop: 14 },
  keyCell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    ...colors.shadow.sm,
  },
  keyLabel: { fontSize: 11, color: colors.ink3 },
  keyValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: -0.2,
  },

  infoCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 6,
    ...colors.shadow.sm,
  },
  infoItem: { width: '50%', paddingHorizontal: 10, paddingVertical: 10 },
  infoItemWide: { width: '100%' },
  infoLabel: { fontSize: 11, color: colors.ink3, marginBottom: 4 },
  infoValue: { fontSize: 13, fontWeight: '600', color: colors.ink2 },

  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 14 },
  actionCell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    ...colors.shadow.sm,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, color: colors.ink2, fontWeight: '600' },

  tenantCard: {
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 16,
    ...colors.shadow.sm,
  },
  tenantTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  tenantAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantAvatarText: { fontSize: 17, fontWeight: '800', color: colors.primary },
  tenantInfo: { flex: 1, minWidth: 0 },
  tenantName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tenantMeta: { fontSize: 11, color: colors.ink3, marginTop: 3 },
  tenantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 12,
  },
  tenantRowLabel: { fontSize: 12, color: colors.ink3 },
  tenantRowValue: { fontSize: 13, color: colors.ink2, fontWeight: '600', flexShrink: 1 },

  ticketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    ...colors.shadow.sm,
  },
  ticketDot: { width: 8, height: 8, borderRadius: 4 },
  ticketBody: { flex: 1, minWidth: 0 },
  ticketHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  ticketDate: { fontSize: 11, color: colors.ink3, fontVariant: ['tabular-nums'] },
  ticketDesc: { fontSize: 12, color: colors.ink3, marginTop: 4 },
});