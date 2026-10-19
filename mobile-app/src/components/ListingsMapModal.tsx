/**
 * 地图找房弹层（共享）
 *
 * App 无原生地图库（Expo Go 不能加载原生地图模块），以「视野内房源列表」消费
 * `/public/map-points`（价格 / 面积 / 房型 / 距离），点行进房源详情。
 *
 * C 端「找房」页与员工端「房源」页共用同一弹层，保证两端「去地图看」1:1。
 */
import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { listingTypeLabel } from '@/lib/publicSite';
import { fmtMoney as formatRent } from '@/utils/format';
import { useI18n } from '@/i18n';
import type { PublicMapPoint } from '@/services/publicApi';

/** 球面距离（km） */
const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export interface ListingsMapModalProps {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  error: boolean;
  points: PublicMapPoint[];
  /** 用户定位（有则显示距离） */
  userPos: { lat: number; lng: number } | null;
  onRetry: () => void;
  /** 点行进入房源详情 */
  onOpenPoint: (point: PublicMapPoint) => void;
}

export default function ListingsMapModal({
  visible,
  onClose,
  loading,
  error,
  points,
  userPos,
  onRetry,
  onOpenPoint,
}: ListingsMapModalProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.mapWrap}>
        <View style={[styles.mapCard, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.mapHead}>
            <View style={styles.mapHeadText}>
              <Text style={styles.mapTitle}>{t('map.title')}</Text>
              <Text style={styles.mapHint}>{t('map.hint')}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.mapCenter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.mapCenter}>
              <Text style={styles.mapEmpty}>{t('loadFailed')}</Text>
              <TouchableOpacity style={styles.mapRetry} onPress={onRetry} activeOpacity={0.8}>
                <Text style={styles.mapRetryText}>{t('retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : points.length === 0 ? (
            <View style={styles.mapCenter}>
              <Text style={styles.mapEmpty}>{t('map.empty')}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.mapCount}>{t('map.pointCount', { n: points.length })}</Text>
              <FlatList
                data={points}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.mapList}
                renderItem={({ item }) => {
                  const price = item.price ?? item.monthly_rent;
                  const dist =
                    userPos && item.lat != null && item.lng != null
                      ? haversineKm(userPos, { lat: item.lat, lng: item.lng })
                      : null;
                  return (
                    <TouchableOpacity
                      style={styles.mapRow}
                      activeOpacity={0.85}
                      onPress={() => onOpenPoint(item)}
                    >
                      <View style={styles.mapBody}>
                        <Text style={styles.mapRowTitle} numberOfLines={1}>
                          {item.project_name ||
                            item.room_number ||
                            item.address ||
                            t('pub.listingsTitle')}
                        </Text>
                        <View style={styles.mapFactRow}>
                          {item.bedrooms != null ? (
                            <Text style={styles.mapFact}>{item.bedrooms} BED</Text>
                          ) : null}
                          {item.size_sqm != null ? (
                            <Text style={styles.mapFact}>
                              {item.size_sqm} {t('pub.sqm')}
                            </Text>
                          ) : null}
                          {item.listing_type ? (
                            <Text style={styles.mapFact}>
                              {listingTypeLabel(item.listing_type, t)}
                            </Text>
                          ) : null}
                        </View>
                        {item.address ? (
                          <Text style={styles.mapAddr} numberOfLines={1}>
                            {item.address}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.mapRight}>
                        {price != null ? (
                          <Text style={styles.mapPrice}>
                            {formatRent(price, item.currency || 'THB')}
                          </Text>
                        ) : null}
                        {dist != null ? (
                          <Text style={styles.mapDist}>
                            {dist.toFixed(1)} {t('pub.km')}
                          </Text>
                        ) : (
                          <Text style={styles.mapNoLoc}>{t('map.noLocation')}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // 地图找房弹层：底部卡片 + 视野内房源列表（App 无原生地图库时的降级形态）
  mapWrap: {
    flex: 1,
    backgroundColor: colors.alpha('0,0,0', 0.45),
    justifyContent: 'flex-end',
  },
  mapCard: {
    maxHeight: '78%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: colors.radius.lg,
    borderTopRightRadius: colors.radius.lg,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  mapHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mapHeadText: { flex: 1 },
  mapTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  mapHint: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  mapCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  mapEmpty: { fontSize: 14, color: colors.ink2 },
  mapRetry: {
    marginTop: 12,
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapRetryText: { fontSize: 14, color: colors.primaryForeground, fontWeight: '600' },
  mapCount: { fontSize: 12, color: colors.ink3, marginTop: 12, marginBottom: 4 },
  mapList: { paddingBottom: 8 },
  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  mapBody: { flex: 1 },
  mapRowTitle: { fontSize: 15, color: colors.text, fontWeight: '600' },
  mapFactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  mapFact: { fontSize: 12, color: colors.ink2 },
  mapAddr: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  mapRight: { alignItems: 'flex-end', gap: 4 },
  mapPrice: { fontSize: 15, color: colors.primary, fontWeight: '700' },
  mapDist: { fontSize: 12, color: colors.ink2 },
  mapNoLoc: { fontSize: 11, color: colors.ink3, maxWidth: 96, textAlign: 'right' },
});
