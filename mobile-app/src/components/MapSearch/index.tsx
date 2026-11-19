import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/utils/format';
import { BANGKOK_CENTER } from '@/constants/location';
import RemoteImage from '@/components/RemoteImage';
import { publicApi, type PublicMapPoint } from '@/services/publicApi';
import { priceRanges, salePriceRanges } from '@/components/ListingsFeed';
import MapCanvas from './MapCanvas';
import type {
  MapFocus,
  MapPointMarker,
  MapRegionInput,
  MapSearchProps,
  MapViewportBounds,
} from './types';

const REGION_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.032 };
const CARD_GAP = 12;
const POINT_LIMIT = 60;

interface Option {
  key: string;
  label: string;
  min?: number;
  max?: number;
}

const regionToBounds = (region: MapRegionInput): MapViewportBounds => ({
  min_lat: region.latitude - region.latitudeDelta / 2,
  max_lat: region.latitude + region.latitudeDelta / 2,
  min_lng: region.longitude - region.longitudeDelta / 2,
  max_lng: region.longitude + region.longitudeDelta / 2,
});

/** 价格口径：公开接口的 price 已统一（租=月租、售=挂牌价），空值再回退月租 */
const pointAmount = (p: PublicMapPoint): number => p.price || p.monthly_rent || 0;

/** 两点球面距离（km），与列表卡片同口径 */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * 贝壳式全屏地图找房。
 *
 * 结构：全屏地图（价格气泡）+ 顶部悬浮搜索/筛选 + 底部房源卡片横滑，
 * 卡片与气泡双向联动（点气泡滚动卡片、滑卡片居中地图）。
 * 移动视野后按当前 bounds 重新拉取点位。
 */
