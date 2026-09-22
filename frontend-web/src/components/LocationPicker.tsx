/**
 * 全局定位选择器（Web）。国家 → 城市 两级底部弹层（链家式定位面板）。
 * 读取/写入 useLocationStore；用于公开站点顶栏左上角「国家/城市」定位。
 * 结构：左栏国家，右栏该国家下的城市，选中即写入全局 Store。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLocationStore,
  LOCATION_GROUPS,
  type LocationSelection,
} from '@/stores/location'
import './LocationPicker.css'

interface Props {
  visible: boolean
  onClose: () => void
}

const LocationPicker = ({ visible, onClose }: Props) => {
  const { t } = useTranslation()
  const selection = useLocationStore((s) => s.selection)
  const select = useLocationStore((s) => s.select)

  const [country, setCountry] = useState<string>(
    selection.country || LOCATION_GROUPS[0]?.country || '',
  )

  const currentGroup = LOCATION_GROUPS.find((g) => g.country === country)

  const handleSelectCity = (sel: LocationSelection) => {
    select(sel)
    onClose()
  }

  if (!visible) return null

  return (
    <div className="lp-mask" onClick={onClose}>
      <div className="lp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="lp-head">
          <span className="lp-title">{t('locate.selectCity')}</span>
          <button type="button" className="lp-close" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <div className="lp-body">
          {/* 左栏：国家 */}
          <div className="lp-left">
            {LOCATION_GROUPS.map((g) => {
              const active = g.country === country
              return (
                <button
                  key={g.country}
                  type="button"
                  className={`lp-left-item${active ? ' lp-left-item--active' : ''}`}
                  onClick={() => setCountry(g.country)}
                >
                  <span className={`lp-left-text${active ? ' lp-left-text--active' : ''}`}>
                    {g.country}
                  </span>
                  <span className={`lp-left-sub${active ? ' lp-left-sub--active' : ''}`}>
                    {t('locate.cityCount', { count: g.cities.length })}
                  </span>
                </button>
              )
            })}
          </div>
          {/* 右栏：城市 */}
          <div className="lp-right lp-scroll">
            {currentGroup?.cities.map((c) => {
              const active = selection.cityKey === c.cityKey
              return (
                <button
                  key={c.cityKey}
                  type="button"
                  className="lp-right-item"
                  onClick={() =>
                    handleSelectCity({
                      country: c.country,
                      cityKey: c.cityKey,
                      cityLabel: c.cityLabel,
                    })
                  }
                >
                  <span className={`lp-right-text${active ? ' lp-right-text--active' : ''}`}>
                    {c.cityLabel}
                  </span>
                  <span className="lp-right-sub">{t('locate.districtCount', { count: c.children.length })}</span>
                  <span className={`lp-right-check${active ? ' lp-right-check--active' : ''}`}>
                    {active ? '✓' : '○'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LocationPicker