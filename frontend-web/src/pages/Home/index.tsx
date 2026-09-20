import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { formatMoney } from '@/lib/money'
import useAuthStore from '@/stores/auth'
import { useCachedQuery } from '@/lib/queryCache'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import brandLogo from '@/assets/haofang-logo.jpg'
import type { Property } from '@/types'
import './home.css'

// 房源卡片 banner 主题色（使用设计令牌 CSS 变量，确保主题一致性）
const BANNER_COLORS = [
  'var(--rent-primary)',
  'var(--state-info)',
  'var(--state-success)',
  'var(--state-purple)',
  'var(--state-warning)',
  'var(--state-error)',
]
const bannerColorFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < (seed || 'x').length; i++) h = (h * 31 + (seed || 'x').charCodeAt(i)) >>> 0
  return BANNER_COLORS[h % BANNER_COLORS.length]
}

// 状态标签样式类（对应 CSS 中的 modifier 类，使用设计令牌）
const STATUS_CLASS: Record<string, string> = {
  vacant: 'rent-status-tag--vacant',
  rented: 'rent-status-tag--rented',
  reserved: 'rent-status-tag--reserved',
  maintenance: 'rent-status-tag--maintenance',
}

// 户型类型图标（lucide 路径，对齐原型 type-badge）
const TYPE_ICON_PATH = (pt: string): string => {
  switch (pt) {
    case 'villa':
    case 'house':
      return 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
    case 'shop':
    case 'commercial':
      return 'M3 9l1-5h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M9 21v-6h6v6'
    case 'office':
      return 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20'
    default: // apartment / condo
      return 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4'
  }
}

