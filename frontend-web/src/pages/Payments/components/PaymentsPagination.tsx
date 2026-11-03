import { useTranslation } from 'react-i18next'

interface Props {
  total: number
  page: number
  totalPages: number
  pageNumbers: (number | string)[]
  setPage: (page: number) => void
}

/** 分页（对齐原型 rent-pagination 结构） */
export default function PaymentsPagination({
  total,
  page,
  totalPages,
  pageNumbers,
  setPage,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="rent-pagination">
      <span className="rent-pagination__info">{t('payments.pageInfo', { count: total.toLocaleString() })}</span>
      <button
        className="rent-pagination__btn"
        aria-label={t('payments.ariaPrev')}
        onClick={() => setPage(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      {pageNumbers.map((n, idx) =>
        n === 'prev-ellipsis' || n === 'next-ellipsis' ? (
          <span className="rent-pagination__info" key={idx} style={{ margin: '0 4px' }}>...</span>
        ) : (
          <button
            key={idx}
            className="rent-pagination__btn"
            data-active={page === n}
            onClick={() => setPage(Number(n))}
          >
            {n}
          </button>
        )
      )}
      <button
        className="rent-pagination__btn"
        aria-label={t('payments.ariaNext')}
        onClick={() => setPage(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  )
}
