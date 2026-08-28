import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import useAuthStore from '@/stores/auth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import type { Property } from '@/types'
import './home.css'

// 与 Properties 页面一致的渐变色板
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

// mock 兜底数据（后端未启动时展示）
const MOCK_PROPS: Property[] = [
  { id: '1', room_number: 'A-1201', monthly_rent: 18000, currency: 'THB', size_sqm: 45, bedrooms: 1, bathrooms: 1, floor: 12, property_type: 'apartment', address: 'Sukhumvit 12, Bangkok', status: 'vacant', project_id: '', owner_id: '', deposit_amount: 36000, building: '', furnished: true },
  { id: '2', room_number: 'B-0805', monthly_rent: 25000, currency: 'THB', size_sqm: 65, bedrooms: 2, bathrooms: 2, floor: 8, property_type: 'condo', address: 'Phrom Phong, Bangkok', status: 'vacant', project_id: '', owner_id: '', deposit_amount: 50000, building: '', furnished: true },
  { id: '3', room_number: 'V-03', monthly_rent: 45000, currency: 'THB', size_sqm: 120, bedrooms: 3, bathrooms: 3, floor: 1, property_type: 'villa', address: 'Laguna, Phuket', status: 'vacant', project_id: '', owner_id: '', deposit_amount: 90000, building: '', furnished: true },
  { id: '4', room_number: 'C-1503', monthly_rent: 15000, currency: 'THB', size_sqm: 38, bedrooms: 1, bathrooms: 1, floor: 15, property_type: 'apartment', address: 'Pattaya Central', status: 'vacant', project_id: '', owner_id: '', deposit_amount: 30000, building: '', furnished: false },
  { id: '5', room_number: 'D-2001', monthly_rent: 32000, currency: 'THB', size_sqm: 80, bedrooms: 2, bathrooms: 2, floor: 20, property_type: 'condo', address: 'Riverside, Chiang Mai', status: 'vacant', project_id: '', owner_id: '', deposit_amount: 64000, building: '', furnished: true },
  { id: '6', room_number: 'E-0602', monthly_rent: 12000, currency: 'THB', size_sqm: 30, bedrooms: 1, bathrooms: 1, floor: 6, property_type: 'apartment', address: 'Hua Hin Beach', status: 'vacant', project_id: '', owner_id: '', deposit_amount: 24000, building: '', furnished: true },
  { id: '7', room_number: 'F-1801', monthly_rent: 28000, currency: 'THB', size_sqm: 70, bedrooms: 2, bathrooms: 1, floor: 18, property_type: 'condo', address: 'Asoke, Bangkok', status: 'vacant', project_id: '', owner_id: '', deposit_amount: 56000, building: '', furnished: true },
  { id: '8', room_number: 'G-0301', monthly_rent: 38000, currency: 'THB', size_sqm: 95, bedrooms: 3, bathrooms: 2, floor: 3, property_type: 'house', address: 'Rawai, Phuket', status: 'vacant', project_id: '', owner_id: '', deposit_amount: 76000, building: '', furnished: false },
]

const fmtRent = (v: number, c: string) => `฿${Number(v || 0).toLocaleString()}`

const roomTypeLabel = (bedrooms: number) => {
  if (!bedrooms) return 'Studio'
  return `${bedrooms} BR`
}

// 金刚区图标背景色
const QUICK_COLORS = [
  'rgba(66,99,235,0.1)',
  'rgba(14,165,233,0.1)',
  'rgba(22,163,74,0.1)',
  'rgba(217,119,6,0.1)',
  'rgba(139,92,246,0.1)',
  'rgba(220,38,38,0.1)',
]
const QUICK_ICON_COLORS = [
  '#4263eb', '#0ea5e9', '#16a34a', '#d97706', '#8b5cf6', '#dc2626',
]

