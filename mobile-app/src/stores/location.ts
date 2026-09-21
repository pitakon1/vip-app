/**
 * 全局定位 Store（跨端统一：App / 小程序 / Web 结构一致）。
 *
 * 对齐链家/贝壳心智：国家 → 城市 两级定位放在「主页左上角」，
 * 找房列表页的「区域」筛选只呈现当前定位城市下的区/街道。
 *
 * 结构基于 src/data/locationArea.ts 的 AREA_GROUPS（国家 → 城市 → 城区）。
 * 持久化：写入本端 KV（App=MMKV/AsyncStorage，小程序=storageSync，Web=localStorage），
 * 冷启动同步读取，避免每次启动都回到默认城市。
 */
import { create } from 'zustand';
import { getStringSync, getItem, setItem } from '@/lib/kv';
import { AREA_GROUPS, type CityGroup } from '@/data/locationArea';

export interface LocationSelection {
  /** 国家名（相当于 AREA_GROUPS[].country） */
  country: string;
  /** cityKey（AREA_GROUPS[].cityKey） */
  cityKey: string;
  /** 城市显示名（AREA_GROUPS[].cityLabel） */
  cityLabel: string;
}

const LOCATION_KEY = 'location:selection';

/** 默认定位：第一个国家下的第一个城市。 */
function defaultSelection(): LocationSelection {
  const first = AREA_GROUPS[0];
  return first
    ? { country: first.country, cityKey: first.cityKey, cityLabel: first.cityLabel }
    : { country: '', cityKey: '', cityLabel: '' };
}

/** 国家 → 城市 两级结构，供定位选择器渲染。 */
export const LOCATION_GROUPS: { country: string; cities: CityGroup[] }[] = AREA_GROUPS.reduce<
  { country: string; cities: CityGroup[] }[]
>((acc, g) => {
  const existing = acc.find((x) => x.country === g.country);
  if (existing) {
    existing.cities.push(g);
  } else {
    acc.push({ country: g.country, cities: [g] });
  }
  return acc;
}, []);

/** 按 cityKey 查找城市分组。 */
export function findCityByKey(cityKey: string): CityGroup | undefined {
  return AREA_GROUPS.find((g) => g.cityKey === cityKey);
}

/** 解析 storage 中的选择并规范化，非法/未匹配返回 null。 */
function findCityByKeySafe(raw?: Partial<LocationSelection>): LocationSelection | null {
  if (!raw?.cityKey) return null;
  const g = findCityByKey(raw.cityKey);
  if (g && g.country === raw.country) {
    return { country: g.country, cityKey: g.cityKey, cityLabel: g.cityLabel };
  }
  return null;
}

interface LocationState {
  selection: LocationSelection;
  /** 初始化：启动时从本地 KV 同步读取。 */
  hydrate: () => void;
  /** 重新定位（主页左上角选择国家后选城市）。 */
  select: (sel: LocationSelection) => void;
  /** 全部城市模式：清空定位，find 全域。 */
  clear: () => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  selection: defaultSelection(),

  hydrate: () => {
    // MMKV 可用时同步秒读；降级路径用异步 getItem 兜底
    try {
      const rawSync = getStringSync(LOCATION_KEY);
      if (rawSync) {
        const g = findCityByKeySafe(JSON.parse(rawSync) as LocationSelection);
        if (g) set({ selection: g });
        return;
      }
    } catch {
      /* 同步读失败继续走异步 */
    }
    try {
      getItem(LOCATION_KEY).then((raw) => {
        if (!raw) return;
        const g = findCityByKeySafe(JSON.parse(raw) as LocationSelection);
        if (g) set({ selection: g });
      });
    } catch {
      /* 读取失败用默认 */
    }
  },

  select: (sel) => {
    const g = findCityByKey(sel.cityKey);
    const normalized: LocationSelection = g
      ? { country: g.country, cityKey: g.cityKey, cityLabel: g.cityLabel }
      : sel;
    set({ selection: normalized });
    try {
      void setItem(LOCATION_KEY, JSON.stringify(normalized));
    } catch {
      /* 持久化失败不影响本次定位 */
    }
  },

  clear: () => {
    const def = defaultSelection();
    set({ selection: def });
    try {
      void setItem(LOCATION_KEY, JSON.stringify(def));
    } catch {
      /* ignore */
    }
  },
}));