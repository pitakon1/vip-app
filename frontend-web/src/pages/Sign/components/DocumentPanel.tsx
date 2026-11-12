import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { contractsPublicApi } from '@/services/api'
import { PREVIEW_W } from '../constants'
import type { ContractDoc, Placed, SignField } from '../types'
import { fieldKey, isFieldDone } from '../utils'
import PlacedBox from './PlacedBox'
import SignFieldBox from './SignFieldBox'

/** 左：文档区（PDF 逐页图 / 合同正文背景） */
const DocumentPanel = ({
  token,
  doc,
  pdfCount,
  page,
  placed,
  pageItems,
  pageFields,
  allFields,
  docRef,
  onPageChange,
  movingKey,
  beginMove,
  removePlaced,
  signOnField,
  focusedKey,
}: {
  token: string
  doc: ContractDoc | null
  pdfCount: number
  page: number
  placed: Placed[]
  pageItems: Placed[]
  pageFields: SignField[]
  allFields: SignField[]
  docRef: React.RefObject<HTMLDivElement>
  onPageChange: (page: number) => void
  movingKey: number | null
  beginMove: (key: number) => (e: React.PointerEvent) => void
  removePlaced: (key: number) => void
  signOnField: (f: SignField) => void
  focusedKey?: string | null
}) => {
  const { t } = useTranslation()
  const fileUrl = useMemo(() => contractsPublicApi.fileUrl(token), [token])
  const contentHtml = !(doc?.source === 'uploaded' && doc?.file_url) && !doc?.pdf_available && doc?.content_html

  const renderPlaced = (p: Placed) => (
    <PlacedBox key={p.key} p={p} moving={movingKey === p.key} onMoveStart={beginMove} onRemove={removePlaced} />
  )
  const renderField = (f: SignField) => (
    <SignFieldBox
      key={fieldKey(f)}
      field={f}
      covered={isFieldDone(f, placed)}
      highlight={focusedKey === fieldKey(f)}
      onSign={signOnField}
    />
  )

  return (
    <main className="kf-doc">
      <div className="rent-card">
        <div className="rent-card__body" style={{ padding: doc?.source === 'uploaded' && doc?.file_url && pdfCount === 0 ? 0 : 12 }}>
          {doc?.source === 'uploaded' && doc?.file_url && pdfCount === 0 ? (
            <div>
              <iframe src={fileUrl} title={doc?.title || 'contract'} style={{ width: '100%', height: 520, border: 'none', background: '#fff' }} />
              <div style={{ padding: '10px 12px', textAlign: 'right' }}>
                <a className="rent-btn rent-btn--ghost rent-btn--sm" href={fileUrl} target="_blank" rel="noopener noreferrer" download>{t('contracts.downloadView')}</a>
              </div>
            </div>
          ) : pdfCount > 0 ? (
            <div>
              <div className="kf-doc__toolbar">
                <span className="rent-text-sm rent-text-muted">{t('contracts.pageIndicator', { cur: page, total: pdfCount })}</span>
                <span className="kf-page-nav">
                  <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{t('contracts.prevPage')}</button>
                  <button type="button" className="rent-btn rent-btn--ghost rent-btn--sm" disabled={page >= pdfCount} onClick={() => onPageChange(page + 1)}>{t('contracts.nextPage')}</button>
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div
                  ref={docRef}
                  className="kf-stage"
                  style={{ width: PREVIEW_W, maxWidth: '100%', margin: '0 auto' }}
                >
                  <img className="kf-stage__bg" src={contractsPublicApi.pdfPageUrl(token, page)} alt={`page ${page}`} draggable={false} loading="eager" decoding="async" />
                  {pageFields.map(renderField)}
                  {pageItems.map(renderPlaced)}
                </div>
              </div>
            </div>
          ) : contentHtml ? (
            <div style={{ overflowX: 'auto' }}>
              <div
                ref={docRef}
                className="kf-stage"
                style={{ width: PREVIEW_W, maxWidth: '100%', margin: '0 auto' }}
              >
                <div className="rent-contract-html" style={{ width: PREVIEW_W, lineHeight: 1.9, fontSize: 14, wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: String(doc.content_html) }} />
                {allFields.map(renderField)}
                {placed.map(renderPlaced)}
              </div>
            </div>
          ) : null}
          <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.dragStampHint')}</div>
        </div>
      </div>
    </main>
  )
}

export default DocumentPanel
