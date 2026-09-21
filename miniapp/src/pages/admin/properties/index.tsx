import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { propertiesApi, dashboardApi } from '@/services/api'
import { fmtMoney as fmtRent } from '@/utils/format'
import { request } from '@/lib/api'
import { iconStyle } from '@/utils/icons'
import { AREA_GROUPS } from '@/data/locationArea'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface PropertyItem {
  id: string
  room_number?: string
  building?: string
  address?: string
  property_type?: string
  monthly_rent?: number
  currency?: string
  bedrooms?: number
  bathrooms?: number
  size_sqm?: number
  status?: string
  photos?: string[]
  [key: string]: any
}

const TYPE_LABELS: Record<string, string> = {
  apartment: '公寓',
  condo: '公寓',
  house: '别墅',
  villa: '别墅',
  commercial: '商铺',
  shop: '商铺',
  office: '写字楼'
}

const STATUS_LABELS: Record<string, string> = {
  vacant: '空置中',
  rented: '已出租',
  renewing: '续约中',
  maintenance: '维护中',
  reserved: '已预订'
} as const

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'vacant', label: '空置中' },
  { key: 'rented', label: '已出租' },
  { key: 'renewing', label: '续约中' },
  { key: 'maintenance', label: '维护中' }
]

const PAGE_SIZE = 100

// 房型选项：''=不限, '0'=单间, '1'/'2'=精确居室, '3'=3室及以上, '4'=4室及以上（对齐租客端 4室+）
const BEDROOM_OPTIONS = [
  { key: '', label: '不限房型' },
  { key: '0', label: '单间' },
  { key: '1', label: '1室' },
  { key: '2', label: '2室' },
  { key: '3', label: '3室+' },
  { key: '4', label: '4室+' }
]

// 价格区间（单位 万/月 THB，语义与租客端对齐）：''=不限, 预设 key, 'custom'=自定义
const PRICE_OPTIONS = [
  { key: '', label: '不限价格' },
  { key: 'u3', label: '≤3万' },
  { key: '3-5', label: '3-5万' },
  { key: '5-8', label: '5-8万' },
  { key: 'g8', label: '≥8万' },
  { key: 'custom', label: '自定义' }
]

// 面积区间（对齐租客端）：''=不限, 预设 key, 'custom'=自定义
const AREA_OPTIONS = [
  { key: '', label: '不限面积' },
  { key: '0-50', label: '≤50㎡' },
  { key: '50-100', label: '50-100㎡' },
  { key: '100-150', label: '100-150㎡' },
  { key: '150-200', label: '150-200㎡' },
  { key: '200+', label: '≥200㎡' },
  { key: 'custom', label: '自定义' }
]

const SORT_OPTIONS = [
  { key: 'latest', label: '默认排序' },
  { key: 'price_asc', label: '价格从低到高' },
  { key: 'price_desc', label: '价格从高到低' },
  { key: 'area_desc', label: '面积从大到小' }
]

// 统一解析列表响应（Page[Property] / 直接数组 两种形态）
function pickList(res: any): PropertyItem[] {
  const d = res?.data ?? res
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  return []
}

