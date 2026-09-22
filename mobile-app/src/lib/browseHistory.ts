/**
 * 浏览历史（本地存储，逐台设备独立）。
 *
 * 以房源「上架单（listing）id」为键记录访问，最新在前、上限 50 条。
 * 数据仅存本地 KV，不上报服务器；已下架/失效的历史条目由列表页与详情页自行兜底。
 */
import { getItem, setItem } from '@/lib/kv';

const HISTORY_KEY = 'browse_history';
const HISTORY_CAP = 50;

export interface BrowseHistoryItem {
  id: string;
  title?: string;
  address?: string;
  price?: number;
  currency?: string;
  cover?: string;
  listing_type?: string;
  viewed_at: number;
}

/** 记录一次访问：按 id 去重并移到最前，超出上限裁剪。 */
export async function recordHistory(
  item: Omit<BrowseHistoryItem, 'viewed_at'>,
): Promise<void> {
  try {
    const cur = await readRaw();
    const next = cur.filter((it) => it.id !== item.id);
    next.unshift({ ...item, id: String(item.id), viewed_at: Date.now() });
    await setItem(HISTORY_KEY, JSON.stringify(next.slice(0, HISTORY_CAP)));
  } catch {
    // 本地存储异常不影响页面浏览
  }
}

/** 读取浏览历史（最新在前）。JSON 损坏时回退空数组。 */
export async function getHistory(): Promise<BrowseHistoryItem[]> {
  try {
    return await readRaw();
  } catch {
    return [];
  }
}

/** 清空浏览历史。 */
export async function clearHistory(): Promise<void> {
  try {
    await setItem(HISTORY_KEY, JSON.stringify([]));
  } catch {
    // 忽略失败
  }
}

async function readRaw(): Promise<BrowseHistoryItem[]> {
  const raw = await getItem(HISTORY_KEY);
  if (!raw) return [];
  const arr = JSON.parse(raw);
  return Array.isArray(arr) ? arr : [];
}