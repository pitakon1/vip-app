import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '@/theme/colors';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { saleListingApi } from '@/services/api';

interface SaleListing {
  id: string;
  title?: string;
  address?: string;
  asking_price?: number;
  currency?: string;
  sale_type?: string;
  status?: string;
  size_sqm?: number;
  bedrooms?: number;
}

const cur = (c?: string) => (c === 'USD' ? '$' : c === 'CNY' ? '¥' : '฿');
const money = (v: any, c?: string) => `${cur(c)}${Number(v || 0).toLocaleString()}`;

const L_STATUS: Record<string, { text: string; color: string; bg: string }> = {
  active: { text: '推广中', color: colors.success, bg: 'rgba(22,163,74,0.1)' },
  pending: { text: '待审', color: colors.info, bg: 'rgba(14,165,233,0.1)' },
  contracted: { text: '已签约', color: colors.primary, bg: colors.sidebarActive },
  closed: { text: '已成交', color: colors.success, bg: 'rgba(22,163,74,0.1)' },
  cancelled: { text: '已取消', color: colors.ink3, bg: colors.surface2 },
  expired: { text: '已过期', color: colors.ink3, bg: colors.surface2 },
};

export default function OwnerMarketingScreen() {
  const [listings, setListings] = useState<SaleListing[]>([]);
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
    try {
      const res: any = await saleListingApi.list({ limit: 100 });
      const data = res?.data;
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];
      setListings(items as SaleListing[]);
    } catch (err: any) {
      Alert.alert('加载失败', err?.response?.data?.message || '无法获取挂牌列表');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const activeCount = listings.filter((l) => l.status === 'active').length;

  const submit = async () => {
    const title = formTitle.trim();
    const price = Number(formPrice);
    if (!title || !price) {
      Alert.alert('请完善信息', '请填写物业名称与挂牌售价');
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
      Alert.alert('已提交', '挂牌已提交，经纪人将尽快与你联系确认');
      setShowForm(false);
      setFormTitle('');
      setFormPrice('');
      setFormAddress('');
      setFormCcy('THB');
      load();
    } catch (err: any) {
      Alert.alert('提交失败', err?.response?.data?.message || '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const openForm = () => {
    setFormTitle('');
    setFormPrice('');
    setFormAddress('');
    setFormCcy('THB');
    setShowForm(true);
  };

  const renderItem = ({ item }: { item: SaleListing }) => {
    const st = L_STATUS[item.status ?? 'active'] ?? L_STATUS.active;
    const seg = money(item.asking_price, item.currency);
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Ionicons name="storefront-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title || '挂牌房源'}
            </Text>
            {!!item.address && (
              <Text style={styles.cardAddress} numberOfLines={1}>{item.address}</Text>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.text}</Text>
          </View>
        </View>
        <View style={styles.cardFoot}>
          <Text style={styles.price}>{seg}</Text>
          <Text style={styles.meta}>
            {item.sale_type === 'buy' ? '挂买' : '挂卖'}
            {item.size_sqm ? ` · ${item.size_sqm}㎡` : ''}
            {item.bedrooms != null ? ` · ${item.bedrooms}室` : ''}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingState label="正在加载挂牌列表…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroLabel}>营销推广概览</Text>
                <Text style={styles.heroAmount}>共 {listings.length} 条挂牌</Text>
              </View>
              <TouchableOpacity style={styles.heroBtn} activeOpacity={0.85} onPress={openForm}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={styles.heroBtnText}>委托挂牌</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.heroStats}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatVal}>{activeCount}</Text>
                <Text style={styles.heroStatLabel}>推广中</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatVal}>{listings.length}</Text>
                <Text style={styles.heroStatLabel}>挂牌总数</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="storefront-outline"
            title="暂无挂牌"
            sub="还没有委托挂牌，发布后房源将进入平台推广与评估流程"
            actionLabel="委托挂牌"
            onAction={openForm}
          />
        }
      />

      {/* 委托挂牌简表单 */}
      <Modal
        visible={showForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForm(false)}
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowForm(false)} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={colors.ink2} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>委托挂牌</Text>
            <Text style={styles.modalSub}>填写基础信息，提交后经纪人将跟进确认</Text>

            <Text style={styles.fieldLabel}>物业名称</Text>
            <TextInput
              style={styles.fieldInput}
              value={formTitle}
              onChangeText={setFormTitle}
              placeholder="如：曼谷 素坤逸 X 号公寓"
              placeholderTextColor={colors.ink3}
              maxLength={80}
            />

            <Text style={styles.fieldLabel}>挂牌售价</Text>
            <View style={styles.priceInputRow}>
              <TextInput
                style={[styles.fieldInput, styles.priceInput]}
                value={formPrice}
                onChangeText={setFormPrice}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.ink3}
              />
              <TextInput
                style={[styles.fieldInput, styles.ccyInput]}
                value={formCcy}
                onChangeText={(t) => setFormCcy(t.toUpperCase())}
                placeholder="THB"
                placeholderTextColor={colors.ink3}
                maxLength={3}
                autoCapitalize="characters"
              />
            </View>

            <Text style={styles.fieldLabel}>物业地址（选填）</Text>
            <TextInput
              style={styles.fieldInput}
              value={formAddress}
              onChangeText={setFormAddress}
              placeholder="楼盘/门牌地址"
              placeholderTextColor={colors.ink3}
            />

            <TouchableOpacity
              style={styles.submitBtn}
              activeOpacity={0.85}
              onPress={submit}
              disabled={submitting}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? '提交中…' : '提交挂牌'}
              </Text>
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
  list: { paddingHorizontal: 12, paddingBottom: 24 },

  /* Hero */
  heroCard: {
    marginTop: 12,
    marginBottom: 4,
    padding: 18,
    borderRadius: colors.radius.xl,
    backgroundColor: colors.primary,
    ...colors.shadow.primary,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginTop: 6,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: colors.radius.full,
  },
  heroBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700', marginLeft: 2 },
  heroStats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 15, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  heroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)' },

  /* 列表卡片 */
  card: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: colors.radius.md,
    backgroundColor: `rgba(${colors.primaryRgb}, 0.1)`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardAddress: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: colors.radius.full, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 12,
    marginLeft: 52,
  },
  price: { fontSize: 17, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, color: colors.ink3 },

  /* Modal 表单 */
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    padding: 20,
    paddingTop: 34,
  },
  modalClose: { position: 'absolute', top: 12, right: 12, padding: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  modalSub: { fontSize: 12, color: colors.ink2, marginTop: 4, marginBottom: 16 },
  fieldLabel: { fontSize: 13, color: colors.ink2, marginBottom: 6, marginTop: 12 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: colors.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: 'center',
    backgroundColor: colors.surface,
  },
  priceInputRow: { flexDirection: 'row' },
  priceInput: { flex: 1, marginRight: 8 },
  ccyInput: { width: 96, textAlign: 'center' },
  submitBtn: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: colors.radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    ...colors.shadow.primary,
  },
  submitBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: '700' },
});