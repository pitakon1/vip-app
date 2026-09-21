/**
 * C 端公开站点顶栏。
 *
 * 免登录浏览是产品原则：匿名用户可自由浏览房源 / 学校 / 小区，顶栏的登录态
 * **只影响右上角按钮**，不影响任何内容可见性。
 */
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import LocationPicker from '@/components/LocationPicker'
import { useLocationStore } from '@/stores/location'
import { useState } from 'react'
import brandLogo from '@/assets/haofang-logo.jpg'

const PublicTopBar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const cityLabel = useLocationStore((s) => s.selection.cityLabel)
  const [locOpen, setLocOpen] = useState(false)
  // 只读 localStorage：顶栏是纯展示件，不必订阅 auth store 而触发整页重渲染
  const token = typeof window === 'undefined' ? null : localStorage.getItem('token')

  const path = location.pathname
  const search = location.search
  const navItems = [
    {
      key: 'rent',
      label: t('browse.rent'),
      to: '/listings?type=rent',
      active: path === '/listings' && !search.includes('type=sell'),
    },
    {
      key: 'sell',
      label: t('browse.buy'),
      to: '/listings?type=sell',
      active: path === '/listings' && search.includes('type=sell'),
    },
    {
      key: 'schools',
      label: t('publicSite.navSchools'),
      to: '/schools',
      active: path.startsWith('/school'),
    },
    {
      key: 'communities',
      label: t('publicSite.navCommunities'),
      to: '/communities',
      active: path.startsWith('/communit'),
    },
  ]

  return (
    <header className="pub-topbar">
      <div className="pub-wrap pub-topbar__inner">
        <button type="button" className="pub-brand" onClick={() => navigate('/')}>
          <img
            src={brandLogo}
            alt={t('common.appName')}
            style={{ height: 30, display: 'block' }}
          />
        </button>

        {/* 左上角全局定位：国家 → 城市（链家式位置） */}
        <button
          type="button"
          className="pub-loc"
          onClick={() => setLocOpen(true)}
          aria-label="选择城市"
        >
          <span className="pub-loc__pin">📍</span>
          <span className="pub-loc__text">{cityLabel || '选择城市'}</span>
          <span className="pub-loc__arrow">▾</span>
        </button>

        <nav className="pub-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className="pub-nav__item"
              data-active={item.active}
              onClick={() => navigate(item.to)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="pub-topbar__actions">
          <LanguageSwitcher />
          {token ? (
            <button
              type="button"
              className="pub-btn pub-btn--primary"
              onClick={() => navigate('/portal')}
            >
              {t('home.enterSystem')}
            </button>
          ) : (
            <>
              <button type="button" className="pub-btn" onClick={() => navigate('/login')}>
                {t('home.login')}
              </button>
              <button
                type="button"
                className="pub-btn pub-btn--primary"
                onClick={() => navigate('/register')}
              >
                {t('register.submit')}
              </button>
            </>
          )}
        </div>
      </div>
      <LocationPicker visible={locOpen} onClose={() => setLocOpen(false)} />
    </header>
  )
}

export default PublicTopBar
