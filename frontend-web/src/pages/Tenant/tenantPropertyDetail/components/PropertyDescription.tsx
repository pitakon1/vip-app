import { useTranslation } from 'react-i18next'

interface Props {
  description?: string
  translatedDesc: string | null
  transTarget: string
  translating: boolean
  onTargetChange: (value: string) => void
  onTranslate: () => void
  onViewOriginal: () => void
}

/** 房源描述与翻译 */
const PropertyDescription = ({
  description,
  translatedDesc,
  transTarget,
  translating,
  onTargetChange,
  onTranslate,
  onViewOriginal,
}: Props) => {
  const { t } = useTranslation()

  return (
    <section className="rent-detail-card">
      <div className="rent-detail-title">{t('tenantPropertyDetail.propertyDesc')}</div>
      {description ? (
        <>
          <p className="rent-detail-desc">{translatedDesc || description}</p>
          <div className="rent-detail-trans">
            <select
              className="rent-pay-form-select"
              style={{ maxWidth: 160 }}
              value={transTarget}
              onChange={(e) => onTargetChange(e.target.value)}
            >
              <option value="zh">{t('language.zh')}</option>
              <option value="en">{t('language.en')}</option>
              <option value="th">{t('language.th')}</option>
            </select>
            <button
              className="rent-btn rent-btn--ghost rent-btn--sm"
              type="button"
              disabled={translating}
              onClick={onTranslate}
            >
              {translating ? t('tenantPropertyDetail.notTranslating') : t('tenantPropertyDetail.translateDesc')}
            </button>
            {translatedDesc && (
              <button
                className="rent-btn rent-btn--ghost rent-btn--sm"
                type="button"
                onClick={onViewOriginal}
              >
                {t('tenantPropertyDetail.viewOriginal')}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="rent-empty">{t('tenantPropertyDetail.emptyDesc')}</div>
      )}
    </section>
  )
}

export default PropertyDescription
