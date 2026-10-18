import { useState } from 'react'
import { View, Text, Input, Picker, Button, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { projectsApi } from '@/services/api'
import './index.scss'
import { useI18n } from '@/i18n'
import ShellHeader from '@/components/ShellHeader'

// 产权类型（对齐后端 Project.Tenure 枚举）
const buildTenures = (
  t: (k: string, p?: Record<string, string | number>) => string
): { key: string; label: string }[] => [
  { key: 'freehold', label: t('np.tenureFreehold') },
  { key: 'leasehold', label: t('np.tenureLeasehold') },
  { key: 'mixed', label: t('np.tenureMixed') }
]

// 销售状态（对齐后端 Project.sale_status 自由字符串）
const buildSaleStatuses = (
  t: (k: string, p?: Record<string, string | number>) => string
): { key: string; label: string }[] => [
  { key: '', label: t('np.saleStatusNone') },
  { key: 'pre_sale', label: t('category.salePreSale') },
  { key: 'on_sale', label: t('category.saleOnSale') },
  { key: 'sold_out', label: t('category.saleSoldOut') }
]

const num = (v: string) => {
  if (v === '' || v === undefined || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const emptyForm = () => ({
  name: '',
  address: '',
  city: '',
  district: '',
  developer: '',
  total_units: '',
  completion_year: '',
  tenure: 'freehold',
  avg_price: '',
  sale_status: '',
  open_date: ''
})

export default function NewProjectPage() {
  const { t } = useI18n()
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage)
  const user = useAuthStore((s) => s.user)
  const TENURES = buildTenures(t)
  const SALE_STATUSES = buildSaleStatuses(t)

  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const set = (key: keyof ReturnType<typeof emptyForm>, value: any) =>
    setForm((f) => ({ ...f, [key]: value }))

  const tenureIdx = Math.max(0, TENURES.findIndex((x) => x.key === form.tenure))
  const saleIdx = Math.max(0, SALE_STATUSES.findIndex((x) => x.key === form.sale_status))

  // 新增楼盘为 agent/admin 能力：非该角色直接拦截，避免暴露给业主/租客
  const canCreate = ['admin', 'agent'].includes(user?.role || '')

  useDidShow(() => {
    loadFromStorage()
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
    }
  })

  const handleSubmit = async () => {
    if (!form.name.trim()) return Taro.showToast({ title: t('np.nameRequired'), icon: 'none' })
    if (!form.address.trim()) return Taro.showToast({ title: t('np.addressRequired'), icon: 'none' })
    const payload: Record<string, any> = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim() || undefined,
      district: form.district.trim() || undefined,
      developer: form.developer.trim() || undefined,
      total_units: num(form.total_units),
      completion_year: num(form.completion_year),
      tenure: form.tenure || undefined,
      avg_price: num(form.avg_price),
      sale_status: form.sale_status || undefined,
      open_date: form.open_date.trim() || undefined
    }
    setSaving(true)
    Taro.showLoading({ title: t('common.saving'), mask: true })
    try {
      await projectsApi.create(payload)
      Taro.hideLoading()
      Taro.showToast({ title: t('np.submitted'), icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (err: any) {
      console.error('[NewProject] 创建失败', err)
      Taro.hideLoading()
      Taro.showToast({ title: err?.message || t('np.saveFailed'), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  if (!canCreate) {
    return (
      <View className='np-page'>
        <ShellHeader title={t('nav.newProject')} />
        <View className='np-state'>
          <Text className='np-state__text'>{t('np.adminOnlyHint')}</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='np-page'>
      <ShellHeader title={t('nav.newProject')} />
      <ScrollView scrollY className='np-scroll'>
        <View className='np-card'>
          <Text className='np-label'>{t('np.name')}</Text>
          <Input
            className='np-input'
            value={form.name}
            onInput={(e: any) => set('name', e.detail.value)}
            placeholder={t('np.name')}
            maxlength={80}
          />

          <Text className='np-label'>{t('np.address')}</Text>
          <Input
            className='np-input'
            value={form.address}
            onInput={(e: any) => set('address', e.detail.value)}
            placeholder={t('np.address')}
            maxlength={200}
          />

          <View className='np-row'>
            <View className='np-col'>
              <Text className='np-label'>{t('np.city')}</Text>
              <Input
                className='np-input'
                value={form.city}
                onInput={(e: any) => set('city', e.detail.value)}
                maxlength={60}
              />
            </View>
            <View className='np-col'>
              <Text className='np-label'>{t('np.district')}</Text>
              <Input
                className='np-input'
                value={form.district}
                onInput={(e: any) => set('district', e.detail.value)}
                maxlength={60}
              />
            </View>
          </View>

          <Text className='np-label'>{t('np.developer')}</Text>
          <Input
            className='np-input'
            value={form.developer}
            onInput={(e: any) => set('developer', e.detail.value)}
            maxlength={120}
          />

          <View className='np-row'>
            <View className='np-col'>
              <Text className='np-label'>{t('np.totalUnits')}</Text>
              <Input
                className='np-input'
                type='number'
                value={form.total_units}
                onInput={(e: any) => set('total_units', e.detail.value)}
              />
            </View>
            <View className='np-col'>
              <Text className='np-label'>{t('np.completionYear')}</Text>
              <Input
                className='np-input'
                type='number'
                value={form.completion_year}
                onInput={(e: any) => set('completion_year', e.detail.value)}
              />
            </View>
          </View>

          <View className='np-row'>
            <View className='np-col'>
              <Text className='np-label'>{t('np.tenure')}</Text>
              <Picker
                mode='selector'
                range={TENURES.map((x) => x.label)}
                value={tenureIdx}
                onChange={(e: any) => set('tenure', TENURES[Number(e.detail.value)].key)}
              >
                <View className='np-picker'>
                  <Text className='np-picker__text'>{TENURES[tenureIdx]?.label}</Text>
                  <Text className='np-picker__arrow'>▾</Text>
                </View>
              </Picker>
            </View>
            <View className='np-col'>
              <Text className='np-label'>{t('np.saleStatus')}</Text>
              <Picker
                mode='selector'
                range={SALE_STATUSES.map((x) => x.label)}
                value={saleIdx}
                onChange={(e: any) => set('sale_status', SALE_STATUSES[Number(e.detail.value)].key)}
              >
                <View className='np-picker'>
                  <Text className='np-picker__text'>{SALE_STATUSES[saleIdx]?.label}</Text>
                  <Text className='np-picker__arrow'>▾</Text>
                </View>
              </Picker>
            </View>
          </View>

          <View className='np-row'>
            <View className='np-col'>
              <Text className='np-label'>{t('np.avgPrice')}</Text>
              <Input
                className='np-input'
                type='digit'
                value={form.avg_price}
                onInput={(e: any) => set('avg_price', e.detail.value)}
                placeholder='0'
              />
            </View>
            <View className='np-col'>
              <Text className='np-label'>{t('np.openDate')}</Text>
              <Input
                className='np-input'
                value={form.open_date}
                onInput={(e: any) => set('open_date', e.detail.value)}
                placeholder={t('op.datePlaceholder')}
                maxlength={10}
              />
            </View>
          </View>
        </View>

        <View className='np-footer'>
          <Button className='np-save' loading={saving} onClick={handleSubmit}>
            {t('np.submit')}
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}