const Home = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token, user } = useAuthStore()
  const [searchVal, setSearchVal] = useState('')

  // 精选房源（缓存优先渲染 + 后台刷新，秒开）
  const q = useCachedQuery<Property[]>({
    queryKey: ['home-featured'],
    cacheKey: 'home:featured',
    queryFn: async () => {
      try {
        const res = await api.get('/properties', { params: { page_size: 8 } })
        const items = res.data?.data?.items ?? res.data?.items ?? res.data?.data
        if (Array.isArray(items)) {
          return items.slice(0, 8)
        }
        return []
      } catch {
        return []
      }
    },
  })
  const props = q.data ?? []

  const handleSearch = useCallback(() => {
    navigate('/listings')
  }, [navigate])

  // 「视频看房」入口：列表页据 ?video=1 只筛有视频的房源
  const goVideoTour = useCallback(() => {
    navigate('/listings?video=1')
  }, [navigate])

  // 房源详情入口：租客走 C 端门户详情页，其余角色走后台详情页
  const detailPath = useCallback(
    (id: string) => (user?.role === 'tenant' ? `/tenant/properties/${id}` : `/properties/detail/${id}`),
    [user]
  )

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

  const searchTags = [t('browse.nearMetro'), t('browse.furnished'), t('browse.moveIn'), t('browse.seaView'), t('browse.nearMall')]

  return (
    <div className="rent-portal">
      {/* ===== 顶栏（对齐原型 rent-portal__header） ===== */}
      <header className="rent-portal__header">
        <div className="rent-portal__brand" onClick={() => navigate('/')}>
          <img className="rent-portal__logo" src={brandLogo} alt="HaoFang.World" />
          <span className="rent-portal__name">HaoFang.World</span>
        </div>
        <nav className="rent-portal__nav">
          <button className="rent-portal__nav-item" data-active="true" onClick={handleSearch}>{t('browse.rent')}</button>
          <button className="rent-portal__nav-item" onClick={handleSearch}>{t('browse.buy')}</button>
          <button className="rent-portal__nav-item" onClick={handleSearch}>{t('browse.mapFind')}</button>
          <button className="rent-portal__nav-item" onClick={goVideoTour}>{t('browse.video')}</button>
        </nav>
        <div className="rent-portal__actions">
          <LanguageSwitcher compact />
          {token ? (
            <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={enterSystem}>
              {t('home.enterSystem')}
            </button>
          ) : (
            <>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate('/login')}>
                {t('home.login')}
              </button>
              <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => navigate('/register')}>
                {t('register.submit')}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="rent-portal__main">
        {/* ===== 搜索 Hero（对齐原型 rent-search-hero） ===== */}
        <section className="rent-search-hero">
          <span className="rent-search-hero__decor rent-search-hero__decor--1"></span>
          <span className="rent-search-hero__decor rent-search-hero__decor--2"></span>
          <span className="rent-search-hero__decor rent-search-hero__decor--3"></span>
          <div className="rent-search-hero__inner">
            <h1 className="rent-search-hero__title">{t('home.heroTitle')}</h1>
            <p className="rent-search-hero__subtitle">{t('home.heroSubtitle')}</p>
            <div className="rent-search-hero__bar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder={t('browse.searchPlaceholder')}
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="rent-search-hero__search-btn" onClick={handleSearch}>
                {t('common.search')}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
            <div className="rent-search-hero__tags">
              {searchTags.map((tag) => (
                <a className="rent-search-hero__tag" key={tag} onClick={handleSearch}>{tag}</a>
              ))}
            </div>
          </div>
        </section>

        {/* ===== 精选房源（对齐原型 rent-prop-search-card 网格） ===== */}
        <section className="rent-section">
          <div className="rent-section__head">
            <h2 className="rent-section__title">{t('browse.featured')}</h2>
            <a className="rent-section__link" onClick={handleSearch}>
              {t('browse.more')}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
          </div>
          <div className="rent-prop-grid">
            {props.length === 0 ? (
              <div className="rent-empty" style={{ gridColumn: '1 / -1' }}>
                {t('common.noData')}
              </div>
            ) : (
              props.map((p) => {
              const ptype = p.property_type || 'apartment'
              const statusKey = (p.status || 'vacant').toLowerCase()
              const beds = Number(p.bedrooms || 0)
              const baths = Number(p.bathrooms || 0)
              const size = Number(p.size_sqm || 0)
              return (
                <div
                  className="rent-prop-search-card"
                  key={p.id}
                  onClick={() => token ? navigate(detailPath(p.id)) : handleSearch()}
                >
                  <div className="rent-prop-search-card__banner" style={{ background: bannerColorFor(p.id) }}>
                    <button
                      className="rent-fav-btn"
                      aria-label={t('property.followProperty')}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </button>
                    <svg className="rent-prop-search-card__banner-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={TYPE_ICON_PATH(ptype)} />
                    </svg>
                    <span className={`rent-prop-search-card__status-tag ${STATUS_CLASS[statusKey] || 'rent-status-tag--rented'}`}>
                      {t(`propertyStatus.${statusKey}`)}
                    </span>
                    <span className="rent-prop-search-card__type-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={TYPE_ICON_PATH(ptype)} />
                      </svg>
                      {t(`propertyType.${ptype}`)}
                    </span>
                  </div>
                  <div className="rent-prop-search-card__body">
                    <h3 className="rent-prop-search-card__name">{p.address || p.room_number}</h3>
                    <p className="rent-prop-search-card__address">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {p.address || p.room_number || '—'}
                    </p>
                    <div className="rent-prop-search-card__tags">
                      {p.furnished && <span className="rent-badge rent-badge--primary">{t('browse.furnished')}</span>}
                      <span className="rent-badge rent-badge--success">{t('browse.moveIn')}</span>
                    </div>
                    <div className="rent-prop-search-card__stats">
                      <span className="rent-prop-search-card__stat">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="1" />
                        </svg>
                        {size}㎡
                      </span>
                      <span className="rent-prop-search-card__stat">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
                        </svg>
                        {beds ? `${beds}${t('browse.statBed')}` : t('roomType.studio')}
                      </span>
                      <span className="rent-prop-search-card__stat">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 12V6a2 2 0 0 1 2-2h1M9 6.5 6.5 4M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM7 19l-1 2M18 19l1 2" />
                        </svg>
                        {baths}{t('browse.statBath')}
                      </span>
                    </div>
                    <div className="rent-prop-search-card__foot">
                      <div className="rent-prop-search-card__price">
                        <span className="rent-prop-search-card__price-value">{formatMoney(p.monthly_rent)}</span>
                        <span className="rent-prop-search-card__price-unit">{t('property.perMonth')}</span>
                      </div>
                      <button
                        className="rent-prop-search-card__cta"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); token ? navigate(detailPath(p.id)) : handleSearch() }}
                      >
                        {t('property.viewDetail')}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
            )}
          </div>
        </section>

        {/* ===== 底部 登录/注册 ===== */}
        <section className="rent-cta">
          <div className="rent-cta__inner">
            <div className="rent-cta__text">
              <div className="rent-cta__title">{t('home.ctaTitle')}</div>
              <div className="rent-cta__desc">{t('home.ctaDesc')}</div>
            </div>
            <div className="rent-cta__actions">
              {!token && (
                <button className="rent-btn rent-btn--ghost rent-cta__ghost" onClick={() => navigate('/login')}>
                  {t('home.login')}
                </button>
              )}
              <button className="rent-btn rent-btn--primary rent-btn--lg rent-cta__primary" onClick={token ? enterSystem : () => navigate('/register')}>
                {token ? t('home.enterSystem') : t('register.submit')}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ===== 页脚 ===== */}
      <footer className="rent-footer">
        <div className="rent-footer__inner">
          <div>
            <div className="rent-footer__brand-name">HaoFang.World</div>
            <div className="rent-footer__brand-desc">{t('login.subtagline')}</div>
          </div>
          <div className="rent-footer__col">
            <div className="rent-footer__col-title">{t('home.footerProduct')}</div>
            <a onClick={handleSearch}>{t('browse.rent')}</a>
            <a onClick={handleSearch}>{t('browse.buy')}</a>
            <a onClick={handleSearch}>{t('browse.mapFind')}</a>
            <a onClick={goVideoTour}>{t('browse.video')}</a>
          </div>
          <div className="rent-footer__col">
            <div className="rent-footer__col-title">{t('home.footerAbout')}</div>
            <a onClick={() => navigate('/login')}>{t('home.login')}</a>
            <a onClick={() => navigate('/company')}>{t('menu.company')}</a>
          </div>
          <div className="rent-footer__col">
            <div className="rent-footer__col-title">{t('home.footerContact')}</div>
            <a>contact@rentflow.com</a>
            <a>+66 2 123 4567</a>
            <a>Bangkok, Thailand</a>
          </div>
        </div>
        <div className="rent-footer__bottom">
          © {new Date().getFullYear()} HaoFang.World · {t('common.appName')}
        </div>
      </footer>
    </div>
  )
}

export default Home
