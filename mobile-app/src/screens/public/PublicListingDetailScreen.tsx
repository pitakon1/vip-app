/**
 * C 端房源详情（匿名可看）。
 *
 * 展示内容严格限定在公开口径：价格、房号地址、面积户型、朝向装修、房源描述、
 * 所属小区参数、周边学校距离、经纪人对外联络方式。
 *
 * **不要渲染分佣配置**（`sale_commission_rate` / `rental_commission_months` /
 * `mandate_type` / `split_option` / `buyer_side_rate` / `listing_side_rate`）。
 * 后端 `/public/listings/{id}` 的响应体里本来就没有这些字段——但如果哪天有人
 * 改成调站内 `/listings/{id}`，那些字段会带着 `None` 或真实值一起回来。
 * 详见上一轮修掉的分佣泄露缺陷。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RemoteImage from '@/components/RemoteImage';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import { publicApi, type PublicListing, type PublicListingDetail } from '@/services/publicApi';
import { priceAlertsApi, viewingsApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import {
  decorationLabel,
  listingTypeLabel,
  loadRates,
  orientationLabel,
  photoUrls,
  convertFromThb,
  type TFunction,
} from '@/lib/publicSite';
import { fmtMoney } from '@/utils/format';
import { recordHistory } from '@/lib/browseHistory';
import PublicInquiryForm from './PublicInquiryForm';
import PublicListingRow from './PublicListingRow';

export default function PublicListingDetailScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const id: string = route.params?.id;
  const [data, setData] = useState<PublicListingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 猜你喜欢：相似房源列表，接口失败时静默隐藏
  const [similar, setSimilar] = useState<PublicListing[]>([]);

  // 登录态决定经纪人联系方式是否已由后端脱下马甲：请求自动带 token，
  // 登录时后端返回完整号码、未登录返回打码版。这里只需知道「是否登录」。
  const isLoggedIn = !!useAuthStore((s) => s.token);

  // 预约看房（贝壳口径：预约需要登录）
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingTime, setBookingTime] = useState('');
  const [bookingNote, setBookingNote] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);

  // 降价提醒（贝壳口径：关注/降价通知需登录）
  const [priceAlertOn, setPriceAlertOn] = useState(false);
  const [priceAlertBusy, setPriceAlertBusy] = useState(false);
  const [priceAlertLoaded, setPriceAlertLoaded] = useState(false);

  const togglePriceAlert = useCallback(async () => {
    if (!isLoggedIn) {
      navigation.navigate('Login');
      return;
    }
    if (priceAlertBusy || !data?.property_id) return;
    setPriceAlertBusy(true);
    try {
      if (priceAlertOn) {
        await priceAlertsApi.unsubscribe(data.property_id);
        setPriceAlertOn(false);
      } else {
        await priceAlertsApi.subscribe({
          property_id: data.property_id,
          listing_id: data.id,
        });
        setPriceAlertOn(true);
      }
    } catch (err: any) {
      console.warn('toggle price alert failed', err);
    } finally {
      setPriceAlertBusy(false);
    }
  }, [isLoggedIn, navigation, priceAlertBusy, priceAlertOn, data?.property_id, data?.id]);

  useEffect(() => {
    if (!isLoggedIn || !data?.property_id || priceAlertLoaded) return;
    let cancelled = false;
    priceAlertsApi
      .status(data.property_id)
      .then((res: any) => {
        if (!cancelled) setPriceAlertOn(!!res?.data?.subscribed);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPriceAlertLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, data?.property_id, priceAlertLoaded]);

  const openBooking = useCallback(() => {
    if (!isLoggedIn) {
      navigation.navigate('Login');
      return;
    }
    setBookingOpen(true);
  }, [isLoggedIn, navigation]);

  const submitBooking = useCallback(async () => {
    if (!data?.property_id || !bookingTime.trim()) return;
    setBookingBusy(true);
    try {
      await viewingsApi.create({
        property_id: data.property_id,
        scheduled_at: bookingTime.trim().replace(' ', 'T'),
        notes: bookingNote.trim() || undefined,
      });
      setBookingOpen(false);
      setBookingTime('');
      setBookingNote('');
    } catch (err: any) {
      console.warn('submit booking failed', err);
    } finally {
      setBookingBusy(false);
    }
  }, [data?.property_id, bookingTime, bookingNote]);

  useEffect(() => {
    void loadRates();
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    publicApi
      .listing(id)
      .then((res: any) => {
        if (!cancelled) {
          const d = res?.data ?? null;
          setData(d);
          // 记录浏览历史（本地 KV，异常不影响页面展示）
          if (d?.id) {
            void recordHistory({
              id: String(d.id),
              title: d.room_number ?? undefined,
              address: d.address ?? undefined,
              price: d.price ?? undefined,
              currency: d.currency ?? undefined,
              cover: d.cover ?? undefined,
              listing_type: d.listing_type ?? undefined,
            }).catch(() => {});
          }
        }
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // 依赖必须带上 isLoggedIn：后端对未登录访客会把经纪人电话打码返回
    // （见 /public/listings/{id} 的 permissive auth）。游客点「登录后拨打」
    // 登录回来时，若不重新拉取，按钮会因为 isLoggedIn 变 true 而解锁，
    // 但数据里仍是打码号码 —— 用户会拨出一个废号。
  }, [id, isLoggedIn]);

  // 猜你喜欢：相似房源（失败静默，不阻塞详情页）
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    publicApi
      .similar(id)
      .then((res: any) => {
        if (!cancelled) setSimilar((res?.data ?? []) as PublicListing[]);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const call = useCallback((phone?: string | null) => {
    if (!phone) return;
    void Linking.openURL(`tel:${phone}`);
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>{t('pub.listingNotFound')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{t('pub.backToList')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photos = photoUrls(data.photos);
  const isSell = data.listing_type === 'sell';
  const price = data.price ?? (isSell ? data.asking_price : data.monthly_rent);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* ---- 相册 ---- */}
        {photos.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {photos.map((url) => (
              <RemoteImage key={url} uri={url} style={{ width, height: 260 }} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={{ width, height: 200, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.emptyText}>{t('pub.noPhoto')}</Text>
          </View>
        )}

        <View style={styles.block}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>
              {data.project_name || data.room_number || t('pub.listingsTitle')}
            </Text>
            {data.listing_type ? (
              <View style={[styles.typeTag, isSell ? styles.typeTagSell : styles.typeTagRent]}>
                <Text style={styles.typeTagText}>{listingTypeLabel(data.listing_type, t)}</Text>
              </View>
            ) : null}
          </View>
          {data.address ? <Text style={styles.addr}>{data.address}</Text> : null}

          <View style={styles.priceRow}>
            <Text style={styles.price}>{fmtMoney(price, data.currency || 'THB')}</Text>
            {isSell ? null : <Text style={styles.priceUnit}>{t('pub.perMonth')}</Text>}
          </View>
          {price ? (
            <Text style={styles.priceSub}>
              ≈ {fmtMoney(convertFromThb(price), 'CNY')}
              {isSell ? '' : t('pub.perMonth')}
            </Text>
          ) : null}
          {price && data.size_sqm ? (
            <Text style={styles.priceSub}>
              ≈ {t('pub.unitPrice')} {fmtMoney(price / data.size_sqm, data.currency || 'THB')} {t('pub.perSqm')}
              {' · '}≈ {fmtMoney(convertFromThb(price / data.size_sqm), 'CNY')}/㎡
            </Text>
          ) : null}

          {/* 降价提醒：贝壳式关注/降价通知，未登录引导登录 */}
          <TouchableOpacity
            style={[styles.priceAlert, priceAlertOn && styles.priceAlertOn]}
            onPress={togglePriceAlert}
            disabled={priceAlertBusy}
            activeOpacity={0.7}
          >
            <Ionicons
              name={priceAlertOn ? 'notifications' : 'notifications-outline'}
              size={16}
              color={priceAlertOn ? colors.primary : colors.ink2}
            />
            <Text style={[styles.priceAlertText, priceAlertOn && styles.priceAlertTextOn]}>
              {isLoggedIn
                ? priceAlertOn
                  ? t('pub.priceAlertOn')
                  : t('pub.priceAlertOff')
                : t('pub.priceAlertGuest')}
            </Text>
          </TouchableOpacity>
          {/* 降价历史只读提示：已订阅显示开提醒，否则提示收藏后可接收降价通知 */}
          <View style={styles.priceHistoryRow}>
            <Ionicons name="trending-down-outline" size={13} color={colors.ink3} />
            <Text style={styles.priceHistoryText}>
              {priceAlertOn ? t('pub.priceAlertOn') : t('pub.priceHistoryHint')}
            </Text>
          </View>
        </View>

        {/* ---- 关键参数 ---- */}
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>{t('pub.keyFacts')}</Text>
          <View style={styles.kvGrid}>
            <KV label={t('pub.roomNumber')} value={data.room_number ?? ''} />
            <KV label={t('pub.building')} value={data.building ?? ''} />
            <KV label={t('pub.floor')} value={data.floor != null ? String(data.floor) : ''} />
            <KV
              label={t('pub.size')}
              value={data.size_sqm != null ? `${data.size_sqm} ${t('pub.sqm')}` : ''}
            />
            <KV
              label={t('pub.layout')}
              value={
                data.bedrooms != null || data.bathrooms != null
                  ? `${data.bedrooms ?? '-'} BED · ${data.bathrooms ?? '-'} BATH`
                  : ''
              }
            />
            <KV label={t('pub.orientationLabel')} value={orientationLabel(data.orientation, t)} />
            <KV label={t('pub.decorationLabel')} value={decorationLabel(data.decoration, t)} />
            <KV
              label={t('pub.deposit')}
              value={
                data.deposit_amount
                  ? fmtMoney(data.deposit_amount, data.currency || 'THB')
                  : data.deposit_months
                    ? `${data.deposit_months}${t('pub.months')}`
                    : ''
              }
            />
            <KV label={t('pub.listingNo')} value={data.listing_no ?? ''} />
          </View>
        </View>

        {/* ---- 所属小区 ---- */}
        {data.project ? (
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>{t('pub.communityInfo')}</Text>
            <Text style={styles.projectName}>{data.project.name}</Text>
            {data.project.developer_name ? (
              <Text style={styles.projectLine}>
                {t('pub.developer')}：{data.project.developer_name}
              </Text>
            ) : null}
            {data.project.total_units ? (
              <Text style={styles.projectLine}>
                {t('pub.totalUnits')}：{data.project.total_units}
              </Text>
            ) : null}
            {data.project.completion_year ? (
              <Text style={styles.projectLine}>
                {t('pub.completionYear')}：{data.project.completion_year}
              </Text>
            ) : null}
            {data.project.nearest_subway ? (
              <Text style={styles.projectLine}>
                {t('pub.transport')}：{data.project.nearest_subway}
              </Text>
            ) : null}
            {/* 楼盘核心指标网格（楼层数/车位/产权/外配/物业费/均价，字段为 null 不渲染） */}
            {data.project.tenure ||
            data.project.foreign_quota_pct != null ||
            data.project.management_fee_per_sqm != null ||
            data.project.avg_price != null ||
            data.project.parking_spaces != null ||
            data.project.total_buildings != null ||
            data.project.total_floors != null ? (
              <View style={styles.kvGrid}>
                {data.project.tenure ? (
                  <KV label={t('pub.tenure')} value={data.project.tenure} />
                ) : null}
                {data.project.foreign_quota_pct != null ? (
                  <KV
                    label={t('pub.foreignQuota')}
                    value={`${data.project.foreign_quota_pct}%`}
                  />
                ) : null}
                {data.project.management_fee_per_sqm != null ? (
                  <KV
                    label={t('pub.mgmtFee')}
                    value={`${data.project.management_fee_per_sqm} THB/㎡${t('pub.perMonth')}`
                      + ` · ≈ ${fmtMoney(convertFromThb(data.project.management_fee_per_sqm), 'CNY')}/㎡`}
                  />
                ) : null}
                {data.project.avg_price != null ? (
                  <KV
                    label={t('pub.avgPrice')}
                    value={`≈ ${fmtMoney(data.project.avg_price, 'THB')}/㎡`}
                  />
                ) : null}
                {data.project.parking_spaces != null ? (
                  <KV label={t('pub.parking')} value={String(data.project.parking_spaces)} />
                ) : null}
                {data.project.total_buildings != null ? (
                  <KV label={t('pub.buildings')} value={String(data.project.total_buildings)} />
                ) : null}
                {data.project.total_floors != null ? (
                  <KV label={t('pub.floors')} value={String(data.project.total_floors)} />
                ) : null}
              </View>
            ) : null}
            {data.project.id ? (
              <TouchableOpacity
                onPress={() => navigation.navigate('PublicCommunityDetail', { id: data.project?.id })}
              >
                <Text style={styles.link}>{t('pub.viewCommunity')} →</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ---- 周边学校 ---- */}
        {(data.nearby_schools ?? []).length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>{t('pub.nearbySchools')}</Text>
            <Text style={styles.sectionHint}>{t('pub.nearbySchoolsHint')}</Text>
            {(data.nearby_schools ?? []).map((school) => (
              <TouchableOpacity
                key={school.id ?? school.name ?? ''}
                style={styles.schoolRow}
                onPress={() => school.id && navigation.navigate('PublicSchoolDetail', { id: school.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.schoolName}>{school.name}</Text>
                  {school.name_en ? (
                    <Text style={styles.schoolSub} numberOfLines={1}>{school.name_en}</Text>
                  ) : null}
                </View>
                {school.distance_km != null ? (
                  <Text style={styles.schoolDistance}>
                    {school.distance_km} {t('pub.km')}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* ---- 描述 ---- */}
        {data.description ? (
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>{t('pub.description')}</Text>
            <Text style={styles.description}>{data.description}</Text>
          </View>
        ) : null}

        {/* ---- 经纪人 ---- */}
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>{t('pub.broker')}</Text>
          {data.broker ? (
            <>
              {data.broker.company ? (
                <Text style={styles.projectLine}>{data.broker.company}</Text>
              ) : null}
              <KV label={t('pub.broker')} value={data.broker.real_name ?? ''} />

              {!isLoggedIn ? (
                <View style={styles.lockBanner}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.ink3} />
                  <Text style={styles.lockText}>{t('pub.contactLocked')}</Text>
                </View>
              ) : null}

              {data.broker.phone ? (
                <TouchableOpacity
                  style={styles.callRow}
                  onPress={() => isLoggedIn && call(data.broker?.phone)}
                  disabled={!isLoggedIn}
                >
                  <Ionicons name="call-outline" size={16} color={colors.primary} />
                  <Text style={[styles.callText, !isLoggedIn && styles.callTextLocked]}>
                    {data.broker.phone} · {isLoggedIn ? t('pub.call') : t('pub.callLocked')}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {data.broker.wechat ? (
                <Text style={styles.projectLine}>
                  WeChat：{data.broker.wechat}
                  {!isLoggedIn ? <Text style={styles.lockedValue}>{t('pub.lockedSuffix')}</Text> : null}
                </Text>
              ) : null}
              {data.broker.line ? (
                <Text style={styles.projectLine}>
                  LINE：{data.broker.line}
                  {!isLoggedIn ? <Text style={styles.lockedValue}>{t('pub.lockedSuffix')}</Text> : null}
                </Text>
              ) : null}
              {data.broker.whatsapp ? (
                <Text style={styles.projectLine}>
                  WhatsApp：{data.broker.whatsapp}
                  {!isLoggedIn ? <Text style={styles.lockedValue}>{t('pub.lockedSuffix')}</Text> : null}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.projectLine}>{t('pub.brokerEmpty')}</Text>
          )}
        </View>

        {/* ---- 预约看房 CTA（贝壳口径：预约需登录） ---- */}
        <View style={{ paddingHorizontal: 16 }}>
          <TouchableOpacity style={styles.bookBtn} onPress={openBooking}>
            <Ionicons name="calendar-outline" size={18} color={colors.primaryForeground} />
            <Text style={styles.bookText}>
              {isLoggedIn ? t('pub.bookViewing') : t('pub.bookViewingLogin')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 预约看房弹层（复用鉴权版房源详情的交互） */}
        <Modal
          visible={bookingOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setBookingOpen(false)}
        >
          <View style={styles.modalWrap}>
            <View style={[styles.modalCard, { paddingBottom: insets.bottom + 24 }]}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>{t('pub.bookViewing')}</Text>
                <TouchableOpacity
                  onPress={() => setBookingOpen(false)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={22} color={colors.ink2} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalProp} numberOfLines={1}>
                {data.project_name || data.room_number || ''}
              </Text>
              <Text style={styles.label}>{t('pub.bookTime')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('pub.bookTimePlaceholder')}
                placeholderTextColor={colors.ink3}
                value={bookingTime}
                onChangeText={setBookingTime}
              />
              <Text style={styles.label}>{t('pub.bookNote')}</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder={t('pub.bookNotePlaceholder')}
                placeholderTextColor={colors.ink3}
                value={bookingNote}
                onChangeText={setBookingNote}
                multiline
                numberOfLines={2}
              />
              <TouchableOpacity
                style={[styles.bookBtn, bookingBusy && styles.bookBtnDisabled]}
                onPress={submitBooking}
                disabled={bookingBusy}
              >
                {bookingBusy ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={styles.bookText}>{t('pub.bookSubmit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ---- 留资 ---- */}
        <View style={{ paddingHorizontal: 16 }}>
          <PublicInquiryForm
            t={t as TFunction}
            title={t('pub.inquireTitle')}
            note={t('pub.inquireNote')}
            context={{ listing_id: data.id, property_id: data.property_id ?? undefined }}
            source="listing_detail"
            defaultMessage={`Inquiry: ${data.project_name ?? ''} ${data.room_number ?? ''}`.trim()}
          />
        </View>

        {/* ---- 猜你喜欢（相似房源，接口失败静默隐藏） ---- */}
        {similar.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>{t('pub.youMayLike')}</Text>
            <View style={{ marginTop: 10 }}>
              {similar.map((row) => (
                <PublicListingRow
                  key={row.id}
                  item={row}
                  t={t}
                  onPress={(item) => navigation.navigate('PublicListingDetail', { id: item.id })}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* ---- 悬浮返回 ---- */}
      <TouchableOpacity
        style={[styles.floatBack, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
        accessibilityLabel={t('pub.back')}
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.kvItem}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  emptyText: { fontSize: colors.fontSize.base, color: colors.ink3 },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    height: 42,
    borderRadius: colors.radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { color: colors.primaryForeground, fontWeight: '600' },
  block: {
    backgroundColor: colors.card,
    borderRadius: colors.radius.lg,
    padding: colors.spacing.lg,
    marginHorizontal: 16,
    marginTop: 12,
    ...colors.shadow.card,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: colors.fontSize['2xl'], fontWeight: '800', color: colors.ink },
  typeTag: { borderRadius: colors.radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  typeTagRent: { backgroundColor: colors.primary },
  typeTagSell: { backgroundColor: colors.ink2 },
  typeTagText: { fontSize: colors.fontSize.xs, color: '#fff', fontWeight: '600' },
  addr: { fontSize: colors.fontSize.base, color: colors.ink2, marginTop: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 12 },
  price: { fontSize: 26, fontWeight: '800', color: colors.primary },
  priceUnit: { fontSize: colors.fontSize.base, color: colors.ink3 },
  priceSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 4 },
  priceAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    height: 40,
    borderRadius: colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  priceAlertOn: { borderColor: colors.primary, backgroundColor: 'rgba(40,120,255,0.06)' },
  priceAlertText: { fontSize: colors.fontSize.sm, color: colors.ink2, fontWeight: '600' },
  priceAlertTextOn: { color: colors.primary },
  priceHistoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  priceHistoryText: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  sectionTitle: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 4, marginBottom: 8 },
  kvGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  kvItem: { width: '50%', paddingVertical: 7 },
  kvLabel: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  kvValue: { fontSize: colors.fontSize.base, color: colors.ink, marginTop: 2 },
  projectName: { fontSize: colors.fontSize.lg, fontWeight: '600', color: colors.ink, marginTop: 8 },
  projectLine: { fontSize: colors.fontSize.base, color: colors.ink2, marginTop: 6 },
  link: { fontSize: colors.fontSize.base, color: colors.primary, fontWeight: '600', marginTop: 10 },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  schoolName: { fontSize: colors.fontSize.base, color: colors.ink, fontWeight: '600' },
  schoolSub: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  schoolDistance: { fontSize: colors.fontSize.base, color: colors.accent, fontWeight: '600' },
  description: { fontSize: colors.fontSize.base, color: colors.ink2, lineHeight: 22, marginTop: 8 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  callText: { fontSize: colors.fontSize.base, color: colors.primary, fontWeight: '600' },
  callTextLocked: { color: colors.ink3 },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: colors.radius.md,
    backgroundColor: colors.surface2,
  },
  lockText: { flex: 1, fontSize: colors.fontSize.sm, color: colors.ink3, lineHeight: 18 },
  lockedValue: { color: colors.ink3 },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.primary,
    marginTop: 14,
  },
  bookBtnDisabled: { opacity: 0.6 },
  bookText: { fontSize: colors.fontSize.base, fontWeight: '700', color: colors.primaryForeground },
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: colors.radius.lg,
    borderTopRightRadius: colors.radius.lg,
    padding: colors.spacing.lg,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: colors.fontSize.lg, fontWeight: '700', color: colors.ink },
  modalProp: { fontSize: colors.fontSize.base, color: colors.ink2, marginTop: 8 },
  label: {
    fontSize: colors.fontSize.sm,
    color: colors.ink2,
    marginTop: colors.spacing.md,
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: colors.radius.md,
    paddingHorizontal: colors.spacing.md,
    fontSize: colors.fontSize.base,
    color: colors.ink,
    backgroundColor: colors.fieldFill,
  },
  textarea: { height: 72, textAlignVertical: 'top' },
  floatBack: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow.sm,
  },
});
