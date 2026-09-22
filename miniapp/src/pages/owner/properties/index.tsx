import { useState, useMemo } from 'react'
import { View, Text, Input, Textarea, ScrollView, Picker, Switch, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { ownerApi } from '@/services/api'
import { useSwrCache } from '@/hooks/useSwrCache'
import { fmtMoney as money } from '@/utils/format'
import { iconStyle } from '@/utils/icons'
import { AREA_GROUPS } from '@/data/locationArea'
import BottomNav from '@/components/BottomNav'
import RegionPicker, { type RegionSelection } from '@/components/RegionPicker'
import './index.scss'

// ============ 接口字段（后端 snake_case）============
interface OwnerProp {
  id?: string | number
  code?: string
  room_number?: string
  display_name?: string
  name?: string
  project_name?: string
  projectName?: string
  address?: string
  building?: string
  floor?: number
  property_type?: string
  status?: string
  monthly_rent?: number
  rentPrice?: number
  sale_price?: number
  currency?: string
  size_sqm?: number
  area?: number
  bedrooms?: number
  bathrooms?: number
  deposit_amount?: number
  deposit_months?: number
  description?: string
  video_url?: string
  furnished?: boolean
  available_from?: string
  photos?: string[]
  layout?: string
  tenant_name?: string
}

// 从接口返回中提取列表，兼容多种结构
function pickList(res: any): any[] {
  if (Array.isArray(res)) return res
  const d = res?.data ?? res ?? {}
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.items)) return d.items
  if (Array.isArray(d?.list)) return d.list
  if (Array.isArray(d?.data)) return d.data
  if (Array.isArray(d?.records)) return d.records
  return []
}

// ============ 列表展示映射（对齐管理端） ============
const TYPE_LABELS: Record<string, string> = {
  apartment: '公寓',
  condo: '公寓',
  house: '别墅',
  villa: '别墅',
  commercial: '商铺',
  shop: '商铺',
  office: '写字楼'
}

// 状态筛选 chips
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'vacant', label: '空置中' },
  { key: 'rented', label: '已出租' },
  { key: 'renewing', label: '续约中' },
  { key: 'maintenance', label: '维护中' },
  { key: 'reserved', label: '已预订' }
]

// 房型选项：''=不限, '0'=单间, '1'/'2'=精确居室, '3'=3室及以上, '4'=4室及以上（对齐管理端/租客端）
const BEDROOM_OPTIONS = [
  { key: '', label: '不限房型' },
  { key: '0', label: '单间' },
  { key: '1', label: '1室' },
  { key: '2', label: '2室' },
  { key: '3', label: '3室+' },
  { key: '4', label: '4室+' }
]

// 价格区间（单位 万/月，语义对齐管理端）：''=不限, 预设 key, 'custom'=自定义
const PRICE_OPTIONS = [
  { key: '', label: '不限价格' },
  { key: 'u3', label: '≤3万' },
  { key: '3-5', label: '3-5万' },
  { key: '5-8', label: '5-8万' },
  { key: 'g8', label: '≥8万' },
  { key: 'custom', label: '自定义' }
]

// 面积区间：''=不限, 预设 key, 'custom'=自定义
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

// ============ 新增/编辑表单（对齐后端 PropertyCreate/Update，不含 project_id/owner_id） ============
const CURRENCY_OPTIONS = ['THB', 'USD', 'CNY']

const TYPE_GROUPS: { label: string; keys: string[] }[] = [
  { label: '公寓', keys: ['apartment', 'condo'] },
  { label: '别墅', keys: ['house', 'villa'] },
  { label: '商铺', keys: ['commercial', 'shop'] },
  { label: '写字楼', keys: ['office'] }
]

const EDIT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'vacant', label: '空置' },
  { value: 'rented', label: '在租' },
  { value: 'maintenance', label: '维护中' },
  { value: 'reserved', label: '已预订' }
]

