/**
 * 分类页共用工具：聚合摘要 hook、筛选项构造器、跳转助手。
 *
 * 5 个分类页的筛选/跳转口径必须一致，抽到这里单点维护，避免各页各写一份
 * 导致同一筛选在不同页行为不同。
 */
import { useEffect, useState } from 'react';
import { publicApi, type PublicCategorySummary, type PublicDistrict } from '@/services/publicApi';
import { findCityByKey } from '@/stores/location';
import { fmtMoney } from '@/utils/format';
import type { FilterGroup, FilterOption } from './CategoryShell';

/** 分类页聚合摘要（全国口径，不传 city：定位城市名为中文，与库内英文 city 不匹配）。 */
export function useCategorySummary(): PublicCategorySummary | null {
  const [data, setData] = useState<PublicCategorySummary | null>(null);
  useEffect(() => {
    let alive = true;
    publicApi
      .listingCategorySummary()
      .then((res: any) => {
        if (alive) setData((res?.data?.data ?? res?.data ?? null) as PublicCategorySummary | null);
      })
      .catch(() => {
        /* 摘要拉取失败不影响列表主流程 */
      });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** 区域筛选项：优先后端 `/public/districts` 的真实区域（可带套数），
 *  接口无数据时回退定位城市的静态区域清单（children label），避免筛选器变死界面。 */
export function districtOptions(
  districts: PublicDistrict[] | null,
  fallbackLabels: string[],
): FilterOption[] {
  if (districts && districts.length) {
    return districts.map((d) => ({
      value: d.district,
      label: d.listing_count > 0 ? `${d.district} (${d.listing_count})` : d.district,
    }));
  }
  return fallbackLabels.map((label) => ({ value: label, label }));
}

/** 当前定位城市的静态区域清单（`AREA_GROUPS` 的 children label），仅作区域接口空数据时的兜底。 */
export function fallbackDistrictLabels(cityKey: string): string[] {
  const g = findCityByKey(cityKey);
  return g ? g.children.map((c) => c.label) : [];
}

/** 区域下拉数据源：带当前城市 cityKey + 当前业务 listing_type/property_type 请求 `/public/districts`。 */
export function usePublicDistricts(
  cityKey?: string,
  listingType?: 'rent' | 'sell',
  propertyTypes?: string[],
): PublicDistrict[] | null {
  const [data, setData] = useState<PublicDistrict[] | null>(null);
  const typesKey = (propertyTypes ?? []).join(',');
  useEffect(() => {
    let alive = true;
    publicApi
      .districts({
        city: cityKey || undefined,
        listing_type: listingType,
        property_type: propertyTypes && propertyTypes.length ? propertyTypes : undefined,
      })
      .then((res: any) => {
        if (!alive) return;
        const body = res?.data?.data ?? res?.data;
        setData(Array.isArray(body) ? (body as PublicDistrict[]) : null);
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
    // propertyTypes 以 join 后的字符串做依赖，避免数组引用变化触发重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey, listingType, typesKey]);
  return data;
}

/** 范围型筛选项 → {min,max} 解析。 */
export function parseRange(value?: string): { min?: number; max?: number } {
  if (!value) return {};
  const [min, max] = value.split('-');
  return { min: min ? Number(min) : undefined, max: max ? Number(max) : undefined };
}

type Range = [number | null, number | null];

function rangeLabel(t: (k: string, p?: Record<string, string | number>) => string, r: Range): string {
  const [min, max] = r;
  if (min == null) return `${t('category.priceUnder')} ${fmtMoney(max ?? 0)}`;
  if (max == null) return `${t('category.priceOver')} ${fmtMoney(min)}`;
  return `${fmtMoney(min)}-${fmtMoney(max)}`;
}

export function rangeOptions(
  t: (k: string, p?: Record<string, string | number>) => string,
  ranges: Range[],
): FilterOption[] {
  return ranges.map((r) => ({ value: `${r[0] ?? ''}-${r[1] ?? ''}`, label: rangeLabel(t, r) }));
}

/** 租房价格区间（泰铢/月）。 */
export const RENT_PRICE_RANGES: Range[] = [
  [null, 15000],
  [15000, 30000],
  [30000, 60000],
  [60000, null],
];
/** 二手/商铺价格区间（泰铢）。 */
export const SELL_PRICE_RANGES: Range[] = [
  [null, 3000000],
  [3000000, 6000000],
  [6000000, 12000000],
  [12000000, null],
];
/** 楼盘均价区间（泰铢/㎡）。 */
export const AVG_PRICE_RANGES: Range[] = [
  [null, 80000],
  [80000, 150000],
  [150000, 250000],
  [250000, null],
];
/** 面积区间（㎡）。 */
export const AREA_RANGES: Range[] = [
  [null, 30],
  [30, 60],
  [60, 100],
  [100, 200],
  [200, null],
];

/** 排序组（房源口径）：App 筛选必须含排序项。 */
export function listingSortGroup(t: (k: string) => string): FilterGroup {
  return {
    key: 'sort',
    label: t('category.sortLabel'),
    options: [
      { value: 'latest', label: t('category.sortLatest') },
      { value: 'price_asc', label: t('category.sortPriceAsc') },
      { value: 'price_desc', label: t('category.sortPriceDesc') },
      { value: 'area_desc', label: t('category.sortAreaDesc') },
    ],
  };
}

/** 排序组（楼盘口径）。 */
export function projectSortGroup(t: (k: string) => string): FilterGroup {
  return {
    key: 'sort',
    label: t('category.sortLabel'),
    options: [
      { value: 'hot', label: t('category.sortHot') },
      { value: 'price_asc', label: t('category.sortPriceAsc') },
      { value: 'price_desc', label: t('category.sortPriceDesc') },
      { value: 'open_date_desc', label: t('category.sortOpenDate') },
    ],
  };
}

/** 区域组。 */
export function districtGroup(options: FilterOption[], t: (k: string) => string): FilterGroup {
  return { key: 'district', label: t('category.filterDistrict'), options };
}

/** 房型（卧室数）组。 */
export function bedroomGroup(t: (k: string, p?: Record<string, string | number>) => string): FilterGroup {
  return {
    key: 'bedrooms_min',
    label: t('category.filterBedrooms'),
    options: [
      { value: '1', label: `1${t('category.bedroomUnit')}` },
      { value: '2', label: `2${t('category.bedroomUnit')}` },
      { value: '3', label: `3${t('category.bedroomUnit')}+` },
      { value: '4', label: `4${t('category.bedroomUnit')}+` },
    ],
  };
}

/** 最短租期组（月）。 */
export function leaseTermGroup(t: (k: string) => string): FilterGroup {
  return {
    key: 'min_lease_months',
    label: t('category.filterLeaseTerm'),
    options: [
      { value: '1', label: t('category.lease1') },
      { value: '3', label: t('category.lease3') },
      { value: '6', label: t('category.lease6') },
      { value: '12', label: t('category.lease12') },
    ],
  };
}

/** 楼层段组（取值与后端 floor_level 一致）。 */
export function floorLevelGroup(t: (k: string) => string): FilterGroup {
  return {
    key: 'floor_level',
    label: t('category.filterFloor'),
    options: [
      { value: 'low', label: t('category.floorLow') },
      { value: 'mid', label: t('category.floorMid') },
      { value: 'high', label: t('category.floorHigh') },
    ],
  };
}

/** 朝向组（复用 `pub.orientation.*` 文案，取值与后端 Orientation 枚举一致）。 */
export function orientationGroup(t: (k: string) => string): FilterGroup {
  return {
    key: 'orientation',
    label: t('category.filterOrientation'),
    options: [
      { value: 'north', label: t('pub.orientation.north') },
      { value: 'south', label: t('pub.orientation.south') },
      { value: 'east', label: t('pub.orientation.east') },
      { value: 'west', label: t('pub.orientation.west') },
      { value: 'northeast', label: t('pub.orientation.northeast') },
      { value: 'northwest', label: t('pub.orientation.northwest') },
      { value: 'southeast', label: t('pub.orientation.southeast') },
      { value: 'southwest', label: t('pub.orientation.southwest') },
    ],
  };
}

/** 装修组（取值与后端 Decoration 枚举一致）。 */
export function decorationGroup(t: (k: string) => string): FilterGroup {
  return {
    key: 'decoration',
    label: t('category.filterDecoration'),
    options: [
      { value: 'luxury', label: t('pub.decoration.luxury') },
      { value: 'standard', label: t('pub.decoration.standard') },
      { value: 'simple', label: t('pub.decoration.simple') },
      { value: 'bare', label: t('pub.decoration.bare') },
    ],
  };
}

/** 布尔型筛选项（「是」才收敛；未选=不限）。 */
export function boolGroup(key: string, label: string, t: (k: string) => string): FilterGroup {
  return { key, label, options: [{ value: '1', label: t('category.onlyYes') }] };
}

/** 未实现的入口统一跳到「功能即将上线」页，不伪造内容。 */
export function notAvailable(navigation: any, feature: string) {
  navigation.navigate('FeatureNotAvailable', { feature });
}