export default function MapSearch({
  visible,
  onClose,
  onOpenPoint,
  city,
  listingType,
  propertyType,
  isNewDevelopment,
  keyword,
  userPos,
}: MapSearchProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const initialRegion = useMemo<MapRegionInput>(
    () => ({
      latitude: userPos?.lat ?? BANGKOK_CENTER.lat,
      longitude: userPos?.lng ?? BANGKOK_CENTER.lng,
      ...REGION_DELTA,
    }),
    // 仅在打开地图时取一次初始中心；进入后由地图自身维护视野
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );

  const [points, setPoints] = useState<PublicMapPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [bounds, setBounds] = useState<MapViewportBounds>(() => regionToBounds(initialRegion));
  const [districts, setDistricts] = useState<string[]>([]);
  const [openPanel, setOpenPanel] = useState<'region' | 'price' | 'bed' | null>(null);

  const [district, setDistrict] = useState('');
  const [priceKey, setPriceKey] = useState('');
  const [bedKey, setBedKey] = useState('');
  const [searchText, setSearchText] = useState(keyword ?? '');
  const [appliedKeyword, setAppliedKeyword] = useState(keyword ?? '');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const listRef = useRef<FlatList<PublicMapPoint>>(null);
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cardWidth = Math.min(width - 32, 420);
  const cardInterval = cardWidth + CARD_GAP;

  const PRICE_OPTIONS = useMemo(
    () => (listingType === 'sell' ? salePriceRanges(t) : priceRanges(t)),
    [listingType, t],
  );
  const BED_OPTIONS = useMemo<Option[]>(
    () => [
      { key: '', label: t('common.any') },
      { key: '1', label: t('prop.bedroomN', { n: 1 }) },
      { key: '2', label: t('prop.bedroomN', { n: 2 }) },
      { key: '3', label: t('list.bed3plus') },
    ],
    [t],
  );
  const REGION_OPTIONS = useMemo<Option[]>(
    () => [{ key: '', label: t('common.any') }, ...districts.map((d) => ({ key: d, label: d }))],
    [districts, t],
  );

  const selectedPrice = PRICE_OPTIONS.find((p) => p.key === priceKey) ?? PRICE_OPTIONS[0];

  const query = useMemo(() => {
    const q: Parameters<typeof publicApi.mapPoints>[0] = {
      limit: POINT_LIMIT,
      ...bounds,
    };
    if (listingType) q.listing_type = listingType;
    if (city) q.city = city;
    if (propertyType?.length) q.property_type = propertyType;
    if (isNewDevelopment !== undefined) q.is_new_development = isNewDevelopment;
    if (appliedKeyword.trim()) q.q = appliedKeyword.trim();
    if (district) q.district = district;
    if (selectedPrice?.min && selectedPrice.min > 0) q.price_min = selectedPrice.min;
    if (selectedPrice?.max && Number.isFinite(selectedPrice.max) && selectedPrice.max > 0) {
      q.price_max = selectedPrice.max;
    }
    if (bedKey) q.bedrooms = Number(bedKey);
    return q;
  }, [
    appliedKeyword,
    bedKey,
    bounds,
    city,
    district,
    isNewDevelopment,
    listingType,
    propertyType,
    selectedPrice,
  ]);

  // 视野变化后按 bounds 拉点位（打断 400ms 内的连续拖动）
  const handleBoundsChange = useCallback((next: MapViewportBounds) => {
    if (boundsTimer.current) clearTimeout(boundsTimer.current);
    boundsTimer.current = setTimeout(() => setBounds(next), 400);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    publicApi
      .mapPoints(query)
      .then((res) => {
        if (cancelled) return;
        const data: any = res?.data;
        const items: PublicMapPoint[] = Array.isArray(data)
          ? data
          : (data?.items ?? data?.data ?? []);
        setPoints(items.filter((p) => p.lat != null && p.lng != null));
      })
      .catch(() => {
        if (cancelled) return;
        setPoints([]);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, visible]);

  // 区域筛选项跟随业务口径（及城市）
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    publicApi
      .districts({
        city,
        listing_type: listingType,
        property_type: propertyType,
      })
      .then((res) => {
        if (cancelled) return;
        const data: any = res?.data;
        const rows: { district?: string | null }[] = Array.isArray(data)
          ? data
          : (data?.items ?? data?.data ?? []);
        setDistricts(
          Array.from(
            new Set(rows.map((r) => (r?.district ?? '').trim()).filter((d): d is string => !!d)),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setDistricts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [city, listingType, propertyType, visible]);

  // 点位更新后保持选中合法：视野内没有当前房源就选第一套（与贝壳一致）
  useEffect(() => {
    if (!points.length) {
      setSelectedId(null);
      setCardIndex(0);
      return;
    }
    if (!selectedId || !points.some((p) => p.id === selectedId)) {
      setSelectedId(points[0].id);
      setCardIndex(0);
    }
  }, [points, selectedId]);

  useEffect(() => {
    if (!visible) {
      setOpenPanel(null);
      return;
    }
    setPoints([]);
    setSelectedId(null);
    setCardIndex(0);
    setFocus(null);
    setSearchText(keyword ?? '');
    setAppliedKeyword(keyword ?? '');
    setDistrict('');
    setPriceKey('');
    setBedKey('');
    setBounds(regionToBounds(initialRegion));
  }, [visible, initialRegion, keyword]);

  const markers = useMemo<MapPointMarker[]>(
    () =>
      points.map((p) => ({
        id: p.id,
        lat: Number(p.lat),
        lng: Number(p.lng),
        priceLabel: formatMoney(pointAmount(p), p.currency || 'THB'),
      })),
    [points],
  );

  const focusPoint = useCallback((point: PublicMapPoint) => {
    setFocus({ lat: Number(point.lat), lng: Number(point.lng), ts: Date.now() });
  }, []);

  const selectFromMap = useCallback(
    (id: string) => {
      const index = points.findIndex((p) => p.id === id);
      if (index < 0) return;
      setSelectedId(id);
      setCardIndex(index);
      focusPoint(points[index]);
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
    },
    [focusPoint, points],
  );

  const selectFromCard = useCallback(
    (index: number) => {
      const point = points[index];
      if (!point) return;
      setCardIndex(index);
      setSelectedId(point.id);
      focusPoint(point);
    },
    [focusPoint, points],
  );

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / cardInterval);
    if (index !== cardIndex) selectFromCard(index);
  };

  const resetFilters = () => {
    setDistrict('');
    setPriceKey('');
    setBedKey('');
  };

  const renderCard = ({ item }: { item: PublicMapPoint }) => {
    const isSellPoint = item.listing_type === 'sell' || listingType === 'sell';
    const price = formatMoney(pointAmount(item), item.currency || 'THB');
    const title = item.project_name || item.address || item.room_number || '—';
    const facts = [
      item.bedrooms != null ? t('prop.bedroomN', { n: item.bedrooms }) : null,
      item.size_sqm != null ? `${item.size_sqm} ${t('pub.sqm')}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const dist =
      userPos && item.lat != null && item.lng != null
        ? distanceKm(userPos, { lat: Number(item.lat), lng: Number(item.lng) })
        : null;

    return (
      <TouchableOpacity
        style={[styles.card, { width: cardWidth }]}
        activeOpacity={0.9}
        onPress={() => onOpenPoint(item)}
        accessibilityRole="button"
      >
        <RemoteImage uri={item.cover} style={styles.cardCover} resizeMode="cover" iconSize={22} />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>
          {facts ? (
            <Text style={styles.cardFacts} numberOfLines={1}>
              {facts}
            </Text>
          ) : null}
          <View style={styles.cardBottom}>
            <Text style={styles.cardPrice} numberOfLines={1}>
              {price}
              {isSellPoint ? null : (
                <Text style={styles.cardPriceSub}>{t('rent.perMonth')}</Text>
              )}
            </Text>
            {dist != null ? (
              <Text style={styles.cardDist} numberOfLines={1}>
                {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} ${t('pub.km')}`}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const chipLabel = (kind: 'region' | 'price' | 'bed') => {
    if (kind === 'region') return district || t('map.filterRegion');
    if (kind === 'price') return priceKey ? selectedPrice?.label ?? t('map.filterPrice') : t('map.filterPrice');
    const bed = BED_OPTIONS.find((b) => b.key === bedKey);
    return bedKey ? bed?.label ?? t('map.filterBed') : t('map.filterBed');
  };

  const activeFilters = !!(district || priceKey || bedKey);

  const optionsForPanel: Option[] =
    openPanel === 'region' ? REGION_OPTIONS : openPanel === 'price' ? PRICE_OPTIONS : BED_OPTIONS;
  const currentKey = openPanel === 'region' ? district : openPanel === 'price' ? priceKey : bedKey;
  const pickOption = (key: string) => {
    if (openPanel === 'region') setDistrict(key);
    if (openPanel === 'price') setPriceKey(key);
    if (openPanel === 'bed') setBedKey(key);
    setOpenPanel(null);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <MapCanvas
          points={markers}
          selectedId={selectedId}
          initialRegion={initialRegion}
          focus={focus}
          userPos={userPos ?? null}
          bottomInset={insets.bottom + 132}
          onSelect={selectFromMap}
          onBoundsChange={handleBoundsChange}
          onLocateUnavailable={() => undefined}
        />

        {/* 顶部悬浮：返回 + 搜索 + 筛选条 */}
        <View style={[styles.topWrap, { paddingTop: insets.top + 8 }]}>
          <View style={styles.searchRow}>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={onClose}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </TouchableOpacity>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color={colors.ink3} />
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder={t('list.searchPlaceholder')}
                placeholderTextColor={colors.ink3}
                returnKeyType="search"
                onSubmitEditing={() => setAppliedKeyword(searchText)}
              />
              {searchText ? (
                <TouchableOpacity
                  onPress={() => {
                    setSearchText('');
                    setAppliedKeyword('');
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={16} color={colors.ink3} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.chipRow}>
            {(['region', 'price', 'bed'] as const).map((kind) => {
              const active = kind === 'region' ? !!district : kind === 'price' ? !!priceKey : !!bedKey;
              const opened = openPanel === kind;
              return (
                <TouchableOpacity
                  key={kind}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setOpenPanel(opened ? null : kind)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {chipLabel(kind)}
                  </Text>
                  <Ionicons
                    name={opened ? 'chevron-up' : 'chevron-down'}
                    size={13}
                    color={active ? colors.primary : colors.ink2}
                  />
                </TouchableOpacity>
              );
            })}
            {activeFilters ? (
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters} hitSlop={6}>
                <Ionicons name="refresh" size={13} color={colors.ink2} />
                <Text style={styles.resetText}>{t('common.clear')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {openPanel ? (
            <>
              <Pressable style={styles.panelMask} onPress={() => setOpenPanel(null)} />
              <View style={styles.panel}>
                <View style={styles.panelGrid}>
                  {optionsForPanel.map((opt) => {
                    const on = opt.key === currentKey;
                    return (
                      <TouchableOpacity
                        key={opt.key || 'any'}
                        style={[styles.panelOpt, on && styles.panelOptOn]}
                        onPress={() => pickOption(opt.key)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.panelOptText, on && styles.panelOptTextOn]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* 视野结果数 / 加载态 */}
        <View style={[styles.countPill, { bottom: insets.bottom + 150 }]}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.countText}>
              {failed
                ? t('loadFailed')
                : t('map.resultCount', { n: points.length })}
            </Text>
          )}
          {failed ? (
            <TouchableOpacity onPress={() => setBounds({ ...bounds })} hitSlop={8}>
              <Text style={styles.countRetry}>{t('common.retry')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 底部卡片条：横滑切换地图中心 */}
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
          {points.length ? (
            <FlatList
              ref={listRef}
              data={points}
              horizontal
              keyExtractor={(p) => p.id}
              renderItem={renderCard}
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardInterval}
              decelerationRate="fast"
              contentContainerStyle={styles.cardList}
              onMomentumScrollEnd={handleScrollEnd}
              getItemLayout={(_, index) => ({
                length: cardInterval,
                offset: cardInterval * index,
                index,
              })}
              onScrollToIndexFailed={() => undefined}
            />
          ) : (
            <View style={[styles.emptyCard, { width: cardWidth }]}>
              <Text style={styles.emptyText}>
                {loading ? t('common.loading') : t('map.empty')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface2 },
  topWrap: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.md,
  },
  searchBox: {
    flex: 1,
    height: 42,
    borderRadius: colors.radius.full,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...colors.shadow.md,
  },
  searchInput: { flex: 1, fontSize: colors.fontSize.base, color: colors.ink, paddingVertical: 0 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 150,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: colors.radius.full,
    backgroundColor: colors.card,
    ...colors.shadow.sm,
  },
  chipActive: { backgroundColor: colors.alpha('20,184,166', 0.12) },
  chipText: { fontSize: colors.fontSize.sm, color: colors.ink2, flexShrink: 1 },
  chipTextActive: { color: colors.primary, fontWeight: colors.fontWeight.semibold },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: colors.radius.full,
    backgroundColor: colors.card,
    ...colors.shadow.sm,
  },
  resetText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  panelMask: { position: 'absolute', left: 0, right: 0, top: 0, height: 900 },
  panel: {
    marginTop: 10,
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: 12,
    ...colors.shadow.md,
  },
  panelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panelOpt: {
    minWidth: 76,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: colors.radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelOptOn: { backgroundColor: colors.alpha('20,184,166', 0.14) },
  panelOptText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
  panelOptTextOn: { color: colors.primary, fontWeight: colors.fontWeight.semibold },
  countPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: colors.radius.full,
    backgroundColor: colors.alpha('15,23,42', 0.78),
  },
  countText: { fontSize: colors.fontSize.sm, color: colors.card, fontWeight: colors.fontWeight.medium },
  countRetry: { fontSize: colors.fontSize.sm, color: colors.primaryForeground, textDecorationLine: 'underline' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  cardList: { paddingHorizontal: 16, gap: CARD_GAP },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: 8,
    gap: 10,
    ...colors.shadow.md,
  },
  cardCover: { width: 104, height: 84, borderRadius: colors.radius.md, backgroundColor: colors.surface2 },
  cardBody: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  cardTitle: { fontSize: colors.fontSize.base, fontWeight: colors.fontWeight.semibold, color: colors.ink },
  cardFacts: { fontSize: colors.fontSize.xs, color: colors.ink2, marginTop: 3 },
  cardBottom: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cardPrice: { fontSize: colors.fontSize.lg, fontWeight: colors.fontWeight.bold, color: colors.primary },
  cardPriceSub: { fontSize: colors.fontSize.xs, fontWeight: colors.fontWeight.regular, color: colors.ink3 },
  cardDist: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  emptyCard: {
    marginHorizontal: 16,
    height: 84,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.md,
  },
  emptyText: { fontSize: colors.fontSize.sm, color: colors.ink2 },
});
