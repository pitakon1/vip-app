import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { View, Text, Input, Textarea, Picker, Switch, Button, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { listingApi, brokerApi, ownerApi } from '@/services/api'
import './index.scss'
import { useI18n } from '@/i18n'

// 房源类型（后端 Property.property_type）
const buildPropertyTypes = (
  t: (k: string, p?: Record<string, string | number>) => string
): { key: string; label: string }[] => [
  { key: 'apartment', label: t('prop.typeApartment') },
  { key: 'condo', label: t('prop.typeApartment') },
  { key: 'house', label: t('prop.typeVilla') },
  { key: 'villa', label: t('prop.typeVilla') },
  { key: 'office', label: t('prop.typeOffice') },
  { key: 'shop', label: t('prop.typeCommercial') }
]

// 上架类型（ListingType）
const buildListingTypes = (
  t: (k: string, p?: Record<string, string | number>) => string
): { key: string; label: string }[] => [
  { key: 'rent', label: t('le.typeRent') },
  { key: 'sell', label: t('le.typeSell') }
]

// 委托方式（MandateType）
const buildMandateTypes = (
  t: (k: string, p?: Record<string, string | number>) => string
): { key: string; label: string; desc: string }[] => [
  { key: 'exclusive', label: t('le.mandateExclusive'), desc: t('le.mandateExclusiveDesc') },
  { key: 'non_exclusive', label: t('le.mandateNonExclusive'), desc: t('le.mandateNonExclusiveDesc') }
]

// 非独家分成档位（NonExclusiveSplit）
const buildSplitOptions = (
  t: (k: string, p?: Record<string, string | number>) => string
): { key: string; label: string; desc: string }[] => [
  { key: 'sp_65_35', label: '65 : 35', desc: t('le.split6535') },
  { key: 'sp_50_50', label: '50 : 50', desc: t('le.split5050') },
  { key: 'sp_30_70', label: '30 : 70', desc: t('le.split3070') },
  { key: 'sp_20_80', label: '20 : 80', desc: t('le.split2080') }
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
  const { t } = useI18n()
  const router = useRouter()
  const id = router.params?.id || ''
  const user = useAuthStore((s) => s.user)
  const PROPERTY_TYPES = buildPropertyTypes(t)
  const LISTING_TYPES = buildListingTypes(t)
  const MANDATE_TYPES = buildMandateTypes(t)
  const SPLIT_OPTIONS = buildSplitOptions(t)

  const [form, setForm] = useState<any>(emptyForm())
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  // 经纪人上架协议签约态（未激活 → 提示先签约）
  const [listingActive, setListingActive] = useState<boolean | null>(null)
  // 归属业主选择器（员工代业主发布时必选）：后端 POST /listings 对非 owner 角色强制要求
  // owner_id，且该值是 Owner 表主键——此前做成自由文本让用户手填 UUID，实际不可能填对。
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false)
  const [ownerKeyword, setOwnerKeyword] = useState('')
  const [ownerList, setOwnerList] = useState<any[]>([])
  const [ownerLoading, setOwnerLoading] = useState(false)
  const [ownerLabel, setOwnerLabel] = useState('')
  const ownerTimer = useRef<any>(null)

  const isStaff = ['admin', 'agent', 'employee'].includes(user?.role || '')

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }))

  const loadOwners = async (kw: string) => {
    setOwnerLoading(true)
    try {
      const res: any = await ownerApi.list({ keyword: kw || undefined, page_size: 50 })
      const payload = obj(res)
      setOwnerList(Array.isArray(payload.items) ? payload.items : [])
    } catch (err) {
      console.error('[ListingEdit] 业主检索失败', err)
      setOwnerList([])
    } finally {
      setOwnerLoading(false)
    }
  }

  // 首次进入（新建且为员工身份）先拉一批业主，避免用户点开是空面板
  useEffect(() => {
    if (!id && isStaff) loadOwners('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isStaff])

  useEffect(() => () => {
    if (ownerTimer.current) clearTimeout(ownerTimer.current)
  }, [])

  const onOwnerKeyword = (value: string) => {
    setOwnerKeyword(value)
    if (ownerTimer.current) clearTimeout(ownerTimer.current)
    ownerTimer.current = setTimeout(() => loadOwners(value), 300)
  }

  const pickOwner = (o: any) => {
    set('owner_id', o.id)
    setOwnerLabel(`${o.name || o.email || o.id}${o.phone ? ` · ${o.phone}` : ''}`)
    setOwnerPickerOpen(false)
  }

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
        Taro.showToast({ title: t('le.loadListingFailed'), icon: 'none' })
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
    if (!form.room_number.trim()) return t('le.roomRequired')
    if (!form.address.trim()) return t('le.addressRequired')
    // 后端对非 owner 角色强制要求 owner_id，前端先拦，避免一定失败的提交
    if (!id && isStaff && !form.owner_id) return t('le.ownerRequired')
    if (isSell) {
      if (num(form.asking_price) === undefined) return t('le.priceRequired')
      const r = num(form.sale_commission_rate)
      if (r !== undefined && (r < 3 || r > 6)) return t('le.saleRateRange')
    } else {
      if (num(form.monthly_rent) === undefined) return t('le.rentRequired')
      if (![1, 1.5, 2, 3].includes(Number(form.rental_commission_months))) return t('le.rentMonthsInvalid')
    }
    if (isExclusive) {
      const b = num(form.buyer_side_rate)
      if (b === undefined || b < 70 || b > 100) return t('le.buyerRateRange')
    }
    if (!form.owner_contact_visible && !form.owner_contact_name && !form.owner_contact_phone) {
      // 允许隐藏，但如果填了则继续
    }
    return ''
  }

  const handleSave = async () => {
    const tip = validate()
    if (tip) return Taro.showToast({ title: tip, icon: 'none' })
    setSaving(true)
    try {
      if (id) {
        await listingApi.update(id, buildPayload())
        Taro.showToast({ title: t('common.saved'), icon: 'success' })
      } else {
        await listingApi.create(buildPayload())
        Taro.showToast({ title: t('le.submitted'), icon: 'success' })
      }
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (err: any) {
      console.error('[ListingEdit] 保存失败', err)
      Taro.showToast({ title: err?.message || t('le.saveFailed'), icon: 'none' })
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
        <View className='le-state'><Text className='le-state__text'>{t('common.loading')}</Text></View>
      </View>
    )
  }

  return (
    <View className='le-page'>
      <ScrollView scrollY className='le-scroll'>
        {/* 房源信息 */}
        <View className='le-card'>
          <Text className='le-card__title'>{t('le.cardInfo')}</Text>
          {row(t('le.listingType'), (
            <Picker
              mode='selector'
              range={LISTING_TYPES.map((t) => t.label)}
              value={listingTypeIndex < 0 ? 0 : listingTypeIndex}
              onChange={(e: any) => set('listing_type', LISTING_TYPES[Number(e.detail.value)].key)}
            >
              <View className='le-picker'>
                <Text className='le-picker__text'>{LISTING_TYPES[listingTypeIndex < 0 ? 0 : listingTypeIndex]?.label || t('prop.select')}</Text>
                <Text className='le-picker__arrow'>▼</Text>
              </View>
            </Picker>
          ), true)}
          {row(t('le.propertyType'), (
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
          {row(t('le.roomNo'), (
            <Input className='le-input' value={form.room_number} placeholder={t('prop.roomNoPlaceholder')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('room_number', e.detail.value)} />
          ), true)}
          {row(t('prop.addressLabel'), (
            <Input className='le-input' value={form.address} placeholder={t('prop.addressPlaceholder')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('address', e.detail.value)} />
          ), true)}
          {row(t('prop.buildingLabel'), (
            <Input className='le-input' value={form.building} placeholder={t('prop.buildingPlaceholder')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('building', e.detail.value)} />
          ))}
          {row(t('prop.floorLabel'), (
            <Input className='le-input' type='number' value={String(form.floor ?? '')} placeholder='0'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('floor', e.detail.value)} />
          ))}
          {row(t('le.areaLabel'), (
            <Input className='le-input' type='digit' value={String(form.size_sqm ?? '')} placeholder='0'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('size_sqm', e.detail.value)} />
          ))}
          {row(t('prop.bedrooms'), (
            <Input className='le-input' type='number' value={String(form.bedrooms ?? '')} placeholder='0'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('bedrooms', e.detail.value)} />
          ))}
          {row(t('prop.bathrooms'), (
            <Input className='le-input' type='number' value={String(form.bathrooms ?? '')} placeholder='0'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('bathrooms', e.detail.value)} />
          ))}
          {row(t('prop.furnishedYes'), (
            <Switch checked={form.furnished} color='#14b8a6'
              onChange={(e: any) => set('furnished', e.detail.value)} />
          ))}
          {row(t('le.availableDate'), (
            <Input className='le-input' value={form.available_from} placeholder='2026-10-01'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('available_from', e.detail.value)} />
          ))}
          {row(t('le.videoUrl'), (
            <Input className='le-input' value={form.video_url} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('video_url', e.detail.value)} />
          ))}
        </View>

        {/* 价格 */}
        <View className='le-card'>
          <Text className='le-card__title'>{t('le.priceCard')}</Text>
          {isSell ? (
            <>
              {row(t('pub.salePrice'), (
                <Input className='le-input' type='digit' value={String(form.asking_price ?? '')} placeholder='0'
                  placeholderStyle='color:#98a1ab' onInput={(e: any) => set('asking_price', e.detail.value)} />
              ), true)}
            </>
          ) : (
            <>
              {row(t('prop.monthlyRent'), (
                <Input className='le-input' type='digit' value={String(form.monthly_rent ?? '')} placeholder='0'
                  placeholderStyle='color:#98a1ab' onInput={(e: any) => set('monthly_rent', e.detail.value)} />
              ), true)}
            </>
          )}
          {row(t('prop.currencyLabel'), (
            <Input className='le-input' value={form.currency} placeholder='THB'
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('currency', e.detail.value)} />
          ))}
        </View>

        {/* 分佣配置 */}
        <View className='le-card'>
          <Text className='le-card__title'>{t('le.commissionCard')}</Text>
          {isSell ? (
            row(t('le.saleRate'), (
              <Input className='le-input' type='digit' value={String(form.sale_commission_rate ?? '')}
                placeholder='3–6' placeholderStyle='color:#98a1ab'
                onInput={(e: any) => set('sale_commission_rate', e.detail.value)} />
            ), true)
          ) : (
            row(t('le.rentCommission'), (
              <Picker
                mode='selector'
                range={RENT_MONTHS.map((m) => t('le.monthsN', { n: m }))}
                value={rentMonthIndex}
                onChange={(e: any) => set('rental_commission_months', String(RENT_MONTHS[Number(e.detail.value)]))}
              >
                <View className='le-picker'>
                  <Text className='le-picker__text'>{t('le.monthsN', { n: form.rental_commission_months })}</Text>
                  <Text className='le-picker__arrow'>▼</Text>
                </View>
              </Picker>
            ), true)
          )}

          {row(t('le.mandateLabel'), (
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
              <Text className='le-split__label'>{t('le.buyerRate')}</Text>
              <Input className='le-input' type='digit' value={String(form.buyer_side_rate ?? '')}
                placeholder='70–100' placeholderStyle='color:#98a1ab'
                onInput={(e: any) => set('buyer_side_rate', e.detail.value)} />
              <View className='le-hint'>{t('le.exclusiveHint')}</View>
            </View>
          ) : (
            <View className='le-split'>
              <Text className='le-split__label'>{t('le.splitLabel')}</Text>
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
          <Text className='le-card__title'>{t('le.ownerContactCard')}</Text>
          {row(t('le.ownerName'), (
            <Input className='le-input' value={form.owner_contact_name} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('owner_contact_name', e.detail.value)} />
          ))}
          {row(t('le.ownerPhone'), (
            <Input className='le-input' value={form.owner_contact_phone} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('owner_contact_phone', e.detail.value)} />
          ))}
          {row(t('le.ownerChannel'), (
            <Input className='le-input' value={form.owner_contact_channel} placeholder={t('le.ownerChannelPlaceholder')}
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('owner_contact_channel', e.detail.value)} />
          ))}
          {row(t('le.hideOwnerContact'), (
            <Switch checked={form.owner_contact_visible} color='#14b8a6'
              onChange={(e: any) => set('owner_contact_visible', e.detail.value)} />
          ))}
          <View className='le-hint'>{t('le.hideOwnerHint')}</View>
        </View>

        {/* 经纪人联系方式 */}
        <View className='le-card'>
          <Text className='le-card__title'>{t('le.brokerContactCard')}</Text>
          {row(t('le.brokerCompany'), (
            <Input className='le-input' value={form.broker_company} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_company', e.detail.value)} />
          ))}
          {row(t('le.brokerName'), (
            <Input className='le-input' value={form.broker_real_name} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_real_name', e.detail.value)} />
          ))}
          {row(t('le.phone'), (
            <Input className='le-input' value={form.broker_phone} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_phone', e.detail.value)} />
          ))}
          {row(t('pub.wechat'), (
            <Input className='le-input' value={form.broker_wechat} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_wechat', e.detail.value)} />
          ))}
          {row('LINE', (
            <Input className='le-input' value={form.broker_line} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_line', e.detail.value)} />
          ))}
          {row('WhatsApp', (
            <Input className='le-input' value={form.broker_whatsapp} placeholder={t('le.optional')}
              placeholderStyle='color:#98a1ab' onInput={(e: any) => set('broker_whatsapp', e.detail.value)} />
          ))}
        </View>

        {!id && isStaff && (
          <View className='le-card'>
            <Text className='le-card__title'>{t('le.ownerSection')}</Text>
            <View className='le-owner__trig'
              onClick={() => {
                const next = !ownerPickerOpen
                setOwnerPickerOpen(next)
                if (next && !ownerList.length) loadOwners(ownerKeyword)
              }}>
              <Text className={`le-owner__trig__text${form.owner_id ? '' : ' le-owner__trig__text--placeholder'}`}>
                {ownerLabel || (form.owner_id ? form.owner_id : t('le.ownerPickPlaceholder'))}
              </Text>
              <Text className='le-owner__trig__arrow'>{ownerPickerOpen ? '▲' : '▼'}</Text>
            </View>
            {ownerPickerOpen && (
              <View className='le-owner__panel'>
                <View className='le-owner__search'>
                  <Input className='le-owner__input' value={ownerKeyword} placeholder={t('le.ownerSearchPlaceholder')}
                    placeholderStyle='color:#98a1ab' onInput={(e: any) => onOwnerKeyword(e.detail.value)} />
                </View>
                <ScrollView scrollY className='le-owner__list'>
                  {ownerLoading && !ownerList.length ? (
                    <View className='le-owner__empty'><Text className='le-owner__empty__text'>{t('common.loading')}</Text></View>
                  ) : ownerList.length === 0 ? (
                    <View className='le-owner__empty'><Text className='le-owner__empty__text'>{t('le.ownerNotFound')}</Text></View>
                  ) : ownerList.map((o: any) => (
                    <View key={o.id}
                      className={`le-owner__item${form.owner_id === o.id ? ' le-owner__item--active' : ''}`}
                      onClick={() => pickOwner(o)}>
                      <Text className='le-owner__name'>{o.name || o.email || o.id}</Text>
                      <Text className='le-owner__meta'>
                        {[o.phone, o.email, t('le.ownerManaged', { n: o.property_count ?? 0 })].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            <View className='le-hint'>{t('le.ownerSectionHint')}</View>
          </View>
        )}

        {/* 描述 */}
        <View className='le-card'>
          <Text className='le-card__title'>{t('prop.descTitle')}</Text>
          <Textarea className='le-textarea' value={form.description} placeholder={t('prop.descPlaceholder')}
            placeholderStyle='color:#98a1ab' maxlength={1000}
            onInput={(e: any) => set('description', e.detail.value)} />
        </View>

        <View className='le-footer'>
          <Button className='le-save' loading={saving} onClick={handleSave}>
            {id ? t('le.saveEdit') : t('le.submitListing')}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}