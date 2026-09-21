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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import { paymentsApi, maintenanceApi } from '@/services/api';
import { publicApi, unwrapPage, type PublicSchool } from '@/services/publicApi';
import { fmtMoney as formatMoney } from '@/utils/format';
import { useI18n } from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { getCachedMeta, setCached } from '@/lib/cache';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

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

/** 首页公开数据（全局一份） */
interface HomePublic {
  listings: Listing[];
  saleItems: SaleListing[];
  /** 国际学校：首页只做「按学校找房」的入口，卡片点击即带着学校去「找房」筛选 */
  schools: PublicSchool[];
}

/** 首页私有数据（按用户隔离） */
interface HomeUser {
  payments: Payment[];
  tickets: Ticket[];
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

// 学校：学段 / 课程体系（与 Web、小程序的取值保持一致）
const stageLabels: Record<string, string> = {
  kindergarten: '幼儿园',
  primary: '小学',
  secondary: '中学',
  high_school: '高中',
  university: '大学',
  k12: '一贯制',
};

const curriculumLabels: Record<string, string> = {
  ib: 'IB',
  american: '美制',
  british: '英制',
  french: '法式',
  german: '德式',
  japanese: '日式',
  thai: '泰制',
  bilingual: '双语',
  other: '其他',
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
  const canOpen = !!item.id;
  return (
    <Pressable
      onPress={() => canOpen && onPress(String(item.id))}
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

/**
 * 学校卡片。与 PropertyCard 同尺寸同结构（图 / 徽标 / 标题 / 副标题 / 标签 / 底部数值），
 * 让「学校」区块和「推荐房源」区块在首页视觉上属于同一层级。
 * 点击不是进学校详情，而是带着这所学校去「找房」——学校在泰国是找房的第一决策因子。
 */
const SchoolCard = React.memo(function SchoolCard({
  item,
  onPress,
}: {
  item: PublicSchool;
  onPress: (item: PublicSchool) => void;
}) {
  // 按压缩放动画值
  const scale = useRef(new Animated.Value(1)).current;
  const photo = item.cover_url ? String(item.cover_url) : null;
  const stage = stageLabels[String(item.stage ?? '')] ?? '国际学校';
  const curriculum = curriculumLabels[String(item.curriculum ?? '')];
  const sub = [item.name_en, item.district].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => onPress(item)}
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
      accessibilityLabel={`${item.name || '学校'}，${sub || '暂无地址'}，查看周边房源`}
    >
      <Animated.View style={[styles.propCard, { transform: [{ scale }] }]}>
        <View style={styles.propImgWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.propImg} resizeMode="cover" />
          ) : (
            <View style={[styles.propImg, styles.propImgPlaceholder]}>
              <Ionicons name="school-outline" size={26} color={colors.ink3} />
            </View>
          )}
          <View style={styles.propBadge}>
            <Text style={styles.propBadgeText}>{stage}</Text>
          </View>
        </View>
        <View style={styles.propBody}>
          <Text style={styles.propName} numberOfLines={1}>
            {item.name || '未命名学校'}
          </Text>
          <Text style={styles.propAddr} numberOfLines={1}>
            {sub || '暂无地址'}
          </Text>
          <View style={styles.propTags}>
            {curriculum ? <Text style={styles.propTag}>{curriculum}</Text> : null}
            {item.age_range ? <Text style={styles.propTag}>{item.age_range}</Text> : null}
          </View>
          <Text style={styles.propPrice} numberOfLines={1}>
            {item.tuition_range || '学费面议'}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bizTab, setBizTab] = useState<'rent' | 'buy'>('rent');
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const locationSel = useLocationStore((s) => s.selection);

