/**
 * 房源列表区：三态（失败/加载/空）+ 卡片网格 + 分页。
 * 纯结构拆分自 pages/Properties/index.tsx，类名与交互保持不变。
 */
import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import type { Project, Property } from '@/types'
import PropertyCard from './PropertyCard'

export default function PropertyList({
  items,
  total,
  loading,
  loadError,
  isFiltering,
  page,
  totalPages,
  pageNumbers,
  projects,
  propertyTypeMap,
  statusLabelMap,
  isManageMode,
  onRetry,
  onPageChange,
  onPublish,
  onEdit,
  onDelete,
}: {
  items: Property[]
  total: number
  loading: boolean
  loadError: string | null
  isFiltering: boolean
  page: number
  totalPages: number
  pageNumbers: (number | string)[]
  projects: Project[]
  propertyTypeMap: Record<string, string>
  statusLabelMap: Record<string, string>
  isManageMode: boolean
  onRetry: () => void
  onPageChange: (page: number) => void
  onPublish: (item: Property) => void
  onEdit: (item: Property) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      {/* Property Card Grid（对齐原型 rent-grid--auto） */}
      {loadError && items.length === 0 ? (
        <DataState error={loadError} retryText={t('common.retry')} onRetry={onRetry} />
      ) : loading && items.length === 0 ? (
        <DataState loading loadingText={t('common.loading')} skeletonRows={6} />
      ) : items.length === 0 ? (
        <DataState empty emptyTitle={t('common.noData')} filtered={isFiltering} />
      ) : (
        <div className="rent-grid rent-grid--auto">
          {items.map((item) => (
            <PropertyCard
              key={item.id}
              item={item}
              projects={projects}
              propertyTypeMap={propertyTypeMap}
              statusLabelMap={statusLabelMap}
              isManageMode={isManageMode}
              onPublish={onPublish}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Pagination（对齐原型 rent-pagination） */}
      {total > 0 && (
        <div className="rent-pagination">
          <span className="rent-pagination__info">{t('propertiesPage.totalRecords', { total })}</span>
          <button
            className="rent-pagination__btn"
            aria-label={t('propertiesPage.prevPage')}
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
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
                onClick={() => onPageChange(Number(n))}
              >
                {n}
              </button>
            )
          )}
          <button
            className="rent-pagination__btn"
            aria-label={t('propertiesPage.nextPage')}
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      )}
    </>
  )
}
