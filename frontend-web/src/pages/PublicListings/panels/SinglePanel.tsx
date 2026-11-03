import { useTranslation } from 'react-i18next'

/**
 * 「户型 / 状态」共用的单选弹层：快捷 chips + 重置/确定。
 */
export default function SinglePanel({
  title,
  options,
  activeKey,
  onPick,
  onClose,
}: {
  title: string
  options: { value: string; label: string }[]
  activeKey: string
  onPick: (v: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rent-loc-panel rent-quick-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group-title">{title}</div>
        <div className="rent-loc-panel__chips">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`rent-loc-panel__chip ${activeKey === o.value ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => onPick(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--ghost" onClick={() => onPick('')}>
            {t('common.reset')}
          </button>
          <button type="button" className="rent-loc-panel__btn rent-loc-panel__btn--primary" onClick={onClose}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
