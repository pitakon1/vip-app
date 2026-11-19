/**
 * 房源通勤测算卡片（公开详情页）。
 *
 * 地铁线路/站点全部来自后端 Google Routes transit 结果，前端不内置线路库；
 * 未配置地图 Key 时后端返回 `available=false, reason=no_key`，这里按 reason
 * 展示明确提示，不展示任何估算值（避免假成功）。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { message as antdMessage } from 'antd'
import api from '@/lib/api'

type CommuteMode = 'transit' | 'driving'

type CommuteResult = {
  available: boolean
  reason?: string | null
  missing?: string[]
  mode?: string
  duration_minutes?: number | null
  distance_km?: number | null
  cached?: boolean
  transit?: {
    lines?: string[]
    stations?: string[]
    vehicle_types?: string[]
    has_rail?: boolean
  } | null
}

const REASON_KEY: Record<string, string> = {
  no_key: 'publicSite.commuteNoKey',
  no_origin: 'publicSite.commuteNoOrigin',
  no_destination: 'publicSite.commuteNeedDest',
  no_route: 'publicSite.commuteNoRoute',
  bad_mode: 'publicSite.commuteBadMode',
  geocode_failed: 'publicSite.commuteGeoFailed',
  upstream_error: 'publicSite.commuteUpstream',
  request_failed: 'publicSite.commuteUpstream',
}

export default function CommuteCard({ listingId }: { listingId: string }) {
  const { t } = useTranslation()
  const [dest, setDest] = useState('')
  const [mode, setMode] = useState<CommuteMode>('transit')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CommuteResult | null>(null)

  const run = async () => {
    const value = dest.trim()
    if (!value) {
      antdMessage.warning(t('publicSite.commuteNeedDest'))
      return
    }
    setBusy(true)
    try {
      const res = await api.post(`/public/listings/${listingId}/commute`, {
        destination: value,
        mode,
      })
      setResult(res.data as CommuteResult)
    } catch {
      setResult({ available: false, reason: 'request_failed' })
    } finally {
      setBusy(false)
    }
  }

  const reasonText =
    result && !result.available
      ? t(REASON_KEY[result.reason || ''] || 'publicSite.commuteUpstream', {
          vars: (result.missing || []).join(' / '),
        })
      : ''

  return (
    <div className="pub-card">
      <h2 className="pub-section__title">{t('publicSite.commuteTitle')}</h2>
      <p className="pub-section__hint">{t('publicSite.commuteHint')}</p>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <input
          className="pub-input"
          style={{ flex: '1 1 220px', minWidth: 180 }}
          value={dest}
          placeholder={t('publicSite.commuteDestPlaceholder')}
          onChange={(e) => setDest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run()
          }}
        />
        <select
          className="pub-select"
          value={mode}
          onChange={(e) => setMode(e.target.value as CommuteMode)}
        >
          <option value="transit">{t('publicSite.commuteTransit')}</option>
          <option value="driving">{t('publicSite.commuteDriving')}</option>
        </select>
        <button
          type="button"
          className="pub-btn pub-btn--primary"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? t('publicSite.commuteCalculating') : t('publicSite.commuteCalc')}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.7 }}>
          {!result.available ? (
            <div className="pub-form-msg pub-form-msg--error">{reasonText}</div>
          ) : (
            <>
              <div>
                <strong>
                  {t('publicSite.commuteDuration', { n: result.duration_minutes ?? '-' })}
                </strong>
                {result.distance_km != null
                  ? ` · ${result.distance_km}${t('publicSite.km')}`
                  : ''}
                {result.cached ? (
                  <span style={{ marginLeft: 8, color: 'var(--rent-ink-3)' }}>
                    {t('publicSite.commuteCached')}
                  </span>
                ) : null}
              </div>
              {result.transit?.lines?.length ? (
                <div style={{ marginTop: 6 }}>
                  {t('publicSite.commuteLines')}: {result.transit.lines.join(' → ')}
                </div>
              ) : null}
              {result.transit?.stations?.length ? (
                <div style={{ marginTop: 4, color: 'var(--rent-ink-3)' }}>
                  {t('publicSite.commuteStations')}: {result.transit.stations.join(' · ')}
                </div>
              ) : null}
              <div style={{ marginTop: 6, color: 'var(--rent-ink-3)', fontSize: 12 }}>
                {t('publicSite.commuteDisclaimer')}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
