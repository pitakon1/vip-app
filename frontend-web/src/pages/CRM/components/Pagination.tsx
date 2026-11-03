import { useTranslation } from 'react-i18next'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  itemCount: number
  onPrev: () => void
  onNext: () => void
}

export default function Pagination({ page, pageSize, total, itemCount, onPrev, onNext }: PaginationProps) {
  const { t } = useTranslation()
  return (
    <div className="rent-pagination">
      <span className="rent-pagination__info">{t('common.total')} {total} {t('common.items')}</span>
      <button
        className="rent-pagination__btn"
        aria-label={t('crm.ariaPrev')}
        onClick={onPrev}
        disabled={page <= 1}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button className="rent-pagination__btn" data-active={true}>{page}</button>
      <button
        className="rent-pagination__btn"
        aria-label={t('crm.ariaNext')}
        onClick={onNext}
        disabled={itemCount < pageSize}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  )
}