interface EditForm {
  room_number: string
  building: string
  floor: string
  address: string
  property_type: string
  currency: string
  monthly_rent: string
  deposit_amount: string
  deposit_months: string
  size_sqm: string
  bedrooms: string
  bathrooms: string
  status: string
  available_from: string
  furnished: boolean
  description: string
  video_url: string
  photos: string[]
}

const emptyForm = (): EditForm => ({
  room_number: '',
  building: '',
  floor: '',
  address: '',
  property_type: 'apartment',
  currency: 'THB',
  monthly_rent: '',
  deposit_amount: '',
  deposit_months: '',
  size_sqm: '',
  bedrooms: '',
  bathrooms: '',
  status: 'vacant',
  available_from: '',
  furnished: false,
  description: '',
  video_url: '',
  photos: []
})

// 房源详情 → 表单回填（数字转字符串便于 Input 展示）
const toForm = (p: OwnerProp): EditForm => ({
  room_number: p.room_number || '',
  building: p.building || '',
  floor: String(p.floor ?? ''),
  address: p.address || '',
  property_type: p.property_type || 'apartment',
  currency: p.currency || 'THB',
  monthly_rent: String(p.monthly_rent ?? ''),
  deposit_amount: String(p.deposit_amount ?? ''),
  deposit_months: String(p.deposit_months ?? ''),
  size_sqm: String(p.size_sqm ?? ''),
  bedrooms: String(p.bedrooms ?? ''),
  bathrooms: String(p.bathrooms ?? ''),
  status: p.status || 'vacant',
  available_from: p.available_from ? String(p.available_from).slice(0, 10) : '',
  furnished: !!p.furnished,
  description: p.description || '',
  video_url: p.video_url || '',
  photos: Array.isArray(p.photos) ? p.photos : []
})

