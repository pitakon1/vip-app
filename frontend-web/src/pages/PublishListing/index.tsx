import { useEffect, useMemo, useState } from 'react'
import { message, Modal, Select } from 'antd'
import { useTranslation } from 'react-i18next'
import { listingsApi, ownersApi } from '@/services/api'
import useAuthStore from '@/stores/auth'
import './publish.css'

/**
 * 房源上架（发布房源）页。
 * 收集房源档案 + 上架类型/价格 + 分佣配置 + 联系方式，提交后端做去重落库。
 * 字段名与后端 ListingCreate 严格一致。
 */

type ListingType = 'rent' | 'sell'
type MandateType = 'exclusive' | 'non_exclusive'
type SplitOption = 'sp_65_35' | 'sp_50_50' | 'sp_30_70' | 'sp_20_80'

const RENTAL_MONTHS = [1, 1.5, 2, 3]
const LISTING_TYPES = ['apartment', 'condo', 'villa', 'house', 'shop', 'commercial', 'office']

// 非独家分档说明（客源方 : 房源方）
const NON_EXCLUSIVE_MAP: Record<SplitOption, { buyer: number; listing: number; desc: string }> = {
  sp_65_35: { buyer: 65, listing: 35, desc: 'publishListing.descSp6535' },
  sp_50_50: { buyer: 50, listing: 50, desc: 'publishListing.descSp5050' },
  sp_30_70: { buyer: 30, listing: 70, desc: 'publishListing.descSp3070' },
  sp_20_80: { buyer: 20, listing: 80, desc: 'publishListing.descSp2080' },
}

const initialForm = {
  project_id: '',
  owner_id: '',
  room_number: '',
  floor: '',
  building: '',
  address: '',
  property_type: 'apartment',
  size_sqm: '',
  bedrooms: '',
  bathrooms: '',
  description: '',
  photos: '',
  furnished: false,
  available_from: '',
  video_url: '',
  // 上架类型与价格
  listing_type: 'rent' as ListingType,
  asking_price: '',
  monthly_rent: '',
  currency: 'THB',
  // 分佣配置
  sale_commission_rate: '',
  rental_commission_months: 1,
  mandate_type: 'non_exclusive' as MandateType,
  split_option: 'sp_65_35' as SplitOption,
  buyer_side_rate: '',
  // 业主联系方式
  owner_contact_name: '',
  owner_contact_phone: '',
  owner_contact_channel: '',
  owner_contact_visible: false,
  // 经纪人联系方式
  broker_company: '',
  broker_real_name: '',
  broker_phone: '',
  broker_wechat: '',
  broker_line: '',
  broker_whatsapp: '',
}