  // ---------- TanStack Query：公开数据全局一份；私有数据（账单/工单）按用户隔离 ----------
  // 跨会话秒开由 MMKV 缓存（cache.ts）承担：mount 时读缓存 seed 进 Query Cache（updatedAt 取缓存
  // 时间戳，与 staleTime 对齐 → 3 分钟内不发请求，超时才后台刷新）；会话内由 staleTime 去重。
  // 缓存键带版本：HomePublic 新增 schools 字段后，旧缓存不含该字段，
  // 若继续复用会在 staleTime 内渲染出空的学校区块
  const publicKey = 'home:public:v2';
  const userKey = token ? `home:user:${user?.id ?? 'anon'}` : null;

  const publicQ = useQuery<HomePublic>({
    queryKey: ['home', 'public'],
    queryFn: async () => {
      const [pRes, sRes, scRes] = await Promise.allSettled([
        // 登录/未登录统一走匿名公开层（对齐贝壳：浏览无需注册），保证内容对所有访客一致
        publicApi.listings({ page: 1, page_size: 20, listing_type: 'rent' }),
        publicApi.listings({ page: 1, page_size: 10, listing_type: 'sell' }),
        // 首页学校区块只做入口，取前 8 条即可，列表页才需要全量
        publicApi.schools({ page_size: 8 }),
      ]);
      const next: HomePublic = { listings: [], saleItems: [], schools: [] };
      if (pRes.status === 'fulfilled') {
        const data: any = pRes.value?.data;
        next.listings = (Array.isArray(data) ? data : data?.items ?? data?.data ?? []) as Listing[];
      }
      if (sRes.status === 'fulfilled') {
        const data: any = sRes.value?.data;
        next.saleItems = (Array.isArray(data) ? data : data?.items ?? data?.data ?? []) as SaleListing[];
      }
      if (scRes.status === 'fulfilled') {
        next.schools = unwrapPage<PublicSchool>(scRes.value?.data).items;
      }
      void setCached(publicKey, next);
      return next;
    },
    staleTime: 3 * 60 * 1000,
  });

  const userQ = useQuery<HomeUser>({
    queryKey: ['home', 'user', userKey ?? 'anon'],
    queryFn: async () => {
      const [payRes, mRes] = await Promise.allSettled([
        paymentsApi.mine(),
        maintenanceApi.list({ page: 1, page_size: 20 }),
      ]);
      const next: HomeUser = { payments: [], tickets: [] };
      if (payRes.status === 'fulfilled') {
        const data: any = payRes.value?.data;
        next.payments = (Array.isArray(data) ? data : data?.items ?? data?.data ?? []) as Payment[];
      }
      if (mRes.status === 'fulfilled') {
        const data: any = mRes.value?.data;
        next.tickets = (Array.isArray(data) ? data : data?.items ?? data?.data ?? []) as Ticket[];
      }
      if (userKey) void setCached(userKey, next);
      return next;
    },
    enabled: !!token,
    staleTime: 3 * 60 * 1000,
  });

  const listings = publicQ.data?.listings ?? [];
  const saleItems = publicQ.data?.saleItems ?? [];
  const schools = publicQ.data?.schools ?? [];
  const payments = userQ.data?.payments ?? [];
  const tickets = userQ.data?.tickets ?? [];

