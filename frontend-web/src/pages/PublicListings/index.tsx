import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Empty,
  Input,
  Pagination,
  Select,
  Spin,
} from 'antd'
import {
  SearchOutlined,
  EyeOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import type { Property } from '@/types'
import './public-listings.css'

// ==================== 常量（与 Home / Properties 保持一致）====================

const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
]

const gradientFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

const formatRent = (v: any) => Number(v || 0).toLocaleString()
const formatPerSqm = (rent: number, sqm: number) => {
  const s = Number(sqm || 0)
  if (!s) return '0'
  return Math.round(Number(rent || 0) / s).toLocaleString()
}

const attentionCount = (id: string) => {
  let h = 0
  for (let i = 0; i < (id || 'x').length; i++) h = (h * 31 + (id || 'x').charCodeAt(i)) >>> 0
  return h % 280
}

const PAGE_SIZE = 10

// mock 兜底数据
const MOCK_PROPS: Property[] = [
  { id: '1', room_number: 'A-1201', monthly_rent: 18000, currency: 'THB', size_sqm: 45, bedrooms: 1, bathrooms: 1, floor: 12, property_type: 'apartment', address: 'Sukhumvit 12, Bangkok', status: 'vacant', project_id: 'Noble Around', owner_id: '', deposit_amount: 36000, building: 'A', furnished: true },
  { id: '2', room_number: 'B-0805', monthly_rent: 25000, currency: 'THB', size_sqm: 65, bedrooms: 2, bathrooms: 2, floor: 8, property_type: 'condo', address: 'Phrom Phong, Bangkok', status: 'vacant', project_id: 'The Emporio', owner_id: '', deposit_amount: 50000, building: 'B', furnished: true },
  { id: '3', room_number: 'V-03', monthly_rent: 45000, currency: 'THB', size_sqm: 120, bedrooms: 3, bathrooms: 3, floor: 1, property_type: 'villa', address: 'Laguna, Phuket', status: 'rented', project_id: 'Laguna Village', owner_id: '', deposit_amount: 90000, building: '', furnished: true },
  { id: '4', room_number: 'C-1503', monthly_rent: 15000, currency: 'THB', size_sqm: 38, bedrooms: 1, bathrooms: 1, floor: 15, property_type: 'apartment', address: 'Pattaya Central', status: 'vacant', project_id: 'Centara Sea', owner_id: '', deposit_amount: 30000, building: 'C', furnished: false },
  { id: '5', room_number: 'D-2001', monthly_rent: 32000, currency: 'THB', size_sqm: 80, bedrooms: 2, bathrooms: 2, floor: 20, property_type: 'condo', address: 'Riverside, Chiang Mai', status: 'reserved', project_id: 'The River', owner_id: '', deposit_amount: 64000, building: 'D', furnished: true },
  { id: '6', room_number: 'E-0602', monthly_rent: 12000, currency: 'THB', size_sqm: 30, bedrooms: 1, bathrooms: 1, floor: 6, property_type: 'apartment', address: 'Hua Hin Beach', status: 'vacant', project_id: 'Baan San Pluem', owner_id: '', deposit_amount: 24000, building: 'E', furnished: true },
  { id: '7', room_number: 'F-1801', monthly_rent: 28000, currency: 'THB', size_sqm: 70, bedrooms: 2, bathrooms: 1, floor: 18, property_type: 'condo', address: 'Asoke, Bangkok', status: 'rented', project_id: 'Ashton Asoke', owner_id: '', deposit_amount: 56000, building: 'F', furnished: true },
  { id: '8', room_number: 'G-0301', monthly_rent: 38000, currency: 'THB', size_sqm: 95, bedrooms: 3, bathrooms: 2, floor: 3, property_type: 'house', address: 'Rawai, Phuket', status: 'maintenance', project_id: 'Rawai VIP', owner_id: '', deposit_amount: 76000, building: '', furnished: false },
]

// ==================== 组件 ====================

