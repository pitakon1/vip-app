/**
 * 轻量磁盘缓存工具（SWR 模式：缓存优先渲染 + 后台刷新）。
 * 存储后端为 MMKV（同步原生 KV，冷启动秒读），Expo Go / Web 下自动降级 AsyncStorage。
 */
import { getItem, multiRemove, getAllKeys, removeItem, setItem } from './kv';

const CACHE_PREFIX = 'cache:';
const DEFAULT_TTL = 3 * 60 * 1000;

interface CacheEnvelope<T> {
  t: number;
  data: T;
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (!env || typeof env.t !== 'number') return null;
    return env.data;
  } catch {
    return null;
  }
}

export async function isFresh(key: string, ttl: number = DEFAULT_TTL): Promise<boolean> {
  try {
    const raw = await getItem(CACHE_PREFIX + key);
    if (!raw) return false;
    const env = JSON.parse(raw) as CacheEnvelope<unknown>;
    return typeof env.t === 'number' && Date.now() - env.t < ttl;
  } catch {
    return false;
  }
}

/** 取缓存数据 + 写入时间戳（供 TanStack Query seed 时对齐 updatedAt） */
export async function getCachedMeta<T>(
  key: string,
): Promise<{ t: number; data: T } | null> {
  try {
    const raw = await getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (!env || typeof env.t !== 'number') return null;
    return { t: env.t, data: env.data };
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    const env: CacheEnvelope<T> = { t: Date.now(), data };
    await setItem(CACHE_PREFIX + key, JSON.stringify(env));
  } catch {
    /* 缓存写失败不影响主流程 */
  }
}

export async function clearCache(key?: string): Promise<void> {
  try {
    if (key) {
      await removeItem(CACHE_PREFIX + key);
      return;
    }
    const keys = await getAllKeys();
    const caches = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (caches.length) await multiRemove(caches);
  } catch {
    /* ignore */
  }
}
