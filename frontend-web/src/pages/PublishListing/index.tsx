import { useMemo, useState } from 'react'
import { message, Modal } from 'antd'
import { listingsApi } from '@/services/api'
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
  sp_65_35: { buyer: 65, listing: 35, desc: '客源方经纪人自主匹配房源给客户，独立完成带客成交签约并售后' },
  sp_50_50: { buyer: 50, listing: 50, desc: '客源方与房源方平均分成，共同协作完成带看与签约' },
  sp_30_70: { buyer: 30, listing: 70, desc: '房源方主导成交，客源方仅提供线索，按 3:7 分成' },
  sp_20_80: { buyer: 20, listing: 80, desc: '房源方全流程主导，客源方参与度低，按 2:8 分成' },
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

  const set = (patch: Partial<typeof initialForm>) => setForm((f) => ({ ...f, ...patch }))

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
      message.warning('请填写房号与地址')
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
      message.error(detail ? `提交失败：${detail}` : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">发布房源</h2>
          <p className="rent-page-header__subtitle">填写房源信息、上架类型与分佣配置，提交后将进入平台上架审核</p>
        </div>
      </div>

      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">房源档案信息</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">楼盘</label>
              <input className="rent-form-input" value={form.project_id} placeholder="项目 ID（可选）" onChange={(e) => set({ project_id: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">楼栋</label>
              <input className="rent-form-input" value={form.building} onChange={(e) => set({ building: e.target.value })} />
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">房号 *</label>
              <input className="rent-form-input" value={form.room_number} onChange={(e) => set({ room_number: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">楼层</label>
              <input className="rent-form-input" type="number" value={form.floor} onChange={(e) => set({ floor: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">户型类型</label>
              <select className="rent-form-select" value={form.property_type} onChange={(e) => set({ property_type: e.target.value })}>
                {LISTING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">地址 *</label>
            <input className="rent-form-input" value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">面积（㎡）</label>
              <input className="rent-form-input" type="number" value={form.size_sqm} onChange={(e) => set({ size_sqm: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">卧室</label>
              <input className="rent-form-input" type="number" value={form.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">卫生间</label>
              <input className="rent-form-input" type="number" value={form.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} />
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">描述</label>
            <textarea className="rent-form-textarea" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">可入住时间</label>
              <input className="rent-form-input" type="date" value={form.available_from} onChange={(e) => set({ available_from: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">视频链接</label>
              <input className="rent-form-input" value={form.video_url} onChange={(e) => set({ video_url: e.target.value })} />
            </div>
          </div>
          <div className="rent-form-group">
            <label className="rent-form-label">照片 URL（每行 / 逗号分隔）</label>
            <textarea className="rent-form-textarea" rows={2} value={form.photos} onChange={(e) => set({ photos: e.target.value })} />
          </div>
          <label className="rent-checkbox">
            <input type="checkbox" checked={form.furnished} onChange={(e) => set({ furnished: e.target.checked })} />
            <span>带家具</span>
          </label>
        </div>
      </div>

      {/* 上架类型与价格 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">上架类型与价格</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-tabs rent-mb-4">
            <button className={`rent-tab ${form.listing_type === 'rent' ? 'rent-tab--active' : ''}`} type="button" onClick={() => set({ listing_type: 'rent' })}>
              <span className="rent-flex rent-gap-2">出租</span>
            </button>
            <button className={`rent-tab ${form.listing_type === 'sell' ? 'rent-tab--active' : ''}`} type="button" onClick={() => set({ listing_type: 'sell' })}>
              <span className="rent-flex rent-gap-2">出售</span>
            </button>
          </div>
          <div className="rent-form-row">
            {form.listing_type === 'rent' ? (
              <div className="rent-form-group">
                <label className="rent-form-label">月租金 *</label>
                <input className="rent-form-input" type="number" value={form.monthly_rent} onChange={(e) => set({ monthly_rent: e.target.value })} />
              </div>
            ) : (
              <div className="rent-form-group">
                <label className="rent-form-label">售价 *</label>
                <input className="rent-form-input" type="number" value={form.asking_price} onChange={(e) => set({ asking_price: e.target.value })} />
              </div>
            )}
            <div className="rent-form-group">
              <label className="rent-form-label">币种</label>
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
          <h3 className="rent-card__title">分佣配置</h3>
        </div>
        <div className="rent-card__body">
          {form.listing_type === 'rent' ? (
            <div className="rent-form-row">
              <div className="rent-form-group">
                <label className="rent-form-label">出租佣金月数</label>
                <div className="rent-chip-group">
                  {RENTAL_MONTHS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`rent-chip ${form.rental_commission_months === m ? 'rent-chip--active' : ''}`}
                      onClick={() => set({ rental_commission_months: m })}
                    >
                      {m} 个月
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rent-form-row">
              <div className="rent-form-group">
                <label className="rent-form-label">出售佣金比例（3% - 6%）</label>
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
            <label className="rent-form-label">委托方式</label>
            <div className="rent-chip-group">
              <button
                type="button"
                className={`rent-chip ${form.mandate_type === 'exclusive' ? 'rent-chip--active' : ''}`}
                onClick={() => set({ mandate_type: 'exclusive' })}
              >
                独家 / 快速成交
              </button>
              <button
                type="button"
                className={`rent-chip ${form.mandate_type === 'non_exclusive' ? 'rent-chip--active' : ''}`}
                onClick={() => set({ mandate_type: 'non_exclusive' })}
              >
                非独家委托
              </button>
            </div>
          </div>

          {form.mandate_type === 'exclusive' ? (
            <div className="rent-form-row">
              <div className="rent-form-group">
                <label className="rent-form-label">客源方可分比例（70% - 100%）</label>
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
                  客源方 {splitDisplay.buyer}% / 房源方 {splitDisplay.listing}%
                </div>
              </div>
            </div>
          ) : (
            <div className="rent-form-group">
              <label className="rent-form-label">分成档位（客源方 : 房源方）</label>
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
                      <div className="rent-text-sm rent-text-muted">{m.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="rent-text-sm rent-text-muted">当前分成：客源方 {splitDisplay.buyer}% / 房源方 {splitDisplay.listing}%</div>
        </div>
      </div>

      {/* 联系方式 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">业主联系方式（选填）</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">姓名</label>
              <input className="rent-form-input" value={form.owner_contact_name} onChange={(e) => set({ owner_contact_name: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">电话</label>
              <input className="rent-form-input" value={form.owner_contact_phone} onChange={(e) => set({ owner_contact_phone: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">渠道</label>
              <input className="rent-form-input" value={form.owner_contact_channel} onChange={(e) => set({ owner_contact_channel: e.target.value })} />
            </div>
          </div>
          <label className="rent-checkbox">
            <input type="checkbox" checked={form.owner_contact_visible} onChange={(e) => set({ owner_contact_visible: e.target.checked })} />
            <span>对外展示业主联系方式</span>
          </label>
        </div>
      </div>

      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">经纪人联系方式</h3>
        </div>
        <div className="rent-card__body">
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">公司</label>
              <input className="rent-form-input" value={form.broker_company} onChange={(e) => set({ broker_company: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">姓名</label>
              <input className="rent-form-input" value={form.broker_real_name} onChange={(e) => set({ broker_real_name: e.target.value })} />
            </div>
            <div className="rent-form-group">
              <label className="rent-form-label">电话</label>
              <input className="rent-form-input" value={form.broker_phone} onChange={(e) => set({ broker_phone: e.target.value })} />
            </div>
          </div>
          <div className="rent-form-row">
            <div className="rent-form-group">
              <label className="rent-form-label">微信</label>
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
        <button className="rent-btn rent-btn--secondary" onClick={() => setForm(initialForm)}>重置</button>
        <button className="rent-btn rent-btn--primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '提交中...' : '发布上架'}
        </button>
      </div>

      <Modal
        open={resultOpen}
        onCancel={() => setResultOpen(false)}
        footer={null}
        title="发布结果"
      >
        {result?.dedupe_state === 'blocked' ? (
          <div className="rent-form-group">
            <div className="rent-text-bold" style={{ color: 'var(--state-error)' }}>⚠ 该房源疑似与已有上架单重复，已被阻断进入平台上架审核。</div>
            <div className="rent-text-sm rent-text-muted rent-mt-2">请勿重复发布，可在「我的上架单」查看处理状态。</div>
          </div>
        ) : result && result.dedupe_reviews.length > 0 ? (
          <div className="rent-form-group">
            <div className="rent-text-bold" style={{ color: 'var(--state-warning)' }}>疑似重复，已进入去重审核队列。</div>
            <div className="rent-text-sm rent-text-muted rent-mt-2">运营将人工比对确认是否为重复房源。请耐心等待审核结果。</div>
          </div>
        ) : (
          <div className="rent-form-group">
            <div className="rent-text-bold" style={{ color: 'var(--state-success)' }}>✅ 上架单已提交，当前状态：{result?.status || 'pending'}。</div>
            <div className="rent-text-sm rent-text-muted rent-mt-2">等待平台上架审核。</div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default PublishListing