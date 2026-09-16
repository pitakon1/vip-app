import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import { propertiesApi, leasesApi, paymentsApi, maintenanceApi, saleListingApi } from '@/services/api';
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
type GridIcon = 'search' | 'map' | 'build' | 'document-text' | 'people' | 'card' | 'key' | 'business' | 'calendar' | 'chatbubbles';

interface GridEntry {
  key: string;
  icon: GridIcon;
  route: string;
  params?: Record<string, any>;
  labelKey?: string;
  label?: string;
}

// 金刚区：按「是否在租」分流。
// 访客/未签约态 = 找房导向（点击直达分类；总入口在顶部搜索栏与底部「房源」Tab，不重复展示）
const VISITOR_GRID: GridEntry[] = [
  { key: 'apartment', labelKey: 'home.apartment', icon: 'key', route: 'TenantListings', params: { filter: 'apartment' } },
  { key: 'office', labelKey: 'home.office', icon: 'business', route: 'TenantListings', params: { filter: 'office' } },
];

// 在租态 = 履约服务（对齐原型 6 格：找房源 / 缴费 / 报修 / 服务 / 文档 / 消息）
const TENANT_GRID: GridEntry[] = [
  { key: 'listings', label: '找房源', icon: 'search', route: 'TenantListings' },
  { key: 'payments', labelKey: 'home.pay', icon: 'card', route: 'Payments' },
  { key: 'maintenance', label: '报修', icon: 'build', route: 'TenantMaintenance' },
  { key: 'services', labelKey: 'home.services', icon: 'people', route: 'TenantServices' },
  { key: 'documents', label: '文档', icon: 'document-text', route: 'Documents' },
  { key: 'messages', label: '消息', icon: 'chatbubbles', route: 'ChatList' },
];

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

const OPEN_TICKET_STATUS = ['submitted', 'accepted', 'in_progress'];

const formatMoney = (v: any, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : 'THB';
  return `${cur === 'THB' ? '฿' : cur}${Number(v || 0).toLocaleString()}`;
};

const formatDay = (x?: string) => (x ? String(x).slice(0, 10) : '—');

const daysSince = (x?: string) => {
  const t = Date.parse(String(x ?? ''));
  if (!t) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};

