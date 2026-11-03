import { useTranslation } from 'react-i18next'
import type { ListingFilters } from '../hooks/useListingFilters'

/**
 * 「区域 | 地铁」下拉面板（对齐贝壳交互）。
 * 区域=实时单选、与地铁互斥；地铁=草稿多选，确定后提交。
 */

const LocIcon = ({ kind }: { kind: 'area' | 'metro' }) => (
  kind === 'area'
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="12" rx="2" /><path d="M9 8h6M6 21l1.5-3h9L18 21M8 9v2M12 9v2M16 9v2" /></svg>
)

export default function LocationPanel({ f }: { f: ListingFilters }) {
  const { t } = useTranslation()
  const {
    locTab, setLocTab, citySel, usingBackendDistricts, backendDistricts, backendDistrict,
    setBackendDistrict, cityDistricts, districtSel, setDistrictSel, setMetroSel, setMetroDraft,
    applyDistrict, cityMetroLines, metroLine, setMetroLine, activeLine, metroDraft, toggleStation,
    clearMetroDraft, resetLoc, confirmMetro, setLocOpen,
  } = f

  return (
    <div className="rent-loc-panel">
      <div className="rent-loc-panel__tabs">
        {(['area', 'metro'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rent-loc-panel__tab ${locTab === tab ? 'rent-loc-panel__tab--active' : ''}`}
            onClick={() => setLocTab(tab)}
          >
            <LocIcon kind={tab} />
            {tab === 'area' ? t('locate.area') : t('locate.metro')}
          </button>
        ))}
      </div>

      {locTab === 'area' ? (
        // 链家样式：只列当前定位城市的 区/街道 chips（国家·城市在顶栏左上角定位器选择）
        <div className="rent-loc-panel__area rent-loc-panel__area--flat">
          <div className="rent-loc-panel__stations-title">{citySel.cityLabel} · {t('publicSite.districtStreet')}</div>
          <div className="rent-loc-panel__chips">
            {usingBackendDistricts ? (
              <>
                <button
                  type="button"
                  className={`rent-loc-panel__chip ${backendDistrict === null ? 'rent-loc-panel__chip--active' : ''}`}
                  onClick={() => { setBackendDistrict(null); setMetroSel([]); setMetroDraft([]) }}
                >
                  {t('locate.all')}
                </button>
                {backendDistricts.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    className={`rent-loc-panel__chip ${backendDistrict === d.value ? 'rent-loc-panel__chip--active' : ''}`}
                    onClick={() => { setBackendDistrict(d.value); setDistrictSel(null); setMetroSel([]); setMetroDraft([]) }}
                  >
                    {d.label}
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`rent-loc-panel__chip ${districtSel === null ? 'rent-loc-panel__chip--active' : ''}`}
                  onClick={() => applyDistrict(null)}
                >
                  {t('locate.all')}
                </button>
                {cityDistricts.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={`rent-loc-panel__chip ${districtSel === d.key ? 'rent-loc-panel__chip--active' : ''}`}
                    onClick={() => applyDistrict(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
                {!cityDistricts.length && (
                  <span className="rent-loc-panel__empty">{t('common.noData')}</span>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rent-loc-panel__metro">
          <div className="rent-loc-panel__lines">
            {cityMetroLines.map((l) => (
              <button
                key={l.key}
                type="button"
                className={`rent-loc-panel__line ${metroLine === l.key ? 'rent-loc-panel__line--active' : ''}`}
                onClick={() => setMetroLine(l.key)}
              >
                {l.cityLabel} · {l.name}
              </button>
            ))}
          </div>
          <div className="rent-loc-panel__stations">
            <div className="rent-loc-panel__stations-title">{activeLine ? `${activeLine.cityLabel} · ${activeLine.name}` : ''}</div>
            <div className="rent-loc-panel__chips">
              {activeLine?.stations.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={`rent-loc-panel__chip ${metroDraft.includes(s.name) ? 'rent-loc-panel__chip--active' : ''}`}
                  onClick={() => toggleStation(s.name)}
                >
                  {s.name}
                </button>
              ))}
              {activeLine && !activeLine.stations.length && <span className="rent-loc-panel__empty">{t('common.noData')}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="rent-loc-panel__footer">
        {locTab === 'metro' && (
          <span className="rent-loc-panel__count">
            {t('locate.selectedCount')} <strong>{metroDraft.length}</strong>
          </span>
        )}
        <div className="rent-loc-panel__actions">
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
            onClick={() => (locTab === 'metro' ? clearMetroDraft() : resetLoc())}
          >
            {t('common.reset')}
          </button>
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--primary"
            onClick={() => (locTab === 'metro' ? confirmMetro() : setLocOpen(false))}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