const PublishListing = () => {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isStaff = user?.role === 'admin' || user?.role === 'agent' || user?.role === 'employee'
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    dedupe_state?: string
    dedupe_reviews: string[]
    status?: string
  } | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  // 归属业主（员工代业主发布时必选）：后端 POST /listings 对非 owner 角色强制要求 owner_id
  const [ownerOptions, setOwnerOptions] = useState<{ value: string; label: string }[]>([])
  const [ownerLoading, setOwnerLoading] = useState(false)

  const set = (patch: Partial<typeof initialForm>) => setForm((f) => ({ ...f, ...patch }))

  // 员工侧业主检索：远端搜索（业主量大，一次性拉全量不现实）
  const loadOwners = async (kw?: string) => {
    try {
      setOwnerLoading(true)
      const res = await ownersApi.list({ keyword: kw || undefined, page_size: 50 })
      const payload = res.data?.data ?? res.data
      const items: any[] = payload?.items ?? []
      setOwnerOptions(
        items.map((o) => {
          const name = `${o.name || o.email || o.id}${o.phone ? ` · ${o.phone}` : ''}`
          return {
            value: o.id,
            label: t('publishListing.ownerOptionLabel', { name, count: o.property_count ?? 0 }),
          }
        }),
      )
    } catch {
      // 接口不可用时给出空列表，由「未选归属业主」的前端拦截提示，避免静默提交失败
      setOwnerOptions([])
    } finally {
      setOwnerLoading(false)
    }
  }

  useEffect(() => {
    if (isStaff) loadOwners()
    // 仅在角色确定/切换时拉一次，搜索走 onSearch
  }, [isStaff])

  // 分佣展示：独家→客源方=输入值，房源方=100-客源方；非独家→按档位
  const splitDisplay = useMemo(() => {
    if (form.mandate_type === 'exclusive') {
      const b = Number(form.buyer_side_rate)
      const buyer = Number.isFinite(b) ? b : 0
      return { buyer, listing: Math.round((100 - buyer) * 100) / 100 }
    }
    const m = NON_EXCLUSIVE_MAP[form.split_option]
    return { buyer: m.buyer, listing: m.listing }
  }, [form.mandate_type, form.buyer_side_rate, form.split_option])

  const photosArray = () =>
    form.photos
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)

  const handleSubmit = async () => {
    if (!form.room_number.trim() || !form.address.trim()) {
      message.warning(t('publishListing.msgNeedRoomAddress'))
      return
    }
    // 后端对非 owner 角色强制要求 owner_id，前端先拦，避免一定失败的提交
    if (isStaff && !form.owner_id) {
      message.warning(t('publishListing.msgNeedOwner'))
      return
    }
    const payload: Record<string, unknown> = {
      project_id: form.project_id || undefined,
      owner_id: isStaff && form.owner_id ? form.owner_id : undefined,
      room_number: form.room_number,
      floor: form.floor ? Number(form.floor) : undefined,
      building: form.building || undefined,
      address: form.address,
      property_type: form.property_type,
      size_sqm: form.size_sqm ? Number(form.size_sqm) : undefined,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      description: form.description || undefined,
      photos: photosArray().length ? photosArray() : undefined,
      furnished: form.furnished,
      available_from: form.available_from || undefined,
      video_url: form.video_url || undefined,
      listing_type: form.listing_type,
      asking_price: form.listing_type === 'sell' && form.asking_price ? Number(form.asking_price) : undefined,
      monthly_rent: form.listing_type === 'rent' && form.monthly_rent ? Number(form.monthly_rent) : undefined,
      currency: form.currency,
      sale_commission_rate: form.listing_type === 'sell' ? (form.sale_commission_rate ? Number(form.sale_commission_rate) : undefined) : undefined,
      rental_commission_months: form.listing_type === 'rent' ? form.rental_commission_months : undefined,
      mandate_type: form.mandate_type,
      split_option: form.mandate_type === 'non_exclusive' ? form.split_option : undefined,
      buyer_side_rate: form.mandate_type === 'exclusive' ? (form.buyer_side_rate ? Number(form.buyer_side_rate) : undefined) : undefined,
      owner_contact_name: form.owner_contact_name || undefined,
      owner_contact_phone: form.owner_contact_phone || undefined,
      owner_contact_channel: form.owner_contact_channel || undefined,
      owner_contact_visible: form.owner_contact_visible,
      broker_company: form.broker_company || undefined,
      broker_real_name: form.broker_real_name || undefined,
      broker_phone: form.broker_phone || undefined,
      broker_wechat: form.broker_wechat || undefined,
      broker_line: form.broker_line || undefined,
      broker_whatsapp: form.broker_whatsapp || undefined,
    }
    try {
      setSubmitting(true)
      const res = await listingsApi.create(payload)
      const data = res.data?.data ?? res.data
      setResult({
        dedupe_state: data?.dedupe_state,
        dedupe_reviews: data?.dedupe_reviews ?? [],
        status: data?.status,
      })
      setResultOpen(true)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message
      message.error(detail ? t('publishListing.msgSubmitFailedDetail', { detail }) : t('publishListing.msgSubmitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('publishListing.title')}</h2>
          <p className="rent-page-header__subtitle">{t('publishListing.subtitle')}</p>
        </div>
      </div>

      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('publishListing.secProfile')}</h3>
        </div>
        <div className="rent-card__body">
          {isStaff && (
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.ownerLabel')}</label>
              <Select
                showSearch
                allowClear
                style={{ maxWidth: 420 }}
                placeholder={t('publishListing.ownerPlaceholder')}
                value={form.owner_id || undefined}
                loading={ownerLoading}
                filterOption={false}
                onSearch={(v) => loadOwners(v)}
                onChange={(v) => set({ owner_id: v || '' })}
                options={ownerOptions}
              />
              <div className="rent-text-sm rent-text-muted rent-mt-2">
                {t('publishListing.ownerHint')}
              </div>
            </div>
          )}
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblProject')}</label>
              <input className="rent-form-input" value={form.project_id} placeholder={t('publishListing.phProjectId')} onChange={(e) => set({ project_id: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblBuilding')}</label>
              <input className="rent-form-input" value={form.building} onChange={(e) => set({ building: e.target.value })} />
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblRoomNo')}</label>
              <input className="rent-form-input" value={form.room_number} onChange={(e) => set({ room_number: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblFloor')}</label>
              <input className="rent-form-input" type="number" value={form.floor} onChange={(e) => set({ floor: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblPropertyType')}</label>
              <select className="rent-form-select" value={form.property_type} onChange={(e) => set({ property_type: e.target.value })}>
                {LISTING_TYPES.map((opt) => <option key={opt} value={opt}>{t(`propertyType.${opt}`, { defaultValue: opt })}</option>)}
              </select>
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('publishListing.lblAddress')}</label>
            <input className="rent-form-input" value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblSize')}</label>
              <input className="rent-form-input" type="number" value={form.size_sqm} onChange={(e) => set({ size_sqm: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblBedrooms')}</label>
              <input className="rent-form-input" type="number" value={form.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblBathrooms')}</label>
              <input className="rent-form-input" type="number" value={form.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} />
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('publishListing.lblDescription')}</label>
            <textarea className="rent-form-textarea" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblAvailableFrom')}</label>
              <input className="rent-form-input" type="date" value={form.available_from} onChange={(e) => set({ available_from: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblVideoUrl')}</label>
              <input className="rent-form-input" value={form.video_url} onChange={(e) => set({ video_url: e.target.value })} />
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">{t('publishListing.lblPhotos')}</label>
            <textarea className="rent-form-textarea" rows={2} value={form.photos} onChange={(e) => set({ photos: e.target.value })} />
          </div>
          <label className="rent-checkbox">
            <input type="checkbox" checked={form.furnished} onChange={(e) => set({ furnished: e.target.checked })} />
            <span>{t('publishListing.lblFurnished')}</span>
          </label>
        </div>
      </div>

      {/* 上架类型与价格 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('publishListing.secListing')}</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-tabs rent-mb-4">
            <button className={`rent-tab ${form.listing_type === 'rent' ? 'rent-tab--active' : ''}`} type="button" onClick={() => set({ listing_type: 'rent' })}>
              <span className="rent-flex rent-gap-2">{t('publishListing.tabRent')}</span>
            </button>
            <button className={`rent-tab ${form.listing_type === 'sell' ? 'rent-tab--active' : ''}`} type="button" onClick={() => set({ listing_type: 'sell' })}>
              <span className="rent-flex rent-gap-2">{t('publishListing.tabSell')}</span>
            </button>
          </div>
          <div className="rent-form-row">
            {form.listing_type === 'rent' ? (
              <div className="rent-form-group">
                <label className="rent-form-label">{t('publishListing.lblMonthlyRent')}</label>
                <input className="rent-form-input" type="number" value={form.monthly_rent} onChange={(e) => set({ monthly_rent: e.target.value })} />
              </div>
            ) : (
              <div className="rent-form-group">
                <label className="rent-form-label">{t('publishListing.lblAskingPrice')}</label>
                <input className="rent-form-input" type="number" value={form.asking_price} onChange={(e) => set({ asking_price: e.target.value })} />
              </div>
            )}
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblCurrency')}</label>
              <select className="rent-form-select" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
                <option value="THB">THB</option>
                <option value="CNY">CNY</option>
                <option value="USD">USD</option>
                <option value="MYR">RM</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 分佣配置区（需求核心） */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('publishListing.secCommission')}</h3>
        </div>
        <div className="rent-card__body">
          {form.listing_type === 'rent' ? (
            <div className="rent-form-row">
              <div className="rent-form-group">
                <label className="rent-form-label">{t('publishListing.lblRentalMonths')}</label>
                <div className="rent-chip-group">
                  {RENTAL_MONTHS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`rent-chip ${form.rental_commission_months === m ? 'rent-chip--active' : ''}`}
                      onClick={() => set({ rental_commission_months: m })}
                    >
                      {t('publishListing.monthsUnit', { n: m })}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rent-form-row">
              <div className="rent-form-group">
                <label className="rent-form-label">{t('publishListing.lblSaleRate')}</label>
                <input
                  className="rent-form-input"
                  type="number"
                  min={3}
                  max={6}
                  step={0.1}
                  value={form.sale_commission_rate}
                  onChange={(e) => set({ sale_commission_rate: e.target.value })}
                  style={{ maxWidth: 200 }}
                />
              </div>
            </div>
          )}

          <div className="rent-form-group">
            <label className="rent-form-label">{t('publishListing.lblMandate')}</label>
            <div className="rent-chip-group">
              <button
                type="button"
                className={`rent-chip ${form.mandate_type === 'exclusive' ? 'rent-chip--active' : ''}`}
                onClick={() => set({ mandate_type: 'exclusive' })}
              >
                {t('publishListing.mandateExclusive')}
              </button>
              <button
                type="button"
                className={`rent-chip ${form.mandate_type === 'non_exclusive' ? 'rent-chip--active' : ''}`}
                onClick={() => set({ mandate_type: 'non_exclusive' })}
              >
                {t('publishListing.mandateNonExclusive')}
              </button>
            </div>
          </div>

          {form.mandate_type === 'exclusive' ? (
            <div className="rent-form-row">
              <div className="rent-form-group">
                <label className="rent-form-label">{t('publishListing.lblBuyerRate')}</label>
                <input
                  className="rent-form-input"
                  type="number"
                  min={70}
                  max={100}
                  value={form.buyer_side_rate}
                  onChange={(e) => set({ buyer_side_rate: e.target.value })}
                  style={{ maxWidth: 200 }}
                />
                <div className="rent-text-sm rent-text-muted rent-mt-2" style={{ color: 'var(--rent-primary)' }}>
                  {t('publishListing.splitPreview', { buyer: splitDisplay.buyer, listing: splitDisplay.listing })}
                </div>
              </div>
            </div>
          ) : (
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblSplitTier')}</label>
              <div className="rent-split-list">
                {(Object.keys(NON_EXCLUSIVE_MAP) as SplitOption[]).map((opt) => {
                  const m = NON_EXCLUSIVE_MAP[opt]
                  const active = form.split_option === opt
                  return (
                    <button
                      key={opt}
                      type="button"
                      className={`rent-split-card ${active ? 'rent-split-card--active' : ''}`}
                      onClick={() => set({ split_option: opt })}
                    >
                      <div className="rent-split-card__ratio">{m.buyer}:{m.listing}</div>
                      <div className="rent-text-sm rent-text-muted">{t(m.desc)}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="rent-text-sm rent-text-muted">{t('publishListing.splitCurrent', { buyer: splitDisplay.buyer, listing: splitDisplay.listing })}</div>
        </div>
      </div>

      {/* 联系方式 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('publishListing.secOwnerContact')}</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblName')}</label>
              <input className="rent-form-input" value={form.owner_contact_name} onChange={(e) => set({ owner_contact_name: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblPhone')}</label>
              <input className="rent-form-input" value={form.owner_contact_phone} onChange={(e) => set({ owner_contact_phone: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblChannel')}</label>
              <input className="rent-form-input" value={form.owner_contact_channel} onChange={(e) => set({ owner_contact_channel: e.target.value })} />
            </div>
          </div>
          <label className="rent-checkbox">
            <input type="checkbox" checked={form.owner_contact_visible} onChange={(e) => set({ owner_contact_visible: e.target.checked })} />
            <span>{t('publishListing.chkOwnerVisible')}</span>
          </label>
        </div>
      </div>

      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('publishListing.secBrokerContact')}</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblCompany')}</label>
              <input className="rent-form-input" value={form.broker_company} onChange={(e) => set({ broker_company: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblName')}</label>
              <input className="rent-form-input" value={form.broker_real_name} onChange={(e) => set({ broker_real_name: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblPhone')}</label>
              <input className="rent-form-input" value={form.broker_phone} onChange={(e) => set({ broker_phone: e.target.value })} />
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">{t('publishListing.lblWechat')}</label>
              <input className="rent-form-input" value={form.broker_wechat} onChange={(e) => set({ broker_wechat: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">LINE</label>
              <input className="rent-form-input" value={form.broker_line} onChange={(e) => set({ broker_line: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">WhatsApp</label>
              <input className="rent-form-input" value={form.broker_whatsapp} onChange={(e) => set({ broker_whatsapp: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      <div className="rent-flex rent-gap-3" style={{ justifyContent: 'flex-end' }}>
        <button className="rent-btn rent-btn--secondary" onClick={() => setForm(initialForm)}>{t('publishListing.btnReset')}</button>
        <button className="rent-btn rent-btn--primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? t('publishListing.submitting') : t('publishListing.btnSubmit')}
        </button>
      </div>

      <Modal
        open={resultOpen}
        onCancel={() => setResultOpen(false)}
        footer={null}
        title={t('publishListing.resultTitle')}
      >
        {result?.dedupe_state === 'blocked' ? (
          <div className="rent-form-group">
            <div className="rent-text-bold" style={{ color: 'var(--state-error)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {t('publishListing.resultBlocked')}
            </div>
            <div className="rent-text-sm rent-text-muted rent-mt-2">{t('publishListing.resultBlockedHint')}</div>
          </div>
        ) : result && result.dedupe_reviews.length > 0 ? (
          <div className="rent-form-group">
            <div className="rent-text-bold" style={{ color: 'var(--state-warning)' }}>{t('publishListing.resultReview')}</div>
            <div className="rent-text-sm rent-text-muted rent-mt-2">{t('publishListing.resultReviewHint')}</div>
          </div>
        ) : (
          <div className="rent-form-group">
            <div className="rent-text-bold" style={{ color: 'var(--state-success)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="m8 12 3 3 5-6" />
              </svg>
              {t('publishListing.resultOk', { status: result?.status || 'pending' })}
            </div>
            <div className="rent-text-sm rent-text-muted rent-mt-2">{t('publishListing.resultOkHint')}</div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default PublishListing