import { useEffect, useState } from 'react'
import api from '@/lib/api'
import './company.css'

interface CompanyInfo {
  name: string
  version: string
  address: string
  phone: string
  email: string
  social_media: {
    wechat?: string
    line?: string
    whatsapp?: string
    [k: string]: any
  }
}

const FALLBACK: CompanyInfo = {
  name: 'VIP 租赁管理系统',
  version: '1.0.0',
  address: '请配置公司地址',
  phone: '请配置公司电话',
  email: '请配置公司邮箱',
  social_media: { wechat: '', line: '', whatsapp: '' },
}

const Company = () => {
  const [info, setInfo] = useState<CompanyInfo>(FALLBACK)

  useEffect(() => {
    api
      .get('/company/info')
      .then((res) => setInfo(res.data || FALLBACK))
      .catch(() => setInfo(FALLBACK))
  }, [])

  const socials = [
    { key: 'wechat', label: '微信', icon: 'M8.5 4a6.5 6.5 0 0 0 0 13h2v3l3-3h1a6.5 6.5 0 0 0 0-13h-6z M7 9h5 M7 12h3', value: info.social_media?.wechat },
    { key: 'line', label: 'LINE', icon: 'M8 7v6l4 4 4-4V7', value: info.social_media?.line },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z', value: info.social_media?.whatsapp },
  ].filter((s) => s.value)

  const contactCards = [
    {
      label: '公司地址',
      value: info.address,
      icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
    },
    {
      label: '联系电话',
      value: info.phone,
      icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    },
    {
      label: '电子邮箱',
      value: info.email,
      icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
    },
  ]

  return (
    <div className="rent-main">
      {/* Brand Hero */}
      <section className="cmp-hero">
        <div className="cmp-hero__decor cmp-hero__decor--1" />
        <div className="cmp-hero__decor cmp-hero__decor--2" />
        <div className="cmp-hero__content">
          <span className="cmp-hero__eyebrow">About Us</span>
          <h2 className="cmp-hero__title">{info.name}</h2>
          <p className="cmp-hero__subtitle">
            专业房地产租赁与资产管理平台，提供房屋托管、出租、出售一站式服务，
            让每一处资产都创造价值。
          </p>
        </div>
        <div className="cmp-hero__badge">v{info.version}</div>
      </section>

      {/* Contact Cards */}
      <section className="cmp-section">
        <div className="cmp-section__head">
          <h3 className="cmp-section__title">联系我们</h3>
          <span className="cmp-section__hint">欢迎来电或到访咨询</span>
        </div>
        <div className="cmp-contact-grid">
          {contactCards.map((c) => (
            <div className="cmp-contact-card" key={c.label}>
              <div className="cmp-contact-card__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={c.icon} />
                </svg>
              </div>
              <div className="cmp-contact-card__label">{c.label}</div>
              <div className="cmp-contact-card__value">{c.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Social Media */}
      {socials.length > 0 && (
        <section className="cmp-section">
          <div className="cmp-section__head">
            <h3 className="cmp-section__title">社交媒体</h3>
            <span className="cmp-section__hint">关注我们获取最新房源动态</span>
          </div>
          <div className="cmp-social-grid">
            {socials.map((s) => (
              <div className="cmp-social-card" key={s.key}>
                <div className="cmp-social-card__icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={s.icon} />
                  </svg>
                </div>
                <div>
                  <div className="cmp-social-card__label">{s.label}</div>
                  <div className="cmp-social-card__value">{s.value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Working Hours */}
      <section className="cmp-section">
        <div className="cmp-section__head">
          <h3 className="cmp-section__title">营业时间</h3>
          <span className="cmp-section__hint">服务时间</span>
        </div>
        <div className="cmp-hours">
          <div className="cmp-hours__row">
            <span>周一 至 周五</span>
            <span>09:00 – 18:00</span>
          </div>
          <div className="cmp-hours__row">
            <span>周六</span>
            <span>09:00 – 12:00</span>
          </div>
          <div className="cmp-hours__row">
            <span>周日 / 法定节假日</span>
            <span>休息</span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Company
