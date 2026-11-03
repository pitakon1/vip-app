import { useTranslation } from 'react-i18next'
import { formatMoney } from '@/lib/money'
import { ICONS, Icon } from '../icons'
import type { Benchmark, FactItem } from '../types'

interface Props {
  facts: FactItem[]
  benchmark: Benchmark | null
}

/** 核心信息 + 同小区均价横评 */
const PropertyCoreInfo = ({ facts, benchmark }: Props) => {
  const { t } = useTranslation()

  return (
    <section className="rent-detail-card">
      <div className="rent-detail-title">{t('tenantPropertyDetail.coreInfo')}</div>
      <div className="rent-detail-facts__grid">
        {facts.map((f) => (
          <div className="rent-detail-fact" key={f.key}>
            <span className="rent-detail-fact__icon">
              <Icon d={f.icon} />
            </span>
            <div className="rent-detail-fact__value">{f.value}</div>
            <div className="rent-detail-fact__label">{f.label}</div>
          </div>
        ))}
      </div>
      {benchmark && (
        <div className="rent-v17-benchmark">
          <Icon d={ICONS.check} />
          {t('tenantPropertyDetail.avgPrice', {
            amount: formatMoney(benchmark.avg, benchmark.currency),
            rel: benchmark.lower ? t('tenantPropertyDetail.belowAvg') : t('tenantPropertyDetail.aboveAvg'),
            pct: benchmark.pct,
          })}
        </div>
      )}
    </section>
  )
}

export default PropertyCoreInfo
