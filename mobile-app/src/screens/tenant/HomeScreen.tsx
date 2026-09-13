import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import { propertiesApi, leasesApi } from '@/services/api';
import { useI18n } from '@/i18n';

interface Listing {
  id: string;
  title?: string;
  room_number?: string;
  address?: string;
  property_type?: string;
  monthly_rent?: number;
  currency?: string;
  bedrooms?: number;
  size_sqm?: number;
  status?: string;
  photos?: string[];
  [key: string]: any;
}

type GridIcon = 'search' | 'map' | 'build' | 'document-text' | 'people' | 'card' | 'key' | 'business' | 'calendar';

interface GridEntry {
  key: string;
  labelKey: string;
  icon: GridIcon;
  route: string;
  params?: Record<string, any>;
}

// 金刚区：按「是否在租」分流。
// 访客/未签约态 = 找房导向（看和选，含分类直达）；在租态 = 履约服务（报修/缴费/合同/增值服务）。
const VISITOR_GRID: GridEntry[] = [
  { key: 'listings', labelKey: 'home.findRent', icon: 'search', route: 'TenantListings' },
  { key: 'apartment', labelKey: 'home.apartment', icon: 'key', route: 'TenantListings', params: { filter: 'apartment' } },
  { key: 'office', labelKey: 'home.office', icon: 'business', route: 'TenantListings', params: { filter: 'office' } },
  { key: 'viewing', labelKey: 'home.viewing', icon: 'calendar', route: 'Viewings' },
  { key: 'map', labelKey: 'home.mapFind', icon: 'map', route: 'Map' },
];

const TENANT_GRID: GridEntry[] = [
  { key: 'maintenance', labelKey: 'home.maintenance', icon: 'build', route: 'TenantMaintenance' },
  { key: 'payments', labelKey: 'home.pay', icon: 'card', route: 'Payments' },
  { key: 'contracts', labelKey: 'home.contracts', icon: 'document-text', route: 'Contracts' },
  { key: 'services', labelKey: 'home.services', icon: 'people', route: 'TenantServices' },
];

const statusLabels: Record<string, string> = {
  vacant: '空置',
  rented: '已出租',
  reserved: '已预订',
  maintenance: '维护中',
};

const statusColors: Record<string, string> = {
  vacant: colors.success,
  rented: colors.primary,
  reserved: colors.primary,
  maintenance: colors.warning,
};

const typeLabels: Record<string, string> = {
  apartment: '公寓',
  condo: '公寓',
  villa: '别墅',
  house: '别墅',
  shop: '商铺',
  commercial: '商铺',
  office: '写字楼',
};

const formatRent = (v: any, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '฿';
  return `${cur}${Number(v || 0).toLocaleString()}`;
};

