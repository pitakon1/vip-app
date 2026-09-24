import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { ownerApi, ownersApi, saleListingApi } from '@/services/api';
import { useI18n } from '@/i18n';
import { notify, notifyError } from '@/utils/feedback';
import { fmtMoney as money } from '@/utils/format';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

const propertyTypeText = (t: TFunc, type?: string) =>
  type === 'apartment'
    ? t('prop.type.apartment')
    : type === 'villa'
      ? t('prop.type.house')
      : type === 'condo'
        ? t('prop.type.apartment')
        : type || t('mkt.propertyFallback');

const directionMeta = (t: TFunc): Record<string, { label: string; color: string }> => ({
  raise: { label: t('mkt.dirRaise'), color: colors.success },
  lower: { label: t('mkt.dirLower'), color: colors.error },
  keep: { label: t('mkt.dirKeep'), color: colors.info },
});

interface VacantItem {
  id: string;
  title: string;
  address?: string;
  monthly_rent?: number;
  currency?: string;
  property_type?: string;
  share_url?: string;
  status?: string;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
}

interface PricingItem {
  property_id: string;
  title: string;
  monthly_rent?: number;
  currency?: string;
  peer_count?: number;
  peer_avg?: number;
  peer_range?: [number, number] | null;
  suggestion?: { direction: string; diff_pct: number; suggested: number };
}

interface OwnerProperty {
  id: string;
  name?: string;
  room_number?: string;
  project_name?: string;
  address?: string;
  status?: string;
  monthly_rent?: number;
  sale_price?: number;
  currency?: string;
  size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  created_at?: string;
}

interface SaleListing {
  id: string;
  title?: string;
  address?: string;
  asking_price?: number;
  currency?: string;
  sale_type?: string;
  status?: string;
  created_at?: string;
  size_sqm?: number;
  bedrooms?: number;
}

const lStatus = (t: TFunc): Record<string, { text: string; color: string; bg: string; pct: number }> => ({
  pending: { text: t('mkt.lsPending'), color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1), pct: 20 },
  active: { text: t('mkt.lsActive'), color: colors.success, bg: colors.alpha(colors.successRgb, 0.1), pct: 45 },
  contracted: { text: t('mkt.lsContracted'), color: colors.primary, bg: colors.alpha(colors.primaryRgb, 0.12), pct: 75 },
  closed: { text: t('mkt.lsClosed'), color: colors.success, bg: colors.alpha(colors.successRgb, 0.1), pct: 100 },
  cancelled: { text: t('mkt.lsCancelled'), color: colors.ink3, bg: colors.surface2, pct: 0 },
  expired: { text: t('mkt.lsExpired'), color: colors.ink3, bg: colors.surface2, pct: 0 },
});

const statusBadge = (t: TFunc, status?: string) =>
  status === 'vacant'
    ? { label: t('status.vacant'), color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.12) }
    : { label: t('status.maintenance'), color: colors.ink3, bg: colors.surface2 };

// 出租委托：由平台托管中的房源（按真实房源状态映射阶段）
const rentStatus = (t: TFunc): Record<string, { text: string; color: string; bg: string; pct: number }> => ({
  rented: { text: t('mkt.rsManaged'), color: colors.success, bg: colors.alpha(colors.successRgb, 0.1), pct: 65 },
  active: { text: t('mkt.rsManaged'), color: colors.success, bg: colors.alpha(colors.successRgb, 0.1), pct: 65 },
  renewing: { text: t('mkt.rsRenewing'), color: colors.info, bg: colors.alpha(colors.infoRgb, 0.1), pct: 80 },
  maintenance: { text: t('status.maintenance'), color: colors.warning, bg: colors.alpha(colors.warningRgb, 0.1), pct: 40 },
});

const formatDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 10) : '-');

