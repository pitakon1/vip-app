/**
 * 可复用缓存查询 Hook：TanStack Query + MMKV 磁盘缓存（SWR 秒开模式）。
 * - 会话内：staleTime 去重 / 后台刷新 / 失败重试由 TanStack Query 承担；
 * - 跨会话：mount 时读 MMKV 缓存 seed 进 Query Cache（updatedAt 对齐缓存时间戳，
 *   让 staleTime 与 TTL 语义一致 —— 新鲜期内不发请求，过期后自动后台刷新）；
 * - 查询成功后自动回写 MMKV 缓存。
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCachedMeta, setCached } from './cache';

interface CachedQueryOptions<T> {
  queryKey: string[];
  cacheKey: string;
  queryFn: () => Promise<T>;
  /** 新鲜期（默认 3 分钟） */
  ttl?: number;
  enabled?: boolean;
}

export function useCachedQuery<T>({
  queryKey,
  cacheKey,
  queryFn,
  ttl = 3 * 60 * 1000,
  enabled = true,
}: CachedQueryOptions<T>) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await queryFn();
      void setCached(cacheKey, data);
      return data;
    },
    staleTime: ttl,
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const meta = await getCachedMeta<T>(cacheKey);
      if (cancelled || !meta) return;
      queryClient.setQueryData(queryKey, meta.data, { updatedAt: meta.t });
    })();
    return () => {
      cancelled = true;
    };
    // queryKey 序列化比较，避免每次渲染重建新数组触发重复 seed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, cacheKey, enabled, JSON.stringify(queryKey)]);

  return query;
}
