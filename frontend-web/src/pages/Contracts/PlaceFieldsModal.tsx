/**
 * 签署框放置编辑器（指定位置 / 关键字 + PDF 或 HTML 文档区）。
 * 纯结构拆分自 pages/Contracts/index.tsx，类名、拖放与字段列表行为保持不变。
 */
import { Modal, Segmented } from 'antd'
import { useTranslation } from 'react-i18next'
import { FIELD_TYPE_OPTIONS } from './contractTypes'
import type { SignAsset, SignField } from './contractTypes'
import type { ContractDetail, SignFieldsState } from './hooks/useSignFields'

export default function PlaceFieldsModal({
  open,
  state,
  detail,
  sigAssets,
  sigSourceLabel,
  onClose,
  onOpenSigLib,
}: {
  open: boolean
  state: SignFieldsState
  detail: ContractDetail
  sigAssets: SignAsset[]
  sigSourceLabel: (s: string) => string
  onClose: () => void
  onOpenSigLib: (type: string) => void
}) {
  const { t } = useTranslation()
  const {
    fields,
    fieldType,
    setFieldType,
    fieldParty,
    setFieldParty,
    pdfPages,
    pdfLoading,
    keywordInput,
    setKeywordInput,
    keywordHits,
    keywordCount,
    keywordSearching,
    previewMode,
    setPreviewMode,
    placeFieldDrop,
    onFieldDown,
    onFieldMove,
    onFieldUp,
    saveFields,
    deleteField,
    partyName,
    pdfAvailable,
    setDefaultKeyword,
    handleKeywordSearch,
    handleKeywordPlace,
  } = state

  const renderField = (f: SignField, i: number) => (
    <div
      key={f.id || `tmp-${i}`}
      className={f.signed ? 'rent-field-placed rent-field-placed--signed' : 'rent-field-placed'}
      style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => onFieldDown(e, f, i)}
      onPointerMove={(e) => onFieldMove(e, f, i)}
      onPointerUp={(e) => onFieldUp(e, f, i)}
    >
      <div className="rent-field-placed__tag">
        {f.signed ? '✓' : ''}
        {t(`contracts.fType_${f.field_type || 'signature'}`) || f.field_type}
      </div>
      <div className="rent-field-placed__party">{partyName(f.party_id)}</div>
      {!f.signed && (
        <button
          className="rent-field-placed__del"
          title={t('common.delete')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            deleteField(f)
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )

  return (
    <Modal
      open={open}
      title={t('contracts.placeFields')}
      width={880}
      okText={t('contracts.saveFields')}
      cancelText={t('common.cancel')}
      onOk={saveFields}
      onCancel={onClose}
      styles={{ body: { maxHeight: '75vh', overflow: 'auto' } }}
    >
      <div className="kf-layout">
        {/* 左：签署配置 */}
        <aside className="kf-config">
          {/* 签署方式：指定位置 / 关键字 */}
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signMethod')}</div>
              <Segmented
                block
                value={previewMode}
                onChange={(v) => setPreviewMode(v as 'position' | 'keyword')}
                options={[
                  { value: 'position', label: t('contracts.methodPosition') },
                  { value: 'keyword', label: t('contracts.methodKeyword') },
                ]}
              />
            </div>
          </div>

          {previewMode === 'position' ? (
            <div className="rent-card">
              <div className="rent-card__body">
                <div className="rent-field" style={{ marginBottom: 12 }}>
                  <label className="rent-label">{t('contracts.fieldType')}</label>
                  <Segmented
                    block
                    options={FIELD_TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
                    value={fieldType}
                    onChange={(v) => setFieldType(v as string)}
                  />
                </div>
                <div className="rent-field">
                  <label className="rent-label">{t('contracts.fieldAssignee')}</label>
                  <select className="rent-input" value={fieldParty} onChange={(e) => setFieldParty(e.target.value)}>
                    <option value="">{t('contracts.anyParty')}</option>
                    {detail.parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}（{p.role}）</option>
                    ))}
                  </select>
                </div>
                <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.placeHint')}</div>
                {/* 待放置签署域：可拖拽源项，拖到文档释放处落框 */}
                <div className="kf-drag-source" draggable title={t('contracts.dragToDoc')}>
                  <span className="kf-drag-source__label">{t(`contracts.fType_${fieldType}`) || fieldType}</span>
                  <span className="kf-drag-source__hint">
                    {fieldParty ? partyName(fieldParty) : t('contracts.anyParty')} · {t('contracts.dragSource')}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rent-card">
              <div className="rent-card__body">
                <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.keywordSign')}</div>
                <div className="rent-flex" style={{ gap: 8 }}>
                  <input
                    className="rent-input"
                    value={keywordInput}
                    placeholder={t('contracts.keywordPlaceholder')}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleKeywordSearch() }}
                  />
                  <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={setDefaultKeyword}>
                    {t('contracts.keywordDefault')}
                  </button>
                  <button className="rent-btn rent-btn--ghost rent-btn--sm" disabled={keywordSearching} onClick={handleKeywordSearch}>
                    {keywordSearching ? t('common.loading') : t('contracts.searchKeyword')}
                  </button>
                </div>
                {keywordHits.length > 0 ? (
                  <div style={{ marginTop: 8 }}>
                    <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 6 }}>
                      {t('contracts.keywordHitsFound', { n: keywordCount })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {keywordHits.map((hit, i) => (
                        <button
                          key={`${hit.page}-${i}`}
                          type="button"
                          className="rent-btn rent-btn--ghost rent-btn--sm"
                          onClick={() => handleKeywordPlace(i)}
                        >
                          {t('contracts.keywordHitItem', { page: hit.page })}
                          {hit.text ? ` · ${hit.text}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : keywordInput.trim() !== '' && !keywordSearching ? (
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.keywordNoHit')}</div>
                ) : null}
              </div>
            </div>
          )}

          {/* 电子印章资产块 */}
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.sealAsset')}</div>
              {sigAssets.filter((a) => a.asset_type === 'seal').length ? (
                <div className="kf-parties">
                  {sigAssets.filter((a) => a.asset_type === 'seal').map((a) => (
                    <div key={a.id} className="kf-party">
                      <img src={a.data_url} alt={a.name} loading="lazy" decoding="async" style={{ width: 36, height: 36, objectFit: 'contain', background: '#fff', border: '1px solid var(--rent-line, #e2e5e8)', borderRadius: 6 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div className="rent-text-sm rent-text-muted">{sigSourceLabel(a.source)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="kf-asset-empty">
                  <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 8 }}>{t('contracts.sealEmpty')}</div>
                  <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => onOpenSigLib('seal')}>{t('contracts.makeSeal')}</button>
                </div>
              )}
            </div>
          </div>

          {/* 手写签名资产块 */}
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signAsset')}</div>
              {sigAssets.filter((a) => a.asset_type === 'handwrite').length ? (
                <div className="kf-parties">
                  {sigAssets.filter((a) => a.asset_type === 'handwrite').map((a) => (
                    <div key={a.id} className="kf-party">
                      <img src={a.data_url} alt={a.name} loading="lazy" decoding="async" style={{ width: 36, height: 36, objectFit: 'contain', background: '#fff', border: '1px solid var(--rent-line, #e2e5e8)', borderRadius: 6 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div className="rent-text-sm rent-text-muted">{sigSourceLabel(a.source)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="kf-asset-empty">
                  <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 8 }}>{t('contracts.signEmpty')}</div>
                  <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => onOpenSigLib('handwrite')}>{t('contracts.setSign')}</button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* 右：文档区 */}
        <main className="kf-doc">
          <div className="rent-card">
            <div className="rent-card__body">
              <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.docArea')}</div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => placeFieldDrop(e, 1)}
                style={{
                  position: 'relative',
                  border: '1px solid var(--rent-line, #e2e5e8)',
                  maxHeight: 520,
                  overflow: 'auto',
                  background: '#fff',
                }}
              >
                {pdfAvailable ? (
                  pdfLoading ? (
                    <div className="rent-text-sm rent-text-muted" style={{ padding: 8 }}>{t('common.loading')}</div>
                  ) : pdfPages.length === 0 ? (
                    <div className="rent-text-sm rent-text-muted" style={{ padding: 8 }}>{t('contracts.errPdfLoad')}</div>
                  ) : (
                    pdfPages.map((url, pi) => (
                      <div
                        key={pi}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => placeFieldDrop(e, pi + 1)}
                        style={{ position: 'relative', background: '#fff' }}
                      >
                        <img src={url} alt={`page ${pi + 1}`} loading="lazy" decoding="async" style={{ display: 'block', width: '100%', pointerEvents: 'none' }} />
                        {fields.filter((f) => f.page === pi + 1).map((f, i) => renderField(f, i))}
                      </div>
                    ))
                  )
                ) : (
                  <>
                    <div
                      className="rent-contract-html"
                      style={{ width: 800, maxWidth: '100%', margin: '0 auto', lineHeight: 1.9, fontSize: 14, wordBreak: 'break-word' }}
                      dangerouslySetInnerHTML={{ __html: String(detail.contract?.content_html || detail.contract?.title || '') }}
                    />
                    {fields.filter((f) => f.page === 1).map((f, i) => renderField(f, i))}
                  </>
                )}
                {fields.length === 0 && (
                  <div className="rent-text-sm rent-text-muted" style={{ padding: 8 }}>{t('contracts.noFields')}</div>
                )}
              </div>

              {/* 字段列表 */}
              <div style={{ marginTop: 12 }}>
                <div className="rent-text-bold" style={{ marginBottom: 6 }}>{t('contracts.fieldList')}</div>
                {fields.length === 0 ? (
                  <div className="rent-text-sm rent-text-muted">{t('contracts.noFields')}</div>
                ) : (
                  fields.map((f, i) => (
                    <div key={f.id || `row-${i}`} className="rent-contract-party" style={{ marginBottom: 6 }}>
                      <div>
                        <span className="rent-text-bold">
                          {f.signed ? '✓ ' : ''}
                          {t(`contracts.fType_${f.field_type || 'signature'}`) || f.field_type}
                        </span>
                        <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 8 }}>
                          {partyName(f.party_id)} · {t('contracts.page', { n: f.page ?? 1 })}
                        </span>
                        {f.signed && (
                          <span className="rent-badge rent-badge--success" style={{ marginLeft: 8 }}>{t('contracts.stSigned')}</span>
                        )}
                      </div>
                      {!f.signed && (
                        <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={() => deleteField(f)}>
                          {t('contracts.deleteField')}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </Modal>
  )
}
