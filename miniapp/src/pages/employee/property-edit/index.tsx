import { useEffect, useState, type ReactNode } from 'react'
import { View, Text, Input, Textarea, Picker, Switch, Button, ScrollView, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { propertiesApi } from '@/services/api'
import './index.scss'

const STATUS_META: { key: string; label: string }[] = [
  { key: 'vacant', label: '空置中' },
  { key: 'rented', label: '已出租' },
  { key: 'renewing', label: '续约中' },
  { key: 'maintenance', label: '维护中' }
]

const STATUS_NAME: Record<string, string> = Object.fromEntries(
  STATUS_META.map((s) => [s.key, s.label])
)

const PROPERTY_TYPES = [
  { key: 'apartment', label: '公寓' },
  { key: 'condo', label: '公寓' },
  { key: 'house', label: '别墅' },
  { key: 'villa', label: '别墅' },
  { key: 'commercial', label: '商铺' },
  { key: 'shop', label: '商铺' },
  { key: 'office', label: '写字楼' }
]

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const parseDetail = (d: any): any => {
  const src = d?.data ?? d ?? {}
  return {
    room_number: src.room_number || '',
    monthly_rent: src.monthly_rent ?? '',
    deposit_amount: src.deposit_amount ?? '',
    deposit_months: src.deposit_months ?? '',
    size_sqm: src.size_sqm ?? '',
    bedrooms: src.bedrooms ?? '',
    bathrooms: src.bathrooms ?? '',
    status: src.status || 'vacant',
    description: src.description || '',
    address: src.address || '',
    currency: src.currency || '',
    building: src.building || '',
    floor: src.floor ?? '',
    available_from: src.available_from ? String(src.available_from).slice(0, 10) : '',
    furnished: !!src.furnished,
    property_type: src.property_type || '',
    photos: Array.isArray(src.photos) ? src.photos : []
  }
}

export default function EmployeePropertyEditPage() {
  const router = useRouter()
  const id = router.params?.id || ''

  const [form, setForm] = useState<any>(null)
  const [initial, setInitial] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 尝试解析 route 传入的 initial data（JSON 字符串，可选）
  useEffect(() => {
    if (!id) {
      Taro.showToast({ title: '缺少房源参数', icon: 'none' })
    }
    const raw = router.params?.initial
    let parsed: any = null
    if (raw) {
      try {
        parsed = JSON.parse(decodeURIComponent(raw))
      } catch (e) {
        parsed = null
      }
    }
    if (parsed) {
      setForm(parseDetail(parsed))
      setInitial(parsed)
    }
  }, [id, router.params?.initial])

  // 无初值时拉取详情
  useEffect(() => {
    if (!id || initial) return
    let alive = true
    setLoading(true)
    propertiesApi
      .get(id)
      .then((res: any) => {
        if (!alive) return
        const d = res?.data ?? res
        setForm(parseDetail(d))
        setInitial(d)
      })
      .catch((err) => {
        console.error('[PropertyEdit] 获取房源失败', err)
        Taro.showToast({ title: '加载房源失败', icon: 'none' })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id, initial])

  const set = (key: string, value: any) =>
    setForm((f: any) => (f ? { ...f, [key]: value } : f))

  const statusIndex = STATUS_META.findIndex((s) => s.key === (form?.status || 'vacant'))
  const typeIndex = PROPERTY_TYPES.findIndex((t) => t.key === (form?.property_type || ''))

  const handleSave = async () => {
    if (!id || !form || saving) return
    setSaving(true)
    try {
      await propertiesApi.update(id, {
        room_number: form.room_number,
        monthly_rent: num(form.monthly_rent),
        deposit_amount: num(form.deposit_amount),
        deposit_months: num(form.deposit_months),
        size_sqm: num(form.size_sqm),
        bedrooms: num(form.bedrooms),
        bathrooms: num(form.bathrooms),
        status: form.status,
        description: form.description,
        address: form.address,
        currency: form.currency,
        building: form.building,
        floor: num(form.floor),
        available_from: form.available_from,
        furnished: !!form.furnished,
        property_type: form.property_type,
        photos: Array.isArray(form.photos) ? form.photos : []
      })
      Taro.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (err) {
      console.error('[PropertyEdit] 保存失败', err)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  // 照片上传：选图后逐张上传，成功后以返回的 photos 覆盖本地列表
  const pickPhotos = () => {
    if (!id) return
    Taro.chooseImage({
      count: 6,
      success: async (res) => {
        const localPaths = (res.tempFilePaths || []).slice(0, 6)
        if (!localPaths.length) return
        Taro.showLoading({ title: '上传中...' })
        try {
          for (const p of localPaths) {
            const r: any = await propertiesApi.uploadPhotos(id, [{ url: p }])
            const body = typeof r?.data === 'string' ? JSON.parse(r.data) : r?.data
            const arr = Array.isArray(body?.photos) ? body.photos : body
            if (Array.isArray(arr)) set('photos', arr)
          }
          Taro.hideLoading()
          Taro.showToast({ title: '已上传', icon: 'success' })
        } catch (err) {
          console.error('[PropertyEdit] 照片上传失败', err)
          Taro.hideLoading()
          Taro.showToast({ title: '上传失败', icon: 'none' })
        }
      }
    })
  }

  const removePhoto = (url: string) => {
    if (!id) return
    Taro.showModal({
      title: '删除照片',
      content: '确认删除该照片？',
      success: async (r) => {
        if (!r.confirm) return
        try {
          const rr: any = await propertiesApi.deletePhoto(id, url)
          const body = rr?.data ?? rr
          const arr = Array.isArray(body?.photos) ? body.photos : body
          if (Array.isArray(arr)) set('photos', arr)
          else set('photos', (form?.photos || []).filter((x: string) => x !== url))
        } catch (err) {
          console.error('[PropertyEdit] 删除照片失败', err)
          Taro.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }

  const row = (label: string, children: ReactNode, key?: string) => (
    <View className='pe-row' key={key}>
      <Text className='pe-row__label'>{label}</Text>
      <View className='pe-row__control'>{children}</View>
    </View>
  )

  if (loading && !form) {
    return (
      <View className='pe-page'>
        <View className='pe-state'>
          <Text className='pe-state__text'>加载中...</Text>
        </View>
      </View>
    )
  }

  if (!form) {
    return (
      <View className='pe-page'>
        <View className='pe-state'>
          <Text className='pe-state__text'>房源不存在或缺少参数</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='pe-page'>
      {/* 顶部条 */}
      <View className='pe-nav'>
        <View className='pe-nav__back' onClick={() => Taro.navigateBack()}>
          <Text className='pe-nav__back-icon'>‹</Text>
          <Text className='pe-nav__back-text'>返回</Text>
        </View>
        <Text className='pe-nav__title'>编辑房源</Text>
        <View className='pe-nav__placeholder' />
      </View>

      <ScrollView scrollY className='pe-scroll'>
        {/* 房源信息 */}
        <View className='pe-card'>
          <Text className='pe-card__title'>房源信息</Text>
          {row('房源编号', (
            <Input
              className='pe-input'
              value={form.room_number}
              placeholder='如 A-12-03'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('room_number', e.detail.value)}
            />
          ))}
          {row('房源类型', (
            <Picker
              mode='selector'
              range={PROPERTY_TYPES.map((t) => t.label)}
              value={typeIndex < 0 ? 0 : typeIndex}
              onChange={(e: any) => {
                const idx = Number(e.detail.value)
                const it = PROPERTY_TYPES[idx]
                if (it) set('property_type', it.key)
              }}
            >
              <View className='pe-picker'>
                <Text className='pe-picker__text'>{PROPERTY_TYPES[typeIndex < 0 ? 0 : typeIndex]?.label || '请选择'}</Text>
                <Text className='pe-picker__arrow'>▼</Text>
              </View>
            </Picker>
          ))}
          {row('地址', (
            <Input
              className='pe-input'
              value={form.address}
              placeholder='请输入详细地址'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('address', e.detail.value)}
            />
          ))}
          {row('楼栋', (
            <Input
              className='pe-input'
              value={form.building}
              placeholder='如 A 栋'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('building', e.detail.value)}
            />
          ))}
          {row('楼层', (
            <Input
              className='pe-input'
              type='number'
              value={form.floor}
              placeholder='0'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('floor', e.detail.value)}
            />
          ))}
          {row('币种', (
            <Input
              className='pe-input'
              value={form.currency}
              placeholder='如 THB / CNY'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('currency', e.detail.value)}
            />
          ))}
          {row('可入住日期', (
            <Input
              className='pe-input'
              value={form.available_from}
              placeholder='2026-10-01'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('available_from', e.detail.value)}
            />
          ))}
          {row('带家具', (
            <Switch
              checked={form.furnished}
              color='#14b8a6'
              onChange={(e: any) => set('furnished', e.detail.value)}
            />
          ))}
          {row('月租', (
            <Input
              className='pe-input'
              type='number'
              value={form.monthly_rent}
              placeholder='0'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('monthly_rent', e.detail.value)}
            />
          ))}
          {row('押金金额', (
            <Input
              className='pe-input'
              type='number'
              value={form.deposit_amount}
              placeholder='0'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('deposit_amount', e.detail.value)}
            />
          ))}
          {row('押金月数', (
            <Input
              className='pe-input'
              type='number'
              value={form.deposit_months}
              placeholder='0'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('deposit_months', e.detail.value)}
            />
          ))}
          {row('面积㎡', (
            <Input
              className='pe-input'
              type='number'
              value={form.size_sqm}
              placeholder='0'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('size_sqm', e.detail.value)}
            />
          ))}
          {row('卧室', (
            <Input
              className='pe-input'
              type='number'
              value={form.bedrooms}
              placeholder='0'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('bedrooms', e.detail.value)}
            />
          ))}
          {row('卫生间', (
            <Input
              className='pe-input'
              type='number'
              value={form.bathrooms}
              placeholder='0'
              placeholderStyle='color:#98a1ab'
              onInput={(e: any) => set('bathrooms', e.detail.value)}
            />
          ))}
          {row('出租状态', (
            <Picker
              mode='selector'
              range={STATUS_META.map((s) => s.label)}
              value={statusIndex < 0 ? 0 : statusIndex}
              onChange={(e: any) => {
                const idx = Number(e.detail.value)
                const it = STATUS_META[idx]
                if (it) set('status', it.key)
              }}
            >
              <View className='pe-picker'>
                <Text className='pe-picker__text'>{STATUS_NAME[form.status] || '请选择'}</Text>
                <Text className='pe-picker__arrow'>▼</Text>
              </View>
            </Picker>
          ))}
        </View>

        {/* 房源照片 */}
        <View className='pe-card'>
          <Text className='pe-card__title'>房源照片</Text>
          {Array.isArray(form.photos) && form.photos.length > 0 && (
            <View className='pe-photo-grid'>
              {form.photos.map((url: string, idx: number) => (
                <View key={idx} className='pe-photo'>
                  <Image className='pe-photo__img' src={url} mode='aspectFill' />
                  <View
                    className='pe-photo__del'
                    onClick={() => removePhoto(url)}
                  >
                    <Text className='pe-photo__del-text'>×</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          <View className='pe-add-btn' onClick={pickPhotos}>
            <Text className='pe-add-btn__text'>＋ 添加照片</Text>
          </View>
        </View>

        {/* 描述 */}
        <View className='pe-card'>
          <Text className='pe-card__title'>房源描述</Text>
          <Textarea
            className='pe-textarea'
            value={form.description}
            placeholder='请输入房源描述...'
            placeholderStyle='color:#98a1ab'
            maxlength={500}
            onInput={(e: any) => set('description', e.detail.value)}
          />
        </View>

        <View className='pe-footer'>
          <Button className='pe-save' loading={saving} onClick={handleSave}>
            保存
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}