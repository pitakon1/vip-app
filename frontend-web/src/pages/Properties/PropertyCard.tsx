/**
 * 房源卡片渲染（纯结构拆分自 pages/Properties/index.tsx）。
 * 类名、文案与交互保持不变。
 */
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Project, Property } from '@/types'
import { roomFacts } from '@/lib/displayValue'

// 户型剪影图标（与首页/公开列表同一套 lucide 路径，缺封面时作为低对比占位）
const typeIconPath = (pt: string): string => {
  switch (pt) {
    case 'villa':
    case 'house':
      return 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
    case 'shop':
    case 'commercial':
      return 'M3 9l1-5h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M9 21v-6h6v6'
    case 'office':
      return 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20'
    default: // apartment / condo
      return 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4'
  }
}

const formatRent = (v: any) => Number(v || 0).toLocaleString()

export default function PropertyCard({
  item,
  projects,
  propertyTypeMap,
  statusLabelMap,
  isManageMode,
  onPublish,
  onEdit,
  onDelete,
}: {
  item: Property
  projects: Project[]
  propertyTypeMap: Record<string, string>
  statusLabelMap: Record<string, string>
  isManageMode: boolean
  onPublish: (item: Property) => void
  onEdit: (item: Property) => void
  onDelete: (id: string) => void
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // project_id 是 UUID，直接展示会露出数据库主键；必须经 projects 表解析成项目名称
  const projectName =
    (item.project_id && projects.find((p) => p.id === item.project_id)?.name) || item.building || ''
  const title = projectName ? `${projectName} · ${item.room_number || ''}` : (item.address || item.room_number || '—')
  const ptype = propertyTypeMap[item.property_type] || item.property_type || t('propertyType.apartment')
  const statusKey = (item.status || 'vacant').toLowerCase()
  // 缺失字段保持 null，不补 0：无数据时不渲染该段，避免「0㎡ / 0卧 / 0浴」假信息
  const { bedrooms: beds, bathrooms: baths, sizeSqm: size } = roomFacts(item)
  const rent = Number(item.monthly_rent || 0)

  const statusTone =
    statusKey === 'rented' ? 'success'
    : statusKey === 'vacant' ? 'warning'
    : statusKey === 'maintenance' ? 'info'
    : statusKey === 'renewing' ? 'warning'
    : 'neutral'

  return (
    <div
      className="rent-card rent-prop-card"
      onClick={() => navigate(`/properties/detail/${item.id}`)}
    >
      {/* 头部暖灰占位 + 低对比户型剪影（不按 id 生成纯色块） */}
      <div className="rent-prop-card__banner" data-photo="false">
        <svg className="rent-prop-card__banner-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={typeIconPath(item.property_type || '')} />
        </svg>
        <span className="rent-prop-card__type-badge">{ptype}</span>
      </div>

      {/* 主体 */}
      <div className="rent-prop-card__body">
        <h3 className="rent-prop-card__name">{title}</h3>
        <p className="rent-prop-card__address">{item.address || '—'}</p>
        <div className="rent-prop-card__stats">
          {size != null && (
            <span className="rent-prop-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              {size}㎡
            </span>
          )}
          {beds != null && (
            <span className="rent-prop-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8V6a2 2 0 0 1 2-2h4"/></svg>
              {beds} {t('propertiesPage.unitBed')}
            </span>
          )}
          {baths != null && (
            <span className="rent-prop-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/><path d="M2 12h20v3a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="7" y1="19" x2="7" y2="22"/><line x1="17" y1="19" x2="17" y2="22"/></svg>
              {baths} {t('propertiesPage.unitBath')}
            </span>
          )}
        </div>
        <div className="rent-prop-card__rent-row">
          <span className="rent-prop-card__rent">฿{formatRent(rent)}<span className="rent-prop-card__rent-unit">{t('propertiesPage.perMonth')}</span></span>
          <span className={`rent-badge rent-badge--${statusTone}`}>
            {statusLabelMap[statusKey] || item.status}
          </span>
        </div>
      </div>

      {/* 卡片底部操作 */}
      <div className="rent-card__footer rent-prop-card__footer">
        <button
          type="button"
          className="rent-btn rent-btn--ghost rent-btn--sm"
          onClick={(e) => { e.stopPropagation(); navigate(`/properties/detail/${item.id}`) }}
        >
          {t('property.viewDetail')}
        </button>
        {isManageMode && (
          <>
            <button
              className="rent-btn rent-btn--primary rent-btn--sm"
              onClick={(e) => { e.stopPropagation(); onPublish(item) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              {t('listing.actionList')}
            </button>
            <button
              className="rent-btn rent-btn--secondary rent-btn--sm"
              onClick={(e) => { e.stopPropagation(); onEdit(item) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
              {t('common.edit')}
            </button>
            <button
              className="rent-btn rent-btn--danger rent-btn--sm"
              onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              {t('common.delete')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
