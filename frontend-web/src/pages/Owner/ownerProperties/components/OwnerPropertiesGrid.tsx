import { useTranslation } from 'react-i18next'
import DataState from '@/components/DataState'
import OwnerPropertyCard from './OwnerPropertyCard'
import type { OwnerProperty } from '../types'

interface Props {
  loading: boolean
  showError: boolean
  items: OwnerProperty[]
  onRetry: () => void
  onCreate: () => void
  onView: (item: OwnerProperty) => void
  onPublish: (item: OwnerProperty) => void
  onEntrust: () => void
  onEdit: (item: OwnerProperty) => void
  onDelete: (id: string) => void
}

/** 房源卡片区：加载 / 失败 / 空态 / 网格 */
const OwnerPropertiesGrid = ({
  loading,
  showError,
  items,
  onRetry,
  onCreate,
  onView,
  onPublish,
  onEntrust,
  onEdit,
  onDelete,
}: Props) => {
  const { t } = useTranslation()

  if (loading) {
    return <DataState loading loadingText={t('common.loading')} skeletonRows={4} />
  }
  if (showError) {
    return (
      <DataState
        error={t('common.loadFailed')}
        retryText={t('common.retry')}
        onRetry={onRetry}
      />
    )
  }
  if (items.length === 0) {
    return (
      <DataState
        empty
        emptyTitle={t('ownerProperties.empty')}
        emptyAction={
          <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={onCreate}>
            {t('ownerProperties.createTitle')}
          </button>
        }
      />
    )
  }
  return (
    <div className="rent-grid rent-grid--auto">
      {items.map((item) => (
        <OwnerPropertyCard
          key={item.id}
          item={item}
          onView={onView}
          onPublish={onPublish}
          onEntrust={onEntrust}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

export default OwnerPropertiesGrid
