import { useNavigate } from 'react-router-dom'
import '../Properties/properties.css'
import './dashboard.css'
import { useOwnerPropertiesList } from './ownerProperties/hooks/useOwnerPropertiesList'
import { useOwnerPropertyActions } from './ownerProperties/hooks/useOwnerPropertyActions'
import OwnerPropertiesHeader from './ownerProperties/components/OwnerPropertiesHeader'
import OwnerPropertiesStats from './ownerProperties/components/OwnerPropertiesStats'
import OwnerPropertiesFilterBar from './ownerProperties/components/OwnerPropertiesFilterBar'
import OwnerPropertiesGrid from './ownerProperties/components/OwnerPropertiesGrid'
import OwnerPropertiesPagination from './ownerProperties/components/OwnerPropertiesPagination'
import OwnerPropertyEditorModal from './ownerProperties/components/OwnerPropertyEditorModal'

const Properties = () => {
  const navigate = useNavigate()
  const list = useOwnerPropertiesList()
  const actions = useOwnerPropertyActions({ refresh: list.refresh, queryKey: list.queryKey })

  return (
    <div className="rent-main">
      <OwnerPropertiesHeader onCreate={actions.openCreate} />

      <OwnerPropertiesStats
        statusCount={list.statusCount}
        totalProps={list.totalProps}
        occupancyPct={list.occupancyPct}
      />

      <OwnerPropertiesFilterBar filters={list.filters} setFilter={list.setFilter} />

      <OwnerPropertiesGrid
        loading={list.loading}
        showError={list.showError}
        items={list.pagedItems}
        onRetry={list.refresh}
        onCreate={actions.openCreate}
        onView={(item) => navigate(`/properties/detail/${item.id}`)}
        onPublish={actions.handlePublish}
        onEntrust={() => navigate('/tenant/marketing')}
        onEdit={actions.openEdit}
        onDelete={actions.handleDelete}
      />

      <OwnerPropertiesPagination
        total={list.total}
        page={list.page}
        totalPages={list.totalPages}
        pageNumbers={list.pageNumbers}
        onPage={list.setPage}
      />

      <OwnerPropertyEditorModal
        open={actions.modalOpen}
        editingId={actions.editingId}
        record={actions.editingRecord}
        form={actions.form}
        submitting={actions.submitting}
        photoFileList={actions.photoFileList}
        onCancel={actions.handleCancel}
        onSubmit={actions.handleSubmit}
        onRemovePhoto={actions.removePhoto}
        onUploadPhoto={actions.uploadPhoto}
      />
    </div>
  )
}

export default Properties