export default function AdminPropertiesPage() {
  const [list, setList] = useState<PropertyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [priceCustomMin, setPriceCustomMin] = useState('')
  const [priceCustomMax, setPriceCustomMax] = useState('')
  const [areaRange, setAreaRange] = useState('')
  const [areaCustomMin, setAreaCustomMin] = useState('')
  const [areaCustomMax, setAreaCustomMax] = useState('')
  const [region, setRegion] = useState('') // 选中的城区，存「省市:城区」复合键
  const [hasVideo, setHasVideo] = useState(false)
  const [sort, setSort] = useState('latest')
  // 区域面板：国家 → 省市 → 城区 三级下钻（左栏只列国家，右栏先是该国家的省市列表，
  // 点省市后右栏换成它的城区）。此前把国家/省市/城区拍平成一条 Picker 选项，混杂难找。
  const [regionOpen, setRegionOpen] = useState(false)
  const [areaCountry, setAreaCountry] = useState<string>(AREA_GROUPS[0].country)
  const [areaDrill, setAreaDrill] = useState<string>('') // 已下钻的省市 cityKey，空 = 停在省市列表

  // 城区扁平表：key 沿用「省市:城区」复合键（不同省市下存在同名城区，如 laguna），
  // 仅用于按选中项反查关键词与展示文案。
  const allDistricts = useMemo(
    () => AREA_GROUPS.flatMap((g) => g.children.map((d) => ({ ...d, key: `${g.cityKey}:${d.key}` }))),
    []
  )
  // 左栏国家清单（按 AREA_GROUPS 出现顺序去重，保持业务顺序）
  const countryList = useMemo(() => Array.from(new Set(AREA_GROUPS.map((g) => g.country))), [])
  // 右栏未下钻时的数据源：当前国家下的省市
  const countryGroups = useMemo(
    () => AREA_GROUPS.filter((g) => g.country === areaCountry),
    [areaCountry]
  )
  // 右栏已下钻时的数据源：该省市的城区
  const activeAreaGroup = useMemo(
    () => AREA_GROUPS.find((g) => g.cityKey === areaDrill),
    [areaDrill]
  )
  const regionLabel = useMemo(
    () => allDistricts.find((d) => d.key === region)?.label || '不限区域',
    [region, allDistricts]
  )

  const fetchSummary = async () => {
    try {
      const res: any = await dashboardApi.summary()
      setSummary(res?.data ?? res)
    } catch (error) {
      console.error('[AdminProperties] 获取房源统计失败', error)
    }
  }

  // 由筛选 state 构建后端查询参数（服务端过滤以保证正确分页）。overrides 用于状态尚未更新时传本次变更。
  const buildParams = (over: Partial<{
    status: string; q: string; bedrooms: string; priceRange: string;
    priceCustomMin: string; priceCustomMax: string; areaRange: string;
    areaCustomMin: string; areaCustomMax: string; region: string;
    hasVideo: boolean; sort: string
  }> = {}) => {
    const p: Record<string, any> = { page: 1, page_size: PAGE_SIZE, sort: 'latest' }
    const st = over.status ?? status
    const q = over.q ?? query
    const bd = over.bedrooms ?? bedrooms
    const pr = over.priceRange ?? priceRange
    const pcMin = over.priceCustomMin ?? priceCustomMin
    const pcMax = over.priceCustomMax ?? priceCustomMax
    const ar = over.areaRange ?? areaRange
    const acMin = over.areaCustomMin ?? areaCustomMin
    const acMax = over.areaCustomMax ?? areaCustomMax
    const rg = over.region ?? region
    const hv = over.hasVideo ?? hasVideo
    const so = over.sort ?? sort

    if (q) p.q = q
    if (st) p.status = st
    if (so !== 'latest') p.sort = so
    // 房型：单间=>0,0；3室以上/4室以上=>min=key 不设上限
    if (bd !== '') {
      if (bd === '3' || bd === '4') p.bedrooms_min = Number(bd)
      else { p.bedrooms_min = Number(bd); p.bedrooms_max = Number(bd) }
    }
    // 价格区间：按预设（万→THB）/自定义按需设 min/max
    if (pr) {
      if (pr === 'custom') {
        if (pcMin) p.price_min = Number(pcMin) * 10000
        if (pcMax) p.price_max = Number(pcMax) * 10000
      } else if (pr === 'u3') {
        p.price_max = 30000
      } else if (pr === 'g8') {
        p.price_min = 80000
      } else {
        const [mn, mx] = pr.split('-').map(Number)
        if (!Number.isNaN(mn)) p.price_min = mn * 10000
        if (!Number.isNaN(mx)) p.price_max = mx * 10000
      }
    }
    // 面积区间：200+按需设 min
    if (ar) {
      if (ar === 'custom') {
        if (acMin) p.area_min = Number(acMin)
        if (acMax) p.area_max = Number(acMax)
      } else if (ar === '200+') {
        p.area_min = 200
      } else {
        const [mn, mx] = ar.split('-').map(Number)
        if (!Number.isNaN(mn)) p.area_min = mn
        if (!Number.isNaN(mx)) p.area_max = mx
      }
    }
    // 区域/位置：选中的城区关键词走后端 keywords（与租客端同语义）
    if (rg) {
      const node = allDistricts.find((d) => d.key === rg)
      if (node && node.kws.length) p.keywords = node.kws
    }
    // 只看带视频
    if (hv) p.has_video = true
    return p
  }

  const fetchList = async (over: Parameters<typeof buildParams>[0] = {}) => {
    setLoading(true)
    try {
      const res: any = await propertiesApi.list(buildParams(over))
      const items = pickList(res)
      // 排序：后端支持 latest/price_asc/price_desc/area_desc，无需客户端兜底
      setList(items)
    } catch (error) {
      console.error('[AdminProperties] 获取房源失败', error)
      Taro.showToast({ title: '加载房源失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchSummary()
    fetchList()
  })

  const handleSearch = () => {
    const q = keyword.trim()
    setQuery(q)
    fetchList({ q })
  }

  const changeStatus = (key: string) => {
    setStatus(key)
    fetchList({ status: key })
  }

  // 筛选项变更：重置到第 1 页（page 恒为 1）并重新请求
  const changeBedrooms = (key: string) => {
    setBedrooms(key)
    fetchList({ bedrooms: key })
  }
  const changePriceRange = (key: string) => {
    setPriceRange(key)
    fetchList({ priceRange: key })
  }
  const changePriceCustom = (which: 'min' | 'max', val: string) => {
    if (which === 'min') { setPriceCustomMin(val); fetchList({ priceCustomMin: val }) }
    else { setPriceCustomMax(val); fetchList({ priceCustomMax: val }) }
  }
  const changeAreaRange = (key: string) => {
    setAreaRange(key)
    fetchList({ areaRange: key })
  }
  const changeAreaCustom = (which: 'min' | 'max', val: string) => {
    if (which === 'min') { setAreaCustomMin(val); fetchList({ areaCustomMin: val }) }
    else { setAreaCustomMax(val); fetchList({ areaCustomMax: val }) }
  }
  const changeSort = (key: string) => {
    setSort(key)
    fetchList({ sort: key })
  }
  // 区域面板开合：打开时按已选城区回显下钻层级（否则停在省市列表）
  const toggleRegionPanel = () => {
    if (regionOpen) {
      setRegionOpen(false)
      return
    }
    setRegionOpen(true)
    const g = AREA_GROUPS.find((x) => x.children.some((d) => `${x.cityKey}:${d.key}` === region))
    if (g) {
      setAreaCountry(g.country)
      setAreaDrill(g.cityKey)
    }
  }
  const pickRegion = (key: string) => {
    setRegion(key)
    setRegionOpen(false)
    // 清空区域时一并清掉下钻状态，下次打开回到省市列表
    if (!key) setAreaDrill('')
    fetchList({ region: key })
  }
  const toggleHasVideo = () => {
    setHasVideo(!hasVideo)
    fetchList({ hasVideo: !hasVideo })
  }

  const openDetail = (item: PropertyItem) => {
    Taro.navigateTo({ url: `/pages/admin/property-detail/index?id=${item.id}` })
  }

  // 软删除房源：后端 DELETE /properties/{id}（require_agent）。删除即下架，前台天然隐藏。
  const removeProperty = (item: PropertyItem) => {
    Taro.showModal({
      title: '删除房源',
      content: `确认删除「${item.room_number || item.address || '该房源'}」？删除后列表不再展示。`,
      success: async (r) => {
        if (!r.confirm) return
        try {
          await request({ url: `/properties/${item.id}`, method: 'DELETE' })
          Taro.showToast({ title: '已删除', icon: 'none' })
          fetchList()
          fetchSummary()
        } catch (error) {
          console.error('[AdminProperties] 删除房源失败', error)
          Taro.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }

  const stats = [
    { key: 'total', label: '总房源', value: summary?.total_properties, tone: 'primary' },
    { key: 'vacant', label: '空置', value: summary?.vacant, tone: 'warning' },
    { key: 'rented', label: '已出租', value: summary?.rented, tone: 'success' },
    { key: 'maintenance', label: '维护中', value: summary?.maintenance, tone: 'info' }
  ]

  return (
    <View className='ap-page'>
      {/* 搜索栏 */}
      <View className='ap-search'>
        <Input
          className='ap-search__input'
          value={keyword}
          placeholder='搜索房源名称/地址'
          confirmType='search'
          onInput={(e: any) => setKeyword(e.detail.value)}
          onConfirm={handleSearch}
        />
        <View className='ap-search__btn' onClick={handleSearch}>
          <Text className='ap-search__btn-text'>搜索</Text>
        </View>
      </View>

      {/* 状态筛选 */}
      <ScrollView scrollX className='ap-chips'>
        {FILTERS.map((f) => (
          <View
            key={f.key || 'all'}
            className={`ap-chip ${status === f.key ? 'ap-chip--active' : ''}`}
            onClick={() => changeStatus(f.key)}
          >
            <Text className='ap-chip__text'>{f.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 高级筛选：区域 / 房型 / 价格 / 面积 / 排序 */}
      <ScrollView scrollX className='ap-chips ap-filter'>
        {/* 区域：改成国家→省市→城区下钻面板（原生 Picker 塞不下近百个选项） */}
        <View className={`ap-chip ${region ? 'ap-chip--active' : ''}`} onClick={toggleRegionPanel}>
          <Text className='ap-chip__text'>{regionLabel}</Text>
          <Text className='ap-chip__caret'>{regionOpen ? '▴' : '▾'}</Text>
        </View>
        {[
          { opts: BEDROOM_OPTIONS, value: bedrooms, onChange: changeBedrooms },
          { opts: PRICE_OPTIONS, value: priceRange, onChange: changePriceRange },
          { opts: AREA_OPTIONS, value: areaRange, onChange: changeAreaRange },
          { opts: SORT_OPTIONS, value: sort, onChange: changeSort }
        ].map((g, idx) => {
          const activeIdx = Math.max(0, g.opts.findIndex((o) => o.key === g.value))
          return (
            <Picker
              key={idx}
              mode='selector'
              range={g.opts.map((o) => o.label)}
              value={activeIdx}
              onChange={(e: any) => g.onChange(g.opts[Number(e.detail.value)].key)}
            >
              <View className={`ap-chip ${g.value !== g.opts[0].key ? 'ap-chip--active' : ''}`}>
                <Text className='ap-chip__text'>{g.opts[activeIdx].label}</Text>
                <Text className='ap-chip__caret'>▾</Text>
              </View>
            </Picker>
          )
        })}
        {/* 只看带视频 */}
        <View
          className={`ap-chip ${hasVideo ? 'ap-chip--active' : ''}`}
          onClick={toggleHasVideo}
        >
          <Text className='ap-chip__text'>只看视频</Text>
          <Text className='ap-chip__caret'>{hasVideo ? '✓' : ''}</Text>
        </View>
      </ScrollView>

      {/* 区域下钻面板：左栏国家 / 右栏省市或城区（链家式两栏） */}
      {regionOpen && (
        <View className='ap-region'>
          <View className='filter-region-twocol'>
            <ScrollView scrollY className='filter-region-twocol__left'>
              {countryList.map((c) => (
                <View
                  key={c}
                  className={`loc-col-item ${areaCountry === c ? 'loc-col-item--active' : ''}`}
                  onClick={() => {
                    setAreaCountry(c)
                    setAreaDrill('')
                  }}
                >
                  <Text>{c}</Text>
                </View>
              ))}
            </ScrollView>
            <ScrollView scrollY className='filter-region-twocol__right'>
              {activeAreaGroup ? (
                <>
                  <View className='filter-region-drill-head' onClick={() => setAreaDrill('')}>
                    <Text className='filter-region-drill-head__back'>← {areaCountry}</Text>
                    <Text className='loc-group__title loc-group__title--flat'>
                      {activeAreaGroup.cityLabel}
                    </Text>
                  </View>
                  <View className='ap-region__chips'>
                    <View
                      className={`ap-chip ${!region ? 'ap-chip--active' : ''}`}
                      onClick={() => pickRegion('')}
                    >
                      <Text className='ap-chip__text'>不限</Text>
                    </View>
                    {activeAreaGroup.children.map((d) => {
                      const key = `${activeAreaGroup.cityKey}:${d.key}`
                      return (
                        <View
                          key={d.key}
                          className={`ap-chip ${region === key ? 'ap-chip--active' : ''}`}
                          onClick={() => pickRegion(key)}
                        >
                          <Text className='ap-chip__text'>{d.label}</Text>
                        </View>
                      )
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Text className='loc-group__title loc-group__title--flat'>{areaCountry}</Text>
                  <View className='ap-region__chips'>
                    {countryGroups.map((g) => (
                      <View
                        key={g.cityKey}
                        className={`ap-chip ${areaDrill === g.cityKey ? 'ap-chip--active' : ''}`}
                        onClick={() => setAreaDrill(g.cityKey)}
                      >
                        <Text className='ap-chip__text'>{g.cityLabel}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* 自定义输入：仅在对应区间选择「自定义」时显示 */}
      {(priceRange === 'custom' || areaRange === 'custom') && (
        <View className='ap-custom'>
          {priceRange === 'custom' && (
            <View className='ap-custom__group'>
              <Text className='ap-custom__name'>价格(万)</Text>
              <Input
                className='ap-custom__input'
                type='number'
                placeholder='最低'
                value={priceCustomMin}
                onInput={(e: any) => changePriceCustom('min', e.detail.value)}
              />
              <Text className='ap-custom__sep'>-</Text>
              <Input
                className='ap-custom__input'
                type='number'
                placeholder='最高'
                value={priceCustomMax}
                onInput={(e: any) => changePriceCustom('max', e.detail.value)}
              />
            </View>
          )}
          {areaRange === 'custom' && (
            <View className='ap-custom__group'>
              <Text className='ap-custom__name'>面积</Text>
              <Input
                className='ap-custom__input'
                type='number'
                placeholder='最小'
                value={areaCustomMin}
                onInput={(e: any) => changeAreaCustom('min', e.detail.value)}
              />
              <Text className='ap-custom__sep'>-</Text>
              <Input
                className='ap-custom__input'
                type='number'
                placeholder='最大'
                value={areaCustomMax}
                onInput={(e: any) => changeAreaCustom('max', e.detail.value)}
              />
            </View>
          )}
        </View>
      )}

      {/* 统计（来源：/dashboard/summary） */}
      <View className='ap-stats'>
        {stats.map((s) => (
          <View key={s.key} className={`ap-stat ap-stat--${s.tone}`}>
            <Text className='ap-stat__value'>{s.value ?? '-'}</Text>
            <Text className='ap-stat__label'>{s.label}</Text>
          </View>
        ))}
      </View>

      <View className='ap-section-head'>
        <Text className='ap-section-head__title'>房源列表</Text>
        <Text className='ap-section-head__count'>共 {list.length} 套</Text>
      </View>

      <ScrollView scrollY className='ap-list'>
        {loading && list.length === 0 && (
          <View className='ap-state'>
            <Text className='ap-state__text'>加载中...</Text>
          </View>
        )}
        {!loading && list.length === 0 && (
          <View className='ap-state'>
            <View className='icon-svg' style={iconStyle('home', 72)} />
            <Text className='ap-state__text'>暂无房源</Text>
            <Text className='ap-state__desc'>
              {query || status ? '换个筛选条件试试' : '还没有录入任何房源'}
            </Text>
          </View>
        )}

        {list.map((item) => (
          <View key={item.id} className='ap-card' onClick={() => openDetail(item)}>
            {/* 头图占位（后端 photos 为空时展示类型徽章底色块） */}
            <View className='ap-card__banner'>
              {Array.isArray(item.photos) && item.photos.length > 0 ? null : (
                <Text className='ap-card__banner-ph'>房源</Text>
              )}
              <Text className='ap-card__type'>
                {TYPE_LABELS[item.property_type || ''] || '房源'}
              </Text>
              <Text className={`ap-card__status ap-card__status--${item.status || 'vacant'}`}>
                {STATUS_LABELS[item.status || ''] || '未知'}
              </Text>
            </View>

            <View className='ap-card__body'>
              <Text className='ap-card__name'>
                {item.room_number || item.address || '未命名房源'}
              </Text>
              <View className='ap-card__addr'>
                <Text className='icon-svg icon-svg--sm' style={iconStyle('home', 26)} />
                <Text className='ap-card__addr-text'>{item.address || '暂无地址'}</Text>
              </View>
              <View className='ap-card__meta'>
                <Text className='ap-card__meta-item'>{item.size_sqm || 0}㎡</Text>
                <Text className='ap-card__meta-item'>{item.bedrooms || 0}卧</Text>
                <Text className='ap-card__meta-item'>{item.bathrooms || 0}浴</Text>
              </View>
              <View className='ap-card__price-row'>
                <Text className='ap-card__price'>
                  {fmtRent(item.monthly_rent, item.currency)}
                  <Text className='ap-card__price-unit'>/月</Text>
                </Text>
              </View>
            </View>

            <View className='ap-card__footer'>
              <View
                className='ap-card__manage'
                onClick={(e) => {
                  e.stopPropagation()
                  openDetail(item)
                }}
              >
                <Text className='ap-card__manage-text'>管理</Text>
              </View>
              <View
                className='ap-card__del'
                onClick={(e) => {
                  e.stopPropagation()
                  removeProperty(item)
                }}
              >
                <Text className='icon-svg icon-svg--sm' style={iconStyle('close', 28)} />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 底部导航：房源 */}
      <BottomNav role='admin' active='properties' />
    </View>
  )
}