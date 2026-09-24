import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Dimensions,
  Animated,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useIsFocused, useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { propertiesApi, translateApi, favoritesApi, viewingsApi, saleListingApi, priceAlertsApi } from '@/services/api';
import { fmtMoney as formatMoney } from '@/utils/format';
import { notify } from '@/utils/feedback';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useI18n } from '@/i18n';

interface PropertyDetail {
  id: string;
  room_number?: string;
  address?: string;
  project_name?: string | null;
  owner_name?: string | null;
  monthly_rent?: number;
  currency?: string;
  deposit_amount?: number;
  deposit_months?: number;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  floor?: number;
  building?: string;
  property_type?: string;
  status?: string;
  furnished?: boolean;
  description?: string;
  photos?: string[];
  video_url?: string;
  [key: string]: any;
}

interface SaleListing {
  id: string;
  title?: string;
  asking_price?: number;
  currency?: string;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  status?: string;
  [key: string]: any;
}

type TFunc = (key: string, params?: Record<string, string | number>) => string;

const typeText = (t: TFunc, type?: string) => {
  switch (type) {
    case 'apartment':
    case 'condo':
      return t('prop.type.apartment');
    case 'villa':
    case 'house':
      return t('prop.type.house');
    case 'shop':
    case 'commercial':
      return t('prop.type.commercial');
    case 'office':
      return t('prop.type.office');
    default:
      return '';
  }
};

const statusText = (t: TFunc, status?: string) => {
  switch (status) {
    case 'vacant':
      return t('status.vacant');
    case 'rented':
      return t('status.rented');
    case 'renewing':
      return t('prop.status.renewing');
    case 'maintenance':
      return t('status.maintenance');
    case 'reserved':
      return t('status.reserved');
    default:
      return '';
  }
};

const screenWidth = Dimensions.get('window').width;
const GALLERY_WIDTH = screenWidth - 32;

