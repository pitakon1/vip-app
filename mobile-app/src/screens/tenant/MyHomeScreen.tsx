import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { ownerApi, leasesApi, paymentsApi, propertyBindingsApi, chatApi } from '@/services/api';
import { publicApi, type PublicListing, type PublicProject, type PublicProjectInsights } from '@/services/publicApi';
import { resolveMediaUrl } from '@/lib/api';
import { isUnpaid } from '@/utils/payment';
import { formatArea, formatMoney, formatUnitPrice } from '@/utils/format';
import BarChart from '@/components/charts/BarChart';
import type { RootStackParamList } from '@/navigation/RootNavigator';

/**
 * C 端「我家」Tab（业主 / 租客共用）。
 *
 * 版式对标贝壳「我家」的长页面节奏：
 *   1. 房源主卡（大图 + 价格 + 户型面积 + 状态）
 *   2. 我的服务（四列宫格，只放贝壳「我家」也有的能力）
 *   3. 服务动态（时间轴：账单 / 租约 / 审核，右上角联系客服）
 *   4. 我家小区房源（在租 / 在售 横向卡）
 *   5. 小区行情（均价 / 在售 / 在租 实时快照）
 *
 * 增值服务只保留宫格一个入口（OwnerServices / TenantServices 同属 ServicesScreen），
 * 不再重复挂「居家服务」卡片。
 *
 * 数据边界：贝壳的成交记录、价格趋势、流通性、竞争力依赖历史成交与供需库，
 * 本端只有平台在架房源快照，因此不做假曲线，只展示能取到的真实数字。
 */

type Nav = NativeStackNavigationProp<RootStackParamList>;
type IconName = keyof typeof Ionicons.glyphMap;

interface FeedItem {
  key: string;
  date?: string;
  title: string;
  meta?: string;
  tone?: 'default' | 'warn';
  onPress: () => void;
}

interface CommunitySnapshot {
  id: string;
  name: string;
  avgPrice: number | null;
  saleCount: number;
  rentCount: number;
  listings: PublicListing[];
}

const fmtDay = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

/** 行情月份标签：2026-08 → 26/08 */
const fmtMonth = (period?: string | null) => {
  const m = /^(\d{4})-(\d{2})/.exec(period ?? '');
  return m ? `${m[1].slice(2)}/${m[2]}` : period ?? '';
};

const leaseTitle = (lease: any, t: (k: string) => string) =>
  lease?.property_name ||
  lease?.room_number ||
  lease?.address ||
  `${t('lease.idPrefix')} #${String(lease?.id ?? '').slice(0, 8)}`;

const isActiveLease = (lease: any) => {
  const status = String(lease?.status ?? '').toLowerCase();
  if (status && status !== 'active') return false;
  const end = new Date(lease?.end_date || lease?.endDate || '').getTime();
  return Number.isNaN(end) ? true : end > Date.now();
};

const propTitle = (property: any, t: (k: string) => string) =>
  property?.name ||
  (property?.project_name
    ? `${property.project_name}·${property.room_number ?? ''}`
    : property?.room_number || property?.address || t('listingFallback'));

const propAddress = (property: any) =>
  [property?.district, property?.city, property?.address].filter(Boolean).join(' · ');

const propCover = (property: any): string | null => {
  const raw =
    property?.cover_image ||
    property?.cover_url ||
    property?.photos?.[0] ||
    property?.images?.[0] ||
    null;
  return resolveMediaUrl(typeof raw === 'string' ? raw : raw?.url);
};

const listingCover = (listing: PublicListing): string | null => {
  const raw = listing?.cover || listing?.photos?.[0] || null;
  return resolveMediaUrl(typeof raw === 'string' ? raw : (raw as any)?.url);
};