export default function HomeScreen() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [saleItems, setSaleItems] = useState<SaleListing[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isRenting, setIsRenting] = useState(false);
  const [activeLease, setActiveLease] = useState<any>(null);
  const [bizTab, setBizTab] = useState<'rent' | 'buy'>('rent');
  const { t } = useI18n();
  const navigation = useNavigation<any>();

  const loadAll = useCallback(async () => {
    const [pRes, lRes, payRes, mRes, sRes] = await Promise.allSettled([
      propertiesApi.list({ page: 1, page_size: 20 }),
      leasesApi.mine(),
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

    // 是否在租：命中「生效中」租约则展示租客履约服务，并缓存该租约用于租约状态卡
    if (lRes.status === 'fulfilled') {
      const leases: any = lRes.value?.data;
      const list = Array.isArray(leases) ? leases : leases?.items ?? [];
      const active = (list as any[]).find((l: any) => l?.status === 'active');
      setIsRenting(!!active);
      setActiveLease(active ?? null);
    } else {
      // 接口不可用时保守按访客态展示，避免对非在租用户暴露租客专属入口
      setIsRenting(false);
      setActiveLease(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const activeGrid = isRenting ? TENANT_GRID : VISITOR_GRID;

  const handleEntry = (entry: GridEntry) => {
    navigation.navigate(entry.route, entry.params);
  };

  const goListings = () => navigation.navigate('TenantListings');

  // ---------- 数据驱动区块 ----------
  // 待办：最近一笔待支付账单
  const pendingPayment = useMemo(
    () => payments.find((p) => p.status === 'pending') ?? null,
    [payments],
  );
  // 报修进行中：最近一张未完结工单
  const activeTicket = useMemo(
    () => tickets.find((tk) => OPEN_TICKET_STATUS.includes(String(tk.status ?? ''))) ?? null,
    [tickets],
  );

  const featured = useMemo(() => listings.slice(0, 5), [listings]);
  // 新上房源：除精选外的其余房源，按创建时间倒序
  const fresh = useMemo(() => {
    const ids = new Set(featured.map((i) => i.id));
    return listings
      .filter((i) => !ids.has(i.id))
      .sort(
        (a, b) =>
          (Date.parse(String(b.created_at ?? '')) || 0) -
          (Date.parse(String(a.created_at ?? '')) || 0),
      )
      .slice(0, 5);
  }, [listings, featured]);

  // 定位行：取真实房源/租约数据中出现的城市（无真实数据则不展示该行）
  const cityLabel = useMemo(() => {
    const rows: any[] = [...featured, ...fresh, ...saleItems];
    const city = rows.map((i) => i?.city).find((c: any) => !!c);
    if (city) return String(city);
    const leaseCity = activeLease?.property_city ?? activeLease?.city;
    return leaseCity ? String(leaseCity) : '';
  }, [featured, fresh, saleItems, activeLease]);

  // 最近动态：账单 + 报修按时间倒序合并
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
      rows.push({
        id: `pay-${p.id}`,
        icon: 'card-outline',
        color: colors.success,
        bg: colors.successLight,
        title: `${paymentTypeLabels[String(p.payment_type ?? '')] ?? '账单'}${metaText}`,
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
        title: `报修工单${meta.text}`,
        sub: `${tk.title || '报修'} · ${formatDay(tk.createdAt ?? tk.created_at)}`,
        badge: meta.text,
        at: Date.parse(String(tk.createdAt ?? tk.created_at ?? '')) || 0,
      });
    });
    return rows.sort((a, b) => b.at - a.at).slice(0, 5);
  }, [payments, tickets]);

  // 租约进度 / 剩余天数
  const leaseProgress = useMemo(() => {
    const s = Date.parse(String(activeLease?.start_date ?? ''));
    const e = Date.parse(String(activeLease?.end_date ?? ''));
    if (!s || !e || e <= s) return { percent: 0, remainDays: null as number | null };
    const percent = Math.min(100, Math.max(3, Math.round(((Date.now() - s) / (e - s)) * 100)));
    return { percent, remainDays: Math.ceil((e - Date.now()) / 86400000) };
  }, [activeLease]);

  const openProperty = (id: string) => navigation.navigate('PropertyDetail', { id });

  const renderPropertyCard = (item: Listing) => {
    const photo = Array.isArray(item.photos) && item.photos.length ? String(item.photos[0]) : null;
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.propCard}
        activeOpacity={0.85}
        onPress={() => openProperty(item.id)}
      >
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
      </TouchableOpacity>
    );
  };

  const renderSaleCard = (item: SaleListing) => {
    const photo =
      Array.isArray(item.photos) && item.photos.length ? String(item.photos[0]) : null;
    const canOpen = !!item.property_id;
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.propCard}
        activeOpacity={canOpen ? 0.85 : 1}
        disabled={!canOpen}
        onPress={() => canOpen && openProperty(String(item.property_id))}
      >
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
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* 1. 定位 + 搜索 hero */}
      {!!cityLabel && (
        <View style={styles.locationRow}>
          <Ionicons name="location" size={14} color={colors.primary} />
          <Text style={styles.locationText} numberOfLines={1}>
            {cityLabel}
          </Text>
        </View>
      )}
      <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={goListings}>
        <Ionicons name="search" size={16} color={colors.ink3} />
        <Text style={styles.searchPlaceholder}>{t('home.searchPlaceholder')}</Text>
        <View style={styles.searchBtn}>
          <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
        </View>
      </TouchableOpacity>

      {/* 2. 双业务 Tab：租房 / 买房 */}
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

      {/* 3. 待办：本月租金未付（有真实待支付账单才渲染） */}
      {pendingPayment && (
        <TouchableOpacity
          style={[styles.card, styles.todoPay]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Payments')}
        >
          <View style={styles.cardHead}>
            <View style={styles.badgeWarning}>
              <Text style={styles.badgeWarningText}>本月待办</Text>
            </View>
            <Text style={styles.todoDue}>{formatDay(pendingPayment.due_date)} 到期</Text>
          </View>
          <Text style={styles.todoLabel}>
            {paymentTypeLabels[String(pendingPayment.payment_type ?? '')] ?? '本月租金'}
          </Text>
          <Text style={styles.todoAmount}>
            {formatMoney(pendingPayment.amount, pendingPayment.currency)}
          </Text>
          <Text style={styles.todoSub}>
            {pendingPayment.description || '请及时缴纳，逾期可能影响信用记录'}
          </Text>
          <View style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>立即付款</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* 4. 报修进行中：进度卡（有未完结工单才渲染） */}
      {activeTicket && (
        <TouchableOpacity
          style={[styles.card, styles.todoMaint]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('TenantMaintenance')}
        >
          <View style={styles.cardHead}>
            <View style={styles.badgeInfo}>
              <Text style={styles.badgeInfoText}>报修进行中</Text>
            </View>
            <Text style={styles.ticketNo}>#{String(activeTicket.id).slice(0, 8)}</Text>
          </View>
          <Text style={styles.todoMaintTitle} numberOfLines={1}>
            {activeTicket.title || '报修工单'} ·{' '}
            {(ticketStatusMeta[String(activeTicket.status ?? '')] ?? ticketStatusMeta.submitted).text}
          </Text>
          {!!activeTicket.description && (
            <Text style={styles.todoMaintDesc} numberOfLines={2}>
              {activeTicket.description}
            </Text>
          )}
          <View style={styles.progress}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${
                    (ticketStatusMeta[String(activeTicket.status ?? '')] ?? ticketStatusMeta.submitted)
                      .progress
                  }%`,
                  backgroundColor:
                    (ticketStatusMeta[String(activeTicket.status ?? '')] ?? ticketStatusMeta.submitted)
                      .color,
                },
              ]}
            />
          </View>
          <View style={styles.cardFoot}>
            <Text style={styles.cardFootText}>
              {daysSince(activeTicket.createdAt ?? activeTicket.created_at) !== null
                ? `已处理 ${daysSince(activeTicket.createdAt ?? activeTicket.created_at)} 天`
                : formatDay(activeTicket.createdAt ?? activeTicket.created_at)}
            </Text>
            <Text style={styles.linkText}>查看详情</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* 5. 找房源 Banner */}
      <TouchableOpacity style={styles.banner} activeOpacity={0.85} onPress={goListings}>
        <View style={styles.bannerIcon}>
          <Ionicons name="home" size={22} color={colors.primaryForeground} />
        </View>
        <View style={styles.bannerBody}>
          <Text style={styles.bannerTitle}>找房源</Text>
          <Text style={styles.bannerSub}>搜索房源 · 查看详情 · 预约看房</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.primaryForeground} />
      </TouchableOpacity>

      {/* 6. 功能宫格 */}
      <View style={styles.grid}>
        {activeGrid.map((entry) => (
          <TouchableOpacity
            key={entry.key}
            style={[styles.gridItem, { width: activeGrid.length > 4 ? '33.33%' : '25%' }]}
            activeOpacity={0.7}
            onPress={() => handleEntry(entry)}
          >
            <View style={styles.gridIconBox}>
              <Ionicons name={entry.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.gridLabel}>
              {entry.labelKey ? t(entry.labelKey) : entry.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 7. 房源 rails（受双业务 Tab 控制） */}
      {bizTab === 'rent' ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('home.featured')}</Text>
            <TouchableOpacity onPress={goListings} activeOpacity={0.7}>
              <Text style={styles.linkText}>更多</Text>
            </TouchableOpacity>
          </View>
          {featured.length === 0 ? (
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
              {featured.map(renderPropertyCard)}
            </ScrollView>
          )}

          {fresh.length > 0 && (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>新上房源</Text>
                <TouchableOpacity onPress={goListings} activeOpacity={0.7}>
                  <Text style={styles.linkText}>更多</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {fresh.map(renderPropertyCard)}
              </ScrollView>
            </>
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
              {saleItems.map(renderSaleCard)}
            </ScrollView>
          )}
        </>
      )}

      {/* 8. 租约状态卡（在租态） */}
      {isRenting && activeLease && (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>租约状态</Text>
            <View style={styles.badgeSuccess}>
              <Text style={styles.badgeSuccessText}>{t('home.leaseInforce')}</Text>
            </View>
          </View>
          <Text style={styles.leaseName} numberOfLines={1}>
            {activeLease.property_name || activeLease.room_number || t('home.myLease')}
          </Text>
          <Text style={styles.leaseMeta}>
            {formatMoney(activeLease.monthly_rent ?? activeLease.rent, activeLease.currency)}/月
          </Text>
          <View style={styles.progress}>
            <View style={[styles.progressBar, { width: `${leaseProgress.percent}%` }]} />
          </View>
          <View style={styles.cardFoot}>
            <Text style={styles.cardFootText}>
              {formatDay(activeLease.start_date)} 至 {formatDay(activeLease.end_date)}
            </Text>
            {leaseProgress.remainDays !== null && (
              <Text style={styles.linkText}>剩余 {leaseProgress.remainDays} 天</Text>
            )}
          </View>
        </View>
      )}

      {/* 9. 快捷入口（在租态） */}
      {isRenting && (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>快捷入口</Text>
          </View>
          <View style={styles.quickGrid}>
            {[
              { key: 'listings', icon: 'search' as GridIcon, label: '找房源', route: 'TenantListings' },
              { key: 'upload', icon: 'card' as GridIcon, label: '上传付款', route: 'Payments' },
              { key: 'services', icon: 'people' as GridIcon, label: '预约服务', route: 'TenantServices' },
              { key: 'maintenance', icon: 'build' as GridIcon, label: '提交报修', route: 'TenantMaintenance' },
            ].map((q) => (
              <TouchableOpacity
                key={q.key}
                style={styles.quickItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate(q.route)}
              >
                <View style={styles.quickIconBox}>
                  <Ionicons name={q.icon} size={20} color={colors.primary} />
                </View>
                <Text style={styles.quickLabel}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* 10. 最近动态（有真实数据才渲染） */}
      {activities.length > 0 && (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>最近动态</Text>
          </View>
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
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: colors.spacing.md, paddingBottom: colors.spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: colors.spacing.lg,
    marginBottom: colors.spacing.md,
    ...colors.shadow.card,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: colors.spacing.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: colors.spacing.sm,
  },
  cardFootText: { fontSize: 12, color: colors.ink3 },

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

  /* 定位行 */
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.xs,
    marginBottom: colors.spacing.sm,
  },
  locationText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },

  /* 待办卡 */
  todoPay: { borderLeftWidth: 3, borderLeftColor: colors.warning },
  todoDue: { fontSize: 12, color: colors.ink3 },
  todoLabel: { fontSize: 13, color: colors.ink2 },
  todoAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginTop: colors.spacing.xs,
    letterSpacing: -0.5,
  },
  todoSub: { fontSize: 12, color: colors.ink3, marginTop: colors.spacing.xs, lineHeight: 18 },
  primaryBtn: {
    marginTop: colors.spacing.md,
    backgroundColor: colors.primary,
    borderRadius: colors.radius.full,
    paddingVertical: colors.spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },

  /* 报修卡 */
  todoMaint: { borderLeftWidth: 3, borderLeftColor: colors.info },
  todoMaintTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  todoMaintDesc: { fontSize: 13, color: colors.ink3, marginTop: colors.spacing.xs, lineHeight: 18 },
  ticketNo: { fontSize: 12, color: colors.ink3 },

  /* 进度条 */
  progress: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: colors.spacing.md,
  },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.primary },

  /* 徽标 */
  badgeWarning: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
  },
  badgeWarningText: { fontSize: 11, fontWeight: '700', color: colors.warning },
  badgeInfo: {
    backgroundColor: colors.alpha(colors.infoRgb, 0.1),
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
  },
  badgeInfoText: { fontSize: 11, fontWeight: '700', color: colors.info },
  badgeSuccess: {
    backgroundColor: colors.successLight,
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
  },
  badgeSuccessText: { fontSize: 11, fontWeight: '700', color: colors.success },

  /* 找房源 Banner */
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.md,
    backgroundColor: colors.primary,
    borderRadius: colors.radius.xl,
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: colors.spacing.lg,
    marginBottom: colors.spacing.md,
    ...colors.shadow.primary,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha('255,255,255', 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1 },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  bannerSub: { fontSize: 13, color: colors.alpha('255,255,255', 0.85), marginTop: 2 },

  /* 功能宫格 */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: colors.spacing.lg,
    marginBottom: colors.spacing.md,
    ...colors.shadow.sm,
  },
  gridItem: { alignItems: 'center', paddingVertical: colors.spacing.sm },
  gridIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: colors.spacing.sm,
  },
  gridLabel: { fontSize: 12, color: colors.ink, fontWeight: '500' },

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
  propBadgeText: { fontSize: 11, color: colors.primaryForeground, fontWeight: '600' },
  propBody: { padding: colors.spacing.md },
  propName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  propAddr: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  propTags: { flexDirection: 'row', gap: colors.spacing.xs, marginTop: colors.spacing.sm },
  propTag: {
    fontSize: 11,
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
  propPriceUnit: { fontSize: 11, fontWeight: '400', color: colors.ink2 },

  /* 租约状态卡 */
  leaseName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  leaseMeta: { fontSize: 13, color: colors.ink2, marginTop: colors.spacing.xs },
  secondaryBtn: {
    marginTop: colors.spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: colors.radius.full,
    paddingVertical: colors.spacing.sm,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },

  /* 快捷入口 */
  quickGrid: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: colors.spacing.lg,
    marginBottom: colors.spacing.md,
    ...colors.shadow.sm,
  },
  quickItem: { flex: 1, alignItems: 'center' },
  quickIconBox: {
    width: 42,
    height: 42,
    borderRadius: colors.radius.md,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: colors.spacing.sm,
  },
  quickLabel: { fontSize: 12, color: colors.ink, fontWeight: '500' },

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
  actSub: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  actBadge: {
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
  },
  actBadgeText: { fontSize: 11, fontWeight: '600' },
});