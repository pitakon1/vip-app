import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { View, Text, Input, Textarea, Picker, Switch, Button, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { listingApi, brokerApi } from '@/services/api'
import './index.scss'

// 房源类型（后端 Property.property_type）
const PROPERTY_TYPES = [
  { key: 'apartment', label: '公寓' },
  { key: 'condo', label: '公寓' },
  { key: 'house', label: '别墅' },
  { key: 'villa', label: '别墅' },
  { key: 'office', label: '写字楼' },
  { key: 'shop', label: '商铺' }
]

// 上架类型（ListingType）
const LISTING_TYPES = [
  { key: 'rent', label: '出租' },
  { key: 'sell', label: '出售' }
]

// 委托方式（MandateType）
const MANDATE_TYPES = [
  { key: 'exclusive', label: '独家 / 快速成交', desc: '客源方可分 70%–100%' },
  { key: 'non_exclusive', label: '非独家（合作分佣）', desc: '按档位拆分客源方/房源方比例' }
]

// 非独家分成档位（NonExclusiveSplit）
const SPLIT_OPTIONS = [
  { key: 'sp_65_35', label: '65 : 35', desc: '客源方 65% · 房源方 35%' },
  { key: 'sp_50_50', label: '50 : 50', desc: '客源方 50% · 房源方 50%' },
  { key: 'sp_30_70', label: '30 : 70', desc: '客源方 30% · 房源方 70%' },
  { key: 'sp_20_80', label: '20 : 80', desc: '客源方 20% · 房源方 80%' }
]

const RENT_MONTHS = [1, 1.5, 2, 3]

const obj = (d: any): any => d?.data ?? d ?? {}
const num = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
const numOrDefault = (v: unknown, def = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

const emptyForm = () => ({
  room_number: '',
  floor: '',
  building: '',
  address: '',
  property_type: 'apartment',
  size_sqm: '',
  bedrooms: '',
  bathrooms: '',
  description: '',
  photos: [] as string[],
  furnished: false,
  available_from: '',
  video_url: '',
  listing_type: 'rent',
  asking_price: '',
  monthly_rent: '',
  currency: 'THB',
  sale_commission_rate: '',
  rental_commission_months: '1',
  mandate_type: 'non_exclusive',
  split_option: 'sp_65_35',
  buyer_side_rate: '75',
  owner_id: '',
  owner_contact_name: '',
  owner_contact_phone: '',
  owner_contact_channel: 'phone',
  owner_contact_visible: false,
  broker_company: '',
  broker_real_name: '',
  broker_phone: '',
  broker_wechat: '',
  broker_line: '',
  broker_whatsapp: ''
})

const parse = (src: any) => {
  const s = obj(src)
  const f = emptyForm()
  return {
    ...f,
    ...{
      room_number: s.room_number || '',
      floor: s.floor === null || s.floor === undefined ? '' : String(s.floor),
      building: s.building || '',
      address: s.address || '',
      property_type: s.property_type || 'apartment',
      size_sqm: s.size_sqm === null || s.size_sqm === undefined ? '' : String(s.size_sqm),
      bedrooms: s.bedrooms === null || s.bedrooms === undefined ? '' : String(s.bedrooms),
      bathrooms: s.bathrooms === null || s.bathrooms === undefined ? '' : String(s.bathrooms),
      description: s.description || '',
      photos: Array.isArray(s.photos) ? s.photos : [],
      furnished: !!s.furnished,
      available_from: s.available_from ? String(s.available_from).slice(0, 10) : '',
      video_url: s.video_url || '',
      listing_type: s.listing_type || 'rent',
      asking_price: s.asking_price === null || s.asking_price === undefined ? '' : String(s.asking_price),
      monthly_rent: s.monthly_rent === null || s.monthly_rent === undefined ? '' : String(s.monthly_rent),
      currency: s.currency || 'THB',
      sale_commission_rate: s.sale_commission_rate === null || s.sale_commission_rate === undefined ? '' : String(s.sale_commission_rate),
      rental_commission_months: s.rental_commission_months === null || s.rental_commission_months === undefined ? '1' : String(s.rental_commission_months),
      mandate_type: s.mandate_type || 'non_exclusive',
      split_option: s.split_option || 'sp_65_35',
      buyer_side_rate: s.buyer_side_rate === null || s.buyer_side_rate === undefined ? '75' : String(s.buyer_side_rate),
      owner_id: s.owner_id || '',
      owner_contact_name: s.owner_contact_name || '',
      owner_contact_phone: s.owner_contact_phone || '',
      owner_contact_channel: s.owner_contact_channel || 'phone',
      owner_contact_visible: !!s.owner_contact_visible,
      broker_company: s.broker_company || '',
      broker_real_name: s.broker_real_name || '',
      broker_phone: s.broker_phone || '',
      broker_wechat: s.broker_wechat || '',
      broker_line: s.broker_line || '',
      broker_whatsapp: s.broker_whatsapp || ''
    }
  }
}

export default function StaffListingEditPage() {
  const router = useRouter()
  const id = router.params?.id || ''
  const user = useAuthStore((s) => s.user)

  const [form, setForm] = useState<any>(emptyForm())
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  // 经纪人上架协议签约态（未激活 → 提示先签约）
  const [listingActive, setListingActive] = useState<boolean | null>(null)

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }))

  // 编辑模式：拉取上架单详情
  useEffect(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    listingApi
      .get(id)
      .then((res: any) => {
        if (alive) setForm(parse(res))
      })
      .catch((err) => {
        console.error('[ListingEdit] 加载上架单失败', err)
        Taro.showToast({ title: '加载上架单失败', icon: 'none' })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  // 发布前检查经纪人上架激活状态（仅 agent 身份且已绑定经纪账号时需校验）
  useEffect(() => {
    brokerApi
      .me()
      .then((res: any) => {
        const b = obj(res)
        setListingActive(!!b.id ? !!b.listing_active : true)
      })
      .catch(() => setListingActive(true))
  }, [])

  const propertyTypeIndex = useMemo(
    () => Math.max(0, PROPERTY_TYPES.findIndex((t) => t.key === (form.property_type || 'apartment'))),
    [form.property_type]
  )
  const listingTypeIndex = LISTING_TYPES.findIndex((t) => t.key === (form.listing_type || 'rent'))
  const mandateIndex = MANDATE_TYPES.findIndex((m) => m.key === (form.mandate_type || 'non_exclusive'))
  const rentMonthIndex = RENT_MONTHS.indexOf(Number(form.rental_commission_months || 1)) < 0
    ? 0
    : RENT_MONTHS.indexOf(Number(form.rental_commission_months || 1))

  const isSell = form.listing_type === 'sell'
  const isExclusive = form.mandate_type === 'exclusive'

  const buildPayload = () => {
    const p: Record<string, any> = {
      room_number: form.room_number,
      floor: num(form.floor),
      building: form.building,
      address: form.address,
      property_type: form.property_type,
      size_sqm: num(form.size_sqm),
      bedrooms: num(form.bedrooms),
      bathrooms: num(form.bathrooms),
      description: form.description,
      photos: Array.isArray(form.photos) ? form.photos : [],
      furnished: !!form.furnished,
      available_from: form.available_from || null,
      video_url: form.video_url || null,
      listing_type: form.listing_type,
      currency: form.currency,
      mandate_type: form.mandate_type,
      split_option: isExclusive ? null : form.split_option,
      buyer_side_rate: isExclusive ? num(form.buyer_side_rate) : null,
      owner_contact_name: form.owner_contact_name || null,
      owner_contact_phone: form.owner_contact_phone || null,
      owner_contact_channel: form.owner_contact_channel || null,
      owner_contact_visible: !!form.owner_contact_visible,
      broker_company: form.broker_company || null,
      broker_real_name: form.broker_real_name || null,
      broker_phone: form.broker_phone || null,
      broker_wechat: form.broker_wechat || null,
      broker_line: form.broker_line || null,
      broker_whatsapp: form.broker_whatsapp || null
    }
    if (isSell) {
      p.asking_price = num(form.asking_price)
      p.sale_commission_rate = num(form.sale_commission_rate)
    } else {
      p.monthly_rent = num(form.monthly_rent)
      p.rental_commission_months = num(form.rental_commission_months)
    }
    if (form.owner_id) p.owner_id = form.owner_id
    return p
  }

  const validate = () => {
    if (!form.room_number.trim()) return '请填写房源编号（房号）'
    if (!form.address.trim()) return '请填写详细地址'
    if (isSell) {
      if (num(form.asking_price) === undefined) return '出售须填写售价'
      const r = num(form.sale_commission_rate)
      if (r !== undefined && (r < 3 || r > 6)) return '卖房佣金比例须在 3%–6% 之间'
    } else {
      if (num(form.monthly_rent) === undefined) return '出租须填写月租'
      if (![1, 1.5, 2, 3].includes(Number(form.rental_commission_months))) return '租房佣金月数须为 1/1.5/2/3'
    }
    if (isExclusive) {
      const b = num(form.buyer_side_rate)
      if (b === undefined || b < 70 || b > 100) return '独家委托客源方可分比例须在 70%–100% 之间'
    }
    if (!form.owner_contact_visible && !form.owner_contact_name && !form.owner_contact_phone) {
      // 允许隐藏，但如果填了则继续
    }
    return ''
  }

  const handleSave = async () => {
    const tip = validate()
    if (tip) return Taro.showToast({ title: tip, icon: 'none' })
    if (listingActive === false) {
      return Taro.showToast({ title: '请先签署《房源经纪人上架房源协议》', icon: 'none' })
    }
    setSaving(true)
    try {
      if (id) {
        await listingApi.update(id, buildPayload())
        Taro.showToast({ title: '已保存', icon: 'success' })
      } else {
        await listingApi.create(buildPayload())
        Taro.showToast({ title: '已提交上架', icon: 'success' })
      }
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (err: any) {
      console.error('[ListingEdit] 保存失败', err)
      Taro.showToast({ title: err?.message || '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const row = (label: string, children: ReactNode, req = false) => (
    <View className='le-row'>
      <Text className='le-row__label'>{req ? label + ' *' : label}</Text>
      <View className='le-row__control'>{children}</View>
    </View>
  )

  if (loading) {
    return (
      <View className='le-page'>
        <View className='le-state'><Text className='le-state__text'>加载中...</Text></View>
      </View>
    )
  }

  return (
    <View className='le-page'>
      <ScrollView scrollY className='le-scroll'>
        {listingActive === false && (
          <View className='le-gate'>
            <Text className='le-gate__title'>尚未签署《房源经纪人上架房源协议》</Text>
            <Text className='le-gate__desc'>签署并激活后方可发布房源作为房源上架经纪人。</Text>
            <View
              className='le-gate__btn'
              onClick={() => Taro.navigateTo({ url: '/pages/staff/agreements/index' })}
            >
              <Text className='le-gate__btn-text'>去签约</Text>
            </View>
          </View>
        )}

        {/* 房源信息 */}
        <View className='le-card'>
          <Text className='le-card__title'>房源信息</Text>
          {row('上架类型', (
            <Picker
              mode='selector'
              range={LISTING_TYPES.map((t) => t.label)}
              value={listingTypeIndex < 0 ? 0 : listingTypeIndex}
              onChange={(e: any) => set('listing_type', LISTING_TYPES[Number(e.detail.value)].key)}
            >
              <View className='le-picker'>
                <Text className='le-picker__text'>{LISTING_TYPES[listingTypeIndex < 0 ? 0 : listingTypeIndex]?.label || '请选择'}</Text>
                <Text className='le-picker__arrow'>▼</Text>
              </View>
            </Picker>
          ), true)}
          {row('房源类型', (
            <Picker
              mode='selector'
              range={PROPERTY_TYPES.map((t) => t.label)}
              value={propertyTypeIndex}
              onChange={(e: any) => set('property_type', PROPERTY_TYPES[Number(e.detail.value)].key)}
            >
              <View className='le-picker'>
                <Text className='le-picker__text'>{PROPERTY_TYPES[propertyTypeIndex]?.label}</Text>
                <Text className='le-picker__arrow'>▼</Text>
              </View>
            </Picker>
          ))}
          {row('房号 / 房源编号', (
            <Input className='le-input' value={form.room_number} placeholder='如 A-12-03'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('room_number', e.detail.value)} />
          ), true)}
          {row('地址', (
            <Input className='le-input' value={form.address} placeholder='请输入详细地址'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('address', e.detail.value)} />
          ), true)}
          {row('楼栋', (
            <Input className='le-input' value={form.building} placeholder='如 A 栋'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('building', e.detail.value)} />
          ))}
          {row('楼层', (
            <Input className='le-input' type='number' value={String(form.floor ?? '')} placeholder='0'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('floor', e.detail.value)} />
          ))}
          {row('面积（㎡）', (
            <Input className='le-input' type='digit' value={String(form.size_sqm ?? '')} placeholder='0'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('size_sqm', e.detail.value)} />
          ))}
          {row('卧室', (
            <Input className='le-input' type='number' value={String(form.bedrooms ?? '')} placeholder='0'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('bedrooms', e.detail.value)} />
          ))}
          {row('卫生间', (
            <Input className='le-input' type='number' value={String(form.bathrooms ?? '')} placeholder='0'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('bathrooms', e.detail.value)} />
          ))}
          {row('带家具', (
            <Switch checked={form.furnished} color='#14b8a6'
              onChange={(e: any) => set('furnished', e.detail.value)} />
          ))}
          {row('可入住日期', (
            <Input className='le-input' value={form.available_from} placeholder='2026-10-01'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('available_from', e.detail.value)} />
          ))}
          {row('视频链接', (
            <Input className='le-input' value={form.video_url} placeholder='选填'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('video_url', e.detail.value)} />
          ))}
        </View>

        {/* 价格 */}
        <View className='le-card'>
          <Text className='le-card__title'>价格</Text>
          {isSell ? (
            <>
              {row('售价', (
                <Input className='le-input' type='digit' value={String(form.asking_price ?? '')} placeholder='0'
                  placeholderStyle='color:#98a1ab' onInput={(e: any) => set('asking_price', e.detail.value)} />
              ), true)}
            </>
          ) : (
            <>
              {row('月租', (
                <Input className='le-input' type='digit' value={String(form.monthly_rent ?? '')} placeholder='0'
                  placeholderStyle='color:#98a1ab' onInput={(e: any) => set('monthly_rent', e.detail.value)} />
              ), true)}
            </>
          )}
          {row('币种', (
            <Input className='le-input' value={form.currency} placeholder='THB'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('currency', e.detail.value)} />
          ))}
        </View>

        {/* 分佣配置 */}
        <View className='le-card'>
          <Text className='le-card__title'>分佣配置</Text>
          {isSell ? (
            row('卖房佣金比例（%）', (
              <Input className='le-input' type='digit' value={String(form.sale_commission_rate ?? '')}
                placeholder='3–6' placeholderStyle='color:#98a1ab'
                onInput={(e: any) => set('sale_commission_rate', e.detail.value)} />
            ), true)
          ) : (
            row('租房佣金（月数）', (
              <Picker
                mode='selector'
                range={RENT_MONTHS.map((m) => `${m} 个月`)}
                value={rentMonthIndex}
                onChange={(e: any) => set('rental_commission_months', String(RENT_MONTHS[Number(e.detail.value)]))}
              >
                <View className='le-picker'>
                  <Text className='le-picker__text'>{form.rental_commission_months} 个月</Text>
                  <Text className='le-picker__arrow'>▼</Text>
                </View>
              </Picker>
            ), true)
          )}

          {row('委托方式', (
            <Picker
              mode='selector'
              range={MANDATE_TYPES.map((m) => m.label)}
              value={mandateIndex < 0 ? 0 : mandateIndex}
              onChange={(e: any) => set('mandate_type', MANDATE_TYPES[Number(e.detail.value)].key)}
            >
              <View className='le-picker'>
                <Text className='le-picker__text'>{MANDATE_TYPES[mandateIndex < 0 ? 0 : mandateIndex]?.label}</Text>
                <Text className='le-picker__arrow'>▼</Text>
              </View>
            </Picker>
          ))}
          <View className='le-hint'>{MANDATE_TYPES[mandateIndex < 0 ? 0 : mandateIndex]?.desc}</View>

          {isExclusive ? (
            <View className='le-split'>
              <Text className='le-split__label'>客源方可分比例（%）</Text>
              <Input className='le-input' type='digit' value={String(form.buyer_side_rate ?? '')}
                placeholder='70–100' placeholderStyle='color:#98a1ab'
                onInput={(e: any) => set('buyer_side_rate', e.detail.value)} />
              <View className='le-hint'>独家/快速成交：客源方可分 70%–100%，剩余归房源方。</View>
            </View>
          ) : (
            <View className='le-split'>
              <Text className='le-split__label'>非独家分成档位</Text>
              <View className='le-chips'>
                {SPLIT_OPTIONS.map((o) => (
                  <View
                    key={o.key}
                    className={`le-chip ${form.split_option === o.key ? 'le-chip--active' : ''}`}
                    onClick={() => set('split_option', o.key)}
                  >
                    <Text className='le-chip__key'>{o.label}</Text>
                    <Text className='le-chip__desc'>{o.desc}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* 业主联系方式（可隐藏） */}
        <View className='le-card'>
          <Text className='le-card__title'>业主联系方式</Text>
          {row('业主姓名', (
            <Input className='le-input' value={form.owner_contact_name} placeholder='选填'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('owner_contact_name', e.detail.value)} />
          ))}
          {row('业主电话', (
            <Input className='le-input' value={form.owner_contact_phone} placeholder='选填'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('owner_contact_phone', e.detail.value)} />
          ))}
          {row('联系渠道', (
            <Input className='le-input' value={form.owner_contact_channel} placeholder='如 phone / line / wechat'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('owner_contact_channel', e.detail.value)} />
          ))}
          {row('对客隐藏业主联系方式', (
            <Switch checked={form.owner_contact_visible} color='#14b8a6'
              onChange={(e: any) => set('owner_contact_visible', e.detail.value)} />
          ))}
          <View className='le-hint'>勾选后，业主联系方式仅发布人本人及平台员工可见。</View>
        </View>

        {/* 经纪人联系方式 */}
        <View className='le-card'>
          <Text className='le-card__title'>经纪人联系方式</Text>
          {row('经纪公司', (
            <Input className='le-input' value={form.broker_company} placeholder='选填'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_company', e.detail.value)} />
          ))}
          {row('经纪人姓名', (
            <Input className='le-input' value={form.broker_real_name} placeholder='选填'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_real_name', e.detail.value)} />
          ))}
          {row('电话', (
            <Input className='le-input' value={form.broker_phone} placeholder='选填'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_phone', e.detail.value)} />
          ))}
          {row('微信', (
            <Input className='le-input' value={form.broker_wechat} placeholder='选填'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_wechat', e.detail.value)} />
          ))}
          {row('LINE', (
            <Input className='le-input' value={form.broker_line} placeholder='选填'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_line', e.detail.value)} />
          ))}
          {row('WhatsApp', (
            <Input className='le-input' value={form.broker_whatsapp} placeholder='选填'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_whatsapp', e.detail.value)} />
          ))}
        </View>

        {!id && (
          <View className='le-card'>
            <Text className='le-card__title'>业主归属（内部/渠道发布）</Text>
            {row('owner_id', (
              <Input className='le-input' value={form.owner_id}
                placeholder='业主发布/经纪发布需填业主归属 UUID'
                placeholderStyle='color:#98a1ab' onInput={(e: any) => set('owner_id', e.detail.value)} />
            ))}
            <View className='le-hint'>仅内部员工/经纪视角，业主自主发布由系统自动绑定。</View>
          </View>
        )}

        {/* 描述 */}
        <View className='le-card'>
          <Text className='le-card__title'>房源描述</Text>
          <Textarea className='le-textarea' value={form.description} placeholder='请输入房源描述...'
            placeholderStyle='color:#98a1ab' maxlength={1000}
            onInput={(e: any) => set('description', e.detail.value)} />
        </View>

        <View className='le-footer'>
          <Button className='le-save' loading={saving} onClick={handleSave}>
            {id ? '保存修改' : '提交上架'}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}