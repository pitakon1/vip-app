import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  Pressable,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import { propertiesApi, paymentsApi, maintenanceApi, saleListingApi } from '@/services/api';
import { fmtMoney as formatMoney } from '@/utils/format';
import { useI18n } from '@/i18n';
import { useAuthStore } from '@/stores/auth';

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
  created_at?: string;
  [key: string]: any;
}

interface SaleListing {
  id: string;
  property_id?: string | null;
  title?: string;
  address?: string;
  asking_price?: number;
  currency?: string;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  status?: string;
  [key: string]: any;
}

interface Payment {
  id: string;
  amount?: number;
  currency?: string;
  payment_type?: string;
  status?: string;
  due_date?: string;
  paid_at?: string;
  description?: string;
  [key: string]: any;
}

interface Ticket {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: any;
}

type IoniconName = keyof typeof Ionicons.glyphMap;

const statusLabels: Record<string, string> = {
  vacant: '空置',
  rented: '已出租',
  reserved: '已预订',
  maintenance: '维护中',
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

const paymentTypeLabels: Record<string, string> = {
  rent: '租金',
  deposit: '押金',
  commission: '佣金',
  service_fee: '服务费',
  utility: '物业费',
  tax: '税费',
  refund: '退款',
};

const paymentStatusLabels: Record<string, string> = {
  pending: '待支付',
  processing: '处理中',
  succeeded: '已支付',
  failed: '支付失败',
  refunded: '已退款',
  disputed: '有争议',
  expired: '已过期',
};

const ticketStatusMeta: Record<
  string,
  { text: string; color: string; bg: string; progress: number }
> = {
  submitted: { text: '待处理', color: colors.warning, bg: colors.warningLight, progress: 25 },
  accepted: { text: '已受理', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1), progress: 50 },
  in_progress: { text: '处理中', color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1), progress: 70 },
  resolved: { text: '已解决', color: colors.success, bg: colors.successLight, progress: 100 },
  closed: { text: '已关闭', color: colors.ink3, bg: colors.surface2, progress: 100 },
};

const formatDay = (x?: string) => (x ? String(x).slice(0, 10) : '—');

/**
 * 租房房源卡片。
 * memo 化：回调保持稳定引用，父级（搜索/切换 Tab 等）状态变化不会重建整条横向 rail。
 * Pressable 包裹：按下缩放 0.97、松开归 1（Animated.spring 原生驱动）。
 */
const PropertyCard = React.memo(function PropertyCard({
  item,
  onPress,
}: {
  item: Listing;
  onPress: (id: string) => void;
}) {
  // 按压缩放动画值
  const scale = useRef(new Animated.Value(1)).current;
  const photo = Array.isArray(item.photos) && item.photos.length ? String(item.photos[0]) : null;
  return (
    <Pressable
      onPress={() => onPress(item.id)}
      onPressIn={() =>
        Animated.spring(scale, {
          toValue: 0.97,
          speed: 40,
          bounciness: 0,
          useNativeDriver: Platform.OS !== 'web',
        }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          speed: 40,
          bounciness: 0,
          useNativeDriver: Platform.OS !== 'web',
        }).start()
      }
      accessibilityRole="button"
      accessibilityLabel={`${item.title || item.room_number || '房源'}，${item.address || '暂无地址'}`}
    >
      <Animated.View style={[styles.propCard, { transform: [{ scale }] }]}>
        <View style={styles.propImgWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.propImg} resizeMode="cover" />
          ) : (
            <View style={[styles.propImg, styles.propImgPlaceholder]}>
              <Ionicons name="business-outline" size={26} color={colors.ink3} />
            </View>
          )}
          <View style={styles.propBadge}>
            <Text style={styles.propBadgeText}>
              {typeLabels[String(item.property_type ?? '')] ?? '房源'}
            </Text>
          </View>
        </View>
        <View style={styles.propBody}>
          <Text style={styles.propName} numberOfLines={1}>
            {item.title || item.room_number || '未命名房源'}
          </Text>
          <Text style={styles.propAddr} numberOfLines={1}>
            {item.address || '暂无地址'}
          </Text>
          <View style={styles.propTags}>
            <Text style={styles.propTag}>
              {item.bedrooms ?? 0}室 · {item.size_sqm ?? 0}㎡
            </Text>
            <Text style={styles.propTag}>
              {statusLabels[String(item.status ?? '')] ?? '在租'}
            </Text>
          </View>
          <Text style={styles.propPrice}>
            {formatMoney(item.monthly_rent, item.currency)}
            <Text style={styles.propPriceUnit}>/月</Text>
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
});

