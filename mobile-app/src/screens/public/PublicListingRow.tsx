/**
 * C 端房源卡片（列表 / 学校详情 / 小区详情三处共用）。
 *
 * 只渲染 C 端该看的信息：封面、房号/地址、租金或挂牌价、面积户型、以及
 * 「距 XX 学校 约 N 公里」的学区回显。
 *
 * **不要在这里渲染任何分佣配置**（佣金比例、佣金月数、客源/房源分成、独家与否）。
 * 那是平台与业主/经纪人的议价条款，后端公开接口已裁剪，前端也不要再拼。
 */
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import colors from '@/theme/colors';
import { fmtMoney } from '@/utils/format';
import { coverOf, listingTypeLabel, type TFunction } from '@/lib/publicSite';
import type { PublicListing } from '@/services/publicApi';

interface Props {
  item: PublicListing;
  t: TFunction;
  onPress?: (item: PublicListing) => void;
}

export default function PublicListingRow({ item, t, onPress }: Props) {
  const cover = coverOf(item);
  const isSell = item.listing_type === 'sell';
  const price = item.price ?? (isSell ? item.asking_price : item.monthly_rent);
  const title = item.project_name || item.room_number || item.address || t('pub.listingsTitle');

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={onPress ? 0.85 : 1}
      onPress={() => onPress?.(item)}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
    >
      <View style={styles.media}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.img} resizeMode="cover" />
        ) : (
          <View style={styles.imgPlaceholder}>
            <Text style={styles.imgPlaceholderText}>{t('pub.noPhoto')}</Text>
          </View>
        )}
        {item.listing_type ? (
          <View style={[styles.typeTag, isSell ? styles.typeTagSell : styles.typeTagRent]}>
            <Text style={styles.typeTagText}>{listingTypeLabel(item.listing_type, t)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {item.room_number && item.project_name ? (
          <Text style={styles.unit} numberOfLines={1}>{item.room_number}</Text>
        ) : null}
        {item.address ? (
          <Text style={styles.addr} numberOfLines={1}>{item.address}</Text>
        ) : null}

        <View style={styles.factRow}>
          {item.bedrooms != null ? (
            <Text style={styles.fact}>{item.bedrooms} BED</Text>
          ) : null}
          {item.bathrooms != null ? (
            <Text style={styles.fact}>{item.bathrooms} BATH</Text>
          ) : null}
          {item.size_sqm != null ? (
            <Text style={styles.fact}>{item.size_sqm} {t('pub.sqm')}</Text>
          ) : null}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{fmtMoney(price, item.currency || 'THB')}</Text>
          {isSell ? null : <Text style={styles.priceUnit}>{t('pub.perMonth')}</Text>}
        </View>

        {/* 学区筛选生效的回显：不显示这行，用户选了学校也看不出筛在哪 */}
        {item.nearest_school_km != null && item.nearest_school_name ? (
          <Text style={styles.school} numberOfLines={1}>
            {t('pub.distanceToSchool', {
              name: item.nearest_school_name,
              km: item.nearest_school_km,
            })}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    marginBottom: colors.spacing.md,
    padding: colors.spacing.md,
    gap: colors.spacing.md,
    ...colors.shadow.card,
  },
  media: { width: 108, height: 96, borderRadius: colors.radius.md, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgPlaceholderText: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  typeTag: {
    position: 'absolute',
    left: 6,
    top: 6,
    borderRadius: colors.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeTagRent: { backgroundColor: colors.primary },
  typeTagSell: { backgroundColor: colors.ink2 },
  typeTagText: { fontSize: colors.fontSize.xs, color: '#fff', fontWeight: '600' },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  unit: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  addr: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 3 },
  factRow: { flexDirection: 'row', gap: colors.spacing.md, marginTop: 6 },
  fact: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 },
  price: { fontSize: colors.fontSize.xl, fontWeight: '800', color: colors.primary },
  priceUnit: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  school: { fontSize: colors.fontSize.xs, color: colors.accent, marginTop: 4 },
});