export default function HomeScreen() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isRenting, setIsRenting] = useState(false);
  const [activeLease, setActiveLease] = useState<any>(null);
  const { t } = useI18n();
  const navigation = useNavigation<any>();

  const loadListings = useCallback(async () => {
    try {
      const res = await propertiesApi.list({ page: 1, page_size: 10 });
      const data = res.data;
      const items = Array.isArray(data)
        ? data
        : (data as any)?.items ?? (data as any)?.data ?? [];
      setListings(items as Listing[]);
    } catch {
      // 忽略加载失败
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 是否在租：命中「生效中」租约则展示租客履约服务，并缓存该租约用于顶部「我的租约」
  useEffect(() => {
    loadListings();
    leasesApi
      .mine()
      .then((res: any) => {
        const leases = res?.data;
        const list = Array.isArray(leases) ? leases : leases?.items ?? [];
        const active = (list as any[]).find((l: any) => l?.status === 'active');
        setIsRenting(!!active);
        setActiveLease(active ?? null);
      })
      .catch(() => {
        // 接口不可用时保守按访客态展示，避免对非在租用户暴露租客专属入口
        setIsRenting(false);
        setActiveLease(null);
      });
  }, [loadListings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadListings();
  }, [loadListings]);

  const activeGrid = isRenting ? TENANT_GRID : VISITOR_GRID;

  const handleEntry = (entry: GridEntry) => {
    navigation.navigate(entry.route, entry.params);
  };

  const goListings = () => navigation.navigate('TenantListings');

  const renderItem = ({ item }: { item: Listing }) => {
    const photo = Array.isArray(item.photos) && item.photos.length ? item.photos[0] : null;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PropertyDetail', { id: item.id })}
      >
        <View style={styles.thumbWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbPlaceholderText}>房源</Text>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title || item.room_number || '未命名房源'}
          </Text>
          <Text style={styles.address} numberOfLines={1}>
            {item.address || '暂无地址'}
          </Text>
          <View style={styles.tagRow}>
            <Text style={styles.tag}>{typeLabels[item.property_type ?? ''] ?? '房源'}</Text>
            <Text style={styles.tag}>
              {item.bedrooms ?? 0}室·{item.size_sqm ?? 0}㎡
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status ?? 'vacant'] }]}>
              <Text style={styles.statusText}>{statusLabels[item.status ?? 'vacant'] ?? '—'}</Text>
            </View>
          </View>
          <Text style={styles.rent}>
            {formatRent(item.monthly_rent, item.currency)}
            <Text style={styles.rentUnit}>/月</Text>
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const header = (
    <View>
      {/* 我的租约（在租态）：一眼看清租约状态/下次缴费/到期日 */}
      {isRenting && activeLease && (
        <TouchableOpacity
          style={styles.leaseCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Contracts')}
        >
          <View style={styles.leaseCardDecor} />
          <View style={styles.leaseLeft}>
            <Text style={styles.leaseBadge}>{t('home.leaseInforce')}</Text>
            <Text style={styles.leaseTitle} numberOfLines={1}>
              {activeLease.property_name || activeLease.room_number || t('home.myLease')}
            </Text>
            <Text style={styles.leaseSub}>
              {formatRent(activeLease.monthly_rent ?? activeLease.rent, activeLease.currency)}/月
              {activeLease.end_date
                ? ` · ${t('home.leaseExpiry')} ${String(activeLease.end_date).slice(0, 10)}`
                : ''}
            </Text>
          </View>
          <View style={styles.leaseRight}>
            <Ionicons name="chevron-forward" size={18} color={colors.primaryForeground} />
          </View>
        </TouchableOpacity>
      )}

      {/* 搜索入口（链家首页顶部搜索） */}
      <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={goListings}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <Text style={styles.searchPlaceholder}>{t('home.searchPlaceholder')}</Text>
      </TouchableOpacity>

      {/* 金刚区：访客态找房 / 在租态履约服务，按是否在租分流 */}
      <View style={styles.grid}>
        {activeGrid.map((entry) => (
          <TouchableOpacity
            key={entry.key}
            style={styles.gridItem}
            activeOpacity={0.7}
            onPress={() => handleEntry(entry)}
          >
            <View style={styles.gridIconBox}>
              <Ionicons name={entry.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.gridLabel}>{t(entry.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('home.featured')}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>暂无房源</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 12, paddingHorizontal: 12, paddingBottom: 24 },

  /* 租约卡片（在租态） */
  leaseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: colors.radius.xl,
    padding: 18,
    marginBottom: 14,
    ...colors.shadow.primary,
    position: 'relative',
    overflow: 'hidden',
  },
  leaseCardDecor: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  leaseLeft: { flex: 1, zIndex: 1 },
  leaseBadge: {
    alignSelf: 'flex-start',
    color: colors.primary,
    backgroundColor: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  leaseTitle: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  leaseSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 6, lineHeight: 18 },
  leaseRight: { justifyContent: 'center', zIndex: 1 },

  /* 搜索栏 */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginBottom: 16,
    ...colors.shadow.sm,
  },
  searchPlaceholder: { fontSize: 14, color: colors.ink3 },

  /* 金刚区 */
  grid: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    marginBottom: 18,
    ...colors.shadow.sm,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
  },
  gridIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridLabel: { fontSize: 12, color: colors.ink, fontWeight: '500' },

  /* 区块标题 */
  sectionHeader: { marginBottom: 10, marginTop: 4, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },

  /* 房源卡片 */
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  thumbWrap: { width: 110 },
  thumb: { width: 110, height: 110 },
  thumbPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: { fontSize: 13, color: colors.ink3 },
  info: { flex: 1, padding: 12, justifyContent: 'space-between' },
  title: { fontSize: 15, color: colors.ink, fontWeight: '700', letterSpacing: -0.1 },
  address: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  tag: {
    fontSize: 11,
    color: colors.ink2,
    backgroundColor: colors.surface2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  statusText: { color: colors.primaryForeground, fontSize: 10, fontWeight: '700' },
  rent: { color: colors.primary, fontSize: 17, fontWeight: '800', marginTop: 6, letterSpacing: -0.2 },
  rentUnit: { fontSize: 11, fontWeight: '400', color: colors.ink2 },
  empty: { textAlign: 'center', color: colors.ink3, marginTop: 48, fontSize: 14 },
});