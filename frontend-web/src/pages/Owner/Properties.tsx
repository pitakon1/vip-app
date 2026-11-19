import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Drawer } from 'antd'
import { useTranslation } from 'react-i18next'
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
import OwnerPropertyBindingPanel from './ownerProperties/components/OwnerPropertyBindingPanel'

const Properties = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const list = useOwnerPropertiesList()
  const actions = useOwnerPropertyActions({ refresh: list.refresh, queryKey: list.queryKey })
  // 添加 / 认领房产已收敛到本页：支持 ?add=1 从其它页面直接打开
  const [bindingOpen, setBindingOpen] = useState(searchParams.get('add') === '1')

  useEffect(() => {
    if (searchParams.get('add') === '1') setBindingOpen(true)
  }, [searchParams])

  const closeBinding = () => {
    setBindingOpen(false)
    if (searchParams.get('add')) {
      const next = new URLSearchParams(searchParams)
      next.delete('add')
      setSearchParams(next, { replace: true })
    }
  }

  return (
    <div className="rent-main">
      <OwnerPropertiesHeader onCreate={actions.openCreate} onAdd={() => setBindingOpen(true)} />

      <OwnerPropertiesStats
        statusCount={list.statusCount}
        totalProps={list.totalProps}
        occupancyPct={list.occupancyPct}
      />

      <OwnerPropertiesFilterBar filters={list.filters} setFilter={list.setFilter} total={list.total} />

      <OwnerPropertiesGrid
        loading={list.loading}
        showError={list.showError}
        items={list.pagedItems}
        onRetry={list.refresh}
        onCreate={actions.openCreate}
        onAdd={() => setBindingOpen(true)}
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

      <Drawer
        open={bindingOpen}
        onClose={closeBinding}
        width={720}
        title={t('propertyBinding.title')}
        destroyOnClose
      >
        <OwnerPropertyBindingPanel onClose={closeBinding} onChanged={list.refresh} />
      </Drawer>
    </div>
  )
}

export default Properties
