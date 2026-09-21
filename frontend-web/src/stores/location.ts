/**
 * 全局定位 Store（跨端统一：App / 小程序 / Web 结构一致）。
 *
 * 对齐链家/贝壳心智：国家 → 城市 两级定位放在「主页左上角」，
 * 找房列表页的「区域」筛选只呈现当前定位城市下的区/街道。
 *
 * 结构基于 src/data/locationArea.ts 的 AREA_GROUPS（国家 → 城市 → 城区）。
 * 持久化：localStorage，冷启动同步读取，避免每次启动都回到默认城市。
 */
import { create } from 'zustand'
import { AREA_GROUPS, type CityGroup } from '@/data/locationArea'

export interface LocationSelection {
  country: string
  cityKey: string
  cityLabel: string
}

const LOCATION_KEY = 'location:selection'

function defaultSelection(): LocationSelection {
  const first = AREA_GROUPS[0]
  return first
    ? { country: first.country, cityKey: first.cityKey, cityLabel: first.cityLabel }
    : { country: '', cityKey: '', cityLabel: '' }
}

/** 国家 → 城市 两级结构，供定位选择器渲染。 */
export const LOCATION_GROUPS: { country: string; cities: CityGroup[] }[] = AREA_GROUPS.reduce<
  { country: string; cities: CityGroup[] }[]
>((acc, g) => {
  const existing = acc.find((x) => x.country === g.country)
  if (existing) {
    existing.cities.push(g)
  } else {
    acc.push({ country: g.country, cities: [g] })
  }
  return acc
}, [])

/** 按 cityKey 查找城市分组。 */
export function findCityByKey(cityKey: string): CityGroup | undefined {
  return AREA_GROUPS.find((g) => g.cityKey === cityKey)
}

function findCityByKeySafe(raw?: Partial<LocationSelection>): LocationSelection | null {
  if (!raw?.cityKey) return null
  const g = findCityByKey(raw.cityKey)
  if (g && g.country === raw.country) {
    return { country: g.country, cityKey: g.cityKey, cityLabel: g.cityLabel }
  }
  return null
}

function readStorage(): string | null {
  try {
    return (globalThis.localStorage?.getItem(LOCATION_KEY) as string | null) ?? null
  } catch {
    return null
  }
}

function writeStorage(sel: LocationSelection): void {
  try {
    globalThis.localStorage?.setItem(LOCATION_KEY, JSON.stringify(sel))
  } catch {
    /* ignore */
  }
}

interface LocationState {
  selection: LocationSelection
  hydrate: () => void
  select: (sel: LocationSelection) => void
  clear: () => void
}

export const useLocationStore = create<LocationState>((set) => ({
  selection: (() => {
    const raw = readStorage()
    if (raw) {
      try {
        const g = findCityByKeySafe(JSON.parse(raw) as LocationSelection)
        if (g) return g
      } catch {
        /* ignore */
      }
    }
    return defaultSelection()
  })(),

  hydrate: () => {
    const raw = readStorage()
    if (!raw) return
    try {
      const g = findCityByKeySafe(JSON.parse(raw) as LocationSelection)
      if (g) set({ selection: g })
    } catch {
      /* ignore */
    }
  },

  select: (sel) => {
    const g = findCityByKey(sel.cityKey)
    const normalized: LocationSelection = g
      ? { country: g.country, cityKey: g.cityKey, cityLabel: g.cityLabel }
      : sel
    set({ selection: normalized })
    writeStorage(normalized)
  },

  clear: () => {
    const def = defaultSelection()
    set({ selection: def })
    writeStorage(def)
  },
}))

export default useLocationStore