  // 冷启动缓存优先：MMKV 命中则立即渲染（秒开），网络刷新在后台进行
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pub, usr] = await Promise.all([
        getCachedMeta<HomePublic>(publicKey),
        userKey ? getCachedMeta<HomeUser>(userKey) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (pub) queryClient.setQueryData(['home', 'public'], pub.data, { updatedAt: pub.t });
      if (usr && userKey) {
        queryClient.setQueryData(['home', 'user', userKey], usr.data, { updatedAt: usr.t });
      }
      if (pub || usr) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, userKey, queryClient]);

  // 无缓存冷启动：查询落定后结束 loading（queryFn 内部 allSettled，不会整体抛错）
  useEffect(() => {
    if (!publicQ.isPending) setLoading(false);
  }, [publicQ.isPending]);

  // 用户名兜底：后端字段可能是 name / full_name / username，全部缺失则不拼接，避免渲染出 undefined
  const displayName = useMemo(
    () => user?.name || user?.full_name || user?.username || '',
    [user],
  );

  // 兜底：即使个别请求挂起/PostgreSQL 偶发慢，也强制结束 loading，
  // 避免首页永久停留在「加载中」白屏/转圈（实测并发下最坏约 11s）。
  useEffect(() => {
    const guard = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, 12000);
    return () => clearTimeout(guard);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.allSettled([
      publicQ.refetch({ cancelRefetch: false }),
      token ? userQ.refetch({ cancelRefetch: false }) : Promise.resolve(),
    ]).finally(() => setRefreshing(false));
  }, [publicQ, userQ, token]);

  const goListings = useCallback(() => navigation.navigate('Listings'), [navigation]);
  const openProperty = useCallback(
    // 卡片 id 为公开层挂牌 id：进公开房源详情（匿名可看，含小区/周边学校/经纪人留资）
    (id: string) => navigation.navigate('PublicListingDetail', { id }),
    [navigation],
  );
  // 学校卡片不是进学校详情，而是带着这所学校跳到「找房」并预选学校筛选（默认 3km）。
  // schoolTs 用时间戳而非学校 id：连续点同一所学校也要重新触发筛选重置。
  const openSchoolListings = useCallback(
    (s: PublicSchool) =>
      navigation.navigate('Listings', {
        schoolId: s.id,
        schoolName: s.name ?? '',
        schoolKm: 3,
        schoolTs: Date.now(),
      }),
    [navigation],
  );

  // ---------- 数据驱动区块 ----------
  // 推荐房源：合并原「精选」与「新上房源」两条 rail（同一批数据被切成两条会被误读为两类房源）
  const recommended = useMemo(() => listings.slice(0, 10), [listings]);

  // 定位城市：来自全局定位 Store（主页左上角选择的国家/城市），当作全局上下文
  const cityLabel = locationSel?.cityLabel || '';

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
  type BodySection = { key: 'rail' | 'school' | 'activity' | 'loading' };
  const bodySections = useMemo<BodySection[]>(() => {
    if (loading) return [{ key: 'loading' }];
    return [{ key: 'rail' }, { key: 'school' }, { key: 'activity' }];
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
      case 'school':
        // 与「推荐房源」同构：区块标题 + 更多 + 横向卡片 rail。
        // 学校是泰国找房的第一决策因子，卡片点击直接带着学校去「找房」做空间筛选。
        return (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('pub.tabSchools')}</Text>
              <TouchableOpacity onPress={goListings} activeOpacity={0.7}>
                <Text style={styles.linkText}>更多</Text>
              </TouchableOpacity>
            </View>
            {schools.length === 0 ? (
              <EmptyState
                icon="school-outline"
                title="暂无学校"
                sub="学校数据完善后会显示在这里"
              />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {schools.map((it) => (
                  <SchoolCard key={it.id} item={it} onPress={openSchoolListings} />
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
    <>
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

      {/* 2. 城市定位（左上角）+ 搜索 hero
          - 国家/城市定位在主页左上角：点击弹出 定位选择器（链家式），写入全局 Store
          - 城市来自全局定位 Store；未定位时回退到 hi 占位 */}
      <TouchableOpacity
        style={styles.locationRow}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('LocationPicker')}
        accessibilityRole="button"
        accessibilityLabel="选择城市"
      >
        <>
          <Ionicons name="location-outline" size={14} color={colors.ink2} />
          <Text style={styles.locationText} numberOfLines={1}>
            {cityLabel ? `${t('home.currentCity')} · ${cityLabel}` : t('home.currentCity')}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.ink3} />
        </>
      </TouchableOpacity>
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

      {/* 4. 学校 / 房源 rail / 最近动态，已移入外层 FlatList 的 data（renderBodySection 按区块懒加载渲染）。
          学校不再是通栏按钮入口，而是与「推荐房源」同构的区块，收在下方。 */}
        </>
      }
    />
    </>
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