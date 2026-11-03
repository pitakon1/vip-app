import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DropOpt } from '../types'

// 可搜索下拉选择器（员工 / 分销商）
export default function SearchSelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string
  value: string
  options: DropOpt[]
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const current = options.find((o) => o.value === value)
  const filtered = kw.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(kw.trim().toLowerCase()))
    : options
  return (
    <div className="rent-search-select">
      <button type="button" className="rent-search-select__trigger" onClick={() => setOpen(!open)}>
        <span className={current ? '' : 'rent-text-muted'}>{current ? current.label : placeholder}</span>
        <span className="rent-search-select__arrow">▾</span>
      </button>
      {open && (
        <div className="rent-search-select__menu">
          <input
            autoFocus
            className="rent-search-select__search"
            placeholder={t('commissionRules.search')}
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          {filtered.length === 0 && <div className="rent-search-select__empty">{t('commissionRules.noMatch')}</div>}
          {filtered.map((o) => (
            <div
              key={o.value}
              className={`rent-search-select__option ${value === o.value ? 'is-active' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
                setKw('')
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
