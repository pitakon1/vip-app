/**
 * 区域候选集（真实数据）。
 *
 * 走匿名公开接口 `GET /public/districts`，按当前城市 + 业务口径聚合出「有房源的区域」。
 * 列表页 / 5 个贝壳式分类页共用：返回非空就用后端区域（可显示套数），为空则调用方
 * 回退到既有静态区域清单，避免筛选器变成只有一个「不限」的死面板。
 *
 * `city` 统一传定位 Store 的 `cityKey`（camelCase，如 chiangMai），后端会做 slug 归一化。
 */
import { useEffect, useState } from 'react'
import api from '@/lib/api'

export interface DistrictOption {
  value: string
  label: string
  listingCount: number
  projectCount: number
}

export interface UseDistrictsParams {
  city?: string
  listingType?: 'rent' | 'sell' | string
  propertyTypes?: string[]
}

export function useDistricts({ city, listingType, propertyTypes }: UseDistrictsParams): DistrictOption[] {
  const [options, setOptions] = useState<DistrictOption[]>([])
  // 数组依赖不能直接进 deps（每次渲染都是新引用），收敛成稳定字符串键
  const ptKey = (propertyTypes ?? []).join(',')

  useEffect(() => {
    let alive = true
    const params: Record<string, unknown> = {}
    if (city) params.city = city
    if (listingType) params.listing_type = listingType
    if (ptKey) params.property_type = ptKey.split(',')

    api
      .get('/public/districts', { params })
      .then((res) => {
        const payload = res.data?.data ?? res.data
        const rows = Array.isArray(payload) ? payload : []
        if (!alive) return
        setOptions(
          rows
            .filter((r: any) => r && r.district)
            .map((r: any) => {
              const listingCount = Number(r.listing_count || 0)
              const projectCount = Number(r.project_count || 0)
              const n = listingCount || projectCount
              return {
                value: String(r.district),
                label: n > 0 ? `${r.district} (${n})` : String(r.district),
                listingCount,
                projectCount,
              }
            }),
        )
      })
      .catch(() => {
        if (alive) setOptions([])
      })
    return () => {
      alive = false
    }
  }, [city, listingType, ptKey])

  return options
}
