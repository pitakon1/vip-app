import { useTranslation } from 'react-i18next'
import { CHIPS, makeChipLabelMap } from '../constants'
import type { FilterKey } from '../types'

interface Props {
  keyword: string
  onKeywordChange: (value: string) => void
  filter: FilterKey
  onFilterChange: (value: FilterKey) => void
}

/** 搜索框 + 状态筛选胶囊 */
const PaymentsSearchBar = ({ keyword, onKeywordChange, filter, onFilterChange }: Props) => {
  const { t } = useTranslation()
  const chipLabelMap = makeChipLabelMap(t)

  return (
    <>
      <div className="rent-pay-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rent-ink-3)" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          placeholder={t('tenantPayments.searchPlaceholder')}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
        />
      </div>

      <div className="rent-chips no-scrollbar">
        {CHIPS.map((k) => (
          <button
            key={k}
            className="rent-chip"
            data-active={filter === k}
            onClick={() => onFilterChange(k)}
          >
            {chipLabelMap[k]}
          </button>
        ))}
      </div>
    </>
  )
}

export default PaymentsSearchBar
