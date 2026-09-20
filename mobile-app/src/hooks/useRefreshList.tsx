import { useCallback, useEffect, useRef, useState } from 'react';
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
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      await fetcher();
    } finally {
      // 卸载/失焦后不再 setState；旧代次响应丢弃，防止慢响应覆盖新阶段列表
      if (mountedRef.current && seq === seqRef.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      seqRef.current++; // 使进行中的请求代次失效
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    const seq = ++seqRef.current;
    setRefreshing(true);
    try {
      await fetcher();
    } finally {
      if (mountedRef.current && seq === seqRef.current) setRefreshing(false);
    }
  }, [fetcher]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
  );

  return { loading, refreshing, load, onRefresh, refreshControl };
}