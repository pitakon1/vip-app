import { useTranslation } from 'react-i18next'

interface Props {
  total: number
  page: number
  totalPages: number
  pageNumbers: (number | string)[]
  onPage: (page: number) => void
}

/** Pagination（对齐管理员端 rent-pagination） */
const OwnerPropertiesPagination = ({ total, page, totalPages, pageNumbers, onPage }: Props) => {
  const { t } = useTranslation()

  if (total <= 0) return null

  return (
    <div className="rent-pagination">
      <span className="rent-pagination__info">{t('ownerProperties.totalRecords', { total })}</span>
      <button
        className="rent-pagination__btn"
        aria-label={t('ownerProperties.prevPage')}
        disabled={page <= 1}
        onClick={() => onPage(Math.max(1, page - 1))}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      {pageNumbers.map((n, idx) =>
        n === 'prev-ellipsis' || n === 'next-ellipsis' ? (
          <span className="rent-pagination__info" key={idx} style={{ margin: '0 4px' }}>...</span>
        ) : (
          <button
            key={idx}
            className="rent-pagination__btn"
            data-active={page === n}
            onClick={() => onPage(Number(n))}
          >
            {n}
          </button>
        )
      )}
      <button
        className="rent-pagination__btn"
        aria-label={t('ownerProperties.nextPage')}
        disabled={page >= totalPages}
        onClick={() => onPage(Math.min(totalPages, page + 1))}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  )
}

export default OwnerPropertiesPagination
