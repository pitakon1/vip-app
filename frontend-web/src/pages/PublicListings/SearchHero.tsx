import { useTranslation } from 'react-i18next'

/**
 * 搜索 Hero（对齐原型 rent-search-hero）。
 */
export default function SearchHero({
  keyword,
  onKeywordChange,
  onSearch,
}: {
  keyword: string
  onKeywordChange: (v: string) => void
  onSearch: () => void
}) {
  const { t } = useTranslation()
  const searchTags = [t('browse.nearMetro'), t('browse.furnished'), t('browse.moveIn'), t('browse.seaView'), t('browse.nearMall')]

  return (
    <section className="rent-search-hero">
      <span className="rent-search-hero__decor rent-search-hero__decor--1"></span>
      <span className="rent-search-hero__decor rent-search-hero__decor--2"></span>
      <span className="rent-search-hero__decor rent-search-hero__decor--3"></span>
      <div className="rent-search-hero__inner">
        <h1 className="rent-search-hero__title">{t('browse.findTitle')}</h1>
        <p className="rent-search-hero__subtitle">{t('browse.findSubtitle')}</p>
        <div className="rent-search-hero__bar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t('browse.searchPlaceholder')}
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          />
          <button className="rent-search-hero__search-btn" onClick={onSearch}>
            {t('common.search')}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
        <div className="rent-search-hero__tags">
          {searchTags.map((tag) => (
            <button type="button" className="rent-search-hero__tag" key={tag} onClick={() => onKeywordChange(tag)}>{tag}</button>
          ))}
        </div>
      </div>
    </section>
  )
}