/** 二手房卡片（同样 memo 化，避免购房 rail 随其它状态重建） */
const SaleCard = React.memo(function SaleCard({
  item,
  onPress,
}: {
  item: SaleListing;
  onPress: (id: string) => void;
}) {
  // 按压缩放动画值
  const scale = useRef(new Animated.Value(1)).current;
  const photo = Array.isArray(item.photos) && item.photos.length ? String(item.photos[0]) : null;
  const canOpen = !!item.property_id;
  return (
    <Pressable
      onPress={() => canOpen && onPress(String(item.property_id))}
      disabled={!canOpen}
      onPressIn={() =>
        Animated.spring(scale, {
          toValue: 0.97,
          speed: 40,
          bounciness: 0,
          useNativeDriver: Platform.OS !== 'web',
        }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          speed: 40,
          bounciness: 0,
          useNativeDriver: Platform.OS !== 'web',
        }).start()
      }
      accessibilityRole="button"
      accessibilityLabel={`${item.title || '在售房源'}，${item.address || '暂无地址'}`}
    >
      <Animated.View style={[styles.propCard, { transform: [{ scale }] }]}>
        <View style={styles.propImgWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.propImg} resizeMode="cover" />
          ) : (
            <View style={[styles.propImg, styles.propImgPlaceholder]}>
              <Ionicons name="pricetag-outline" size={26} color={colors.ink3} />
            </View>
          )}
          <View style={styles.propBadge}>
            <Text style={styles.propBadgeText}>二手房</Text>
          </View>
        </View>
        <View style={styles.propBody}>
          <Text style={styles.propName} numberOfLines={1}>
            {item.title || '在售房源'}
          </Text>
          <Text style={styles.propAddr} numberOfLines={1}>
            {item.address || '暂无地址'}
          </Text>
          <View style={styles.propTags}>
            <Text style={styles.propTag}>
              {item.bedrooms ?? 0}室 · {item.size_sqm ?? 0}㎡
            </Text>
          </View>
          <Text style={styles.propPrice}>{formatMoney(item.asking_price, item.currency)}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<Listing[]>([]);
  const [saleItems, setSaleItems] = useState<SaleListing[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bizTab, setBizTab] = useState<'rent' | 'buy'>('rent');
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  // 用户名兜底：后端字段可能是 name / full_name / username，全部缺失则不拼接，避免渲染出 undefined
  const displayName = useMemo(
    () => user?.name || user?.full_name || user?.username || '',
    [user],
  );

  const loadAll = useCallback(async () => {
    const [pRes, payRes, mRes, sRes] = await Promise.allSettled([
      propertiesApi.list({ page: 1, page_size: 20 }),
      paymentsApi.mine(),
      maintenanceApi.list({ page: 1, page_size: 20 }),
      saleListingApi.list({ page: 1, limit: 10 }),
    ]);

    if (pRes.status === 'fulfilled') {
      const data: any = pRes.value?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setListings(items as Listing[]);
    }
    if (payRes.status === 'fulfilled') {
      const data: any = payRes.value?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setPayments(items as Payment[]);
    }
    if (mRes.status === 'fulfilled') {
      const data: any = mRes.value?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setTickets(items as Ticket[]);
    }
    if (sRes.status === 'fulfilled') {
      const data: any = sRes.value?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setSaleItems(items as SaleListing[]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadAll();
    // 兜底：即使个别请求挂起/PostgreSQL 偶发慢，也强制结束 loading，
    // 避免首页永久停留在「加载中」白屏/转圈（实测并发下最坏约 11s）。
    const guard = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, 12000);
    return () => clearTimeout(guard);
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const goListings = useCallback(() => navigation.navigate('Listings'), [navigation]);
  const openProperty = useCallback(
    (id: string) => navigation.navigate('PropertyDetail', { id }),
    [navigation],
  );

  // ---------- 数据驱动区块 ----------
  // 推荐房源：合并原「精选」与「新上房源」两条 rail（同一批数据被切成两条会被误读为两类房源）
  const recommended = useMemo(() => listings.slice(0, 10), [listings]);

  // 城市标签：取真实房源数据中出现的城市（仅作静态展示，不代表 GPS 定位）
  const cityLabel = useMemo(() => {
    const rows: any[] = [...recommended, ...saleItems];
    const city = rows.map((i) => i?.city).find((c: any) => !!c);
    return city ? String(city) : '';
  }, [recommended, saleItems]);

  // 最近动态：账单 + 报修按时间倒序合并。
  // title 只保留类型/事项名，状态一律交给右侧徽标表达，避免同一状态出现两次
  const activities = useMemo(() => {
    const rows: {
      id: string;
      icon: IoniconName;
      color: string;
      bg: string;
      title: string;
      sub: string;
      badge: string;
      at: number;
    }[] = [];
    payments.forEach((p) => {
      const metaText = paymentStatusLabels[String(p.status ?? '')] ?? String(p.status ?? '');
      const typeLabel = paymentTypeLabels[String(p.payment_type ?? '')];
      rows.push({
        id: `pay-${p.id}`,
        icon: 'card-outline',
        color: colors.success,
        bg: colors.successLight,
        title: typeLabel ? `${typeLabel}账单` : '账单',
        sub: p.description || `截止 ${formatDay(p.due_date)}`,
        badge: metaText,
        at: Date.parse(String(p.paid_at ?? p.due_date ?? '')) || 0,
      });
    });
    tickets.forEach((tk) => {
      const meta = ticketStatusMeta[String(tk.status ?? '')] ?? ticketStatusMeta.submitted;
      rows.push({
        id: `maint-${tk.id}`,
        icon: 'build-outline',
        color: meta.color,
        bg: meta.bg,
        title: '报修工单',
        sub: `${tk.title || '报修'} · ${formatDay(tk.createdAt ?? tk.created_at)}`,
        badge: meta.text,
        at: Date.parse(String(tk.createdAt ?? tk.created_at ?? '')) || 0,
      });
    });
    return rows.sort((a, b) => b.at - a.at).slice(0, 5);
  }, [payments, tickets]);

  // 「买房」上下文：隐藏租房 rail，只展示购房 rail
  const isRentTab = bizTab === 'rent';

  // 外层 FlatList 的数据区块：房源 rail / 最近动态。
  // 房源卡统一在横向 rail（ScrollView horizontal）里，纵向只按「区块」懒加载，
  // 避免首页一次性渲染并挂载全部内容。最近动态区块固定渲染（无数据时展示空态），
  // 保证不同身份/状态用户看到一致的页面排版。
  // 加载中仅渲染一个「加载」占位区块：顶部的问候/搜索/Tab 已在 ListHeader 立即展示，
  // 数据到位后该区块替换为实际内容，避免整页停留在白屏/加载漩涡。
  type BodySection = { key: 'rail' | 'activity' | 'loading' };
  const bodySections = useMemo<BodySection[]>(() => {
    if (loading) return [{ key: 'loading' }];
    return [{ key: 'rail' }, { key: 'activity' }];
  }, [loading]);

  // 渲染单个数据区块（rail 内部仍是横向 ScrollView，保持横向滚动行为不变）
  const renderBodySection = ({ item }: { item: BodySection }) => {
    if (loading) {
      // 骨架屏：占位图块 + 灰条，尺寸对齐真实房源卡（210 宽 rail），
      // 比转圈更贴合最终内容，避免数据到位后整块跳变。
      return (
        <View style={styles.skeletonBlock}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('home.featured')}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={false}
            contentContainerStyle={styles.rail}
          >
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skelCard}>
                <View style={styles.skelImg} />
                <View style={styles.skelBody}>
                  <View style={styles.skelLineWide} />
                  <View style={[styles.skelLine, { width: '55%' }]} />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }
    switch (item.key) {
      case 'rail':
        return isRentTab ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('home.featured')}</Text>
              <TouchableOpacity onPress={goListings} activeOpacity={0.7}>
                <Text style={styles.linkText}>更多</Text>
              </TouchableOpacity>
            </View>
            {recommended.length === 0 ? (
              <EmptyState
                icon="home-outline"
                title={t('home.noListings')}
                sub="稍后再来看看新的房源"
                actionLabel="去搜索"
                onAction={goListings}
              />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {recommended.map((it) => (
                  <PropertyCard key={it.id} item={it} onPress={openProperty} />
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>热门二手房</Text>
            </View>
            {saleItems.length === 0 ? (
              <EmptyState
                icon="pricetag-outline"
                title="暂无在售房源"
                sub="当前没有可浏览的在售挂牌"
              />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {saleItems.map((it) => (
                  <SaleCard key={it.id} item={it} onPress={openProperty} />
                ))}
              </ScrollView>
            )}
          </>
        );
      case 'activity':
        return (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>最近动态</Text>
            </View>
            {activities.length === 0 ? (
              <EmptyState
                icon="notifications-outline"
                title="暂无动态"
                sub="账单、报修等动态会显示在这里"
              />
            ) : (
              <View style={styles.card}>
                {activities.map((a, idx) => (
                  <View
                    key={a.id}
                    style={[styles.actRow, idx < activities.length - 1 && styles.actRowDivider]}
                  >
                    <View style={[styles.actIcon, { backgroundColor: a.bg }]}>
                      <Ionicons name={a.icon} size={16} color={a.color} />
                    </View>
                    <View style={styles.actBody}>
                      <Text style={styles.actTitle} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Text style={styles.actSub} numberOfLines={1}>
                        {a.sub}
                      </Text>
                    </View>
                    <View style={[styles.actBadge, { backgroundColor: a.bg }]}>
                      <Text style={[styles.actBadgeText, { color: a.color }]}>{a.badge}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <FlatList
      style={styles.container}
      // 用 insets.top 补顶部安全区（不用 SafeAreaView 包滚动容器，避免横向 rail 被裁切）
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      aria-busy={loading}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      data={bodySections}
      keyExtractor={(s) => s.key}
      renderItem={renderBodySection}
      initialNumToRender={3}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
      ListHeaderComponent={
        <>
      {/* 1. 问候（情感锚点；用户名缺失时退化为通用问候） */}
      <View style={styles.greeting}>
        <Text style={styles.greetingTitle} numberOfLines={1}>
          {displayName
            ? t('home.greeting').replace('{name}', displayName)
            : t('home.greetingGeneric')}
        </Text>
        <Text style={styles.greetingSub} numberOfLines={1}>
          {t('home.greetingSub')}
        </Text>
      </View>

      {/* 2. 城市标签 + 搜索 hero
          - 城市来自房源/租约数据，非 GPS 定位，故用空心图标 +「当前城市」前缀，不暗示已定位
          - 固定行高占位，数据回来时不会让整行突然出现/消失造成跳动 */}
      <View style={styles.locationRow}>
        {!!cityLabel && (
          <>
            <Ionicons name="location-outline" size={14} color={colors.ink2} />
            <Text style={styles.locationText} numberOfLines={1}>
              {t('home.currentCity')} · {cityLabel}
            </Text>
          </>
        )}
      </View>
      <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={goListings}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <Text style={styles.searchPlaceholder}>{t('home.searchPlaceholder')}</Text>
        <View style={styles.searchBtn}>
          <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
        </View>
      </TouchableOpacity>

      {/* 3. 双业务 Tab：租房 / 买房 */}
      <View style={styles.bizTabs}>
        {(['rent', 'buy'] as const).map((b) => (
          <TouchableOpacity
            key={b}
            style={[styles.bizTab, bizTab === b && styles.bizTabActive]}
            onPress={() => setBizTab(b)}
            activeOpacity={0.7}
          >
            <Text style={[styles.bizTabText, bizTab === b && styles.bizTabTextActive]}>
              {b === 'rent' ? '租房' : '买房'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 4. 房源 rail / 最近动态，已移入外层 FlatList 的 data（renderBodySection 按区块懒加载渲染） */}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: colors.spacing.md, paddingBottom: colors.spacing.xxl },
  // 边框与阴影二选一：保留柔和阴影，去掉 1px 描边，避免「边 + 影」双重描边显得层级平
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: colors.spacing.lg,
    marginBottom: colors.spacing.md,
    ...colors.shadow.card,
  },

  /* 问候 */
  greeting: { marginBottom: colors.spacing.md },
  greetingTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  greetingSub: { fontSize: 13, color: colors.ink2, marginTop: 2 },

  /* 搜索 hero */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.full,
    paddingLeft: colors.spacing.lg,
    paddingRight: colors.spacing.xs,
    paddingVertical: colors.spacing.xs,
    marginBottom: colors.spacing.md,
    ...colors.shadow.sm,
  },
  searchPlaceholder: { flex: 1, fontSize: 14, color: colors.ink3 },
  searchBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* 数据区骨架屏：尺寸对齐真实房源卡（propCard 宽 210 / 图高 110） */
  skeletonBlock: { paddingBottom: colors.spacing.sm },
  skelCard: {
    width: 210,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  skelImg: { height: 110, backgroundColor: colors.muted },
  skelBody: { padding: colors.spacing.md, gap: colors.spacing.sm },
  skelLineWide: { height: 14, borderRadius: 7, backgroundColor: colors.muted },
  skelLine: { height: 14, borderRadius: 7, backgroundColor: colors.surface2 },

  /* 双业务 Tab */
  bizTabs: {
    flexDirection: 'row',
    gap: colors.spacing.sm,
    marginBottom: colors.spacing.md,
  },
  bizTab: {
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: colors.spacing.sm,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  bizTabActive: { backgroundColor: colors.primary },
  bizTabText: { fontSize: 14, color: colors.ink2, fontWeight: '600' },
  bizTabTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  /* 城市标签（固定高度占位，避免数据到达时整行跳变） */
  locationRow: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.xs,
    marginBottom: colors.spacing.sm,
  },
  locationText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.ink2 },

  /* 区块标题 */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: colors.spacing.xs,
    marginBottom: colors.spacing.sm,
    paddingHorizontal: colors.spacing.xs,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  linkText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  /* 房源 rail */
  rail: { gap: colors.spacing.md, paddingBottom: colors.spacing.sm },
  propCard: {
    width: 210,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.card,
  },
  propImgWrap: { height: 110, position: 'relative' },
  propImg: { width: '100%', height: 110 },
  propImgPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propBadge: {
    position: 'absolute',
    left: colors.spacing.sm,
    top: colors.spacing.sm,
    backgroundColor: colors.alpha('28,39,51', 0.65),
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 2,
    borderRadius: colors.radius.sm,
  },
  propBadgeText: { fontSize: 12, color: colors.primaryForeground, fontWeight: '600' },
  propBody: { padding: colors.spacing.md },
  propName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  propAddr: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  propTags: { flexDirection: 'row', gap: colors.spacing.xs, marginTop: colors.spacing.sm },
  propTag: {
    fontSize: 12,
    color: colors.ink2,
    backgroundColor: colors.surface2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
    overflow: 'hidden',
  },
  propPrice: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: colors.spacing.sm,
    letterSpacing: -0.2,
  },
  propPriceUnit: { fontSize: 12, fontWeight: '400', color: colors.ink2 },

  /* 最近动态 */
  actRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: colors.spacing.md },
  actRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  actIcon: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actBody: { flex: 1, marginLeft: colors.spacing.md },
  actTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  actSub: { fontSize: 13, color: colors.ink2, marginTop: 2 },
  actBadge: {
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
  },
  actBadgeText: { fontSize: 12, fontWeight: '600' },
});