const PublicListings = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token, user } = useAuthStore()

  // 数据
  const [allItems, setAllItems] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)

  // 筛选
  const [keyword, setKeyword] = useState('')
  const [region, setRegion] = useState('')
  const [roomType, setRoomType] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [areaRange, setAreaRange] = useState('')
  const [sort, setSort] = useState('default')
  const [page, setPage] = useState(1)

  // 选项
  const statusLabelMap = useMemo<Record<string, string>>(() => ({
    vacant: t('propertyStatus.vacant'),
    rented: t('propertyStatus.rented'),
    reserved: t('propertyStatus.reserved'),
    maintenance: t('propertyStatus.maintenance'),
  }), [t])

  const propertyTypeMap = useMemo<Record<string, string>>(() => ({
    apartment: t('propertyType.apartment'),
    condo: t('propertyType.condo'),
    villa: t('propertyType.villa'),
    house: t('propertyType.house'),
    shop: t('propertyType.shop'),
    commercial: t('propertyType.commercial'),
    office: t('propertyType.office'),
  }), [t])

  const regionOptions = useMemo(() => [
    { value: '', label: t('property.allRegions') },
    { value: 'Bangkok', label: t('region.bangkok') },
    { value: 'Phuket', label: t('region.phuket') },
    { value: 'Chiang Mai', label: t('region.chiangMai') },
    { value: 'Pattaya', label: t('region.pattaya') },
    { value: 'Hua Hin', label: t('region.huaHin') },
  ], [t])

  const roomTypeOptions = useMemo(() => [
    { value: '', label: t('property.allRoomTypes') },
    { value: '1', label: t('roomType.r1') },
    { value: '2', label: t('roomType.r2') },
    { value: '3', label: t('roomType.r3') },
    { value: '4', label: t('roomType.r4') },
  ], [t])

  const priceOptions = useMemo(() => [
    { value: '', label: t('property.allPrices') },
    { value: '0-5000', label: t('priceRange.below5k') },
    { value: '5000-10000', label: t('priceRange.r5k10k') },
    { value: '10000-20000', label: t('priceRange.r10k20k') },
    { value: '20000-50000', label: t('priceRange.r20k50k') },
    { value: '50000-99999999', label: t('priceRange.above50k') },
  ], [t])

  const areaOptions = useMemo(() => [
    { value: '', label: t('property.allAreas') },
    { value: '0-50', label: t('areaRange.below50') },
    { value: '50-100', label: t('areaRange.r50to100') },
    { value: '100-200', label: t('areaRange.r100to200') },
    { value: '200-999999', label: t('areaRange.above200') },
  ], [t])

  const sortItems = useMemo(() => [
    { value: 'default', label: t('property.defaultSort') },
    { value: 'latest', label: t('property.latest') },
    { value: 'price_asc', label: t('property.priceAsc') },
    { value: 'price_desc', label: t('property.priceDesc') },
    { value: 'area_desc', label: t('property.areaDesc') },
  ], [t])

  // 数据获取（公开接口，不需要 auth）
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/properties', { params: { page_size: 999 } })
      const payload = res.data?.data ?? res.data
      const items = payload?.items ?? []
      if (Array.isArray(items) && items.length > 0) {
        setAllItems(items)
      } else {
        setAllItems(MOCK_PROPS)
      }
    } catch {
      setAllItems(MOCK_PROPS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 前端筛选 + 排序
  const filteredItems = useMemo(() => {
    let list = [...allItems]
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      list = list.filter((it: any) =>
        [it.room_number, it.address, it.project_id, it.building, it.city]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kw))
      )
    }
    if (region) {
      list = list.filter((it: any) =>
        [it.city, it.address, it.project_id].filter(Boolean).some((v) => String(v).toLowerCase().includes(region.toLowerCase()))
      )
    }
    if (roomType) {
      const n = Number(roomType)
      list = list.filter((it: any) => n >= 4 ? Number(it.bedrooms) >= 4 : Number(it.bedrooms) === n)
    }
    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number)
      list = list.filter((it: any) => { const r = Number(it.monthly_rent); return r >= min && r <= max })
    }
    if (areaRange) {
      const [min, max] = areaRange.split('-').map(Number)
      list = list.filter((it: any) => { const s = Number(it.size_sqm); return s >= min && s <= max })
    }
    switch (sort) {
      case 'price_asc': list.sort((a: any, b: any) => a.monthly_rent - b.monthly_rent); break
      case 'price_desc': list.sort((a: any, b: any) => b.monthly_rent - a.monthly_rent); break
      case 'area_desc': list.sort((a: any, b: any) => b.size_sqm - a.size_sqm); break
      case 'latest': list.sort((a: any, b: any) => dayjs(b.created_at || 0).valueOf() - dayjs(a.created_at || 0).valueOf()); break
    }
    return list
  }, [allItems, keyword, region, roomType, priceRange, areaRange, sort])

  useEffect(() => { setPage(1) }, [keyword, region, roomType, priceRange, areaRange, sort])

  const total = filteredItems.length
  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

  // 辅助函数
  const relativeTime = (dateStr?: string) => {
    if (!dateStr) return t('property.justNow')
    const d = dayjs(dateStr)
    if (!d.isValid()) return t('property.justNow')
    const now = dayjs()
    const diffDays = now.diff(d, 'day')
    const diffMonths = now.diff(d, 'month')
    const diffYears = now.diff(d, 'year')
    if (diffDays < 1) return t('property.justNow')
    if (diffDays < 30) return `${diffDays} ${t('property.daysAgo')}`
    if (diffMonths < 12) return `${diffMonths} ${t('property.monthsAgo')}`
    return `${diffYears} ${t('property.yearsAgo')}`
  }

  const handleCardClick = (item: any) => {
    if (token) {
      navigate(`/properties/detail/${item.id}`)
    } else {
      navigate('/login')
    }
  }

  const enterSystem = useCallback(() => {
    if (!token) { navigate('/login'); return }
    const role = user?.role
    switch (role) {
      case 'owner': navigate('/owner/dashboard'); break
      case 'tenant': navigate('/tenant/dashboard'); break
      case 'employee': navigate('/employee/dashboard'); break
      default: navigate('/dashboard')
    }
  }, [token, user, navigate])

  // 列表项渲染
  const renderListItem = (item: any) => {
    const projectName = item.project_id || item.building || ''
    const title = projectName ? `${projectName} · ${item.room_number || ''}` : (item.address || item.room_number || '—')
    const ptype = propertyTypeMap[item.property_type] || item.property_type || t('propertyType.apartment')
    const statusKey = (item.status || 'vacant').toLowerCase()
    const beds = Number(item.bedrooms || 0)
    const baths = Number(item.bathrooms || 0)
    const size = Number(item.size_sqm || 0)
    const floor = item.floor || '—'
    const rent = Number(item.monthly_rent || 0)
    const followers = attentionCount(String(item.id || item.room_number || ''))
    const seed = String(item.id || item.room_number || '')

    const infoParts = [
      `${beds}${t('property.bedrooms')}${baths}${t('property.bathrooms')}`,
      `${size}㎡`,
      item.furnished ? t('browse.furnished') : t('property.unfurnished'),
      `${t('property.floor')} ${floor}`,
      ptype,
    ]

    const tags: { label: string; type: string }[] = []
    tags.push({ label: statusLabelMap[statusKey] || item.status || '', type: statusKey })
    if (item.furnished) tags.push({ label: t('browse.furnished'), type: 'feature' })
    tags.push({ label: t('browse.moveIn'), type: 'feature' })

    return (
      <div className="pl-item" key={item.id} onClick={() => handleCardClick(item)}>
        <div className="pl-item__img" style={{ background: gradientFor(seed) }}>
          <span className="pl-item__img-text">{item.room_number || '—'}</span>
          <span className={`pl-item__badge pl-item__badge--${statusKey}`}>
            {statusLabelMap[statusKey] || item.status}
          </span>
        </div>
        <div className="pl-item__body">
          <div className="pl-item__title">{title}</div>
          <div className="pl-item__addr">
            <EnvironmentOutlined /> {item.address || '—'}
          </div>
          <div className="pl-item__info">
            {infoParts.map((p, i) => (
              <span key={i}>
                {i > 0 && <em className="pl-item__sep">|</em>}
                {p}
              </span>
            ))}
          </div>
          <div className="pl-item__meta">
            <EyeOutlined className="pl-item__meta-icon" />
            <span>{followers} {t('property.attention')}</span>
            <em className="pl-item__sep">/</em>
            <span>{relativeTime(item.created_at)}</span>
          </div>
          <div className="pl-item__tags">
            {tags.map((tag, i) => (
              <span key={i} className={`pl-chip pl-chip--${tag.type}`}>{tag.label}</span>
            ))}
          </div>
          <div className="pl-item__bottom">
            <div className="pl-item__price">
              <span className="pl-item__price-num">฿{formatRent(rent)}</span>
              <span className="pl-item__price-unit">{t('property.perMonth')}</span>
              <span className="pl-item__price-per">฿{formatPerSqm(rent, size)}{t('property.perSqm')}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const searchTags = [t('browse.nearMetro'), t('browse.furnished'), t('browse.moveIn'), t('browse.seaView'), t('browse.nearMall')]

  return (
    <div className="pl-page">
      {/* ===== Header（与主页一致）===== */}
      <header className="bk-header">
        <div className="bk-header__inner">
          <div className="bk-header__brand" onClick={() => navigate('/')}>
            <div className="bk-header__logo">R</div>
            <span className="bk-header__name">RentFlow</span>
          </div>
          <nav className="bk-header__nav">
            <button className="bk-header__nav-item" data-active="true" onClick={() => navigate('/listings')}>{t('browse.rent')}</button>
            <button className="bk-header__nav-item" onClick={() => navigate('/listings')}>{t('browse.buy')}</button>
            <button className="bk-header__nav-item" onClick={() => navigate('/listings')}>{t('browse.mapFind')}</button>
            <button className="bk-header__nav-item" onClick={() => navigate('/listings')}>{t('browse.video')}</button>
          </nav>
          <div className="bk-header__right">
            <LanguageSwitcher compact />
            {token ? (
              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={enterSystem}>
                {t('home.enterSystem')}
              </button>
            ) : (
              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => navigate('/login')}>
                {t('home.login')}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ===== 搜索区（紧凑版，与主页同色系）===== */}
      <section className="pl-hero">
        <div className="pl-hero__inner">
          <h1 className="pl-hero__title">{t('browse.featured')}</h1>
          <p className="pl-hero__subtitle">{t('browse.featuredDesc')}</p>
          <div className="pl-search-bar">
            <input
              className="pl-search-bar__input"
              placeholder={t('browse.searchPlaceholder')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button className="pl-search-bar__btn">
              <SearchOutlined />
              {t('browse.findNow')}
            </button>
          </div>
          <div className="pl-search-tags">
            {searchTags.map((tag) => (
              <span className="pl-search-tag" key={tag} onClick={() => setKeyword(tag)}>{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 筛选栏 ===== */}
      <div className="pl-container">
        <div className="pl-filter">
          <div className="pl-filter__selects">
            <Select value={region} onChange={setRegion} options={regionOptions} className="pl-filter__select" />
            <Select value={roomType} onChange={setRoomType} options={roomTypeOptions} className="pl-filter__select" />
            <Select value={priceRange} onChange={setPriceRange} options={priceOptions} className="pl-filter__select" />
            <Select value={areaRange} onChange={setAreaRange} options={areaOptions} className="pl-filter__select" />
          </div>
        </div>

        {/* 排序栏 */}
        <div className="pl-sortbar">
          <div className="pl-sortbar__items">
            {sortItems.map((s) => (
              <button
                key={s.value}
                className="pl-sortbar__item"
                data-active={sort === s.value}
                onClick={() => setSort(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="pl-sortbar__count">
            {t('property.found')} <span className="pl-sortbar__count-num">{total}</span> {t('property.units')}
          </div>
        </div>

        {/* 房源列表 */}
        <Spin spinning={loading} tip={t('common.loading')}>
          {pagedItems.length === 0 && !loading ? (
            <div className="pl-empty"><Empty description={t('common.noData')} /></div>
          ) : (
            <div className="pl-list">
              {pagedItems.map((item: any) => renderListItem(item))}
            </div>
          )}
        </Spin>

        {/* 分页 */}
        {total > 0 && (
          <div className="pl-pagination">
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              showTotal={(tt) => `${t('common.total')} ${tt} ${t('common.items')}`}
              showSizeChanger={false}
              onChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* ===== Footer（与主页一致）===== */}
      <footer className="bk-footer">
        <div className="bk-footer__inner">
          <div>
            <div className="bk-footer__brand-name">RentFlow</div>
            <div className="bk-footer__brand-desc">{t('login.subtagline')}</div>
          </div>
          <div className="bk-footer__col">
            <div className="bk-footer__col-title">{t('home.footerProduct')}</div>
            <a onClick={() => navigate('/listings')}>{t('browse.rent')}</a>
            <a onClick={() => navigate('/listings')}>{t('browse.buy')}</a>
            <a onClick={() => navigate('/listings')}>{t('browse.mapFind')}</a>
            <a onClick={() => navigate('/listings')}>{t('browse.video')}</a>
          </div>
          <div className="bk-footer__col">
            <div className="bk-footer__col-title">{t('home.footerAbout')}</div>
            <a onClick={() => navigate('/login')}>{t('home.login')}</a>
            <a onClick={() => navigate('/company')}>{t('menu.company')}</a>
          </div>
          <div className="bk-footer__col">
            <div className="bk-footer__col-title">{t('home.footerContact')}</div>
            <a>contact@rentflow.com</a>
            <a>+66 2 123 4567</a>
            <a>Bangkok, Thailand</a>
          </div>
        </div>
        <div className="bk-footer__bottom">
          © {new Date().getFullYear()} RentFlow · {t('common.appName')}
        </div>
      </footer>
    </div>
  )
}

export default PublicListings
