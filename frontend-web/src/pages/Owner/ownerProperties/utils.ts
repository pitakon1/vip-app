import dayjs from 'dayjs'
import type {
  OwnerProperty,
  OwnerPropertyFilters,
  OwnerPropertyStatusCounts,
} from './types'

/** 统计（名下房源 / 在租 / 空置 / 在售） */
export const computeStatusCounts = (items: OwnerProperty[]): OwnerPropertyStatusCounts => {
  const count = { vacant: 0, rented: 0, for_sale: 0 }
  items.forEach((p) => {
    const s = String(p.status || '').toLowerCase()
    if (s === 'vacant' || s === 'available') count.vacant += 1
    else if (s === 'for_sale' || s === 'on_sale' || s === 'sale') count.for_sale += 1
    else if (s === 'rented' || s === 'active') count.rented += 1
  })
  return count
}

/** 前端筛选 + 排序（客户端过滤，与管理员端一致；保持原有逻辑不变） */
export const filterAndSortProperties = (
  allItems: OwnerProperty[],
  filters: OwnerPropertyFilters,
): OwnerProperty[] => {
  const {
    keyword,
    status,
    bedrooms,
    priceRange,
    priceCustomMin,
    priceCustomMax,
    areaRange,
    areaCustomMin,
    areaCustomMax,
    sort,
  } = filters

  let list = [...allItems]
  const kw = keyword.trim().toLowerCase()
  if (kw) {
    list = list.filter((it: any) =>
      [it.room_number, it.address, it.building]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    )
  }
  if (status) {
    list = list.filter((it: any) => (it.status || 'vacant').toLowerCase() === status)
  }
  // 房型：'0'=单间, '1'/'2'/'3' 精确, '4'=≥4
  if (bedrooms !== '') {
    const n = Number(bedrooms)
    if (bedrooms === '4') {
      list = list.filter((it: any) => Number(it.bedrooms || 0) >= 4)
    } else {
      list = list.filter((it: any) => Number(it.bedrooms || 0) === n)
    }
  }
  // 价格区间：预设区间 or 自定义
  {
    let pMin = 0, pMax = Infinity
    if (priceRange === 'custom') {
      if (priceCustomMin) { const mn = Number(priceCustomMin); if (!Number.isNaN(mn)) pMin = mn }
      if (priceCustomMax) { const mx = Number(priceCustomMax); if (!Number.isNaN(mx)) pMax = mx }
    } else if (priceRange) {
      if (priceRange.endsWith('+')) {
        const mn = Number(priceRange.slice(0, -1))
        if (!Number.isNaN(mn)) pMin = mn
      } else {
        const [mn, mx] = priceRange.split('-').map(Number)
        if (!Number.isNaN(mn)) pMin = mn
        if (!Number.isNaN(mx)) pMax = mx
      }
    }
    list = list.filter((it: any) => {
      const r = Number(it.monthly_rent || 0)
      return r >= pMin && r <= pMax
    })
  }
  // 面积区间：预设区间 or 自定义
  {
    let aMin = 0, aMax = Infinity
    if (areaRange === 'custom') {
      if (areaCustomMin) { const mn = Number(areaCustomMin); if (!Number.isNaN(mn) && mn > 0) aMin = mn }
      if (areaCustomMax) { const mx = Number(areaCustomMax); if (!Number.isNaN(mx) && mx > 0) aMax = mx }
    } else if (areaRange) {
      if (areaRange.endsWith('+')) {
        const mn = Number(areaRange.slice(0, -1))
        if (!Number.isNaN(mn)) aMin = mn
      } else {
        const [mn, mx] = areaRange.split('-').map(Number)
        if (!Number.isNaN(mn)) aMin = mn
        if (!Number.isNaN(mx)) aMax = mx
      }
    }
    list = list.filter((it: any) => {
      const s = Number(it.size_sqm || 0)
      return s >= aMin && s <= aMax
    })
  }
  switch (sort) {
    case 'rent-asc': list.sort((a: any, b: any) => a.monthly_rent - b.monthly_rent); break
    case 'rent-desc': list.sort((a: any, b: any) => b.monthly_rent - a.monthly_rent); break
    case 'created':
    default:
      list.sort((a: any, b: any) => dayjs(b.created_at || 0).valueOf() - dayjs(a.created_at || 0).valueOf())
      break
  }
  return list
}

/** 分页页码（对齐管理员端 rent-pagination 结构） */
export const buildPageNumbers = (totalPages: number, page: number): (number | string)[] => {
  const nums: (number | string)[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) nums.push(i)
  } else {
    nums.push(1)
    if (page > 4) nums.push('prev-ellipsis')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) nums.push(i)
    if (page < totalPages - 3) nums.push('next-ellipsis')
    nums.push(totalPages)
  }
  return nums
}
