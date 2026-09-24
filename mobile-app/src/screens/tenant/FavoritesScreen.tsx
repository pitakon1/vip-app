import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import { favoritesApi } from '@/services/api';
import { useI18n } from '@/i18n';
import RemoteImage from '@/components/RemoteImage';
import colors from '@/theme/colors';
import { fmtMoney } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 我的关注（收藏列表）。
 * 由「我的 - 常用功能 - 我的关注」进入；展示收藏房源卡片，点红心可取消收藏。
 * 有公开上架单（listing_id）时跳到 C 端公开详情，否则回退登录态房源详情。
 */
export default function FavoritesScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // 加载失败与「真的没有收藏」必须分开：此前 catch 里只 console.warn，
  // 请求失败也会掉进 items.length === 0 的空态，用户看到的是「还没有关注」——
  // 把网络故障说成了业务事实，用户不会去重试。
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const res = await favoritesApi.mine({ page: 1, page_size: 50 });
      const d: any = res?.data;
      const rows = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      setItems(rows);
    } catch (e) {
      console.warn('load favorites failed', e);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openDetail = useCallback(
    (item: any) => {
      if (item.listing_id) {
        navigation.navigate('PublicListingDetail', { id: String(item.listing_id) });
      } else if (item.property_id) {
        navigation.navigate('PropertyDetail', { id: String(item.property_id) });
      }
    },
    [navigation],
  );

  const unfavorite = useCallback(
    async (item: any) => {
      if (!item.property_id || removingId) return;
      setRemovingId(String(item.property_id));
      try {
        await favoritesApi.remove(String(item.property_id));
        setItems((prev) => prev.filter((it) => it.property_id !== item.property_id));
      } catch (e) {
        console.warn('unfavorite failed', e);
      } finally {
        setRemovingId(null);
      }
    },
    [removingId],
  );

  if (loading) {
    return <LoadingState label={t('pub.loading')} />;
  }

  if (!loading && failed) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState
          icon="cloud-offline-outline"
          title={t('loadFailed')}
          sub={t('loadFailedSub')}
          actionLabel={t('retry')}
          onAction={() => {
            setLoading(true);
            load();
          }}
        />
      </View>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
        <EmptyState icon="heart-outline" title={t('pub.followsEmpty')} sub={t('pub.followsEmptySub')} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {items.map((it, idx) => {
        const title =
          it.title ||
          `${it.room_number ?? ''}` ||
          `${t('listingFallback')} ${String(it.property_id ?? '').slice(0, 8)}`;
        const img = it.photo;
        return (
          <TouchableOpacity
            key={String(it.id ?? it.property_id)}
            style={[styles.row, idx < items.length - 1 && styles.rowBorder]}
            activeOpacity={0.7}
            onPress={() => openDetail(it)}
          >
            {img ? (
              <RemoteImage uri={String(img)} style={styles.thumb} />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Ionicons name="image-outline" size={22} color={colors.ink3} />
              </View>
            )}
            <View style={styles.meta}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {it.address ? (
                <Text style={styles.address} numberOfLines={1}>
                  {it.address}
                </Text>
              ) : null}
              {it.monthly_rent ? (
                <Text style={styles.price}>{fmtMoney(it.monthly_rent, it.currency)}<Text style={styles.priceUnit}>/月</Text></Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.heart}
              onPress={() => unfavorite(it)}
              accessibilityRole="button"
              accessibilityLabel={t('pub.myFollow')}
            >
              <Ionicons
                name={removingId === String(it.property_id) ? 'heart-half' : 'heart'}
                size={22}
                color={colors.error}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'flex-start' },
  emptyWrap: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: colors.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...colors.shadow.card,
  },
  rowBorder: {},
  thumb: { width: 84, height: 84, borderRadius: colors.radius.lg, backgroundColor: colors.surface2 },
  thumbPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: colors.radius.lg,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600', color: colors.ink },
  address: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  price: { fontSize: 15, fontWeight: '700', color: colors.error, marginTop: 6 },
  priceUnit: { fontSize: 11, fontWeight: '400', color: colors.ink3 },
  heart: { padding: 8, marginRight: -8 },
});