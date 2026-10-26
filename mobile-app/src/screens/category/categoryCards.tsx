/**
 * 分类页卡片（各业务 × 物业类型字段不同）。
 *
 * 只渲染真实存在的字段：后端公开卡片没有的字段（如近地铁的房源级数据、
 * 满二/满五年等税费口径）一律不展示，绝不用占位假数据补齐版面。
 * 颜色一律取 theme/colors 令牌。
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import RemoteImage from '@/components/RemoteImage';
import colors from '@/theme/colors';
import { fmtMoney } from '@/utils/format';
import {
  coverOf,
  decorationLabel,
  tenureLabel,
  type TFunction,
} from '@/lib/publicSite';
import type { PublicListing, PublicProject } from '@/services/publicApi';

const num = (v?: number | null, digits = 0) => (v == null ? '' : Number(v).toFixed(digits).replace(/\.0+$/, ''));

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

function Cover({ uri, size }: { uri: string | null; size: number | { w: number; h: number } }) {
  const { w, h } = typeof size === 'number' ? { w: size, h: size } : size;
  if (uri) {
    return <RemoteImage uri={uri} style={{ width: w, height: h, borderRadius: colors.radius.md }} resizeMode="cover" />;
  }
  return (
    <View style={[styles.coverPlaceholder, { width: w, height: h }]}>
      <Ionicons name="image-outline" size={22} color={colors.ink3} />
    </View>
  );
}

/** 物业类型文案（复用全站 prop.type.* 既有条目）。 */
function propertyTypeLabel(v: string | null | undefined, t: TFunction): string {
  switch (v) {
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
    case 'factory':
      return t('category.typeFactory');
    case 'warehouse':
      return t('prop.type.warehouse');
    case 'hotel':
      return t('prop.type.hotel');
    case 'land':
      return t('prop.type.land');
    case 'townhouse':
      return t('prop.type.townhouse');
    case 'coworking':
      return t('prop.type.coworking');
    case 'homeoffice':
      return t('prop.type.homeoffice');
    case 'showroom':
      return t('prop.type.showroom');
    default:
      return '';
  }
}

/** 通用「房东直租 / 优选 / VR / 已核验 / 有视频 / 带家具 / 装修」标签（真实字段派生）。 */
function commonTags(item: PublicListing, t: TFunction): string[] {
  const tags: string[] = [];
  if (item.owner_direct) tags.push(t('category.tagOwnerDirect'));
  if (item.is_featured) tags.push(t('category.tagFeatured'));
  if (item.vr_url) tags.push(t('category.tagVr'));
  if (item.verified_days_ago != null) tags.push(t('category.tagVerified'));
  if (item.video_url) tags.push(t('category.tagVideo'));
  if (item.furnished) tags.push(t('category.tagFurnished'));
  const deco = decorationLabel(item.decoration, t);
  if (deco) tags.push(deco);
  return tags;
}

