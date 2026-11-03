import { useTranslation } from 'react-i18next'
import type { Placed } from '../types'

/** 落框成品（可按住改位 + ✕ 删除；不展示任何坐标数字） */
const PlacedBox = ({
  p,
  moving,
  onMoveStart,
  onRemove,
}: {
  p: Placed
  moving: boolean
  onMoveStart: (key: number) => (e: React.PointerEvent) => void
  onRemove: (key: number) => void
}) => {
  const { t } = useTranslation()
  return (
    <div
      className={`kf-placed${moving ? ' kf-placed--moving' : ''}`}
      onPointerDown={onMoveStart(p.key)}
      title={t('contracts.movePlaced')}
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%`, touchAction: 'none' }}
    >
      {p.imageDataUrl ? (
        <img src={p.imageDataUrl} alt="" draggable={false} loading="eager" decoding="async" />
      ) : (
        // date 类：不落图，展示当天日期样式（后端按同日渲染进 PDF）
        <span className="kf-placed__date">{new Date().toISOString().slice(0, 10)}</span>
      )}
      <button
        type="button"
        className="kf-placed__del"
        draggable={false}
        title={t('contracts.removePlaced')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(p.key)
        }}
      >
        ×
      </button>
    </div>
  )
}

export default PlacedBox
