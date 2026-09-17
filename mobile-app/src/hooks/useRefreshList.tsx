import { useCallback, useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import colors from '@/theme/colors';

/**
 * 通用「首次加载 + 下拉刷新」列表状态封装。
 * 返回 loading（首屏加载）、refreshing（下拉中）、load（触发首屏加载）、
 * onRefresh（下拉刷新），以及可直接塞进 ScrollView/FlatList 的 refreshControl。
 */
export function useRefreshList<T>(fetcher: () => Promise<T>) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      await fetcher();
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetcher();
    } finally {
      setRefreshing(false);
    }
  }, [fetcher]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
  );

  return { loading, refreshing, load, onRefresh, refreshControl };
}