export default function PropertyDetailScreen() {
  const isFocused = useIsFocused();
  const { t } = useI18n();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  // 底部安全区：吸底操作栏需要避开手势条
  const insets = useSafeAreaInsets();
  const propertyId: string | undefined = route.params?.id;

  const user = useAuthStore((s) => s.user);
  const uid = user?.id ?? 'anon';
  const [photoIndex, setPhotoIndex] = useState(0);
  const galleryRef = useRef<ScrollView>(null);
  const [biz, setBiz] = useState<'rent' | 'buy'>('rent');

  interface DetailPayload {
    property: PropertyDetail | null;
    saleListing: SaleListing | null;
    projectStats: { avg: number; count: number } | null;
  }

  // 房源详情 + 在售挂牌 + 同小区均价：缓存优先（MMKV seed），后台刷新
  const detailQ = useCachedQuery<DetailPayload>({
    queryKey: ['prop', 'detail', propertyId ?? 'none'],
    cacheKey: `prop:detail:${propertyId ?? 'none'}`,
    queryFn: async (): Promise<DetailPayload> => {
      if (!propertyId) {
        return { property: null, saleListing: null, projectStats: null };
      }
      const [pRes, sRes] = await Promise.allSettled([
        propertiesApi.get(propertyId),
        saleListingApi.list({ property_id: propertyId, limit: 1 }),
      ]);
      if (pRes.status === 'rejected') {
        throw (
          (pRes.reason as any)?.response?.data?.detail ||
          t('prop.detailLoadFail')
        );
      }
      const d: any = pRes.value?.data;
      const item = d?.data ?? d;
      const property = item && item.id ? (item as PropertyDetail) : null;
      let projectStats: DetailPayload['projectStats'] = null;
      if (property?.project_id) {
        try {
          const res = await propertiesApi.list({ project_id: property.project_id, page_size: 50 });
          const dd: any = res?.data;
          const rows = (Array.isArray(dd) ? dd : dd?.items ?? dd?.data ?? []) as PropertyDetail[];
          const rents = rows
            .filter((r) => r.id !== property.id && Number(r.monthly_rent) > 0)
            .map((r) => Number(r.monthly_rent));
          projectStats = rents.length
            ? { avg: Math.round(rents.reduce((a, b) => a + b, 0) / rents.length), count: rents.length }
            : null;
        } catch {
          projectStats = null;
        }
      }
      let saleListing: SaleListing | null = null;
      if (sRes.status === 'fulfilled') {
        const sd: any = sRes.value?.data;
        const items = Array.isArray(sd) ? sd : sd?.items ?? sd?.data ?? [];
        saleListing = (items as SaleListing[])[0] ?? null;
      }
      return { property, saleListing, projectStats };
    },
  });

  const property = detailQ.data?.property ?? null;
  const saleListing = detailQ.data?.saleListing ?? null;
  const projectStats = detailQ.data?.projectStats ?? null;
  const loading = detailQ.isPending && !detailQ.data;
  const loadError = detailQ.isError && !detailQ.data ? String(detailQ.error ?? '') : null;

  // 收藏状态：实时查询不落盘缓存，避免收藏态跨会话陈旧
  const favQ = useQuery({
    queryKey: ['prop', 'fav', propertyId ?? 'none', uid],
    queryFn: async () => {
      try {
        const res: any = await favoritesApi.status(propertyId!);
        return !!(res as any)?.data?.favorited;
      } catch {
        return false;
      }
    },
    enabled: !!propertyId,
    staleTime: 60 * 1000,
  });
  const favorited = favQ.data ?? false;

  // 降价提醒订阅状态：不落盘缓存，避免订阅态跨会话陈旧
  const priceQ = useQuery({
    queryKey: ['prop', 'price-alert', propertyId ?? 'none', uid],
    queryFn: async () => {
      try {
        const res: any = await priceAlertsApi.status(propertyId!);
        return !!(res as any)?.data?.subscribed;
      } catch {
        return false;
      }
    },
    enabled: !!propertyId,
    staleTime: 60 * 1000,
  });
  const subscribed = priceQ.data ?? false;

  // 从其他页面返回详情页时后台刷新（首帧不重复请求）
  const firstFocus = useRef(true);
  useEffect(() => {
    if (!isFocused) return;
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    void detailQ.refetch({ cancelRefetch: false });
  }, [isFocused, detailQ]);

  // biz 初始值跟随房源是否有月租（仅首次，不打断用户手动切换）
  const bizInit = useRef(false);
  useEffect(() => {
    if (property && !bizInit.current) {
      bizInit.current = true;
      setBiz(Number(property.monthly_rent) > 0 ? 'rent' : 'buy');
    }
  }, [property]);

  // 贷款试算：纯本地计算，总价取真实挂牌价，利率/首付/年限由用户输入
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcPrice, setCalcPrice] = useState('');
  const [calcDown, setCalcDown] = useState('30');
  const [calcRate, setCalcRate] = useState('');
  const [calcYears, setCalcYears] = useState('30');

  // 收藏（favBusy 防连点）
  const [favBusy, setFavBusy] = useState(false);
  // 降价提醒订阅（priceBusy 防连点）
  const [priceBusy, setPriceBusy] = useState(false);

  // 翻译（保留原有能力）
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [target, setTarget] = useState<'en' | 'es' | 'ja' | 'ko'>('en');

  // 预约看房
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingTime, setBookingTime] = useState('');
  const [bookingNote, setBookingNote] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);

  const handleToggleFav = async () => {
    if (!propertyId) return;
    setFavBusy(true);
    try {
      if (favorited) {
        await favoritesApi.remove(propertyId);
      } else {
        await favoritesApi.toggle(propertyId);
      }
      void favQ.refetch();
    } catch {
      notify(t('acc.opFailed'), t('prop.retryLater'));
    } finally {
      setFavBusy(false);
    }
  };

  const handleTogglePriceAlert = async () => {
    if (!propertyId) return;
    setPriceBusy(true);
    try {
      if (subscribed) {
        await priceAlertsApi.unsubscribe(propertyId);
      } else {
        await priceAlertsApi.subscribe({ property_id: propertyId });
      }
      void priceQ.refetch();
    } catch {
      notify(t('acc.opFailed'), t('prop.retryLater'));
    } finally {
      setPriceBusy(false);
    }
  };

  const handleBooking = async () => {
    if (!propertyId) return;
    if (!bookingTime.trim()) {
      notify(t('common.hint'), t('prop.viewingTimeRequired'));
      return;
    }
    setBookingBusy(true);
    try {
      await viewingsApi.create({
        property_id: propertyId,
        scheduled_at: bookingTime.trim().replace(' ', 'T'),
        notes: bookingNote.trim() || undefined,
      });
      notify(t('maint.submitSuccess'), t('prop.bookingOkMsg'));
      setBookingOpen(false);
      setBookingTime('');
      setBookingNote('');
    } catch (err: any) {
      notify(t('maint.submitFail'), err?.response?.data?.detail || t('prop.retryLater'));
    } finally {
      setBookingBusy(false);
    }
  };

  const handleTranslate = async () => {
    if (!property?.description) {
      notify(t('common.hint'), t('prop.noDescToast'));
      return;
    }
    setTranslating(true);
    setTranslated('');
    try {
      const res = await translateApi.translate(property.description, target);
      const d = res.data as any;
      setTranslated(
        String(d?.translated_text ?? d?.translation ?? d?.text ?? JSON.stringify(d)),
      );
    } catch (err: any) {
      notify(t('prop.translateFail'), err?.response?.data?.message || t('prop.retryLater'));
    } finally {
      setTranslating(false);
    }
  };

  const langs: { key: typeof target; label: string }[] = [
    { key: 'en', label: 'EN' },
    { key: 'es', label: 'ES' },
    { key: 'ja', label: t('prop.langJa') },
    { key: 'ko', label: t('prop.langKo') },
  ];

  // 主 CTA 按压反馈：按下缩至 0.97、松手 spring 回弹（原生驱动；web 退化默认）
  const favScale = useRef(new Animated.Value(1)).current;
  const bellScale = useRef(new Animated.Value(1)).current;
  const contactScale = useRef(new Animated.Value(1)).current;
  const bookScale = useRef(new Animated.Value(1)).current;
  const pressIn = (v: Animated.Value) =>
    Animated.spring(v, {
      toValue: 0.97,
      speed: 30,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  const pressOut = (v: Animated.Value) =>
    Animated.spring(v, {
      toValue: 1,
      speed: 30,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

  if (loading) {
    return <LoadingState label={t('prop.loadingDetail')} />;
  }

  // 错误态：加载失败时给出原因与重试入口（原实现仅 Alert，web 下不可见）
  if (loadError) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="cloud-offline-outline"
          title={t('loadFailed')}
          sub={loadError}
          actionLabel={t('pub.retry')}
          onAction={() => void detailQ.refetch()}
        />
      </View>
    );
  }

  if (!propertyId) {
    return (
      <View style={styles.container}>
        <EmptyState icon="home-outline" title={t('prop.noSpecified')} sub={t('prop.enterFromList')} />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('prop.goneTitle')}
          sub={t('prop.goneSub')}
          actionLabel={t('prop.goFindListings')}
          onAction={() => navigation.navigate('Listings')}
        />
      </View>
    );
  }

  const photos = Array.isArray(property.photos)
    ? property.photos.filter(Boolean).map((p) => String(p))
    : [];
  const displayName =
    [property.project_name, property.room_number].filter(Boolean).join(' ') ||
    property.address ||
    t('prop.detailTitle');
  const typeLabel = typeText(t, String(property.property_type ?? '')) || t('tab.properties');
  const statusLabel = statusText(t, String(property.status ?? '')) || t('prop.status.rented');

  // 核心信息：仅展示接口真实字段
  const facts: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }[] = [];
  if (property.size_sqm) facts.push({ icon: 'scan-outline', value: `${property.size_sqm}㎡`, label: t('prop.factArea') });
  if (property.bedrooms || property.bathrooms)
    facts.push({
      icon: 'grid-outline',
      value: t('prop.bedBath', { bed: property.bedrooms ?? 0, bath: property.bathrooms ?? 0 }),
      label: t('pub.layout'),
    });
  if (property.floor || property.building)
    facts.push({
      icon: 'layers-outline',
      value: [
        property.building,
        property.floor ? t('prop.floorN', { n: property.floor }) : null,
      ]
        .filter(Boolean)
        .join(' '),
      label: t('prop.factFloor'),
    });
  facts.push({
    icon: 'color-palette-outline',
    value: property.furnished ? t('list.furnished') : t('pub.decoration.bare'),
    label: t('prop.factDecoration'),
  });
  if (property.deposit_amount)
    facts.push({
      icon: 'wallet-outline',
      value: `${formatMoney(property.deposit_amount, property.currency)}${
        property.deposit_months ? ` · ${t('prop.monthsN', { n: property.deposit_months })}` : ''
      }`,
      label: t('pub.deposit'),
    });

  // 卖点与配套：由真实字段派生
  const featureTags = [
    typeLabel,
    statusLabel,
    property.furnished ? t('list.furnished') : t('pub.decoration.bare'),
    ...(property.video_url ? [t('list.videoTour')] : []),
    ...(property.project_name ? [String(property.project_name)] : []),
  ];

  // 与同小区均价对比（正数为高于均价）
  const rentGap =
    projectStats && Number(property.monthly_rent) > 0
      ? Math.round(
          ((Number(property.monthly_rent) - projectStats.avg) / projectStats.avg) * 100,
        )
      : null;

  // 贷款试算（等额本息；总价默认取真实挂牌价，利率等参数由用户输入）
  const calcDownRatio = Math.min(Math.max(Number(calcDown || 0), 0), 100) / 100;
  const calcPrincipal = Math.max(0, Number(calcPrice || 0) * (1 - calcDownRatio));
  const calcMonths = Math.max(1, Math.round(Number(calcYears || 0) * 12));
  const calcMonthly = (() => {
    const monthlyRate = Number(calcRate || 0) / 100 / 12;
    if (!calcPrincipal || monthlyRate <= 0) return 0;
    return (
      (calcPrincipal * monthlyRate * Math.pow(1 + monthlyRate, calcMonths)) /
      (Math.pow(1 + monthlyRate, calcMonths) - 1)
    );
  })();

  const openCalculator = () => {
    setCalcPrice(String(saleListing?.asking_price ?? ''));
    setCalcOpen(true);
  };

  const goPhoto = (i: number) => {
    setPhotoIndex(i);
    galleryRef.current?.scrollTo({ x: i * GALLERY_WIDTH, animated: true });
  };

  return (
    <View style={styles.container}>
      {/* 滚动内容底部预留安全区，避免最后一张卡片贴住吸底栏 */}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: colors.spacing.xxxl + insets.bottom },
        ]}
      >
        {/* 1. 图片轮播 */}
        <View style={styles.gallery}>
          {photos.length ? (
            <>
              <ScrollView
                ref={galleryRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  const i = Math.round(e.nativeEvent.contentOffset.x / GALLERY_WIDTH);
                  setPhotoIndex(i);
                }}
              >
                {photos.map((uri, i) => (
                  <Image key={`${uri}-${i}`} source={{ uri }} style={styles.galleryImg} resizeMode="cover" />
                ))}
              </ScrollView>
              <Text style={styles.galleryCount}>
                {Math.min(photoIndex + 1, photos.length)}/{photos.length}
              </Text>
              {!!property.video_url && (
                <View style={styles.galleryVideo}>
                  <Ionicons name="videocam" size={14} color={colors.primaryForeground} />
                  <Text style={styles.galleryVideoText}>{t('list.videoTour')}</Text>
                </View>
              )}
              {/* 缩略图条：点击切换到对应大图 */}
              {photos.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbRow}
                >
                  {photos.map((uri, i) => (
                    <TouchableOpacity
                      key={`thumb-${uri}-${i}`}
                      activeOpacity={0.8}
                      onPress={() => goPhoto(i)}
                      style={[styles.thumb, i === photoIndex && styles.thumbActive]}
                    >
                      <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          ) : (
            <View style={[styles.galleryImg, styles.galleryPlaceholder]}>
              <Ionicons name="image-outline" size={30} color={colors.ink3} />
              <Text style={styles.galleryPlaceholderText}>{t('prop.noImages')}</Text>
            </View>
          )}
        </View>

        {/* 2. 价格区（租房 / 买房） */}
        <View style={styles.card}>
          <View style={styles.bizTabs}>
            {(['rent', 'buy'] as const).map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.bizTab, biz === b && styles.bizTabActive]}
                onPress={() => setBiz(b)}
                activeOpacity={0.7}
              >
                <Text style={[styles.bizTabText, biz === b && styles.bizTabTextActive]}>
                  {b === 'rent' ? t('pub.typeRent') : t('pub.typeSell')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {biz === 'rent' ? (
            <>
              <View style={styles.priceRow}>
                <View style={styles.priceLeft}>
                  <Text style={styles.priceValue}>
                    {formatMoney(property.monthly_rent, property.currency)}
                    <Text style={styles.priceUnit}>{t('pub.perMonth')}</Text>
                  </Text>
                  <View style={styles.tagRow}>
                    {featureTags.slice(0, 3).map((tag) => (
                      <Text key={tag} style={styles.tag}>
                        {tag}
                      </Text>
                    ))}
                  </View>
                </View>
                <View style={styles.badgeSuccess}>
                  <Text style={styles.badgeSuccessText}>{t('prop.bookable')}</Text>
                </View>
              </View>
              <Text style={styles.propName}>{displayName}</Text>
              <Text style={styles.propAddr}>
                <Ionicons name="location-outline" size={13} color={colors.ink3} /> {property.address || t('prop.noAddress')}
              </Text>
            </>
          ) : saleListing ? (
            <>
              <View style={styles.priceRow}>
                <View style={styles.priceLeft}>
                  <Text style={styles.priceValue}>
                    {formatMoney(saleListing.asking_price, saleListing.currency)}
                    <Text style={styles.priceUnit}> {t('prop.totalPrice')}</Text>
                  </Text>
                  <View style={styles.tagRow}>
                    {[
                      saleListing.size_sqm && saleListing.asking_price
                        ? t('prop.unitPricePerSqm', {
                            price: formatMoney(
                              Math.round(
                                Number(saleListing.asking_price) / Number(saleListing.size_sqm),
                              ),
                              saleListing.currency,
                            ),
                          })
                        : null,
                      saleListing.bedrooms
                        ? t('prop.bedroomN', { n: saleListing.bedrooms })
                        : null,
                    ]
                      .filter(Boolean)
                      .map((tag) => (
                        <Text key={String(tag)} style={styles.tag}>
                          {String(tag)}
                        </Text>
                      ))}
                  </View>
                </View>
                <View style={styles.badgeSuccess}>
                  <Text style={styles.badgeSuccessText}>{t('prop.bookable')}</Text>
                </View>
              </View>
              <Text style={styles.propName}>{saleListing.title || displayName}</Text>
              <Text style={styles.propAddr}>
                <Ionicons name="location-outline" size={13} color={colors.ink3} />{' '}
                {saleListing.address || property.address || t('prop.noAddress')}
              </Text>
              {/* 首付 / 年限提示（月供由「算贷款」按用户输入利率试算） */}
              <TouchableOpacity style={styles.loanHint} activeOpacity={0.8} onPress={openCalculator}>
                <Text style={styles.loanHintText}>
                  {t('prop.loanHint', {
                    down: formatMoney(
                      Math.round(Number(saleListing.asking_price || 0) * 0.3),
                      saleListing.currency,
                    ),
                    years: 30,
                  })}
                </Text>
                <Ionicons name="calculator-outline" size={16} color={colors.primary} />
              </TouchableOpacity>
            </>
          ) : (
            <EmptyState
              icon="pricetag-outline"
              title={t('prop.noSaleListing')}
              sub={t('prop.rentOnly')}
            />
          )}
        </View>

        {/* 3. 核心信息 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('prop.sectionCore')}</Text>
          {facts.length ? (
            <View style={styles.factGrid}>
              {facts.map((f) => (
                <View key={f.label} style={styles.fact}>
                  <Ionicons name={f.icon} size={18} color={colors.primary} />
                  <Text style={styles.factValue} numberOfLines={1}>
                    {f.value}
                  </Text>
                  <Text style={styles.factLabel}>{f.label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState icon="information-circle-outline" title={t('prop.noCore')} />
          )}
          {/* 同小区均价基准（同 project_id 真实房源聚合） */}
          {projectStats && (
            <View style={styles.avgBar}>
              <Text style={styles.avgBarText}>
                {t('prop.avgRentBar', {
                  price: formatMoney(projectStats.avg, property.currency),
                  count: projectStats.count,
                })}
              </Text>
              {rentGap !== null && (
                <Text
                  style={[
                    styles.avgGap,
                    rentGap > 0 ? styles.avgGapHigh : styles.avgGapLow,
                  ]}
                >
                  {rentGap > 0
                    ? t('prop.avgHigh', { pct: rentGap })
                    : rentGap < 0
                    ? t('prop.avgLow', { pct: Math.abs(rentGap) })
                    : t('prop.avgFlat')}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* 4. 房源卖点与配套 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('prop.sectionFeatures')}</Text>
          <View style={styles.chipRow}>
            {featureTags.map((tag) => (
              <View key={tag} style={styles.chip}>
                <Text style={styles.chipText}>{tag}</Text>
              </View>
            ))}
          </View>
          {!!property.owner_name && (
            <Text style={styles.cardMeta}>
              {t('prop.ownerLabel', { name: String(property.owner_name) })}
            </Text>
          )}
        </View>

        {/* 5. 位置与周边 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('prop.sectionLocation')}</Text>
          {property.address || property.project_name ? (
            <>
              <Text style={styles.mapPinLabel}>
                <Ionicons name="location" size={14} color={colors.primary} />{' '}
                {[property.project_name, property.address].filter(Boolean).join(' · ')}
              </Text>
            </>
          ) : (
            <EmptyState icon="map-outline" title={t('prop.noLocation')} />
          )}
        </View>

        {/* 6. 房源描述 + 翻译（保留原有能力） */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('prop.sectionDesc')}</Text>
          <Text style={styles.desc}>{property.description || t('prop.noDesc')}</Text>
          <Text style={styles.subTitle}>{t('prop.googleTranslate')}</Text>
          {property.description ? (
            <View style={styles.langRow}>
              {langs.map((l) => (
                <TouchableOpacity
                  key={l.key}
                  style={[styles.langBtn, target === l.key && styles.langBtnActive]}
                  onPress={() => setTarget(l.key)}
                >
                  <Text style={[styles.langText, target === l.key && styles.langTextActive]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.transBtn, (translating || !property.description) && styles.btnDisabled]}
            onPress={handleTranslate}
            disabled={translating || !property.description}
          >
            {translating ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.transText}>{t('prop.translateDesc')}</Text>
            )}
          </TouchableOpacity>
          {translated ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>{translated}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* 底部固定操作栏（主 CTA：立即预约看房；已避开底部安全区） */}
      <View
        style={[
          styles.actionBar,
          { paddingBottom: Math.max(insets.bottom, colors.spacing.sm) },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: favScale }] }}>
          <TouchableOpacity
            style={styles.favBtn}
            activeOpacity={0.8}
            onPress={handleToggleFav}
            disabled={favBusy}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPressIn={() => pressIn(favScale)}
            onPressOut={() => pressOut(favScale)}
            accessibilityRole="button"
            accessibilityLabel={favorited ? t('list.unfavorite') : t('prop.favA11yOff')}
            accessibilityState={{ disabled: favBusy }}
          >
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={20}
              color={favorited ? colors.error : colors.ink2}
            />
            <Text style={styles.favText}>
              {favorited ? t('prop.favorited') : t('prop.favorite')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: bellScale }] }}>
          <TouchableOpacity
            style={styles.favBtn}
            activeOpacity={0.8}
            onPress={handleTogglePriceAlert}
            disabled={priceBusy}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPressIn={() => pressIn(bellScale)}
            onPressOut={() => pressOut(bellScale)}
            accessibilityRole="button"
            accessibilityLabel={subscribed ? t('pub.priceAlertOn') : t('pub.priceAlertOff')}
            accessibilityState={{ disabled: priceBusy }}
          >
            <Ionicons
              name={subscribed ? 'notifications' : 'notifications-outline'}
              size={20}
              color={subscribed ? colors.primary : colors.ink2}
            />
            <Text style={[styles.favText, subscribed && styles.bellTextActive]}>
              {subscribed ? t('pub.priceAlertOn') : t('pub.priceAlertOff')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: contactScale }] }}>
          <TouchableOpacity
            style={styles.contactBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('ChatList')}
            onPressIn={() => pressIn(contactScale)}
            onPressOut={() => pressOut(contactScale)}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.ink2} />
            <Text style={styles.contactText}>{t('prop.contactBroker')}</Text>
          </TouchableOpacity>
        </Animated.View>
        {/* 算贷款：仅买房业务下展示（对齐原型） */}
        {biz === 'buy' && saleListing ? (
          <TouchableOpacity
            style={styles.contactBtn}
            activeOpacity={0.8}
            onPress={openCalculator}
          >
            <Ionicons name="calculator-outline" size={18} color={colors.ink2} />
            <Text style={styles.contactText}>{t('prop.calcLoan')}</Text>
          </TouchableOpacity>
        ) : null}
        <Animated.View style={{ transform: [{ scale: bookScale }] }}>
          <TouchableOpacity
            style={styles.bookBtn}
            activeOpacity={0.85}
            onPress={() => setBookingOpen(true)}
            onPressIn={() => pressIn(bookScale)}
            onPressOut={() => pressOut(bookScale)}
          >
            <Text style={styles.bookText}>{t('prop.bookNow')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* 预约看房弹层 */}
      <Modal
        visible={bookingOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBookingOpen(false)}
      >
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { paddingBottom: colors.spacing.xxl + insets.bottom }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('pub.bookViewing')}</Text>
              <TouchableOpacity
                onPress={() => setBookingOpen(false)}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalProp} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.label}>{t('prop.viewingTime')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('prop.viewingTimePh')}
              placeholderTextColor={colors.ink3}
              value={bookingTime}
              onChangeText={setBookingTime}
            />
            <Text style={styles.label}>{t('prop.viewingNote')}</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder={t('prop.viewingNotePh')}
              placeholderTextColor={colors.ink3}
              value={bookingNote}
              onChangeText={setBookingNote}
              multiline
              numberOfLines={2}
            />
            <TouchableOpacity
              style={[styles.transBtn, bookingBusy && styles.btnDisabled]}
              onPress={handleBooking}
              disabled={bookingBusy}
            >
              {bookingBusy ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={styles.transText}>{t('prop.submitBooking')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 贷款试算弹层（等额本息，参数由用户输入；总价默认取真实挂牌价） */}
      <Modal
        visible={calcOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCalcOpen(false)}
      >
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { paddingBottom: colors.spacing.xxl + insets.bottom }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{t('prop.calcLoan')}</Text>
              <TouchableOpacity
                onPress={() => setCalcOpen(false)}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalProp} numberOfLines={1}>
              {saleListing?.title || displayName}
            </Text>
            <Text style={styles.label}>{t('prop.calcPrice')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('prop.calcPricePh')}
              placeholderTextColor={colors.ink3}
              keyboardType="numeric"
              value={calcPrice}
              onChangeText={setCalcPrice}
            />
            <View style={styles.calcRow}>
              <View style={styles.calcCol}>
                <Text style={styles.label}>{t('prop.calcDown')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="30"
                  placeholderTextColor={colors.ink3}
                  keyboardType="numeric"
                  value={calcDown}
                  onChangeText={setCalcDown}
                />
              </View>
              <View style={styles.calcCol}>
                <Text style={styles.label}>{t('prop.calcRate')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('prop.calcRatePh')}
                  placeholderTextColor={colors.ink3}
                  keyboardType="numeric"
                  value={calcRate}
                  onChangeText={setCalcRate}
                />
              </View>
              <View style={styles.calcCol}>
                <Text style={styles.label}>{t('prop.calcYears')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="30"
                  placeholderTextColor={colors.ink3}
                  keyboardType="numeric"
                  value={calcYears}
                  onChangeText={setCalcYears}
                />
              </View>
            </View>
            <View style={styles.calcResult}>
              <View style={styles.calcResultRow}>
                <Text style={styles.calcResultLabel}>{t('prop.calcDownAmount')}</Text>
                <Text style={styles.calcResultValue}>
                  {formatMoney(Math.round(Number(calcPrice || 0) * calcDownRatio), saleListing?.currency)}
                </Text>
              </View>
              <View style={styles.calcResultRow}>
                <Text style={styles.calcResultLabel}>{t('prop.calcLoanAmount')}</Text>
                <Text style={styles.calcResultValue}>
                  {formatMoney(Math.round(calcPrincipal), saleListing?.currency)}
                </Text>
              </View>
              <View style={styles.calcResultRow}>
                <Text style={styles.calcResultLabel}>{t('prop.calcMonthly')}</Text>
                <Text style={styles.calcMonthly}>
                  {calcMonthly
                    ? `${formatMoney(Math.round(calcMonthly), saleListing?.currency)}${t('pub.perMonth')}`
                    : t('prop.calcRateRequired')}
                </Text>
              </View>
            </View>
            <Text style={styles.calcNote}>{t('prop.calcNote')}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: colors.spacing.md, paddingBottom: colors.spacing.xxxl },
  card: {
    // 阴影与描边二选一：统一使用柔和阴影，避免叠加产生"重边框"观感
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: colors.spacing.lg,
    marginBottom: colors.spacing.md,
    ...colors.shadow.card,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: colors.spacing.md },
  cardMeta: { fontSize: 12, color: colors.ink2, marginTop: colors.spacing.md },
  subTitle: { fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: colors.spacing.lg, marginBottom: colors.spacing.sm },

  /* 图集 */
  gallery: {
    borderRadius: colors.radius.xl,
    overflow: 'hidden',
    marginBottom: colors.spacing.md,
    backgroundColor: colors.surface,
  },
  galleryImg: { width: GALLERY_WIDTH, height: 220 },
  galleryPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: colors.spacing.sm,
  },
  galleryPlaceholderText: { fontSize: 13, color: colors.ink3 },
  galleryCount: {
    position: 'absolute',
    right: colors.spacing.md,
    bottom: colors.spacing.md,
    backgroundColor: colors.alpha('28,39,51', 0.65),
    color: colors.primaryForeground,
    fontSize: 12,
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 2,
    borderRadius: colors.radius.sm,
    overflow: 'hidden',
  },
  galleryVideo: {
    position: 'absolute',
    left: colors.spacing.md,
    bottom: colors.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
  },
  galleryVideoText: { fontSize: 12, color: colors.primaryForeground, fontWeight: '600' },
  /* 缩略图条 */
  thumbRow: { gap: colors.spacing.sm, padding: colors.spacing.sm },
  thumb: {
    width: 56,
    height: 44,
    borderRadius: colors.radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: { borderColor: colors.primary },
  thumbImg: { width: '100%', height: '100%' },

  /* 同小区均价基准 */
  avgBar: {
    marginTop: colors.spacing.md,
    paddingTop: colors.spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: colors.spacing.xs,
  },
  avgBarText: { fontSize: 13, color: colors.ink2 },
  avgGap: { fontSize: 13, fontWeight: '700' },
  avgGapHigh: { color: colors.warning },
  avgGapLow: { color: colors.success },

  /* 买房：首付 / 贷款试算入口 */
  loanHint: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: colors.spacing.sm,
    marginTop: colors.spacing.md,
    paddingHorizontal: colors.spacing.md,
    paddingVertical: colors.spacing.sm,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
  },
  loanHintText: { flex: 1, fontSize: 12, color: colors.ink2 },

  /* 双业务 Tab */
  bizTabs: { flexDirection: 'row', gap: colors.spacing.sm, marginBottom: colors.spacing.md },
  bizTab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: colors.spacing.sm,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
  },
  bizTabActive: { backgroundColor: colors.primary },
  bizTabText: { fontSize: 14, color: colors.ink2, fontWeight: '600' },
  bizTabTextActive: { color: colors.primaryForeground, fontWeight: '700' },

  /* 价格区 */
  priceRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  priceLeft: { flex: 1 },
  priceValue: { fontSize: 26, fontWeight: '800', color: colors.primary, letterSpacing: -0.5 },
  priceUnit: { fontSize: 12, fontWeight: '400', color: colors.ink2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: colors.spacing.xs, marginTop: colors.spacing.sm },
  tag: {
    fontSize: 12,
    color: colors.ink2,
    backgroundColor: colors.surface2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
    overflow: 'hidden',
  },
  badgeSuccess: {
    backgroundColor: colors.successLight,
    paddingHorizontal: colors.spacing.sm,
    paddingVertical: 3,
    borderRadius: colors.radius.sm,
  },
  badgeSuccessText: { fontSize: 12, fontWeight: '700', color: colors.success },
  propName: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: colors.spacing.md },
  propAddr: { fontSize: 13, color: colors.ink2, marginTop: colors.spacing.xs },

  /* 核心信息 */
  factGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  fact: { width: '33.33%', alignItems: 'center', paddingVertical: colors.spacing.sm },
  factValue: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: colors.spacing.xs },
  factLabel: { fontSize: 12, color: colors.ink2, marginTop: 2 },

  /* 卖点 chips */
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: colors.spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.full,
    paddingHorizontal: colors.spacing.md,
    paddingVertical: colors.spacing.xs,
  },
  chipText: { fontSize: 12, color: colors.ink2 },

  /* 位置 */
  mapPinLabel: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  secondaryBtn: {
    marginTop: colors.spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: colors.radius.full,
    paddingVertical: colors.spacing.sm,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },

  /* 描述与翻译 */
  desc: { fontSize: 14, color: colors.ink, lineHeight: 22 },
  langRow: { flexDirection: 'row', gap: colors.spacing.sm, marginBottom: colors.spacing.md },
  langBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: colors.spacing.lg,
    paddingVertical: colors.spacing.sm,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  langTextActive: { color: colors.primaryForeground },
  transBtn: {
    backgroundColor: colors.primary,
    paddingVertical: colors.spacing.md,
    borderRadius: colors.radius.full,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  transText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '600' },
  resultBox: {
    marginTop: colors.spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    padding: colors.spacing.md,
  },
  resultText: { fontSize: 14, color: colors.ink, lineHeight: 22 },

  /* 底部操作栏 */
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: colors.spacing.sm,
    paddingHorizontal: colors.spacing.md,
    paddingVertical: colors.spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  favBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: colors.spacing.md,
  },
  favText: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  bellTextActive: { color: colors.primary },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: colors.spacing.xs,
    paddingVertical: colors.spacing.md,
    borderRadius: colors.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  contactText: { fontSize: 14, color: colors.ink2, fontWeight: '600' },
  bookBtn: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: colors.spacing.md,
    borderRadius: colors.radius.full,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  bookText: { fontSize: 15, color: colors.primaryForeground, fontWeight: '700' },

  /* 预约弹层 */
  modalWrap: { flex: 1, backgroundColor: colors.alpha('0,0,0', 0.4), justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.xl,
    borderTopRightRadius: colors.radius.xl,
    padding: colors.spacing.lg,
    paddingBottom: colors.spacing.xxl,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: colors.spacing.sm,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  modalProp: { fontSize: 14, color: colors.ink2 },
  label: { fontSize: 13, color: colors.ink2, marginTop: colors.spacing.md, marginBottom: colors.spacing.xs },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: colors.spacing.md,
    paddingVertical: colors.spacing.sm,
    fontSize: 14,
    color: colors.ink,
  },
  textarea: { minHeight: 56, textAlignVertical: 'top' },

  /* 贷款试算 */
  calcRow: { flexDirection: 'row', gap: colors.spacing.sm },
  calcCol: { flex: 1 },
  calcResult: {
    marginTop: colors.spacing.lg,
    padding: colors.spacing.md,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
    gap: colors.spacing.sm,
  },
  calcResultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calcResultLabel: { fontSize: 13, color: colors.ink2 },
  calcResultValue: { fontSize: 14, fontWeight: '600', color: colors.ink },
  calcMonthly: { fontSize: 16, fontWeight: '700', color: colors.primary },
  calcNote: { fontSize: 12, color: colors.ink3, marginTop: colors.spacing.md },
});