import { useTranslation } from 'react-i18next'
import type { ListingFilters } from '../hooks/useListingFilters'

/**
 * 「学校」弹层：选一所学校 + 半径，只看它周边的房源。
 * 这是空间筛选（后端按 haversine 算真实距离），不是「学区房」布尔标签——
 * 泰国没有划片入学，国际学校是「付费 + 距离」逻辑，硬贴标签无据可依。
 */
export default function SchoolPanel({ f }: { f: ListingFilters }) {
  const { t } = useTranslation()
  const { schoolKw, setSchoolKw, schoolId, setSchoolId, filteredSchools, schoolKm, setSchoolKm, schoolRadiusOptions, setSchoolOpen } = f

  return (
    <div className="rent-loc-panel rent-school-panel">
      <div className="rent-loc-panel__body">
        <div className="rent-loc-panel__group-title">{t('publicSite.schoolFilterHint')}</div>
        <input
          className="rent-price-custom__input"
          style={{ width: '100%', marginBottom: 10 }}
          value={schoolKw}
          onChange={(e) => setSchoolKw(e.target.value)}
          placeholder={t('publicSite.schoolSearchPlaceholder')}
        />
        <div className="rent-loc-panel__schools">
          <button
            type="button"
            className={`rent-loc-panel__chip ${!schoolId ? 'rent-loc-panel__chip--active' : ''}`}
            onClick={() => setSchoolId('')}
          >
            {t('publicSite.schoolFilterAny')}
          </button>
          {filteredSchools.map((s: any) => (
            <button
              key={s.id}
              type="button"
              className={`rent-loc-panel__chip ${String(s.id) === schoolId ? 'rent-loc-panel__chip--active' : ''}`}
              onClick={() => setSchoolId(String(s.id))}
            >
              {s.name}
            </button>
          ))}
        </div>
        {!filteredSchools.length && <div className="rent-loc-panel__empty">{t('publicSite.schoolFilterEmpty')}</div>}

        {schoolId && (
          <>
            <div className="rent-loc-panel__group-title" style={{ marginTop: 16 }}>
              {t('publicSite.schoolFilterRadius')}
            </div>
            <div className="rent-loc-panel__chips">
              {schoolRadiusOptions.map((km) => (
                <button
                  key={km}
                  type="button"
                  className={`rent-loc-panel__chip ${schoolKm === km ? 'rent-loc-panel__chip--active' : ''}`}
                  onClick={() => setSchoolKm(km)}
                >
                  {km} {t('publicSite.km')}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="rent-loc-panel__footer">
        <div className="rent-loc-panel__actions">
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--ghost"
            onClick={() => { setSchoolId(''); setSchoolKm(3); setSchoolKw('') }}
          >
            {t('common.reset')}
          </button>
          <button
            type="button"
            className="rent-loc-panel__btn rent-loc-panel__btn--primary"
            onClick={() => setSchoolOpen(false)}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
