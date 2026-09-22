import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import EmptyState from '@/components/EmptyState';
import { getHistory, clearHistory, type BrowseHistoryItem } from '@/lib/browseHistory';
import { useI18n } from '@/i18n';
import colors from '@/theme/colors';
import { fmtMoney } from '@/utils/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 浏览历史。
 * 由「我的 - 常用功能 - 浏览历史」进入；本地记录已看过的房源（最新在前），点行进公开详情，可一键清空。
 */
export default function HistoryScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [items, setItems] = useState<BrowseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await getHistory());
    } catch (e) {
      console.warn('load history failed', e);
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

  const onClear = useCallback(async () => {
    await clearHistory();
    setItems([]);
  }, []);

  const openDetail = useCallback(
    (row: BrowseHistoryItem) => {
      if (row.id) navigation.navigate('PublicListingDetail', { id: String(row.id) });
    },
    [navigation],
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 24 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.length > 0 ? (
        <TouchableOpacity style={styles.clearBar} onPress={onClear} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={15} color={colors.ink3} />
          <Text style={styles.clearText}>清空</Text>
        </TouchableOpacity>
      ) : null}
      {!loading && items.length === 0 ? (
        <View style={[styles.emptyWrap, { paddingTop: insets.top + 24 }]}>
          <EmptyState icon="time-outline" title={t('pub.historyEmpty')} sub={t('pub.historyEmptySub')} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {items.map((it, idx) => {
            const title = it.title || `房源 ${String(it.id).slice(0, 8)}`;
            return (
              <TouchableOpacity
                key={it.id}
                style={[styles.row, idx < items.length - 1 && styles.rowBorder]}
                activeOpacity={0.7}
                onPress={() => openDetail(it)}
              >
                {it.cover ? (
                  <Image source={{ uri: String(it.cover) }} style={styles.thumb} />
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
                  {it.price ? (
                    <Text style={styles.price}>
                      {fmtMoney(it.price, it.currency)}
                      <Text style={styles.priceUnit}>/月</Text>
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'flex-start' },
  emptyWrap: { flex: 1, backgroundColor: colors.background },
  clearBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  clearText: { fontSize: 13, color: colors.ink3 },
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
});