import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * 自定义分页（对齐原型 rent-pagination）。
 */
export default function ListingPagination({
  page,
  pageCount,
  pageNumbers,
  total,
  setPage,
}: {
  page: number
  pageCount: number
  pageNumbers: number[]
  total: number
  setPage: (p: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rent-pagination">
      <span className="rent-pagination__count">
        {t('common.total')} {total} {t('property.units')}
      </span>
      <div className="rent-pagination__pages">
        <button className="rent-page-btn" type="button" aria-label={t('publicSite.ariaPrev')} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        {pageNumbers.map((p, i) => {
          const prev = pageNumbers[i - 1]
          const gap = !!prev && p - prev > 1
          return (
            <Fragment key={p}>
              {gap && <span className="rent-page-btn rent-page-btn--ellipsis">···</span>}
              <button className="rent-page-btn" type="button" data-active={page === p} onClick={() => setPage(p)}>{p}</button>
            </Fragment>
          )
        })}
        <button className="rent-page-btn" type="button" aria-label={t('publicSite.ariaNext')} disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  )
}
