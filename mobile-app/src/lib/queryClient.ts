/**
 * TanStack Query 全局 QueryClient。
 * 职责：会话内请求去重（同 key 并发只发一次）、staleTime 后台刷新、失败重试；
 * 跨会话「秒开」由 MMKV 缓存的 cache.ts 承担（页面级 SWR），两层互补。
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 3 分钟内视为新鲜：Tab 切换/回屏不重复请求，下拉刷新用 refetch 强制
      staleTime: 3 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 10 * 60 * 1000,
    },
  },
});