/** 住宅卡（租房 / 二手房）：封面 + 标题 + 标签 + 价格（二手房附单价/楼龄）。 */
export function ResidentialRow({
  item,
  t,
  mode,
  onPress,
}: {
  item: PublicListing;
  t: TFunction;
  mode: 'rent' | 'sell';
  onPress: () => void;
}) {
  const cover = coverOf(item);
  const title = item.project_name || item.room_number || item.address || t('category.unnamed');
  const price = item.price ?? (mode === 'rent' ? item.monthly_rent : item.asking_price);
  const unitPrice = mode === 'sell' && price && item.size_sqm ? price / item.size_sqm : null;
  const age =
    mode === 'sell' && item.completion_year ? new Date().getFullYear() - item.completion_year : null;
  const tags = commonTags(item, t).slice(0, 4);

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <Cover uri={cover} size={{ w: 108, h: 96 }} />
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {item.district || item.city ? (
          <Text style={styles.sub} numberOfLines={1}>
            {[item.district, item.city].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        <View style={styles.factRow}>
          {item.bedrooms != null ? <Text style={styles.fact}>{item.bedrooms} {t('category.bedShort')}</Text> : null}
          {item.size_sqm != null ? <Text style={styles.fact}>{num(item.size_sqm, 1)} {t('pub.sqm')}</Text> : null}
          {age != null ? <Text style={styles.fact}>{t('category.ageYears', { n: age })}</Text> : null}
        </View>
        {tags.length > 0 ? (
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{fmtMoney(price, item.currency || 'THB')}</Text>
          {mode === 'rent' ? <Text style={styles.priceUnit}>{t('pub.perMonth')}</Text> : null}
          {unitPrice ? (
            <Text style={styles.priceUnit}>
              · {fmtMoney(Math.round(unitPrice), item.currency || 'THB')}/{t('pub.sqm')}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** 商铺办公卡（横向）：面积 / 商圈·楼盘 / 标签 / 月租 + 元/㎡/天。 */
export function CommercialRow({
  item,
  t,
  onPress,
}: {
  item: PublicListing;
  t: TFunction;
  onPress: () => void;
}) {
  const cover = coverOf(item);
  const title = item.project_name || item.building || item.address || t('category.unnamed');
  const place = [item.district, item.building || item.project_name].filter(Boolean).join('·');
  const tags: string[] = [];
  if (item.whole_floor_only) tags.push(t('category.tagWholeFloor'));
  if (item.whole_building_only) tags.push(t('category.tagWholeBuilding'));
  if (item.company_registrable) tags.push(t('category.tagRegistrable'));
  tags.push(...commonTags(item, t));
  const typeLabel = propertyTypeLabel(item.property_type, t);

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <View>
        <Cover uri={cover} size={{ w: 108, h: 96 }} />
        {typeLabel ? (
          <View style={styles.coverBadge}>
            <Text style={styles.coverBadgeText}>{typeLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[item.size_sqm != null ? `${num(item.size_sqm, 1)}${t('pub.sqm')}` : null, place]
            .filter(Boolean)
            .join('/')}
        </Text>
        {tags.length > 0 ? (
          <View style={styles.tagRow}>
            {tags.slice(0, 4).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{fmtMoney(item.monthly_rent ?? item.price, item.currency || 'THB')}</Text>
          <Text style={styles.priceUnit}>{t('pub.perMonth')}</Text>
        </View>
        {item.rent_per_sqm_day != null ? (
          <Text style={styles.priceSub}>
            {fmtMoney(item.rent_per_sqm_day, item.currency || 'THB')}/{t('pub.sqm')}/{t('category.perDay')}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/** 厂房卡（横向）：土地面积 / 层高 / 荷载 / 柱距 / 电力 / 可环评。 */
export function FactoryRow({
  item,
  t,
  onPress,
}: {
  item: PublicListing;
  t: TFunction;
  onPress: () => void;
}) {
  const cover = coverOf(item);
  const title = item.project_name || item.building || item.address || t('category.unnamed');
  const place = [item.district, item.building || item.project_name].filter(Boolean).join('·');
  const specs: string[] = [];
  if (item.land_area_sqm != null) specs.push(`${t('category.landArea')} ${num(item.land_area_sqm)}${t('pub.sqm')}`);
  if (item.ceiling_height_m != null) specs.push(`${t('category.ceiling')} ${num(item.ceiling_height_m, 1)}m`);
  if (item.floor_loading_kg_sqm != null) specs.push(`${t('category.floorLoading')} ${num(item.floor_loading_kg_sqm)}kg/㎡`);
  if (item.column_spacing) specs.push(`${t('category.columnSpacing')} ${item.column_spacing}`);
  if (item.power_capacity_kva != null) specs.push(`${t('category.power')} ${num(item.power_capacity_kva)}kVA`);
  if (item.environmental_permit) specs.push(t('category.tagEnvPermit'));
  if (item.whole_building_only) specs.push(t('category.tagWholeBuilding'));

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <Cover uri={cover} size={{ w: 108, h: 96 }} />
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[item.size_sqm != null ? `${num(item.size_sqm, 1)}${t('pub.sqm')}` : null, place]
            .filter(Boolean)
            .join('/')}
        </Text>
        {specs.length > 0 ? (
          <View style={styles.tagRow}>
            {specs.slice(0, 5).map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{fmtMoney(item.monthly_rent ?? item.price, item.currency || 'THB')}</Text>
          <Text style={styles.priceUnit}>{t('pub.perMonth')}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** 酒店卡（横向）：面积 / 商圈·楼盘 / 标签 / 租金或售价。 */
export function HotelRow({
  item,
  t,
  mode,
  onPress,
}: {
  item: PublicListing;
  t: TFunction;
  mode: 'rent' | 'sell';
  onPress: () => void;
}) {
  const cover = coverOf(item);
  const title = item.project_name || item.building || item.address || t('category.unnamed');
  const place = [item.district, item.building || item.project_name].filter(Boolean).join('·');
  const price = item.price ?? (mode === 'rent' ? item.monthly_rent : item.asking_price);

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <Cover uri={cover} size={{ w: 108, h: 96 }} />
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[item.size_sqm != null ? `${num(item.size_sqm, 1)}${t('pub.sqm')}` : null, place]
            .filter(Boolean)
            .join('/')}
        </Text>
        {commonTags(item, t).length > 0 ? (
          <View style={styles.tagRow}>
            {commonTags(item, t).slice(0, 4).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{fmtMoney(price, item.currency || 'THB')}</Text>
          {mode === 'rent' ? <Text style={styles.priceUnit}>{t('pub.perMonth')}</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** 土地卡（横向）：土地面积 / 位置 / 标签 / 租金或售价。 */
export function LandRow({
  item,
  t,
  mode,
  onPress,
}: {
  item: PublicListing;
  t: TFunction;
  mode: 'rent' | 'sell';
  onPress: () => void;
}) {
  const cover = coverOf(item);
  const title = item.project_name || item.building || item.address || t('category.unnamed');
  const place = [item.district, item.city].filter(Boolean).join('·');
  // 与后端面积筛选（Property.size_sqm）保持一致，避免卡片面积与筛选项对不上
  const area = item.size_sqm ?? item.land_area_sqm;
  const price = item.price ?? (mode === 'rent' ? item.monthly_rent : item.asking_price);

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <Cover uri={cover} size={{ w: 108, h: 96 }} />
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[area != null ? `${num(area, 1)}${t('pub.sqm')}` : null, place].filter(Boolean).join('/')}
        </Text>
        {commonTags(item, t).length > 0 ? (
          <View style={styles.tagRow}>
            {commonTags(item, t).slice(0, 4).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{fmtMoney(price, item.currency || 'THB')}</Text>
          {mode === 'rent' ? <Text style={styles.priceUnit}>{t('pub.perMonth')}</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** 楼盘卡（新房，纵向大图）。 */
export function ProjectRow({
  item,
  t,
  onPress,
}: {
  item: PublicProject;
  t: TFunction;
  onPress: () => void;
}) {
  const onSale = (item.listing_count ?? 0) > 0;
  const sizeRange =
    item.size_min != null && item.size_max != null
      ? `${t('category.buildRange')}${num(item.size_min)}-${num(item.size_max)}${t('pub.sqm')}`
      : null;
  const bedroomText =
    item.bedroom_options && item.bedroom_options.length
      ? `${item.bedroom_options.join(',')}${t('category.bedroomUnit')}`
      : null;
  const location = [item.district, item.address || item.city].filter(Boolean).join('-');
  const priceRange =
    item.sale_price_min != null || item.sale_price_max != null
      ? item.sale_price_min === item.sale_price_max
        ? fmtMoney(item.sale_price_min ?? 0, 'THB')
        : `${fmtMoney(item.sale_price_min, 'THB')}-${fmtMoney(item.sale_price_max, 'THB')}`
      : null;
  const tags: string[] = [];
  if (item.nearest_subway) tags.push(t('category.tagNearSubway'));
  if (item.completion_year != null && item.completion_year <= new Date().getFullYear()) {
    tags.push(t('category.tagReady'));
  }
  const tenure = tenureLabel(item.tenure, t);
  if (tenure) tags.push(tenure);

  return (
    <TouchableOpacity style={styles.projectCard} activeOpacity={0.85} onPress={onPress}>
      {item.cover ? (
        <RemoteImage uri={item.cover} style={styles.projectCover} resizeMode="cover" />
      ) : (
        <View style={[styles.projectCover, styles.coverPlaceholder]}>
          <Ionicons name="business-outline" size={26} color={colors.ink3} />
        </View>
      )}
      <View style={styles.projectBody}>
        <View style={styles.projectHead}>
          <Text style={styles.title} numberOfLines={1}>
            {item.name}
          </Text>
          {onSale ? (
            <View style={styles.onSaleBadge}>
              <Text style={styles.onSaleBadgeText}>{t('category.onSale')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {[location, sizeRange, bedroomText].filter(Boolean).join(' / ')}
        </Text>
        {tags.length > 0 ? (
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        ) : null}
        {priceRange ? <Text style={styles.price}>{priceRange}</Text> : null}
        {(item.recent_deal_count ?? 0) > 0 ? (
          <Text style={styles.priceSub}>{t('category.recentDeals', { n: item.recent_deal_count ?? 0 })}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/** 楼盘横滑小卡（新房页「热销榜」rail）。 */
export function ProjectRailCard({
  item,
  t,
  onPress,
}: {
  item: PublicProject;
  t: TFunction;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.railCard} activeOpacity={0.85} onPress={onPress}>
      {item.cover ? (
        <RemoteImage uri={item.cover} style={styles.railCover} resizeMode="cover" />
      ) : (
        <View style={[styles.railCover, styles.coverPlaceholder]}>
          <Ionicons name="business-outline" size={22} color={colors.ink3} />
        </View>
      )}
      <View style={styles.railBody}>
        <Text style={styles.railName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.railSub} numberOfLines={1}>
          {[item.district, item.city].filter(Boolean).join(' · ')}
        </Text>
        {item.sale_price_min != null ? (
          <Text style={styles.railPrice} numberOfLines={1}>
            {fmtMoney(item.sale_price_min, 'THB')}
            {t('category.priceFrom')}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    marginHorizontal: 16,
    marginBottom: colors.spacing.md,
    padding: colors.spacing.md,
    gap: colors.spacing.md,
    ...colors.shadow.card,
  },
  rowBody: { flex: 1, justifyContent: 'center' },
  coverPlaceholder: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: colors.alpha(colors.inkRgb, 0.65),
    borderRadius: colors.radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  coverBadgeText: { fontSize: colors.fontSize.xs, color: colors.primaryForeground, fontWeight: '600' },
  title: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  sub: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 3 },
  factRow: { flexDirection: 'row', gap: colors.spacing.md, marginTop: 5 },
  fact: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  tag: {
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagText: { fontSize: colors.fontSize.xs, color: colors.ink2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 7, flexWrap: 'wrap' },
  price: { fontSize: colors.fontSize.xl, fontWeight: '800', color: colors.primary, letterSpacing: -0.2 },
  priceUnit: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  priceSub: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 4 },

  projectCard: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    marginHorizontal: 16,
    marginBottom: colors.spacing.md,
    overflow: 'hidden',
    ...colors.shadow.card,
  },
  projectCover: { width: '100%', height: 150 },
  projectBody: { padding: colors.spacing.lg },
  projectHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onSaleBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: colors.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  onSaleBadgeText: { fontSize: colors.fontSize.xs, color: colors.accent, fontWeight: '700' },

  railCard: {
    width: 200,
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    overflow: 'hidden',
    ...colors.shadow.card,
  },
  railCover: { width: '100%', height: 100 },
  railBody: { padding: colors.spacing.md },
  railName: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.ink },
  railSub: { fontSize: colors.fontSize.xs, color: colors.ink3, marginTop: 3 },
  railPrice: { fontSize: colors.fontSize.base, fontWeight: '800', color: colors.primary, marginTop: 6 },
});