const num = (v: string) => {
  if (v === '' || v === undefined || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const propertyTitle = (p: OwnerProp) =>
  p.display_name || p.name || p.project_name || p.projectName || p.room_number || p.code || p.address || '未命名房源'

const propStatus = (p: OwnerProp) => {
  const s = String(p.status || '').toLowerCase()
  if (s === 'vacant' || s === 'available') return { text: '空置', cls: 'vacant' }
  if (s === 'for_sale' || s === 'on_sale' || s === 'sale') return { text: '在售', cls: 'sale' }
  return { text: '在租', cls: 'rented' }
}

export default function OwnerPropertiesPage() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  const uid = useAuthStore((state) => state.user?.id) ?? 'anon'

  // 筛选（客户端过滤）
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
  const [sort, setSort] = useState('latest')
  // 列表级区域筛选（国家→城市→区），未选=全部区域
  const [region, setRegion] = useState<RegionSelection | null>(null)

  // 新增/编辑弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EditForm>(emptyForm())
  const [submitting, setSubmitting] = useState(false)

  const { data, loading, refresh } = useSwrCache<OwnerProp[]>({
    key: `owner:properties:${uid}`,
    fetcher: async () => {
      const res = await ownerApi.properties()
      return pickList(res) as OwnerProp[]
    },
  })
  const properties = data ?? []

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    refresh()
  })

  const stats = {
    total: properties.length,
    rented: properties.filter((p) => p.status === 'rented').length,
    vacant: properties.filter((p) => ['vacant', 'available'].includes(String(p.status || ''))).length,
    forSale: properties.filter((p) => ['for_sale', 'on_sale', 'sale'].includes(String(p.status || ''))).length
  }

  // 区域匹配关键词：城市 label + 选中区/国家的 kws（转小写）
  const regionKeywords = useMemo(() => {
    if (!region) return []
    const kw: string[] = []
    if (region.city) kw.push(region.city)
    if (region.district) {
      const grp = AREA_GROUPS.find((g) => g.country === region.region && g.cityLabel === region.city)
      const d = grp?.children.find((x) => x.label === region.district)
      if (d?.kws?.length) kw.push(...d.kws)
      else kw.push(region.district)
    } else if (region.region) {
      kw.push(region.region)
    }
    return kw.filter(Boolean).map((k) => String(k).toLowerCase())
  }, [region])

  // ===== 客户端过滤 + 排序 =====
  const filtered = useMemo(() => {
    let arr = [...properties]
    const kw = query.trim().toLowerCase()
    if (kw) {
      arr = arr.filter((p) =>
        [p.room_number, p.address, p.building].some((v) => v && String(v).toLowerCase().includes(kw))
      )
    }
    if (status) arr = arr.filter((p) => String(p.status || '') === status)
    if (regionKeywords.length) {
      arr = arr.filter((p) => {
        const hay = [p.address, p.project_name, p.projectName, p.building, p.room_number]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return regionKeywords.some((k) => hay.includes(k))
      })
    }

    if (bedrooms !== '') {
      arr = arr.filter((p) => {
        const b = Number(p.bedrooms || 0)
        if (bedrooms === '0') return b === 0
        if (bedrooms === '1' || bedrooms === '2') return b === Number(bedrooms)
        return b >= Number(bedrooms)
      })
    }

    if (priceRange) {
      arr = arr.filter((p) => {
        const r = Number(p.monthly_rent || 0)
        if (priceRange === 'custom') {
          if (priceCustomMin && r < Number(priceCustomMin) * 10000) return false
          if (priceCustomMax && r > Number(priceCustomMax) * 10000) return false
          return true
        }
        if (priceRange === 'u3') return r <= 30000
        if (priceRange === 'g8') return r >= 80000
        const [mn, mx] = priceRange.split('-').map(Number)
        if (!Number.isNaN(mn) && r < mn * 10000) return false
        if (!Number.isNaN(mx) && r > mx * 10000) return false
        return true
      })
    }

    if (areaRange) {
      arr = arr.filter((p) => {
        const a = Number((p.size_sqm ?? p.area) || 0)
        if (areaRange === 'custom') {
          if (areaCustomMin && a < Number(areaCustomMin)) return false
          if (areaCustomMax && a > Number(areaCustomMax)) return false
          return true
        }
        if (areaRange === '200+') return a >= 200
        const [mn, mx] = areaRange.split('-').map(Number)
        if (!Number.isNaN(mn) && a < mn) return false
        if (!Number.isNaN(mx) && a > mx) return false
        return true
      })
    }

    if (sort === 'price_asc') arr.sort((a, b) => Number(a.monthly_rent || 0) - Number(b.monthly_rent || 0))
    else if (sort === 'price_desc') arr.sort((a, b) => Number(b.monthly_rent || 0) - Number(a.monthly_rent || 0))
    else if (sort === 'area_desc') arr.sort((a, b) => Number((b.size_sqm ?? b.area) || 0) - Number((a.size_sqm ?? a.area) || 0))

    return arr
  }, [properties, query, status, bedrooms, priceRange, priceCustomMin, priceCustomMax, areaRange, areaCustomMin, areaCustomMax, sort, regionKeywords])

  const goMarketing = () => Taro.navigateTo({ url: '/pages/owner/marketing/index' })

  const confirmDelete = (p: OwnerProp) => {
    const title = propertyTitle(p)
    Taro.showModal({
      title: '删除房源',
      content: `确定删除「${title}」吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await ownerApi.remove(String(p.id))
          Taro.showToast({ title: '房源已删除', icon: 'success' })
          refresh(true)
        } catch (err: any) {
          const detail = err?.data?.detail || err?.message
          Taro.showToast({ title: typeof detail === 'string' ? detail : '删除失败', icon: 'none' })
        }
      }
    })
  }

  /* ===== 搜索 / 筛选 ===== */
  const handleSearch = () => {
    const q = keyword.trim()
    setQuery(q)
  }

  /* ===== 新增 / 编辑弹窗 ===== */
  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (p: OwnerProp) => {
    setEditingId(String(p.id))
    setForm(toForm(p))
    setModalOpen(true)
  }

  const resetModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setSubmitting(false)
    setForm(emptyForm())
  }

  const set = (key: keyof EditForm, value: any) => setForm((f) => ({ ...f, [key]: value }))

  const submitForm = async () => {
    if (!form.room_number.trim()) {
      Taro.showToast({ title: '请填写房号', icon: 'none' })
      return
    }
    if (!form.address.trim()) {
      Taro.showToast({ title: '请填写地址', icon: 'none' })
      return
    }
    if (!form.monthly_rent.trim() || Number(form.monthly_rent) <= 0) {
      Taro.showToast({ title: '请填写月租', icon: 'none' })
      return
    }
    if (!form.size_sqm.trim() || Number(form.size_sqm) <= 0) {
      Taro.showToast({ title: '请填写面积', icon: 'none' })
      return
    }
    const payload: Record<string, any> = {
      room_number: form.room_number.trim(),
      building: form.building.trim() || undefined,
      floor: num(form.floor),
      address: form.address.trim(),
      property_type: form.property_type,
      currency: form.currency,
      monthly_rent: num(form.monthly_rent),
      deposit_amount: num(form.deposit_amount),
      deposit_months: num(form.deposit_months),
      size_sqm: num(form.size_sqm),
      bedrooms: num(form.bedrooms),
      bathrooms: num(form.bathrooms),
      status: form.status,
      available_from: form.available_from.trim() || undefined,
      furnished: !!form.furnished,
      description: form.description.trim() || undefined,
      video_url: form.video_url.trim() || undefined
    }
    setSubmitting(true)
    Taro.showLoading({ title: '保存中...', mask: true })
    try {
      if (editingId) {
        await ownerApi.update(editingId, { ...payload, photos: form.photos })
      } else {
        await ownerApi.create(payload)
      }
      Taro.hideLoading()
      resetModal()
      Taro.showToast({ title: editingId ? '房源已更新' : '房源创建成功', icon: 'success' })
      refresh(true)
    } catch (err: any) {
      console.error('[OwnerProperties] 保存房源失败', err)
      Taro.hideLoading()
      Taro.showToast({ title: err?.message || '保存失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  /* ===== 照片上传（仅编辑态） ===== */
  const pickPhotos = () => {
    if (!editingId) return
    Taro.chooseImage({
      count: 6,
      success: async (res) => {
        const localPaths = (res.tempFilePaths || []).slice(0, 6)
        if (!localPaths.length) return
        Taro.showLoading({ title: '上传中...' })
        try {
          let latest: string[] = [...form.photos]
          for (const p of localPaths) {
            const r: any = await ownerApi.uploadPhotos(editingId, [{ url: p }])
            const body = typeof r?.data === 'string' ? JSON.parse(r.data) : r?.data
            const arr = Array.isArray(body?.photos) ? body.photos : body
            if (Array.isArray(arr)) latest = arr
          }
          set('photos', latest)
          Taro.hideLoading()
          Taro.showToast({ title: '已上传', icon: 'success' })
        } catch (err) {
          console.error('[OwnerProperties] 照片上传失败', err)
          Taro.hideLoading()
          Taro.showToast({ title: '上传失败', icon: 'none' })
        }
      }
    })
  }

  const removePhoto = (url: string) => {
    if (!editingId) return
    Taro.showModal({
      title: '删除照片',
      content: '确认删除该照片？',
      success: async (r) => {
        if (!r.confirm) return
        try {
          const rr: any = await ownerApi.deletePhoto(editingId, url)
          const body = rr?.data ?? rr
          const arr = Array.isArray(body?.photos) ? body.photos : body
          if (Array.isArray(arr)) set('photos', arr)
          else set('photos', form.photos.filter((x) => x !== url))
        } catch (err) {
          console.error('[OwnerProperties] 删除照片失败', err)
          Taro.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }

  // Picker 索引
  const typeIdx = Math.max(
    0,
    TYPE_GROUPS.findIndex((g) => g.keys.includes(form.property_type))
  )
  const curIdx = Math.max(0, CURRENCY_OPTIONS.indexOf(form.currency))

  return (
    <View className='op-page'>
      <View className='page-container'>
        {/* 页头：标题 + 委托挂牌 */}
        <View className='page-header'>
          <View className='page-header__body'>
            <Text className='page-header__title'>房源管理</Text>
            <Text className='page-header__sub'>共 {stats.total} 套 · 点击查看详情</Text>
          </View>
          <View className='page-header__btn' hoverClass='page-header__btn--hover' onClick={goMarketing}>
            <Text>委托挂牌</Text>
          </View>
        </View>

        {/* 搜索栏（客户端过滤：房号/地址/楼栋） */}
        <View className='op-search'>
          <Input
            className='op-search__input'
            value={keyword}
            placeholder='搜索房号/地址/楼栋'
            confirmType='search'
            onInput={(e: any) => setKeyword(e.detail.value)}
            onConfirm={handleSearch}
          />
          <View className='op-search__btn' onClick={handleSearch}>
            <Text className='op-search__btn-text'>搜索</Text>
          </View>
        </View>

        {/* 状态筛选 chips */}
        <ScrollView scrollX className='op-chips'>
          {STATUS_FILTERS.map((f) => (
            <View
              key={f.key || 'all'}
              className={`op-chip ${status === f.key ? 'op-chip--active' : ''}`}
              onClick={() => setStatus(f.key)}
            >
              <Text className='op-chip__text'>{f.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* 区域筛选（国家→城市→区） */}
        <View className='op-region'>
          <RegionPicker value={region} onChange={setRegion} />
        </View>

        {/* 筛选行：房型 / 价格 / 面积 / 排序 */}
        <ScrollView scrollX className='op-chips op-filter'>
          {[
            { opts: BEDROOM_OPTIONS, value: bedrooms, onChange: setBedrooms },
            { opts: PRICE_OPTIONS, value: priceRange, onChange: setPriceRange },
            { opts: AREA_OPTIONS, value: areaRange, onChange: setAreaRange },
            { opts: SORT_OPTIONS, value: sort, onChange: setSort }
          ].map((g, idx) => {
            const activeIdx = Math.max(0, g.opts.findIndex((o: any) => o.key === g.value))
            return (
              <Picker
                key={idx}
                mode='selector'
                range={g.opts.map((o: any) => o.label)}
                value={activeIdx}
                onChange={(e: any) => g.onChange(g.opts[Number(e.detail.value)].key)}
              >
                <View className={`op-chip ${g.value !== g.opts[0].key ? 'op-chip--active' : ''}`}>
                  <Text className='op-chip__text'>{g.opts[activeIdx].label}</Text>
                  <Text className='op-chip__caret'>▾</Text>
                </View>
              </Picker>
            )
          })}
        </ScrollView>

        {/* 自定义区间输入 */}
        {(priceRange === 'custom' || areaRange === 'custom') && (
          <View className='op-custom'>
            {priceRange === 'custom' && (
              <View className='op-custom__group'>
                <Text className='op-custom__name'>价格(万)</Text>
                <Input
                  className='op-custom__input'
                  type='number'
                  placeholder='最低'
                  value={priceCustomMin}
                  onInput={(e: any) => setPriceCustomMin(e.detail.value)}
                />
                <Text className='op-custom__sep'>-</Text>
                <Input
                  className='op-custom__input'
                  type='number'
                  placeholder='最高'
                  value={priceCustomMax}
                  onInput={(e: any) => setPriceCustomMax(e.detail.value)}
                />
              </View>
            )}
            {areaRange === 'custom' && (
              <View className='op-custom__group'>
                <Text className='op-custom__name'>面积</Text>
                <Input
                  className='op-custom__input'
                  type='number'
                  placeholder='最小'
                  value={areaCustomMin}
                  onInput={(e: any) => setAreaCustomMin(e.detail.value)}
                />
                <Text className='op-custom__sep'>-</Text>
                <Input
                  className='op-custom__input'
                  type='number'
                  placeholder='最大'
                  value={areaCustomMax}
                  onInput={(e: any) => setAreaCustomMax(e.detail.value)}
                />
              </View>
            )}
          </View>
        )}

        {/* 统计行：名下房源 / 在租 / 空置 / 在售 */}
        <View className='op-stats'>
          <View className='op-stat op-stat--primary'>
            <Text className='op-stat__value'>{stats.total}</Text>
            <Text className='op-stat__label'>名下房源</Text>
          </View>
          <View className='op-stat op-stat--success'>
            <Text className='op-stat__value'>{stats.rented}</Text>
            <Text className='op-stat__label'>在租</Text>
          </View>
          <View className='op-stat op-stat--warning'>
            <Text className='op-stat__value'>{stats.vacant}</Text>
            <Text className='op-stat__label'>空置</Text>
          </View>
          <View className='op-stat op-stat--info'>
            <Text className='op-stat__value'>{stats.forSale}</Text>
            <Text className='op-stat__label'>在售</Text>
          </View>
        </View>

        {/* 列表标题行 + 新增房源 */}
        <View className='op-section-head'>
          <View className='op-section-head__left'>
            <Text className='op-section-head__title'>房源列表</Text>
            <Text className='op-section-head__count'>共 {filtered.length} 套</Text>
          </View>
          <View className='op-add-btn' hoverClass='op-add-btn--hover' onClick={openCreate}>
            <Text className='op-add-btn__plus'>＋</Text>
            <Text className='op-add-btn__text'>新增房源</Text>
          </View>
        </View>

        {/* 房源列表卡片 */}
        {loading && filtered.length === 0 && (
          <View className='op-state'>
            <Text className='op-state__text'>加载中...</Text>
          </View>
        )}
        {!loading && filtered.length === 0 && (
          <View className='op-state'>
            <View className='icon-svg' style={iconStyle('home', 72)} />
            <Text className='op-state__text'>暂无房源</Text>
            <Text className='op-state__desc'>{query || status || bedrooms || priceRange || areaRange ? '换个筛选条件试试' : '点击右上角「新增房源」录入'}</Text>
          </View>
        )}

        {filtered.map((item) => {
          const st = propStatus(item)
          return (
            <View
              key={String(item.id)}
              className='op-card'
              onClick={() => Taro.navigateTo({ url: `/pages/owner/property-detail/index?id=${item.id}` })}
            >
              {/* 头图占位 + 类型/状态徽章 */}
              <View className='op-card__banner'>
                {Array.isArray(item.photos) && item.photos.length > 0 ? null : (
                  <Text className='op-card__banner-ph'>房源</Text>
                )}
                <Text className='op-card__type'>{TYPE_LABELS[item.property_type || ''] || '房源'}</Text>
                <Text className={`op-card__status op-card__status--${st.cls}`}>{st.text}</Text>
              </View>

              <View className='op-card__body'>
                <Text className='op-card__name'>
                  {item.room_number || item.address || '未命名房源'}
                </Text>
                <View className='op-card__addr'>
                  <Text className='icon-svg icon-svg--sm' style={iconStyle('home', 26)} />
                  <Text className='op-card__addr-text'>{item.address || '暂无地址'}</Text>
                </View>
                <View className='op-card__meta'>
                  <Text className='op-card__meta-item'>{(item.size_sqm ?? item.area) || 0}㎡</Text>
                  <Text className='op-card__meta-item'>{item.bedrooms || 0}卧</Text>
                  <Text className='op-card__meta-item'>{item.bathrooms || 0}浴</Text>
                </View>
                <View className='op-card__price-row'>
                  <Text className='op-card__price'>
                    {item.monthly_rent ?? item.rentPrice
                      ? money(item.monthly_rent ?? item.rentPrice, item.currency || 'THB')
                      : item.sale_price
                        ? money(item.sale_price, item.currency || 'THB')
                        : '暂无挂牌价'}
                    {item.monthly_rent ?? item.rentPrice ? (
                      <Text className='op-card__price-unit'>/月</Text>
                    ) : null}
                  </Text>
                </View>
              </View>

              {/* 操作：编辑 / 委托挂牌 / 删除 */}
              <View className='op-card__footer'>
                <View
                  className='op-card__edit'
                  hoverClass='op-card__btn--hover'
                  onClick={(e: any) => {
                    e.stopPropagation()
                    openEdit(item)
                  }}
                >
                  <Text className='op-card__edit-text'>编辑</Text>
                </View>
                <View
                  className='op-card__manage'
                  hoverClass='op-card__btn--hover'
                  onClick={(e: any) => {
                    e.stopPropagation()
                    goMarketing()
                  }}
                >
                  <Text className='op-card__manage-text'>委托挂牌</Text>
                </View>
                <View
                  className='op-card__del'
                  hoverClass='op-card__btn--hover'
                  onClick={(e: any) => {
                    e.stopPropagation()
                    confirmDelete(item)
                  }}
                >
                  <Text className='icon-svg icon-svg--sm' style={iconStyle('close', 28)} />
                </View>
              </View>
            </View>
          )
        })}
      </View>

      {/* 新增 / 编辑弹窗 */}
      {modalOpen && (
        <View className='sheet-mask' onClick={resetModal}>
          <View className='sheet' onClick={(e) => e.stopPropagation()}>
            <View className='sheet__head'>
              <Text className='sheet__title'>{editingId ? '编辑房源' : '新增房源'}</Text>
              <View className='sheet__close icon-svg' style={iconStyle('close', 36)} onClick={resetModal} />
            </View>
            <View className='sheet__body'>
              <Text className='field-label'>房号 *</Text>
              <Input
                className='input'
                value={form.room_number}
                onInput={(e: any) => set('room_number', e.detail.value)}
                placeholder='如：A-1201'
                maxlength={40}
              />

              <View className='field-row'>
                <View className='field-col'>
                  <Text className='field-label'>楼栋</Text>
                  <Input
                    className='input'
                    value={form.building}
                    onInput={(e: any) => set('building', e.detail.value)}
                    placeholder='如：A栋'
                    maxlength={60}
                  />
                </View>
                <View className='field-col'>
                  <Text className='field-label'>楼层</Text>
                  <Input
                    className='input'
                    type='number'
                    value={form.floor}
                    onInput={(e: any) => set('floor', e.detail.value)}
                    placeholder='如 12'
                  />
                </View>
              </View>

              <Text className='field-label'>地址 *</Text>
              <Input
                className='input'
                value={form.address}
                onInput={(e: any) => set('address', e.detail.value)}
                placeholder='房源所在地址'
                maxlength={120}
              />

              <View className='field-row'>
                <View className='field-col'>
                  <Text className='field-label'>房型</Text>
                  <Picker
                    mode='selector'
                    range={TYPE_GROUPS.map((t) => t.label)}
                    value={typeIdx}
                    onChange={(e: any) => set('property_type', TYPE_GROUPS[Number(e.detail.value)].keys[0])}
                  >
                    <View className='form-picker'>
                      <Text className='form-picker__text'>{TYPE_GROUPS[typeIdx]?.label || '请选择'}</Text>
                      <Text className='form-picker__arrow'>▾</Text>
                    </View>
                  </Picker>
                </View>
                <View className='field-col'>
                  <Text className='field-label'>币种</Text>
                  <Picker
                    mode='selector'
                    range={CURRENCY_OPTIONS}
                    value={curIdx}
                    onChange={(e: any) => set('currency', CURRENCY_OPTIONS[Number(e.detail.value)])}
                  >
                    <View className='form-picker'>
                      <Text className='form-picker__text'>{CURRENCY_OPTIONS[curIdx]}</Text>
                      <Text className='form-picker__arrow'>▾</Text>
                    </View>
                  </Picker>
                </View>
              </View>

              <View className='field-row'>
                <View className='field-col'>
                  <Text className='field-label'>月租 *</Text>
                  <Input
                    className='input'
                    type='digit'
                    value={form.monthly_rent}
                    onInput={(e: any) => set('monthly_rent', e.detail.value)}
                    placeholder='如 12000'
                  />
                </View>
                <View className='field-col'>
                  <Text className='field-label'>押金金额</Text>
                  <Input
                    className='input'
                    type='digit'
                    value={form.deposit_amount}
                    onInput={(e: any) => set('deposit_amount', e.detail.value)}
                    placeholder='如 24000'
                  />
                </View>
              </View>

              <View className='field-row'>
                <View className='field-col'>
                  <Text className='field-label'>押金月数</Text>
                  <Input
                    className='input'
                    type='number'
                    value={form.deposit_months}
                    onInput={(e: any) => set('deposit_months', e.detail.value)}
                    placeholder='如 2'
                  />
                </View>
                <View className='field-col'>
                  <Text className='field-label'>面积（㎡）*</Text>
                  <Input
                    className='input'
                    type='digit'
                    value={form.size_sqm}
                    onInput={(e: any) => set('size_sqm', e.detail.value)}
                    placeholder='如 45'
                  />
                </View>
              </View>

              <View className='field-row'>
                <View className='field-col'>
                  <Text className='field-label'>卧室</Text>
                  <Input
                    className='input'
                    type='number'
                    value={form.bedrooms}
                    onInput={(e: any) => set('bedrooms', e.detail.value)}
                    placeholder='如 2'
                  />
                </View>
                <View className='field-col'>
                  <Text className='field-label'>卫生间</Text>
                  <Input
                    className='input'
                    type='number'
                    value={form.bathrooms}
                    onInput={(e: any) => set('bathrooms', e.detail.value)}
                    placeholder='如 1'
                  />
                </View>
              </View>

              <Text className='field-label'>状态</Text>
              <View className='pick-wrap'>
                {EDIT_STATUS_OPTIONS.map((s) => {
                  const active = form.status === s.value
                  return (
                    <View
                      key={s.value}
                      className={`pick-chip${active ? ' pick-chip--active' : ''}`}
                      hoverClass='pick-chip--hover'
                      onClick={() => set('status', s.value)}
                    >
                      <Text className={`pick-chip__text${active ? ' pick-chip__text--active' : ''}`}>{s.label}</Text>
                    </View>
                  )
                })}
              </View>

              <View className='field-row'>
                <View className='field-col'>
                  <Text className='field-label'>可入住日期</Text>
                  <Input
                    className='input'
                    value={form.available_from}
                    onInput={(e: any) => set('available_from', e.detail.value)}
                    placeholder='如 2026-10-01'
                    maxlength={10}
                  />
                </View>
                <View className='field-col field-col--switch'>
                  <Text className='field-label'>带家具</Text>
                  <Switch
                    checked={form.furnished}
                    color='#14b8a6'
                    onChange={(e: any) => set('furnished', e.detail.value)}
                  />
                </View>
              </View>

              <Text className='field-label'>视频链接</Text>
              <Input
                className='input'
                value={form.video_url}
                onInput={(e: any) => set('video_url', e.detail.value)}
                placeholder='如 https://... （选填）'
                maxlength={300}
              />

              <Text className='field-label'>房源描述</Text>
              <Textarea
                className='input input--area'
                value={form.description}
                onInput={(e: any) => set('description', e.detail.value)}
                placeholder='请输入房源描述（选填）'
                maxlength={500}
              />

              {/* 照片：仅编辑态展示（上传需房源已存在） */}
              {editingId && (
                <>
                  <Text className='field-label'>房源照片</Text>
                  <View className='photo-grid'>
                    {form.photos.map((url, idx) => (
                      <View key={idx} className='photo-item'>
                        <Image className='photo-item__img' src={url} mode='aspectFill' />
                        <View className='photo-item__del' onClick={() => removePhoto(url)}>
                          <Text className='photo-item__del-text'>×</Text>
                        </View>
                      </View>
                    ))}
                    <View className='photo-add' hoverClass='photo-add--hover' onClick={pickPhotos}>
                      <Text className='photo-add__text'>＋ 添加照片</Text>
                    </View>
                  </View>
                </>
              )}

              <View
                className={`submit-btn${submitting ? ' submit-btn--disabled' : ''}`}
                hoverClass='submit-btn--hover'
                onClick={submitForm}
              >
                <Text className='submit-btn__text'>{submitting ? '提交中…' : editingId ? '保存修改' : '确认创建'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      <BottomNav role='owner' active='dashboard' />
    </View>
  )
}
