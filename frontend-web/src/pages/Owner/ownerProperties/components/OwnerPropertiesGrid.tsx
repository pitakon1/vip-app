import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
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
        emptySub={t('propertyBinding.noPropertySub')}
        emptyAction={
          <div className="rent-flex rent-gap-2">
            {/* C 端只有一种用户：没有房源时先引导绑定房产，再回来新建 */}
            <Link className="rent-btn rent-btn--primary rent-btn--sm" to="/tenant/property-binding">
              {t('menu.addProperty')}
            </Link>
            <button type="button" className="rent-btn rent-btn--secondary rent-btn--sm" onClick={onCreate}>
              {t('ownerProperties.createTitle')}
            </button>
          </div>
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