export default function MyHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [properties, setProperties] = useState<any[]>([]);
  const [lease, setLease] = useState<any>(null);
  const [binding, setBinding] = useState<any>(null);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [community, setCommunity] = useState<CommunitySnapshot | null>(null);
  const [communityTab, setCommunityTab] = useState<'rent' | 'sell' | null>(null);
  const [insights, setInsights] = useState<PublicProjectInsights | null>(null);
  const [trendMonths, setTrendMonths] = useState<6 | 12>(6);
  const [dealsExpanded, setDealsExpanded] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [managerBusy, setManagerBusy] = useState(false);

  const load = useCallback(async () => {
    const [propsRes, leaseRes, bindRes, payRes] = await Promise.allSettled([
      ownerApi.properties(),
      leasesApi.mine(),
      propertyBindingsApi.mine(),
      paymentsApi.mine(),
    ]);

    if (propsRes.status === 'fulfilled') {
      const payload = propsRes.value?.data;
      const list = Array.isArray(payload) ? payload : payload?.items ?? [];
      setProperties(Array.isArray(list) ? list : []);
    } else {
      setProperties([]);
    }

    if (leaseRes.status === 'fulfilled') {
      const payload = leaseRes.value?.data;
      const list = Array.isArray(payload) ? payload : payload?.items ?? [];
      setLease((Array.isArray(list) ? list : []).find(isActiveLease) ?? null);
    } else {
      setLease(null);
    }

    if (bindRes.status === 'fulfilled') {
      const payload = bindRes.value?.data;
      const list = Array.isArray(payload) ? payload : payload?.items ?? [];
      const sorted = [...(Array.isArray(list) ? list : [])].sort(
        (a, b) =>
          new Date(b?.created_at ?? 0).getTime() - new Date(a?.created_at ?? 0).getTime(),
      );
      setBinding(sorted[0] ?? null);
    } else {
      setBinding(null);
    }

    if (payRes.status === 'fulfilled') {
      const payload = payRes.value?.data;
      const list = Array.isArray(payload) ? payload : payload?.items ?? [];
      const unpaid = (Array.isArray(list) ? list : []).filter(isUnpaid);
      setUnpaidCount(unpaid.length);
      const due = unpaid
        .map((p: any) => p?.due_date)
        .filter(Boolean)
        .sort()[0];
      setNextDue(due ?? null);
    } else {
      setUnpaidCount(0);
      setNextDue(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void load().finally(() => {
        if (alive) setLoading(false);
      });
      return () => {
        alive = false;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      // 小区行情是独立请求，单独触发一次重拉（否则下拉刷新不会更新行情）
      setRefreshTick((v) => v + 1);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const activeProperty = properties[Math.min(activeIdx, Math.max(properties.length - 1, 0))];
  const bindingStatus = String(binding?.status ?? '').toLowerCase();
  const hasPendingBinding = bindingStatus === 'pending' || bindingStatus === 'reviewing';
  const hasRejectedBinding = bindingStatus === 'rejected';
  const mode: 'owner' | 'tenant' | 'empty' =
    properties.length > 0 ? 'owner' : lease ? 'tenant' : 'empty';

  const goto = useCallback(
    (name: keyof RootStackParamList, params?: any) => {
      (navigation.navigate as any)(name, params);
    },
    [navigation],
  );

  const openBinding = useCallback(() => {
    goto('OwnerProperties', { openBinding: true });
  }, [goto]);

  // 专属管家：后端 /chat/support 幂等返回与平台客服（管理员）的会话，
  // 点击后直接进入真实聊天，不走帮助中心静态页。
  const openManager = useCallback(async () => {
    if (managerBusy) return;
    setManagerBusy(true);
    try {
      const res: any = await chatApi.support();
      const conv = res?.data ?? res;
      const id = conv?.id ?? conv?.conversation_id;
      if (!id) throw new Error('missing conversation');
      goto('ChatDetail', { conversationId: id, title: t('myHome.manager') });
    } catch {
      Alert.alert(t('myHome.manager'), t('myHome.managerError'));
    } finally {
      setManagerBusy(false);
    }
  }, [managerBusy, goto, t]);

  // 小区行情 / 小区房源：用房产（或租约）带的 project_name 反查公开楼盘，
  // 取平台在架房源的实时快照；查不到就整段不渲染，不编造行情。
  const projectName = mode === 'owner' ? activeProperty?.project_name : lease?.project_name;

  useEffect(() => {
    if (!projectName) {
      setCommunity(null);
      setInsights(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await publicApi.projects({ q: projectName, page_size: 6 });
        const raw = res?.data;
        const items: PublicProject[] = Array.isArray(raw) ? raw : raw?.items ?? raw?.data?.items ?? [];
        const hit =
          items.find((p) => (p?.name ?? '').trim() === String(projectName).trim()) ?? items[0];
        if (!hit?.id) {
          if (alive) {
            setCommunity(null);
            setInsights(null);
          }
          return;
        }
        // 小区详情（房源 + 快照）与小区画像（成交/流通性/竞争力/全城/出租）并行拉取
        const [detailRes, insightsRes] = await Promise.all([
          publicApi.project(hit.id, { listing_limit: 12 }),
          publicApi.projectInsights(hit.id).catch(() => null),
        ]);
        const detail = detailRes?.data?.data ?? detailRes?.data;
        const insightBody: any = insightsRes
          ? (insightsRes as any)?.data?.data ?? (insightsRes as any)?.data
          : null;
        if (!alive) return;
        setCommunity({
          id: hit.id,
          name: detail?.name ?? hit.name ?? String(projectName),
          avgPrice: detail?.avg_price != null ? Number(detail.avg_price) : null,
          saleCount: Number(detail?.sale_count ?? 0),
          rentCount: Number(detail?.rent_count ?? 0),
          listings: Array.isArray(detail?.listings) ? detail.listings : [],
        });
        setInsights(insightBody?.project_id ? (insightBody as PublicProjectInsights) : null);
      } catch {
        if (alive) {
          setCommunity(null);
          setInsights(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectName, refreshTick]);

  // 当前房源主卡上的真实价格与规格
  const hero = useMemo(() => {
    const isOwner = mode === 'owner';
    const source: any = isOwner ? activeProperty : lease;
    const price = Number(source?.monthly_rent ?? source?.rent ?? 0) || 0;
    const parts: string[] = [];
    if (source?.bedrooms) parts.push(`${source.bedrooms}${t('myHome.bedUnit')}`);
    if (source?.bathrooms) parts.push(`${source.bathrooms}${t('myHome.bathUnit')}`);
    if (source?.size_sqm) parts.push(formatArea(source.size_sqm, t('myHome.areaUnit')));
    return {
      isOwner,
      cover: isOwner ? propCover(activeProperty) : null,
      title: isOwner ? propTitle(activeProperty, t) : leaseTitle(lease, t),
      address: isOwner
        ? propAddress(activeProperty)
        : [lease?.district, lease?.city, lease?.address].filter(Boolean).join(' · '),
      price,
      currency: source?.currency,
      priceText: price ? formatMoney(price, source?.currency) : t('myHome.priceUnset'),
      specText: parts.join(' · '),
      badge: isOwner ? t('myHome.ownerBadge') : t('myHome.tenantBadge'),
    };
  }, [mode, activeProperty, lease, t]);

  const communityRent = useMemo(
    () => (community?.listings ?? []).filter((l) => l.listing_type !== 'sell'),
    [community],
  );
  const communitySale = useMemo(
    () => (community?.listings ?? []).filter((l) => l.listing_type === 'sell'),
    [community],
  );
  const showRentTab = communityRent.length > 0 || Number(community?.rentCount ?? 0) > 0;
  const showSaleTab = communitySale.length > 0 || Number(community?.saleCount ?? 0) > 0;
  const activeCommunityTab: 'rent' | 'sell' =
    communityTab === 'sell' && showSaleTab ? 'sell' : showRentTab ? 'rent' : 'sell';
  const activeCommunityList =
    activeCommunityTab === 'rent' ? communityRent : communitySale;

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];

    if (unpaidCount > 0) {
      items.push({
        key: 'bill',
        date: nextDue ? fmtDay(nextDue) : undefined,
        title: mode === 'owner' ? t('myHome.todoOwnerBill') : t('myHome.todoBill'),
        meta: `${unpaidCount} ${t('myHome.todoBillUnit')}`,
        tone: 'warn',
        onPress: () => goto('Payments'),
      });
    }

    if (lease?.end_date) {
      const days = Math.round((new Date(lease.end_date).getTime() - Date.now()) / 86400000);
      if (days >= 0 && days <= 60) {
        items.push({
          key: 'leaseEnd',
          date: fmtDay(lease.end_date),
          title: t('myHome.todoLease'),
          meta: `${days} ${t('myHome.todoDayUnit')}`,
          tone: 'warn',
          onPress: () => goto('MyLease'),
        });
      }
    }

    if (lease?.start_date) {
      items.push({
        key: 'leaseStart',
        date: fmtDay(lease.start_date),
        title: t('myHome.leaseStart'),
        meta: leaseTitle(lease, t),
        onPress: () => goto('MyLease'),
      });
    }

    if (mode === 'owner' && activeProperty?.tenant_name) {
      items.push({
        key: 'rented',
        title: t('myHome.rentedOut'),
        meta: activeProperty.tenant_name,
        onPress: () => goto('OwnerProperties'),
      });
    }

    return items.slice(0, 4);
  }, [unpaidCount, nextDue, lease, mode, activeProperty, t, goto]);

  const gridItems = useMemo(() => {
    if (mode === 'owner') {
      return [
        { key: 'income', label: t('myHome.gridIncome'), icon: 'trending-up-outline' as IconName, onPress: () => goto('OwnerIncome') },
        { key: 'properties', label: t('myHome.gridProperties'), icon: 'home-outline' as IconName, onPress: () => goto('OwnerProperties') },
        { key: 'marketing', label: t('myHome.gridMarketing'), icon: 'megaphone-outline' as IconName, onPress: () => goto('OwnerMarketing') },
        { key: 'services', label: t('myHome.gridServices'), icon: 'sparkles-outline' as IconName, onPress: () => goto('OwnerServices') },
      ];
    }
    if (mode === 'tenant') {
      return [
        { key: 'bill', label: t('myHome.gridBill'), icon: 'card-outline' as IconName, onPress: () => goto('Payments'), badge: unpaidCount },
        { key: 'repair', label: t('myHome.gridRepair'), icon: 'construct-outline' as IconName, onPress: () => goto('TenantMaintenance') },
        { key: 'lease', label: t('myHome.gridLease'), icon: 'key-outline' as IconName, onPress: () => goto('MyLease') },
        { key: 'value', label: t('myHome.gridValue'), icon: 'analytics-outline' as IconName, onPress: () => goto('ValueEstimate') },
        { key: 'notice', label: t('ann.title'), icon: 'megaphone-outline' as IconName, onPress: () => goto('Announcements') },
        { key: 'services', label: t('myHome.gridServices'), icon: 'sparkles-outline' as IconName, onPress: () => goto('TenantServices') },
      ];
    }
    return [
      { key: 'search', label: t('myHome.gridSearch'), icon: 'search-outline' as IconName, onPress: () => goto('PublicListings') },
      { key: 'new', label: t('myHome.gridNew'), icon: 'business-outline' as IconName, onPress: () => goto('NewHouse') },
      { key: 'community', label: t('myHome.gridCommunity'), icon: 'location-outline' as IconName, onPress: () => goto('PublicCommunities') },
      { key: 'support', label: t('myHome.gridSupport'), icon: 'headset-outline' as IconName, onPress: () => goto('HelpCenter') },
    ];
  }, [mode, t, goto, unpaidCount]);

  const renderBindingCard = () => {
    const rejected = hasRejectedBinding;
    return (
      <TouchableOpacity style={styles.cardPad} activeOpacity={0.85} onPress={openBinding}>
        <View style={styles.stateRow}>
          <View style={[styles.stateIcon, rejected && styles.stateIconWarn]}>
            <Ionicons
              name={rejected ? 'alert-circle-outline' : 'time-outline'}
              size={22}
              color={rejected ? colors.warningInk : colors.primary}
            />
          </View>
          <View style={styles.stateText}>
            <Text style={styles.stateTitle}>
              {rejected ? t('myHome.bindingRejected') : t('myHome.bindingPending')}
            </Text>
            <Text style={styles.stateDesc} numberOfLines={2}>
              {rejected
                ? binding?.reject_reason || binding?.reason || t('myHome.bindingRejectedMeta')
                : t('myHome.bindingPendingMeta')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyHero = () => (
    <View style={styles.cardPad}>
      <View style={styles.emptyRow}>
        <View style={styles.emptyArt}>
          <Ionicons name="home-outline" size={30} color={colors.primary} />
          <View style={styles.emptyArtDot} />
        </View>
        <View style={styles.emptyBody}>
          <Text style={styles.emptyTitle}>{t('myHome.emptyTitle')}</Text>
          <Text style={styles.emptyDesc} numberOfLines={2}>{t('myHome.emptyDesc')}</Text>
        </View>
      </View>
      <View style={styles.emptyActions}>
        <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={openBinding}>
          <Text style={styles.primaryBtnText}>{t('myHome.claim')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={openBinding}>
          <Text style={styles.secondaryBtnText}>{t('myHome.addProperty')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHero = () => {
    if (mode === 'empty') return renderEmptyHero();
    if (hasPendingBinding || hasRejectedBinding) return renderBindingCard();

    const { isOwner, cover, title, address, priceText, specText, badge, price } = hero;

    return (
      <View style={styles.heroCard}>
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => goto(isOwner ? 'OwnerProperties' : 'MyLease')}
        >
          <View style={styles.heroMedia}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={[styles.heroImage, styles.heroFallback]}>
                <Ionicons
                  name={isOwner ? 'home-outline' : 'key-outline'}
                  size={44}
                  color={colors.ink3}
                />
              </View>
            )}
            {cover ? <View style={styles.heroScrim} /> : null}
            <View style={styles.heroTop}>
              <View style={[styles.heroBadge, !cover && styles.heroBadgeLight]}>
                <Text style={[styles.heroBadgeText, !cover && styles.heroBadgeTextLight]}>
                  {badge}
                </Text>
              </View>
              {isOwner && properties.length > 1 ? (
                <TouchableOpacity
                  hitSlop={colors.touch.hitSlop}
                  activeOpacity={0.75}
                  style={[styles.heroSwitch, !cover && styles.heroSwitchLight]}
                  onPress={() => setActiveIdx((idx) => (idx + 1) % properties.length)}
                >
                  <Text style={[styles.heroSwitchText, !cover && styles.heroSwitchTextLight]}>
                    {t('myHome.switch')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.heroBottom}>
              <View style={styles.heroPriceRow}>
                <Text style={[styles.heroPrice, !cover && styles.heroInk]}>
                  {price ? priceText : t('myHome.priceUnset')}
                </Text>
                {price ? (
                  <Text style={[styles.heroPriceUnit, !cover && styles.heroInk2]}>
                    {t('myHome.perMonth')}
                  </Text>
                ) : null}
              </View>
              {specText ? (
                <Text style={[styles.heroSpec, !cover && styles.heroInk2]} numberOfLines={1}>
                  {specText}
                </Text>
              ) : null}
              {address ? (
                <Text style={[styles.heroAddr, !cover && styles.heroInk2]} numberOfLines={1}>
                  {address}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.heroFoot}>
            <Text style={styles.heroFootText} numberOfLines={1}>{title}</Text>
            {isOwner && properties.length > 1 ? (
              <Text style={styles.heroFootMeta}>
                {`${activeIdx + 1}/${properties.length}`}
              </Text>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderGrid = () => (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('myHome.myServices')}</Text>
      </View>
      <View style={styles.grid}>
        {gridItems.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.gridItem}
            activeOpacity={0.8}
            onPress={item.onPress}
          >
            <View style={styles.gridIcon}>
              <Ionicons name={item.icon} size={24} color={colors.primary} />
              {'badge' in item && item.badge ? (
                <View style={styles.gridBadge}>
                  <Text style={styles.gridBadgeText}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.gridLabel} numberOfLines={1}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderManager = () => (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('myHome.community')}</Text>
      </View>
      <TouchableOpacity
        style={styles.guideRow}
        activeOpacity={0.8}
        onPress={openManager}
        disabled={managerBusy}
      >
        <View style={styles.guideIcon}>
          <Ionicons name="person-outline" size={18} color={colors.ink2} />
        </View>
        <Text style={styles.guideLabel} numberOfLines={1}>{t('myHome.manager')}</Text>
        <Text style={styles.guideMeta} numberOfLines={1}>{t('myHome.managerMeta')}</Text>
        {managerBusy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
        )}
      </TouchableOpacity>
    </View>
  );

  const renderFeed = () => (
    <View style={styles.card}>
      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionTitle}>{t('myHome.serviceFeed')}</Text>
        <TouchableOpacity
          hitSlop={colors.touch.hitSlop}
          activeOpacity={0.7}
          onPress={() => goto('HelpCenter')}
        >
          <Text style={styles.linkText}>{t('myHome.contactService')}</Text>
        </TouchableOpacity>
      </View>
      {feed.length > 0 ? (
        <View style={styles.feedList}>
          {feed.map((item, idx) => (
            <TouchableOpacity
              key={item.key}
              style={styles.feedRow}
              activeOpacity={0.8}
              onPress={item.onPress}
            >
              <View style={styles.feedRail}>
                <View style={[styles.feedDot, item.tone === 'warn' && styles.feedDotWarn]} />
                {idx < feed.length - 1 ? <View style={styles.feedLine} /> : null}
              </View>
              <View style={styles.feedBody}>
                {item.date ? <Text style={styles.feedDate}>{item.date}</Text> : null}
                <Text style={styles.feedTitle} numberOfLines={1}>{item.title}</Text>
                {item.meta ? (
                  <Text style={styles.feedMeta} numberOfLines={1}>{item.meta}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>{t('myHome.noServiceFeed')}</Text>
      )}
    </View>
  );

  const renderCommunityListings = () => {
    if (!community || (!showRentTab && !showSaleTab)) return null;

    return (
      <View style={styles.card}>
        <View style={styles.sectionHeadRow}>
          <View style={styles.sectionHeadText}>
            <Text style={styles.sectionTitle}>{t('myHome.communityListings')}</Text>
            <Text style={styles.sectionSub} numberOfLines={1}>{community.name}</Text>
          </View>
          <TouchableOpacity
            hitSlop={colors.touch.hitSlop}
            activeOpacity={0.7}
            onPress={() => goto('PublicCommunityDetail', { id: community.id })}
          >
            <Text style={styles.linkText}>{t('myHome.viewAll')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          {showRentTab ? (
            <TouchableOpacity
              style={styles.tabItem}
              activeOpacity={0.8}
              onPress={() => setCommunityTab('rent')}
            >
              <Text style={[styles.tabText, activeCommunityTab === 'rent' && styles.tabTextActive]}>
                {t('myHome.tabRent')}
              </Text>
              {activeCommunityTab === 'rent' ? <View style={styles.tabLine} /> : null}
            </TouchableOpacity>
          ) : null}
          {showSaleTab ? (
            <TouchableOpacity
              style={styles.tabItem}
              activeOpacity={0.8}
              onPress={() => setCommunityTab('sell')}
            >
              <Text style={[styles.tabText, activeCommunityTab === 'sell' && styles.tabTextActive]}>
                {t('myHome.tabSale')}
              </Text>
              {activeCommunityTab === 'sell' ? <View style={styles.tabLine} /> : null}
            </TouchableOpacity>
          ) : null}
        </View>

        {activeCommunityList.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hList}
          >
            {activeCommunityList.slice(0, 8).map((listing) => {
              const cover = listingCover(listing);
              const price = listing.price ?? listing.monthly_rent ?? listing.asking_price;
              const spec = [
                listing.bedrooms ? `${listing.bedrooms}${t('myHome.bedUnit')}` : '',
                listing.size_sqm ? formatArea(listing.size_sqm, t('myHome.areaUnit')) : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <TouchableOpacity
                  key={listing.id}
                  style={styles.lCard}
                  activeOpacity={0.85}
                  onPress={() => goto('PublicListingDetail', { id: listing.id })}
                >
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.lCover} resizeMode="cover" />
                  ) : (
                    <View style={[styles.lCover, styles.lCoverFallback]}>
                      <Ionicons name="image-outline" size={22} color={colors.ink3} />
                    </View>
                  )}
                  <Text style={styles.lPrice} numberOfLines={1}>
                    {formatMoney(price, listing.currency)}
                    {activeCommunityTab === 'rent' ? t('myHome.perMonth') : ''}
                  </Text>
                  <Text style={styles.lSpec} numberOfLines={1}>{spec || '—'}</Text>
                  <Text style={styles.lName} numberOfLines={1}>
                    {listing.project_name || listing.address || listing.room_number || ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>{t('myHome.noCommunityListings')}</Text>
        )}
      </View>
    );
  };

  const renderMarket = () => {
    if (!community || insights) return null;
    const hasMarket =
      Number(community.avgPrice ?? 0) > 0 ||
      Number(community.saleCount ?? 0) > 0 ||
      Number(community.rentCount ?? 0) > 0;
    if (!hasMarket) return null;

    return (
      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('myHome.communityMarket')}</Text>
        </View>
        <View style={styles.marketGrid}>
          {Number(community.avgPrice ?? 0) > 0 ? (
            <View style={styles.marketItem}>
              <Text style={styles.marketValue} numberOfLines={1}>
                {formatUnitPrice(community.avgPrice)}
              </Text>
              <Text style={styles.marketLabel}>{t('myHome.avgPrice')}</Text>
            </View>
          ) : null}
          {community.saleCount > 0 ? (
            <View style={styles.marketItem}>
              <Text style={styles.marketValue}>{community.saleCount}</Text>
              <Text style={styles.marketLabel}>{t('myHome.onSale')}</Text>
            </View>
          ) : null}
          {community.rentCount > 0 ? (
            <View style={styles.marketItem}>
              <Text style={styles.marketValue}>{community.rentCount}</Text>
              <Text style={styles.marketLabel}>{t('myHome.onRent')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.marketNote}>{t('myHome.marketNote')}</Text>
      </View>
    );
  };

  // ---- 贝壳行情段：全部取 insights 的真实数据，无数据整段隐藏 ----
  const similarDeals = insights?.similar_deals ?? [];
  const trend = insights?.price_trend ?? [];
  const liquidity = insights?.liquidity ?? null;
  const competitiveness = insights?.competitiveness ?? null;
  const cityMarket = insights?.city_market ?? null;
  const rentalMarket = insights?.rental_market ?? null;

  const renderUnlistedNotice = () => {
    if (mode !== 'owner' || !activeProperty || activeProperty.listing_id) return null;
    return (
      <View style={styles.noticeCard}>
        <View style={styles.noticeIcon}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.warningInk} />
        </View>
        <View style={styles.noticeBody}>
          <Text style={styles.noticeTitle}>{t('myHome.unlistedTitle')}</Text>
          <Text style={styles.noticeMeta} numberOfLines={2}>
            {t('myHome.unlistedMeta')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.noticeBtn}
          activeOpacity={0.85}
          onPress={() => goto('OwnerProperties')}
        >
          <Text style={styles.noticeBtnText}>{t('myHome.unlistedCta')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSimilarDeals = () => {
    if (similarDeals.length === 0) return null;
    const rows = dealsExpanded ? similarDeals : similarDeals.slice(0, 3);
    return (
      <View style={styles.card}>
        <View style={styles.sectionHeadRow}>
          <View style={styles.sectionHeadText}>
            <Text style={styles.sectionTitle}>{t('myHome.similarDeals')}</Text>
            <Text style={styles.sectionSub}>{t('myHome.similarDealsSub')}</Text>
          </View>
          <View style={styles.pulseDot} />
        </View>
        <View style={styles.dealList}>
          {rows.map((deal, idx) => {
            const spec = [
              deal.bedrooms ? `${deal.bedrooms}${t('myHome.bedUnit')}` : '',
              deal.size_sqm ? formatArea(deal.size_sqm, t('myHome.areaUnit')) : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View
                key={deal.id}
                style={[styles.dealRow, idx < rows.length - 1 && styles.rowBorder]}
              >
                <View style={styles.dealDate}>
                  <Text style={styles.dealDateText}>{fmtDay(deal.deal_date)}</Text>
                </View>
                <View style={styles.dealBody}>
                  <Text style={styles.dealTitle} numberOfLines={1}>
                    {spec || deal.room_number || '—'}
                  </Text>
                  <Text style={styles.dealMeta} numberOfLines={1}>
                    {t('myHome.dealPriceSqm')} {formatUnitPrice(deal.price_sqm, deal.currency)}
                  </Text>
                </View>
                <Text style={styles.dealPrice} numberOfLines={1}>
                  {formatMoney(deal.sale_price, deal.currency)}
                </Text>
              </View>
            );
          })}
        </View>
        {similarDeals.length > 3 ? (
          <TouchableOpacity
            style={styles.dealMore}
            activeOpacity={0.7}
            onPress={() => setDealsExpanded((v) => !v)}
          >
            <Text style={styles.dealMoreText}>
              {dealsExpanded ? t('myHome.collapse') : t('myHome.viewAll')}
            </Text>
            <Ionicons
              name={dealsExpanded ? 'chevron-up' : 'chevron-down'}
              size={13}
              color={colors.primary}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderPriceTrend = () => {
    const chartData = trend
      .filter((p) => Number(p.avg_price_sqm ?? 0) > 0)
      .slice(-trendMonths)
      .map((p) => ({ label: fmtMonth(p.period), value: Number(p.avg_price_sqm) }));
    if (chartData.length === 0) return null;
    return (
      <View style={styles.card}>
        <View style={styles.sectionHeadRow}>
          <View style={styles.sectionHeadText}>
            <Text style={styles.sectionTitle}>{t('myHome.priceTrend')}</Text>
            <Text style={styles.sectionSub}>{t('myHome.priceTrendSub')}</Text>
          </View>
          <View style={styles.trendChips}>
            {([6, 12] as const).map((n) => {
              const active = trendMonths === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.trendChip, active && styles.trendChipActive]}
                  activeOpacity={0.8}
                  onPress={() => setTrendMonths(n)}
                >
                  <Text
                    style={[styles.trendChipText, active && styles.trendChipTextActive]}
                  >
                    {t('myHome.lastMonths', { n })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.chartWrap}>
          <BarChart data={chartData} height={150} />
        </View>
      </View>
    );
  };

  const renderLiquidity = () => {
    if (!liquidity) return null;
    if (
      liquidity.sold_90d === 0 &&
      liquidity.sold_180d === 0 &&
      liquidity.active_sale_count === 0
    ) {
      return null;
    }
    return (
      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('myHome.liquidity')}</Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{liquidity.sold_90d}</Text>
            <Text style={styles.statLabel}>{t('myHome.sold90d')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{liquidity.sold_180d}</Text>
            <Text style={styles.statLabel}>{t('myHome.sold180d')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>
              {liquidity.clearance_months != null
                ? `${liquidity.clearance_months}${t('myHome.monthsUnit')}`
                : '—'}
            </Text>
            <Text style={styles.statLabel}>{t('myHome.clearance')}</Text>
          </View>
        </View>
        <Text style={styles.marketNote}>
          {`${liquidity.active_sale_count}${t('myHome.unitsUnit')} · ${t('myHome.onSale')}`}
        </Text>
      </View>
    );
  };

  const renderCompetitiveness = () => {
    if (!competitiveness) return null;
    const cheaper = competitiveness.delta_pct <= 0;
    return (
      <View style={styles.card}>
        <View style={styles.sectionHeadRow}>
          <View style={styles.sectionHeadText}>
            <Text style={styles.sectionTitle}>{t('myHome.competitiveness')}</Text>
            {competitiveness.district ? (
              <Text style={styles.sectionSub}>{competitiveness.district}</Text>
            ) : null}
          </View>
          <View
            style={[
              styles.deltaChip,
              { backgroundColor: cheaper ? colors.successLight : colors.warningSoft },
            ]}
          >
            <Text
              style={[
                styles.deltaChipText,
                { color: cheaper ? colors.success : colors.warningInk },
              ]}
            >
              {`${Math.abs(competitiveness.delta_pct)}% ${
                cheaper ? t('myHome.belowDistrict') : t('myHome.aboveDistrict')
              }`}
            </Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatUnitPrice(competitiveness.project_price_sqm)}
            </Text>
            <Text style={styles.statLabel}>{t('myHome.avgPrice')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatUnitPrice(competitiveness.district_price_sqm)}
            </Text>
            <Text style={styles.statLabel}>{t('myHome.districtAvg')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>
              {competitiveness.district_rank && competitiveness.district_total
                ? t('myHome.rankOf', {
                    rank: competitiveness.district_rank,
                    total: competitiveness.district_total,
                  })
                : '—'}
            </Text>
            <Text style={styles.statLabel}>{t('myHome.districtRank')}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCityMarket = () => {
    if (!cityMarket) return null;
    return (
      <View style={styles.card}>
        <View style={styles.sectionHeadRow}>
          <View style={styles.sectionHeadText}>
            <Text style={styles.sectionTitle}>{t('myHome.cityMarket')}</Text>
            {cityMarket.city ? (
              <Text style={styles.sectionSub}>{cityMarket.city}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatUnitPrice(cityMarket.avg_price_sqm)}
            </Text>
            <Text style={styles.statLabel}>{t('myHome.cityAvgPrice')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{cityMarket.sale_count}</Text>
            <Text style={styles.statLabel}>{t('myHome.onSale')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{cityMarket.rent_count}</Text>
            <Text style={styles.statLabel}>{t('myHome.onRent')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{cityMarket.sold_30d}</Text>
            <Text style={styles.statLabel}>{t('myHome.citySold30d')}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderRentalMarket = () => {
    if (!rentalMarket) return null;
    return (
      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('myHome.rentalMarket')}</Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatMoney(rentalMarket.avg_rent, rentalMarket.currency)}
            </Text>
            <Text style={styles.statLabel}>{t('myHome.avgRent')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatUnitPrice(rentalMarket.avg_rent_sqm, rentalMarket.currency)}
            </Text>
            <Text style={styles.statLabel}>{t('myHome.rentPerSqm')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{rentalMarket.rent_count}</Text>
            <Text style={styles.statLabel}>{t('myHome.onRent')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1}>
              {rentalMarket.gross_yield_pct != null
                ? `${rentalMarket.gross_yield_pct}%`
                : '—'}
            </Text>
            <Text style={styles.statLabel}>{t('myHome.grossYield')}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderGuide = () => (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('myHome.guide')}</Text>
      </View>
      {[
        { key: 'claim', label: t('myHome.claim'), meta: t('myHome.claimMeta'), icon: 'home-outline' as IconName, onPress: openBinding },
        { key: 'add', label: t('myHome.addProperty'), meta: t('myHome.addPropertyMeta'), icon: 'add-circle-outline' as IconName, onPress: openBinding },
        { key: 'help', label: t('myHome.help'), meta: t('myHome.helpMeta'), icon: 'headset-outline' as IconName, onPress: () => goto('HelpCenter') },
      ].map((row, idx, arr) => (
        <TouchableOpacity
          key={row.key}
          style={[styles.guideRow, idx < arr.length - 1 && styles.rowBorder]}
          activeOpacity={0.8}
          onPress={row.onPress}
        >
          <View style={styles.guideIcon}>
            <Ionicons name={row.icon} size={18} color={colors.ink2} />
          </View>
          <Text style={styles.guideLabel} numberOfLines={1}>{row.label}</Text>
          <Text style={styles.guideMeta} numberOfLines={1}>{row.meta}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('myHome.title')}</Text>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {renderHero()}
            {renderGrid()}
            {mode !== 'empty' ? renderSimilarDeals() : null}
            {renderUnlistedNotice()}
            {mode !== 'empty' ? renderFeed() : null}
            {mode !== 'empty' ? renderManager() : null}
            {mode !== 'empty' ? renderCommunityListings() : null}
            {mode !== 'empty' ? renderMarket() : null}
            {mode !== 'empty' ? renderPriceTrend() : null}
            {mode !== 'empty' ? renderLiquidity() : null}
            {mode !== 'empty' ? renderCompetitiveness() : null}
            {mode !== 'empty' ? renderCityMarket() : null}
            {mode !== 'empty' ? renderRentalMarket() : null}
            {mode === 'empty' ? renderGuide() : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    lineHeight: 34,
    fontWeight: colors.fontWeight.bold,
    color: colors.ink,
  },
  loading: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.card,
  },
  cardPad: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...colors.shadow.card,
  },
  sectionHead: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },
  sectionHeadText: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
  },
  sectionSub: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },
  linkText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },
  emptyText: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink3,
  },

  // ---- 房源主卡（对标贝壳顶部房源摘要）----
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...colors.shadow.card,
  },
  heroMedia: {
    height: 188,
    backgroundColor: colors.surface2,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface2,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23, 26, 29, 0.32)',
  },
  heroTop: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: colors.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroBadgeLight: {
    backgroundColor: colors.primarySoft,
  },
  heroBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
  },
  heroBadgeTextLight: {
    color: colors.ink2,
  },
  heroSwitch: {
    backgroundColor: 'rgba(23, 26, 29, 0.45)',
    borderRadius: colors.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heroSwitchLight: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroSwitchText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.onDark,
  },
  heroSwitchTextLight: {
    color: colors.ink2,
  },
  heroBottom: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    gap: 2,
  },
  heroPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  heroPrice: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: colors.fontWeight.bold,
    color: colors.onDark,
  },
  heroPriceUnit: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.onDark,
    marginBottom: 3,
  },
  heroInk: {
    color: colors.ink,
  },
  heroInk2: {
    color: colors.ink2,
  },
  heroSpec: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.onDark,
  },
  heroAddr: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.onDark,
  },
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heroFootText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
  },
  heroFootMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },

  // ---- 空态 / 审核态 ----
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  emptyArt: {
    width: 64,
    height: 64,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyArtDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    right: 12,
    top: 12,
    backgroundColor: colors.primary,
  },
  emptyBody: {
    flex: 1,
    gap: 4,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
  },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink3,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  primaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: colors.fontWeight.semibold,
    color: colors.primaryForeground,
  },
  secondaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: colors.fontWeight.medium,
    color: colors.ink2,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stateIcon: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateIconWarn: {
    backgroundColor: colors.warningSoft,
  },
  stateText: {
    flex: 1,
    gap: 2,
  },
  stateTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
  },
  stateDesc: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },

  // ---- 四列宫格 ----
  grid: {
    flexDirection: 'row',
    paddingBottom: 14,
    paddingHorizontal: 8,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  gridIcon: {
    width: 44,
    height: 44,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    color: colors.onDark,
    fontWeight: colors.fontWeight.semibold,
  },
  gridLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink2,
  },

  // ---- 服务动态时间轴 ----
  feedList: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: 14,
  },
  feedRail: {
    width: 12,
    alignItems: 'center',
    paddingTop: 5,
    alignSelf: 'stretch',
  },
  feedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink3,
  },
  feedDotWarn: {
    backgroundColor: colors.warning,
  },
  feedLine: {
    position: 'absolute',
    top: 13,
    bottom: -3,
    width: 1,
    backgroundColor: colors.line,
  },
  feedBody: {
    flex: 1,
    gap: 2,
  },
  feedDate: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },
  feedTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: colors.fontWeight.medium,
    color: colors.ink,
  },
  feedMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },

  // ---- 小区房源 ----
  tabs: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 14,
  },
  tabItem: {
    paddingBottom: 8,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink3,
  },
  tabTextActive: {
    color: colors.ink,
    fontWeight: colors.fontWeight.semibold,
  },
  tabLine: {
    marginTop: 6,
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  hList: {
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  lCard: {
    width: 144,
    gap: 3,
  },
  lCover: {
    width: 144,
    height: 92,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    marginBottom: 4,
  },
  lCoverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lPrice: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
  },
  lSpec: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink2,
  },
  lName: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },

  // ---- 小区行情 ----
  marketGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  marketItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
  },
  marketValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
  },
  marketLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },
  marketNote: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    fontSize: 11,
    lineHeight: 15,
    color: colors.ink3,
  },

  // ---- 未挂牌提示 ----
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...colors.shadow.card,
  },
  noticeIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeBody: {
    flex: 1,
    gap: 2,
  },
  noticeTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
  },
  noticeMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },
  noticeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
  },
  noticeBtnText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: colors.fontWeight.semibold,
    color: colors.primaryForeground,
  },

  // ---- 相似房源成交 ----
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  dealList: {
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  dealDate: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
  },
  dealDateText: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.ink3,
    fontVariant: ['tabular-nums'],
  },
  dealBody: {
    flex: 1,
    gap: 2,
  },
  dealTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: colors.fontWeight.medium,
    color: colors.ink,
  },
  dealMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },
  dealPrice: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  dealMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  dealMoreText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: colors.fontWeight.medium,
    color: colors.primary,
  },

  // ---- 行情统计（趋势 / 流通性 / 竞争力 / 全城 / 出租）----
  chartWrap: {
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  trendChips: { flexDirection: 'row', gap: 6 },
  trendChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  trendChipActive: { backgroundColor: colors.primarySoft },
  trendChipText: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.ink3,
    fontWeight: colors.fontWeight.medium,
  },
  trendChipTextActive: { color: colors.primary, fontWeight: colors.fontWeight.semibold },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
  },
  statValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: colors.fontWeight.semibold,
    color: colors.ink,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.ink3,
    textAlign: 'center',
  },
  deltaChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: colors.radius.full,
  },
  deltaChipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: colors.fontWeight.semibold,
  },

  // ---- 空态引导行 ----
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  guideIcon: {
    width: 32,
    height: 32,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  guideMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink3,
  },
});
