import { useTranslation } from 'react-i18next'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import brandLogo from '@/assets/haofang-logo.jpg'
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from '../constants'
import type { CompanyFormState } from '../types'

interface Props {
  form: CompanyFormState
  setForm: Dispatch<SetStateAction<CompanyFormState>>
  loading: boolean
  saving: boolean
  logoUrl: string
  logoUploading: boolean
  logoInputRef: RefObject<HTMLInputElement>
  onSave: () => void
  onReset: () => void
  onLogoUpload: (file?: File | null) => void
  onLogoRemove: () => void
}

/** Tab 1：公司信息 */
export const CompanyTab = ({
  form,
  setForm,
  loading,
  saving,
  logoUrl,
  logoUploading,
  logoInputRef,
  onSave,
  onReset,
  onLogoUpload,
  onLogoRemove,
}: Props) => {
  const { t } = useTranslation()
  return (
    <div className="rent-tab-panel" data-active="true">
      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('settings.tabCompany')}</h3>
          <span className="rent-badge rent-badge--neutral">{t('settings.basicInfo')}</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-form-group">
            <label className="rent-form-label">{t('settings.companyName')}</label>
            <input
              className="rent-form-input"
              type="text"
              value={form.name}
              disabled={loading}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('settings.companyRegNo')}</label>
            <input
              className="rent-form-input"
              type="text"
              value={form.regNo}
              disabled={loading}
              onChange={(e) => setForm((p) => ({ ...p, regNo: e.target.value }))}
            />
            <div className="rent-form-hint">{t('settings.regNoHint')}</div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('settings.companyAddress')}</label>
            <textarea
              className="rent-form-textarea"
              rows={2}
              value={form.address}
              disabled={loading}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            />
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('settings.contactPhone')}</label>
              <input
                className="rent-form-input"
                type="text"
                value={form.phone}
                disabled={loading}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('settings.contactEmail')}</label>
              <input
                className="rent-form-input"
                type="email"
                value={form.email}
                disabled={loading}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('settings.currency')}</label>
              <select
                className="rent-form-select"
                value={form.currency}
                disabled={loading}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
              >
                {!CURRENCY_OPTIONS.includes(form.currency) && (
                  <option value="">{t('settings.notSet')}</option>
                )}
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('settings.timezone')}</label>
              <select
                className="rent-form-select"
                value={form.timezone}
                disabled={loading}
                onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
              >
                {!TIMEZONE_OPTIONS.includes(form.timezone) && (
                  <option value="">{t('settings.notSet')}</option>
                )}
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="rent-form-group" style={{ marginBottom: 0 }}>
            <label className="rent-form-label">{t('settings.companyLogo')}</label>
            <div className="rent-logo-preview">
              {logoUrl ? (
                <>
                  <img className="rent-logo-preview__box" src={logoUrl} alt="logo" loading="lazy" decoding="async" />
                  <div>
                    <div className="rent-text-sm rent-text-bold">{logoUrl.split('/').pop()}</div>
                    <div className="rent-caption">{t('settings.logoSaved')}</div>
                  </div>
                  <button
                    className="rent-btn rent-btn--ghost rent-btn--sm"
                    style={{ marginLeft: 8 }}
                    type="button"
                    onClick={onLogoRemove}
                    disabled={logoUploading}
                  >
                    {t('settings.remove')}
                  </button>
                </>
              ) : (
                <>
                  <img className="rent-logo-preview__box" src={brandLogo} alt="logo" loading="lazy" decoding="async" />
                  <div>
                    <div className="rent-text-sm rent-text-bold">{t('settings.logoNotSet')}</div>
                    <div className="rent-caption">{t('settings.logoDefaultHint')}</div>
                  </div>
                </>
              )}
            </div>
            <label
              className="rent-upload"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                onLogoUpload(e.dataTransfer.files?.[0])
              }}
            >
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={(e) => onLogoUpload(e.target.files?.[0])}
              />
              <div className="rent-upload__icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <div className="rent-text-sm rent-text-bold" style={{ color: 'var(--rent-ink)' }}>
                {logoUploading ? t('settings.uploading') : t('settings.uploadHint')}
              </div>
              <div className="rent-caption" style={{ marginTop: 4 }}>{t('settings.uploadSpec')}</div>
            </label>
          </div>
        </div>
        <div className="rent-card__footer rent-flex" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="rent-btn rent-btn--secondary" type="button" onClick={onReset} disabled={loading}>{t('settings.reset')}</button>
          <button className="rent-btn rent-btn--primary" type="button" onClick={onSave} disabled={saving || loading}>
            {saving ? t('settings.saving') : t('settings.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  )
}