const Home = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token, user } = useAuthStore()
  const [props, setProps] = useState<Property[]>(MOCK_PROPS)
  const [searchVal, setSearchVal] = useState('')

  // 尝试从接口获取房源
  useEffect(() => {
    const fetchProps = async () => {
      try {
        const res = await api.get('/properties', { params: { page_size: 8 } })
        const items = res.data?.data?.items ?? res.data?.items ?? res.data?.data
        if (Array.isArray(items) && items.length > 0) {
          setProps(items.slice(0, 8))
        }
      } catch {
        // 后端未启动，使用 mock 数据
      }
    }
    fetchProps()
  }, [])

  const handleSearch = useCallback(() => {
    navigate('/listings')
  }, [navigate])

  const enterSystem = useCallback(() => {
    if (!token) {
      navigate('/login')
      return
    }
    const role = user?.role
    switch (role) {
      case 'owner': navigate('/owner/dashboard'); break
      case 'tenant': navigate('/tenant/dashboard'); break
      case 'employee': navigate('/employee/dashboard'); break
      default: navigate('/dashboard')
    }
  }, [token, user, navigate])

  // 金刚区
  const quickActions = [
    { label: t('browse.rent'), icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22', onClick: handleSearch },
    { label: t('browse.buy'), icon: 'M12 2L2 7v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7z M12 22V12 M3 7l9 5 9-5', onClick: handleSearch },
    { label: t('browse.mapFind'), icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', onClick: handleSearch },
    { label: t('browse.video'), icon: 'M23 7l-7 5 7 5V7z M1 5h15v14H1z', onClick: handleSearch },
    { label: t('browse.loanCalc'), icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', onClick: handleSearch },
    { label: t('browse.sellValuation'), icon: 'M3 3v18h18 M7 14l4-4 4 4 5-7', onClick: handleSearch },
  ]

  // 特色优势
  const features = [
    { title: t('login.feature1Title'), desc: t('login.feature1Desc'), icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6', color: '#4263eb', bg: 'rgba(66,99,235,0.1)' },
    { title: t('login.feature2Title'), desc: t('login.feature2Desc'), icon: 'M1 4h22v16H1z M1 10h23 M3 15h4', color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
    { title: t('login.feature3Title'), desc: t('login.feature3Desc'), icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
    { title: t('login.feature4Title'), desc: t('login.feature4Desc'), icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  ]

  const searchTags = [t('browse.nearMetro'), t('browse.furnished'), t('browse.moveIn'), t('browse.seaView'), t('browse.nearMall')]

  return (
    <div className="bk-home">
      {/* ===== Header ===== */}
      <header className="bk-header">
        <div className="bk-header__inner">
          <div className="bk-header__brand" onClick={() => navigate('/')}>
            <div className="bk-header__logo">R</div>
            <span className="bk-header__name">RentFlow</span>
          </div>
          <nav className="bk-header__nav">
            <button className="bk-header__nav-item" data-active="true" onClick={handleSearch}>{t('browse.rent')}</button>
            <button className="bk-header__nav-item" onClick={handleSearch}>{t('browse.buy')}</button>
            <button className="bk-header__nav-item" onClick={handleSearch}>{t('browse.mapFind')}</button>
            <button className="bk-header__nav-item" onClick={handleSearch}>{t('browse.video')}</button>
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

      {/* ===== Hero ===== */}
      <section className="bk-hero">
        <div className="bk-hero__inner">
          <h1 className="bk-hero__title">{t('home.heroTitle')}</h1>
          <p className="bk-hero__subtitle">{t('home.heroSubtitle')}</p>
          <div className="bk-search-bar">
            <input
              className="bk-search-bar__input"
              placeholder={t('browse.searchPlaceholder')}
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="bk-search-bar__btn" onClick={handleSearch}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {t('browse.findNow')}
            </button>
          </div>
          <div className="bk-search-tags">
            {searchTags.map((tag) => (
              <span className="bk-search-tag" key={tag} onClick={handleSearch}>{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 金刚区 ===== */}
      <div className="bk-section">
        <div className="bk-quick-grid">
          {quickActions.map((a, i) => (
            <button className="bk-quick-item" key={i} onClick={a.onClick}>
              <div className="bk-quick-item__icon" style={{ background: QUICK_COLORS[i] }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={QUICK_ICON_COLORS[i]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={a.icon} />
                </svg>
              </div>
              <span className="bk-quick-item__label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== 精选房源 ===== */}
      <section className="bk-section bk-section--padded">
        <div className="bk-section-head">
          <div className="bk-section-head__left">
            <h2 className="bk-section-head__title">{t('browse.featured')}</h2>
            <span className="bk-section-head__sub">{t('browse.featuredDesc')}</span>
          </div>
          <a className="bk-section-head__more" onClick={handleSearch}>
            {t('browse.more')}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>
        <div className="bk-prop-grid">
          {props.map((p) => (
            <div
              className="bk-prop-card"
              key={p.id}
              onClick={() => token ? navigate(`/properties/detail/${p.id}`) : navigate('/listings')}
            >
              <div className="bk-prop-card__banner" style={{ background: gradientFor(p.id) }}>
                <span className="bk-prop-card__banner-tag">{t(`propertyType.${p.property_type || 'apartment'}`)}</span>
              </div>
              <div className="bk-prop-card__body">
                <div className="bk-prop-card__name">{p.address || p.room_number}</div>
                <div className="bk-prop-card__info">
                  <span>{roomTypeLabel(p.bedrooms)}</span>
                  <span>·</span>
                  <span>{p.size_sqm}㎡</span>
                  <span>·</span>
                  <span>{t('property.floor')} {p.floor || '-'}</span>
                </div>
                <div className="bk-prop-card__tags">
                  {p.furnished && <span className="bk-prop-card__tag">{t('browse.furnished')}</span>}
                  <span className="bk-prop-card__tag">{t('browse.moveIn')}</span>
                </div>
                <div className="bk-prop-card__price">
                  <span className="bk-prop-card__price-value">{fmtRent(p.monthly_rent, p.currency)}</span>
                  <span className="bk-prop-card__price-unit">{t('browse.rentUnit')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 特色优势 ===== */}
      <section className="bk-section bk-section--padded">
        <div className="bk-section-head">
          <div className="bk-section-head__left">
            <h2 className="bk-section-head__title">{t('home.whyUs')}</h2>
          </div>
        </div>
        <div className="bk-features">
          {features.map((f, i) => (
            <div className="bk-feature-card" key={i}>
              <div className="bk-feature-card__icon" style={{ background: f.bg }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={f.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={f.icon} />
                </svg>
              </div>
              <div className="bk-feature-card__title">{f.title}</div>
              <div className="bk-feature-card__desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <div className="bk-cta">
        <div className="bk-cta__text">
          <div className="bk-cta__title">{t('home.ctaTitle')}</div>
          <div className="bk-cta__desc">{t('home.ctaDesc')}</div>
        </div>
        <button className="bk-cta__btn" onClick={() => navigate('/login')}>
          {t('home.ctaBtn')}
        </button>
      </div>

      {/* ===== Footer ===== */}
      <footer className="bk-footer">
        <div className="bk-footer__inner">
          <div>
            <div className="bk-footer__brand-name">RentFlow</div>
            <div className="bk-footer__brand-desc">{t('login.subtagline')}</div>
          </div>
          <div className="bk-footer__col">
            <div className="bk-footer__col-title">{t('home.footerProduct')}</div>
            <a onClick={handleSearch}>{t('browse.rent')}</a>
            <a onClick={handleSearch}>{t('browse.buy')}</a>
            <a onClick={handleSearch}>{t('browse.mapFind')}</a>
            <a onClick={handleSearch}>{t('browse.video')}</a>
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

export default Home
