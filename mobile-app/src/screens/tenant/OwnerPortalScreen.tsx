/**
 * 房东工作台
 * 营销推广空置房列表 + 一键分享链接、定价建议、年度财务汇总
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '@/theme/colors';
import { ownersApi } from '@/services/api';

interface MarketingItem {
  id: string;
  title?: string;
  address?: string;
  monthly_rent?: number;
  currency?: string;
  photo?: string;
  status?: string;
  share_url?: string;
}

interface PricingItem {
  property_id: string;
  title?: string;
  monthly_rent?: number;
  currency?: string;
  peer_count?: number;
  peer_avg?: number;
  peer_range?: string;
  suggestion?: {
    direction?: string;
    diff_pct?: number;
    suggested?: number;
  };
}

interface MonthSummary {
  month?: string;
  received?: number;
  pending?: number;
  overdue?: number;
  count?: number;
}

interface AnnualSummary {
  by_month?: MonthSummary[];
  totals?: {
    received?: number;
    pending?: number;
    overdue?: number;
    count?: number;
  };
}

const formatMoney = (v: any, currency?: string) => {
  const cur = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '฿';
  return `${cur}${Number(v || 0).toLocaleString()}`;
};

const directionText: Record<string, string> = {
  up: '建议上调',
  down: '建议下调',
  flat: '持平',
};

export default function OwnerPortalScreen() {
  const [marketing, setMarketing] = useState<MarketingItem[]>([]);
  const [totalVacant, setTotalVacant] = useState(0);
  const [pricing, setPricing] = useState<PricingItem[]>([]);
  const [summary, setSummary] = useState<AnnualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    try {
      const [mkRes, pRes, sumRes]: any[] = await Promise.allSettled([
        ownersApi.marketing(),
        ownersApi.pricingSuggestion(),
        ownersApi.annualSummary(year),
      ]);
      if (mkRes.status === 'fulfilled') {
        const d = mkRes.value?.data;
        setMarketing(
          Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [],
        );
        setTotalVacant(d?.total_vacant ?? 0);
      }
      if (pRes.status === 'fulfilled') {
        const d = pRes.value?.data;
        setPricing(Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : []);
      }
      if (sumRes.status === 'fulfilled') {
        setSummary((sumRes.value?.data ?? null) as AnnualSummary | null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleShare = (item: MarketingItem) => {
    const url = item.share_url;
    if (!url) {
      Alert.alert('提示', '该房源暂无分享链接');
      return;
    }
    Alert.alert('推广链接', url, [
      { text: '复制', onPress: () => Alert.alert('已复制', '推广链接已复制到剪贴板（演示）') },
      { text: '关闭' },
      { text: '分享', onPress: () => Alert.alert('分享', '已唤起系统分享（演示）') },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const totals = summary?.totals;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      {/* 年度财务汇总 */}
      <View style={styles.banner}>
        <View style={styles.bannerTop}>
          <Text style={styles.bannerLabel}>年度财务汇总（{year}）</Text>
          <TouchableOpacity
            onPress={() => {
              Alert.alert('选择年份', '当前年份', [
                { text: String(year - 1), onPress: () => setYear(year - 1) },
                { text: String(year), onPress: () => {} },
                { text: '取消', style: 'cancel' },
              ]);
            }}
          >
            <Text style={styles.bannerYear}>切换</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{formatMoney(totals?.received ?? 0)}</Text>
            <Text style={styles.summaryLabel}>实收</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { color: colors.warning }]}>
              {formatMoney(totals?.pending ?? 0)}
            </Text>
            <Text style={styles.summaryLabel}>待收</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryValue, { color: colors.error }]}>
              {formatMoney(totals?.overdue ?? 0)}
            </Text>
            <Text style={styles.summaryLabel}>逾期</Text>
          </View>
        </View>
      </View>

      {/* 营销推广 */}
      <Text style={styles.sectionTitle}>
        营销推广（空置 {totalVacant} 套）
      </Text>
      {marketing.length === 0 ? (
        <Text style={styles.empty}>暂无可推广房源</Text>
      ) : (
        marketing.map((m) => (
          <View key={m.id} style={styles.card}>
            <View style={styles.cardTop}>
              {m.photo ? (
                <Image source={{ uri: m.photo }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Text style={styles.thumbText}>房源</Text>
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{m.title || '未命名房源'}</Text>
                <Text style={styles.cardAddress} numberOfLines={1}>{m.address || '暂无地址'}</Text>
                <Text style={styles.cardRent}>{formatMoney(m.monthly_rent, m.currency)}/月</Text>
              </View>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => handleShare(m)}
                activeOpacity={0.8}
              >
                <Text style={styles.shareBtnText}>一键分享</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* 定价建议 */}
      <Text style={styles.sectionTitle}>定价建议</Text>
      {pricing.length === 0 ? (
        <Text style={styles.empty}>暂无定价建议</Text>
      ) : (
        pricing.map((p) => {
          const sug = p.suggestion;
          const dir = directionText[sug?.direction ?? ''] ?? (sug?.direction ?? '—');
          return (
            <View key={p.property_id} style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={1}>{p.title || '房源'}</Text>
              <Text style={styles.cardAddr}>
                当前 {formatMoney(p.monthly_rent, p.currency)} · 同类 {p.peer_count ?? 0} 套，均价{' '}
                {formatMoney(p.peer_avg, p.currency)}
              </Text>
              {!!p.peer_range && <Text style={styles.cardAddr}>区间 {p.peer_range}</Text>}
              <View style={styles.pricingRow}>
                <View style={styles.directionBadge}>
                  <Text style={styles.directionText}>{dir}</Text>
                </View>
                <Text style={styles.cardAddr}>
                  建议价 {formatMoney(sug?.suggested, p.currency)}
                  {sug?.diff_pct != null ? `（${Number(sug.diff_pct) > 0 ? '+' : ''}${sug.diff_pct}%）` : ''}
                </Text>
              </View>
            </View>
          );
        })
      )}

      {/* 月度明细 */}
      <Text style={styles.sectionTitle}>月度明细</Text>
      {(summary?.by_month ?? []).length === 0 ? (
        <Text style={styles.empty}>暂无月度数据</Text>
      ) : (
        (summary?.by_month ?? []).map((m) => (
          <View key={m.month ?? ''} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{m.month}</Text>
              <Text style={styles.monthCount}>{m.count ?? 0} 笔</Text>
            </View>
            <Text style={styles.cardAddr}>
              实收 {formatMoney(m.received ?? 0)} · 待收 {formatMoney(m.pending ?? 0)} · 逾期{' '}
              {formatMoney(m.overdue ?? 0)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 12, paddingBottom: 24 },
  banner: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
  },
  bannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bannerLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  bannerYear: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryCell: { flex: 1 },
  summaryValue: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 18,
    marginBottom: 8,
  },
  empty: { color: colors.ink3, textAlign: 'center', marginTop: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  thumbPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { fontSize: 12, color: colors.ink3 },
  cardInfo: { flex: 1, marginLeft: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardAddress: { fontSize: 12, color: colors.ink2, marginTop: 4 },
  cardAddr: { fontSize: 12, color: colors.ink2, marginTop: 4 },
  cardRent: { color: colors.primary, fontSize: 14, fontWeight: '700', marginTop: 4 },
  shareBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  shareBtnText: { color: colors.primaryForeground, fontSize: 12, fontWeight: '600' },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  directionBadge: {
    backgroundColor: colors.sidebarActive,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  directionText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthCount: { fontSize: 12, color: colors.ink3 },
});