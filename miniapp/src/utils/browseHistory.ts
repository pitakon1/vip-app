/**
 * 浏览历史（本地存储，逐台设备独立）。
 *
 * 以房源「上架单（listing）id」为键记录访问，最新在前、上限 50 条。
 * 数据仅存本地 KV（Taro.getStorageSync / setStorageSync），不上报服务器。
 * 与 App 端 mobile-app/src/lib/browseHistory.ts 保持同一口径。
 */
import Taro from '@tarojs/taro'

const HISTORY_KEY = 'browse_history'
const HISTORY_CAP = 50

export interface BrowseHistoryItem {
  id: string
  title?: string
  address?: string
  price?: number
  currency?: string
  cover?: string
  listing_type?: string
  viewed_at: number
}

/** 记录一次访问：按 id 去重并移到最前，超出上限裁剪。 */
export function recordHistory(item: Omit<BrowseHistoryItem, 'viewed_at'>): void {
  try {
    if (!item?.id) return
    const cur = readRaw()
    const next = cur.filter((it) => String(it.id) !== String(item.id))
    next.unshift({ ...item, id: String(item.id), viewed_at: Date.now() })
    Taro.setStorageSync(HISTORY_KEY, JSON.stringify(next.slice(0, HISTORY_CAP)))
  } catch {
    // 本地存储异常不影响页面浏览
  }
}

/** 读取浏览历史（最新在前）。JSON 损坏时回退空数组。 */
export function getHistory(): BrowseHistoryItem[] {
  return readRaw()
}

/** 清空浏览历史。 */
export function clearHistory(): void {
  try {
    Taro.setStorageSync(HISTORY_KEY, JSON.stringify([]))
  } catch {
    // 忽略失败
  }
}

function readRaw(): BrowseHistoryItem[] {
  try {
    const raw = Taro.getStorageSync(HISTORY_KEY) as string | null | undefined
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}