import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  displayCountry,
  flagEmoji,
  searchCountries,
  type Country,
} from '@/data/countries'
import './country-select.css'

interface CountrySelectProps {
  value: Country
  onChange: (country: Country) => void
  id?: string
}

/**
 * 可搜索的国家/区号选择器：支持按中文名、英文名、ISO 代码、区号（+66 / 66）检索。
 * 数据来自 src/data/countries.ts（由 node scripts/sync-countries.mjs 生成）。
 */
export default function CountrySelect({ value, onChange, id }: CountrySelectProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const list = useMemo(() => searchCountries(query), [query])
  const lang = i18n.language

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <div className="country-select" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="country-select__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={displayCountry(value, lang)}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="country-select__flag">{flagEmoji(value.iso2)}</span>
        <span className="country-select__code">+{value.dial}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="country-select__pop">
          <input
            className="country-select__search"
            type="search"
            autoFocus
            placeholder={t('login.searchCountry')}
            aria-label={t('login.searchCountry')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="country-select__list" role="listbox">
            {list.map((c) => (
              <li
                key={c.iso2}
                role="option"
                aria-selected={c.iso2 === value.iso2}
                className={`country-select__item ${c.iso2 === value.iso2 ? 'is-active' : ''}`}
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                }}
              >
                <span className="country-select__flag">{flagEmoji(c.iso2)}</span>
                <span className="country-select__name">{lang.startsWith('zh') ? c.zh : c.en}</span>
                <span className="country-select__dial">+{c.dial}</span>
              </li>
            ))}
            {list.length === 0 && (
              <li className="country-select__empty">{t('login.countryNotFound')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