export default function OwnerMarketingScreen() {
  const { t } = useI18n();
  const DIRECTION_META = useMemo(() => directionMeta(t), [t]);
  const L_STATUS = useMemo(() => lStatus(t), [t]);
  const RENT_STATUS = useMemo(() => rentStatus(t), [t]);
  const [tab, setTab] = useState<'rent' | 'sale'>('rent');
  const [vacants, setVacants] = useState<VacantItem[]>([]);
  const [totalVacant, setTotalVacant] = useState(0);
  const [, setTotalProperties] = useState(0);
  const [pricing, setPricing] = useState<PricingItem[]>([]);
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [listings, setListings] = useState<SaleListing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 委托挂牌表单
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCcy, setFormCcy] = useState('THB');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [mkRes, prRes, propRes, listRes] = await Promise.allSettled([
      ownersApi.marketing(),
      ownersApi.pricingSuggestion(),
      ownerApi.properties(),
      saleListingApi.list({ limit: 100 }),
    ]);

    if (mkRes.status === 'fulfilled') {
      const payload = mkRes.value?.data;
      const items = payload?.items ?? payload?.data ?? [];
      setVacants(Array.isArray(items) ? items : []);
      setTotalVacant(Number(payload?.total_vacant ?? 0));
      setTotalProperties(Number(payload?.total_properties ?? 0));
    }
    if (prRes.status === 'fulfilled') {
      const payload = prRes.value?.data;
      const items = payload?.items ?? payload?.data ?? [];
      setPricing(Array.isArray(items) ? items : []);
    }
    if (propRes.status === 'fulfilled') {
      const data = propRes.value?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setProperties(Array.isArray(items) ? items : []);
    }
    if (listRes.status === 'fulfilled') {
      const data = listRes.value?.data;
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setListings(Array.isArray(items) ? items : []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // 定价建议按 property_id 关联，id 口径不一致时回退按房源标题匹配
  const pricingOf = useCallback(
    (item?: VacantItem | null) => {
      if (!item) return undefined;
      return (
        pricing.find((p) => String(p.property_id) === String(item.id)) ??
        pricing.find((p) => !!p.title && p.title === item.title)
      );
    },
    [pricing],
  );

  // 默认选中第一个「有定价基准」的房源，保证步骤 ② 有真实数据可展示
  useEffect(() => {
    if (vacants.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && vacants.some((v) => v.id === prev)) return prev;
      const withPricing = vacants.find((v) => pricingOf(v));
      return (withPricing ?? vacants[0]).id;
    });
  }, [vacants, pricingOf]);

  const selected = useMemo(
    () => vacants.find((v) => v.id === selectedId) ?? null,
    [vacants, selectedId],
  );
  const selectedPricing = pricingOf(selected);

  const saleProp = useMemo(
    () =>
      properties.find((p) =>
        ['for_sale', 'on_sale', 'sale'].includes(String(p.status || '').toLowerCase()),
      ),
    [properties],
  );

  const saleListing = listings[0] ?? null;

  /* 出租委托：托管中的名下房源（由真实房源状态派生） */
  const rentConsigns = useMemo(
    () => properties.filter((p) => !!RENT_STATUS[String(p.status || '').toLowerCase()]),
    [properties, RENT_STATUS],
  );

  const propTitle = (p: OwnerProperty) =>
    p.name ||
    (p.project_name
      ? `${p.project_name}·${p.room_number ?? ''}`
      : p.room_number || p.address || t('mkt.propertyFallback'));

  /* ② 定价建议：建议价在同行情区间中的真实位置 */
  const pRange = selectedPricing?.peer_range ?? null;
  const suggestedPrice = selectedPricing?.suggestion?.suggested;
  const rangePct =
    pRange && suggestedPrice != null && pRange[1] > pRange[0]
      ? Math.min(
          100,
          Math.max(0, Math.round(((suggestedPrice - pRange[0]) / (pRange[1] - pRange[0])) * 100)),
        )
      : 0;
  const rangeText =
    pRange && pRange.length === 2
      ? `${money(pRange[0], selectedPricing?.currency)} ~ ${money(pRange[1], selectedPricing?.currency)}`
      : t('mkt.noRangeData');
  const dirMeta = DIRECTION_META[selectedPricing?.suggestion?.direction || 'keep'] ?? DIRECTION_META.keep;

  const stepState = (index: number, activeIdx: number) =>
    index < activeIdx ? 'done' : index === activeIdx ? 'active' : 'idle';

  const openForm = () => {
    setFormTitle('');
    setFormPrice('');
    setFormAddress('');
    setFormCcy('THB');
    setShowForm(true);
  };

  const submit = async () => {
    const title = formTitle.trim();
    const price = Number(formPrice);
    if (!title || !price) {
      Alert.alert(t('mkt.incompleteTitle'), t('mkt.incompleteMsg'));
      return;
    }
    setSubmitting(true);
    try {
      await saleListingApi.create({
        sale_type: 'sell',
        title,
        asking_price: price,
        currency: formCcy || 'THB',
        address: formAddress.trim() || undefined,
      });
      notify(t('mkt.submittedTitle'), t('mkt.submittedMsg'));
      setShowForm(false);
      load();
    } catch (err: any) {
      notifyError(t('mkt.submitFail'), err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label={t('mkt.loading')} />
      </View>
    );
  }

  const rentSteps = [t('mkt.stepChoose'), t('mkt.stepPrice'), t('mkt.stepList'), t('mkt.stepManaged')];
  const rentActiveIdx = !selected ? 0 : !selectedPricing ? 1 : 2;
  const saleSteps = [t('mkt.stepEstimate'), t('mkt.stepList'), t('mkt.stepAppointment'), t('mkt.stepDeal')];
  const saleActiveIdx = !saleProp ? 0 : !saleListing ? 1 : 2;

  const renderSteps = (labels: string[], activeIdx: number) => (
    <View style={styles.steps}>
      {labels.map((label, i) => {
        const state = stepState(i, activeIdx);
        return (
          <View key={label} style={styles.step}>
            <View
              style={[
                styles.stepDot,
                state === 'active' && styles.stepDotActive,
                state === 'done' && styles.stepDotDone,
              ]}
            >
              {state === 'done' ? (
                <Ionicons name="checkmark" size={13} color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.stepDotText, state === 'active' && styles.stepDotTextActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, state !== 'idle' && styles.stepLabelActive]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );

  const renderCardHead = (title: string, badge: string, badgeColor: string, badgeBg: string) => (
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text style={[styles.badgeText, { color: badgeColor }]}>{badge}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ===== 双委托入口 Tab ===== */}
        <View style={styles.tabs}>
          {([
            { key: 'rent', label: t('mkt.tabRent') },
            { key: 'sale', label: t('mkt.tabSale') },
          ] as const).map((tb) => (
            <TouchableOpacity
              key={tb.key}
              style={[styles.tab, tab === tb.key && styles.tabActive]}
              activeOpacity={0.8}
              onPress={() => setTab(tb.key)}
            >
              <Text style={[styles.tabText, tab === tb.key && styles.tabTextActive]}>{tb.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'rent' ? (
          <>
            {renderSteps(rentSteps, rentActiveIdx)}

            {/* ===== ① 选择房源 ===== */}
            <View style={styles.card}>
              {renderCardHead(
                t('mkt.headChoose'),
                t('mkt.availableN', { n: totalVacant }),
                colors.primary,
                colors.alpha(colors.primaryRgb, 0.12),
              )}
              {vacants.length === 0 ? (
                <EmptyState
                  icon="home-outline"
                  title={t('mkt.emptyVacantTitle')}
                  sub={t('mkt.emptyVacantSub')}
                />
              ) : (
                <>
                  {vacants.map((v) => {
                    const badge = statusBadge(t, v.status);
                    const active = v.id === selectedId;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[styles.pick, active && styles.pickActive]}
                        activeOpacity={0.8}
                        onPress={() => setSelectedId(v.id)}
                      >
                        <View style={[styles.radio, active && styles.radioActive]}>
                          {active && <View style={styles.radioDot} />}
                        </View>
                        <View style={styles.pickBody}>
                          <Text style={styles.pickTitle} numberOfLines={1}>{v.title}</Text>
                          <Text style={styles.pickMeta} numberOfLines={1}>
                            {t('mkt.pickMeta', {
                              type: propertyTypeText(t, v.property_type),
                              price: money(v.monthly_rent, v.currency),
                            })}
                          </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {selected && (
                    <Text style={styles.pickHint} numberOfLines={1}>
                      {t('mkt.selectedHint', { title: selected.title, price: money(selected.monthly_rent, selected.currency) })}
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* ===== ② 定价建议 ===== */}
            <View style={styles.card}>
              {renderCardHead(
                t('mkt.headPricing'),
                selectedPricing ? dirMeta.label : t('mkt.peerMarket'),
                selectedPricing ? dirMeta.color : colors.ink3,
                colors.surface2,
              )}
              {!selected || !selectedPricing ? (
                <EmptyState
                  icon="trending-up-outline"
                  title={t('mkt.emptyPricingTitle')}
                  sub={selected ? t('mkt.emptyPricingSubHas') : t('mkt.emptyPricingSubNone')}
                />
              ) : (
                <>
                  <View style={styles.priceRow}>
                    <View>
                      <Text style={styles.mutedSm}>{t('mkt.suggestedRent')}</Text>
                      <Text style={styles.priceBig}>
                        {suggestedPrice != null ? money(suggestedPrice, selectedPricing.currency) : '—'}
                        <Text style={styles.priceUnit}>{t('mkt.perMonth')}</Text>
                      </Text>
                    </View>
                    <View style={styles.priceRight}>
                      <Text style={styles.mutedSm}>{t('mkt.marketAvg')}</Text>
                      <Text style={styles.priceAvg}>
                        {selectedPricing.peer_avg
                          ? money(selectedPricing.peer_avg, selectedPricing.currency)
                          : '—'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressBar, { width: `${rangePct}%` }]} />
                  </View>
                  <View style={styles.progressFoot}>
                    <Text style={styles.mutedSm}>{t('mkt.marketRange', { range: rangeText })}</Text>
                    <Text style={[styles.progressRate, { color: dirMeta.color }]}>
                      {dirMeta.label}
                      {selectedPricing.suggestion
                        ? ` ${selectedPricing.suggestion.diff_pct > 0 ? '+' : ''}${selectedPricing.suggestion.diff_pct}%`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.note}>
                    {t('mkt.pricingBasis', { n: selectedPricing.peer_count ?? 0 })}
                    {selectedPricing.monthly_rent
                      ? t('mkt.currentRentParen', {
                          price: money(selectedPricing.monthly_rent, selectedPricing.currency),
                        })
                      : ''}
                    {t('mkt.pricingBasisEnd')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.blockBtn, !selected && styles.blockBtnDisabled]}
                    activeOpacity={0.85}
                    disabled={!selected}
                    onPress={openForm}
                  >
                    <Text style={styles.blockBtnText}>
                      {t('mkt.confirmList', {
                        price: money(suggestedPrice ?? selected.monthly_rent, selectedPricing.currency),
                      })}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ===== ③ 挂牌托管 ===== */}
            <View style={styles.card}>
              {renderCardHead(
                t('mkt.headManage'),
                t('mkt.feeBadge'),
                colors.warning,
                colors.alpha(colors.warningRgb, 0.12),
              )}
              <View style={styles.colGrid}>
                <View style={styles.colCell}>
                  <Text style={styles.mutedSm}>{t('mkt.serviceFee')}</Text>
                  <Text style={styles.colVal}>8%</Text>
                  <Text style={styles.mutedSm}>{t('mkt.inclAds')}</Text>
                </View>
                <View style={styles.colCell}>
                  <Text style={styles.mutedSm}>{t('mkt.manageFee')}</Text>
                  <Text style={styles.colVal}>{t('mkt.firstYearFree')}</Text>
                  <Text style={styles.mutedSm}>{t('mkt.fromNextYear')}</Text>
                </View>
              </View>
              <Text style={styles.note}>{t('mkt.manageNote')}</Text>
              {!!selected?.share_url && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{t('mkt.shareLink')}</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>{selected.share_url}</Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            {renderSteps(saleSteps, saleActiveIdx)}

            {/* ===== ① 在线估价 ===== */}
            <View style={styles.card}>
              {renderCardHead(
                t('mkt.headEstimate'),
                t('mkt.refRange'),
                colors.warning,
                colors.alpha(colors.warningRgb, 0.12),
              )}
              {!saleProp ? (
                <EmptyState
                  icon="pricetag-outline"
                  title={t('mkt.emptySaleTitle')}
                  sub={t('mkt.emptySaleSub')}
                  actionLabel={t('mkt.actionConsign')}
                  onAction={openForm}
                />
              ) : (
                <>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('mkt.fieldProperty')}</Text>
                    <Text style={styles.fieldValue} numberOfLines={1}>{propTitle(saleProp)}</Text>
                  </View>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('pub.layout')}</Text>
                    <Text style={styles.fieldValue}>
                      {t('mkt.layoutValue', {
                        bed: saleProp.bedrooms ?? 0,
                        bath: saleProp.bathrooms ?? 0,
                        area: saleProp.size_sqm ?? 0,
                      })}
                    </Text>
                  </View>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('mkt.askingPrice')}</Text>
                    <Text style={styles.fieldValue}>
                      {money(Number(saleProp.sale_price || 0), saleProp.currency)}
                    </Text>
                  </View>
                  <View style={styles.estBox}>
                    <Text style={styles.mutedSm}>{t('mkt.estPriceLabel')}</Text>
                    <Text style={styles.estValue}>
                      {money(Number(saleProp.sale_price || 0) * 0.97, saleProp.currency)} -{' '}
                      {money(Number(saleProp.sale_price || 0) * 1.03, saleProp.currency)}
                    </Text>
                    <Text style={styles.estNote}>
                      {t('mkt.suggestAsk', {
                        price: money(Number(saleProp.sale_price || 0), saleProp.currency),
                      })}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.blockBtn} activeOpacity={0.85} onPress={openForm}>
                    <Text style={styles.blockBtnText}>{t('mkt.confirmEstimate')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ===== ② 挂牌 ===== */}
            <View style={styles.card}>
              {renderCardHead(
                t('mkt.headList'),
                saleListing ? L_STATUS[saleListing.status ?? '']?.text ?? t('mkt.inProgress') : t('mkt.pendingConfirm'),
                saleListing ? L_STATUS[saleListing.status ?? '']?.color ?? colors.info : colors.ink3,
                colors.surface2,
              )}
              {!saleListing ? (
                <EmptyState
                  icon="storefront-outline"
                  title={t('mkt.emptyListingTitle')}
                  sub={t('mkt.emptyListingSub')}
                  actionLabel={t('mkt.actionConsign')}
                  onAction={openForm}
                />
              ) : (
                <>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('mkt.listedProperty')}</Text>
                    <Text style={styles.fieldValue} numberOfLines={1}>{saleListing.title || t('mkt.listedProperty')}</Text>
                  </View>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('mkt.askingPrice')}</Text>
                    <Text style={styles.fieldValue}>
                      {money(saleListing.asking_price, saleListing.currency)}
                    </Text>
                  </View>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('mkt.serviceFee')}</Text>
                    <Text style={styles.fieldValue}>{t('mkt.saleFee')}</Text>
                  </View>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('mkt.promotion')}</Text>
                    <Text style={styles.fieldValue}>{t('mkt.promoAllChannel')}</Text>
                  </View>
                </>
              )}
            </View>

            {/* ===== ③ 预约带看 ===== */}
            <View style={styles.card}>
              {renderCardHead(
                t('mkt.headAppointment'),
                saleListing ? t('mkt.canBook') : t('mkt.unlockAfterListing'),
                colors.ink3,
                colors.surface2,
              )}
              {!saleListing ? (
                <EmptyState
                  icon="calendar-outline"
                  title={t('mkt.emptyAppointmentTitle')}
                  sub={t('mkt.emptyAppointmentSub')}
                />
              ) : (
                <>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('mkt.viewingTime')}</Text>
                    <Text style={styles.fieldValue}>{t('mkt.viewingTimeUnset')}</Text>
                  </View>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{t('mkt.viewingMode')}</Text>
                    <Text style={styles.fieldValue}>{t('mkt.viewingModeVal')}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    activeOpacity={0.85}
                    onPress={() => Alert.alert(t('mkt.setViewingTitle'), t('mkt.setViewingMsg'))}
                  >
                    <Text style={styles.secondaryBtnText}>{t('mkt.setViewingTitle')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ===== ④ 成交 ===== */}
            <View style={styles.card}>
              {renderCardHead(
                t('mkt.headDeal'),
                saleListing ? L_STATUS[saleListing.status ?? '']?.text ?? t('mkt.inProgress') : t('mkt.pendingListing'),
                colors.ink3,
                colors.surface2,
              )}
              <Text style={styles.note}>{t('mkt.dealNote')}</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${L_STATUS[saleListing?.status ?? '']?.pct ?? 0}%` },
                  ]}
                />
              </View>
              <Text style={styles.note}>
                {t('mkt.currentProgress', {
                  status: L_STATUS[saleListing?.status ?? '']?.text ?? t('mkt.pendingListing'),
                })}
              </Text>
            </View>
          </>
        )}

        {/* ===== 我的委托 ===== */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('mkt.myConsign')}</Text>
          <Text style={styles.sectionHint}>
            {t('mkt.countN', { n: rentConsigns.length + listings.length })}
          </Text>
        </View>
        <View style={styles.card}>
          {rentConsigns.length === 0 && listings.length === 0 ? (
            <EmptyState
              icon="storefront-outline"
              title={t('mkt.emptyConsignTitle')}
              sub={t('mkt.emptyConsignSub')}
              actionLabel={t('mkt.actionConsign')}
              onAction={openForm}
            />
          ) : (
            <>
              {/* 出租委托：平台托管中的房源 */}
              {rentConsigns.map((p) => {
                const st = RENT_STATUS[String(p.status || '').toLowerCase()];
                return (
                  <View key={`rent-${p.id}`} style={styles.consignItem}>
                    <View style={styles.consignIconRent}>
                      <Ionicons name="home-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.consignBody}>
                      <View style={styles.consignHead}>
                        <Text style={styles.consignTitle} numberOfLines={1}>
                          {t('mkt.rentConsign', { title: propTitle(p) })}
                        </Text>
                        <View style={[styles.badge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.badgeText, { color: st.color }]}>{st.text}</Text>
                        </View>
                      </View>
                      <Text style={styles.consignMeta} numberOfLines={1}>
                        {t('mkt.rentConsignMeta', {
                          date: formatDate(p.created_at),
                          price: money(p.monthly_rent, p.currency),
                        })}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressBar, { width: `${st.pct}%` }]} />
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* 出售委托：挂牌记录 */}
              {listings.map((l) => {
                const st = L_STATUS[l.status ?? ''] ?? L_STATUS.pending;
                return (
                  <View key={l.id} style={styles.consignItem}>
                    <View style={[styles.consignIcon, { backgroundColor: st.bg }]}>
                      <Ionicons name="storefront-outline" size={18} color={st.color} />
                    </View>
                    <View style={styles.consignBody}>
                      <View style={styles.consignHead}>
                        <Text style={styles.consignTitle} numberOfLines={1}>
                          {t('mkt.saleConsign', { title: l.title || t('mkt.listedProperty') })}
                        </Text>
                        <View style={[styles.badge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.badgeText, { color: st.color }]}>{st.text}</Text>
                        </View>
                      </View>
                      <Text style={styles.consignMeta} numberOfLines={1}>
                        {t('mkt.saleConsignMeta', {
                          date: formatDate(l.created_at),
                          price: money(l.asking_price, l.currency),
                        })}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressBar, { width: `${st.pct}%` }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>

      {/* 委托挂牌简表单 */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowForm(false)} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('mkt.modalTitle')}</Text>
            <Text style={styles.modalSub}>{t('mkt.modalSub')}</Text>

            <Text style={styles.formLabel}>{t('mkt.formName')}</Text>
            <TextInput
              style={styles.formInput}
              value={formTitle}
              onChangeText={setFormTitle}
              placeholder={t('mkt.formNamePh')}
              placeholderTextColor={colors.ink3}
              maxLength={80}
            />

            <Text style={styles.formLabel}>{t('mkt.formPrice')}</Text>
            <View style={styles.priceInputRow}>
              <TextInput
                style={[styles.formInput, styles.priceInput]}
                value={formPrice}
                onChangeText={setFormPrice}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.ink3}
              />
              <TextInput
                style={[styles.formInput, styles.ccyInput]}
                value={formCcy}
                onChangeText={(v) => setFormCcy(v.toUpperCase())}
                placeholder="THB"
                placeholderTextColor={colors.ink3}
                maxLength={3}
                autoCapitalize="characters"
              />
            </View>

            <Text style={styles.formLabel}>{t('mkt.formAddress')}</Text>
            <TextInput
              style={styles.formInput}
              value={formAddress}
              onChangeText={setFormAddress}
              placeholder={t('mkt.formAddressPh')}
              placeholderTextColor={colors.ink3}
            />

            <TouchableOpacity
              style={styles.blockBtn}
              activeOpacity={0.85}
              onPress={submit}
              disabled={submitting}
            >
              <Text style={styles.blockBtnText}>{submitting ? t('prop.submitting') : t('mkt.submit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  content: { paddingBottom: 32 },

  /* ===== Tabs ===== */
  tabs: {
    flexDirection: 'row',
    marginHorizontal: colors.spacing.lg,
    marginTop: colors.spacing.md,
    marginBottom: colors.spacing.lg,
    backgroundColor: colors.surface2,
    borderRadius: colors.radius.md,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: colors.radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.surface, ...colors.shadow.sm },
  tabText: { fontSize: colors.fontSize.base, fontWeight: '600', color: colors.ink3 },
  tabTextActive: { color: colors.ink, fontWeight: '700' },

  /* ===== 四步条 ===== */
  steps: {
    flexDirection: 'row',
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
  },
  step: { flex: 1, alignItems: 'center', gap: 5 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotText: { fontSize: colors.fontSize.sm, fontWeight: '700', color: colors.ink3 },
  stepDotTextActive: { color: colors.primaryForeground },
  stepLabel: { fontSize: colors.fontSize.xs, color: colors.ink3 },
  stepLabelActive: { color: colors.ink, fontWeight: '600' },

  /* ===== 卡片 ===== */
  card: {
    marginHorizontal: colors.spacing.lg,
    marginBottom: colors.spacing.lg,
    padding: colors.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: colors.spacing.md,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.full },
  badgeText: { fontSize: colors.fontSize.xs, fontWeight: '600' },
  mutedSm: { fontSize: colors.fontSize.sm, color: colors.ink3 },

  /* ===== ① 选择房源 ===== */
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    marginBottom: 8,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickActive: {
    borderColor: colors.primary,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.06),
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  pickBody: { flex: 1, minWidth: 0 },
  pickTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  pickMeta: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 2 },
  pickHint: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 4 },

  /* ===== ② 定价建议 ===== */
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: colors.spacing.md },
  priceBig: {
    fontSize: colors.fontSize['2xl'],
    fontWeight: '800',
    color: colors.primary,
    marginTop: 4,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  priceUnit: { fontSize: colors.fontSize.sm, fontWeight: '400', color: colors.ink3 },
  priceRight: { alignItems: 'flex-end' },
  priceAvg: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 8,
    borderRadius: colors.radius.full,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBar: { height: 8, borderRadius: colors.radius.full, backgroundColor: colors.primary },
  progressFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressRate: { fontSize: colors.fontSize.sm, fontWeight: '700' },
  note: { fontSize: colors.fontSize.sm, color: colors.ink3, lineHeight: 19, marginTop: colors.spacing.md },

  /* ===== ③ 挂牌托管 ===== */
  colGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  colCell: {
    flex: 1,
    padding: 10,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  colVal: { fontSize: colors.fontSize['2xl'], fontWeight: '700', color: colors.ink, marginVertical: 2 },

  /* ===== 字段行 ===== */
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  fieldLabel: { fontSize: colors.fontSize.sm, color: colors.ink3 },
  fieldValue: { flex: 1, textAlign: 'right', fontSize: colors.fontSize.base, fontWeight: '600', color: colors.ink },

  /* ===== 估价盒 ===== */
  estBox: {
    marginTop: colors.spacing.md,
    padding: 12,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.alpha(colors.warningRgb, 0.3),
    backgroundColor: colors.alpha(colors.warningRgb, 0.06),
    gap: 4,
  },
  estValue: {
    fontSize: colors.fontSize.xl,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  estNote: { fontSize: colors.fontSize.sm, color: colors.ink2 },

  /* ===== 主按钮 ===== */
  blockBtn: {
    marginTop: colors.spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: colors.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    ...colors.shadow.primary,
  },
  blockBtnDisabled: { opacity: 0.5 },
  blockBtnText: { color: colors.primaryForeground, fontSize: colors.fontSize.base, fontWeight: '700' },
  secondaryBtn: {
    marginTop: colors.spacing.lg,
    borderRadius: colors.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.ink2, fontSize: colors.fontSize.base, fontWeight: '600' },

  /* ===== 区块标题 ===== */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: colors.spacing.xl,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionHint: { fontSize: colors.fontSize.sm, color: colors.ink3, fontWeight: '500' },

  /* ===== 我的委托 ===== */
  consignItem: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  consignIcon: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consignIconRent: {
    width: 36,
    height: 36,
    borderRadius: colors.radius.md,
    backgroundColor: colors.alpha(colors.primaryRgb, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  consignBody: { flex: 1, minWidth: 0 },
  consignHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  consignTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  consignMeta: { fontSize: colors.fontSize.sm, color: colors.ink3, marginTop: 4, marginBottom: 8 },

  /* ===== Modal ===== */
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: colors.radius.xl, padding: 20, paddingTop: 34 },
  modalClose: { position: 'absolute', top: 12, right: 12, padding: 4 },
  modalTitle: { fontSize: colors.fontSize.xl, fontWeight: '700', color: colors.ink },
  modalSub: { fontSize: colors.fontSize.sm, color: colors.ink2, marginTop: 4, marginBottom: 16 },
  formLabel: { fontSize: colors.fontSize.base, color: colors.ink2, marginBottom: 6, marginTop: 12 },
  formInput: {
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  priceInputRow: { flexDirection: 'row' },
  priceInput: { flex: 1, marginRight: 8 },
  ccyInput: { width: 96, textAlign: 'center' },
});