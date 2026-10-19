import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input, Switch } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminOptionsApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 管理端 · 数据字典（对齐 Web 端 /system/options）。
 *
 * 读接口 `GET /options` 匿名可读；写接口 `POST/PATCH/DELETE /admin/options` 需
 * `option:manage` 权限。系统内置项（is_system）不可删除，只能停用。
 */
interface OptionItem {
  id: string
  type: string
  value: string
  label: string
  label_i18n?: Record<string, string>
  sort?: number
  is_active?: boolean
  is_system?: boolean
}

interface FormState {
  open: boolean
  mode: 'create' | 'edit'
  id: string
  type: string
  value: string
  label: string
  zh: string
  en: string
  th: string
  sort: string
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  open: false,
  mode: 'create',
  id: '',
  type: '',
  value: '',
  label: '',
  zh: '',
  en: '',
  th: '',
  sort: '0',
  isActive: true
}

export default function AdminOptionsPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<OptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const load = async () => {
    setLoading(true)
    try {
      // active_only=false：管理端需看到停用项
      const res: any = await adminOptionsApi.list({ active_only: false })
      const list: OptionItem[] = Array.isArray(res) ? res : res?.data ?? res?.items ?? []
      setItems(
        [...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.value.localeCompare(b.value))
      )
    } catch (error) {
      console.error('[AdminOptions] 加载字典失败', error)
      Taro.showToast({ title: t('dict.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 按 type 分组（保持出现顺序）
  const groups = useMemo(() => {
    const map = new Map<string, OptionItem[]>()
    items.forEach((it) => {
      const arr = map.get(it.type) ?? []
      arr.push(it)
      map.set(it.type, arr)
    })
    return Array.from(map.entries())
  }, [items])

  const openCreate = () =>
    setForm({ ...EMPTY_FORM, open: true, mode: 'create' })

  const openEdit = (it: OptionItem) =>
    setForm({
      open: true,
      mode: 'edit',
      id: it.id,
      type: it.type,
      value: it.value,
      label: it.label,
      zh: it.label_i18n?.zh ?? '',
      en: it.label_i18n?.en ?? '',
      th: it.label_i18n?.th ?? '',
      sort: String(it.sort ?? 0),
      isActive: it.is_active !== false
    })

  const closeForm = () => setForm(EMPTY_FORM)

  const collectI18n = () => {
    const out: Record<string, string> = {}
    if (form.zh.trim()) out.zh = form.zh.trim()
    if (form.en.trim()) out.en = form.en.trim()
    if (form.th.trim()) out.th = form.th.trim()
    return out
  }

  const submit = async () => {
    if (form.mode === 'create') {
      if (!form.type.trim() || !form.value.trim()) {
        Taro.showToast({ title: t('dict.requiredType'), icon: 'none' })
        return
      }
    }
    setSaving(true)
    try {
      if (form.mode === 'create') {
        await adminOptionsApi.create({
          type: form.type.trim(),
          value: form.value.trim(),
          label: form.label.trim(),
          label_i18n: collectI18n(),
          sort: Number(form.sort) || 0,
          is_active: form.isActive
        })
        Taro.showToast({ title: t('dict.createOk'), icon: 'success' })
      } else {
        await adminOptionsApi.update(form.id, {
          label: form.label.trim(),
          label_i18n: collectI18n(),
          sort: Number(form.sort) || 0,
          is_active: form.isActive
        })
        Taro.showToast({ title: t('dict.updateOk'), icon: 'success' })
      }
      closeForm()
      load()
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('dict.saveFailed'), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (it: OptionItem, next: boolean) => {
    try {
      await adminOptionsApi.update(it.id, { is_active: next })
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, is_active: next } : x)))
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('dict.saveFailed'), icon: 'none' })
    }
  }

  const remove = async (it: OptionItem) => {
    if (it.is_system) {
      Taro.showToast({ title: t('dict.system'), icon: 'none' })
      return
    }
    const res = await Taro.showModal({
      title: t('dict.delete'),
      content: t('dict.deleteConfirm'),
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    try {
      await adminOptionsApi.remove(it.id)
      setItems((prev) => prev.filter((x) => x.id !== it.id))
      Taro.showToast({ title: t('dict.deleteOk'), icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('dict.removeFailed'), icon: 'none' })
    }
  }

  return (
    <View className='op-page'>
      <ShellHeader title={t('dict.title')} />

      <View className='op-toolbar'>
        <View className='op-add' onClick={openCreate}>
          <Text className='op-add__text'>+ {t('dict.add')}</Text>
        </View>
      </View>

      {loading ? (
        <View className='op-state'>
          <Text className='op-state__text'>{t('common.loading')}</Text>
        </View>
      ) : groups.length === 0 ? (
        <View className='op-state'>
          <Text className='op-state__text'>{t('dict.empty')}</Text>
        </View>
      ) : (
        groups.map(([type, list]) => (
          <View key={type} className='op-card'>
            <Text className='op-card__title'>{type}</Text>
            {list.map((it) => (
              <View key={it.id} className='op-row'>
                <View className='op-row__body' onClick={() => openEdit(it)}>
                  <View className='op-row__title-row'>
                    <Text className='op-row__label'>{it.label || it.value}</Text>
                    {it.is_system && <Text className='op-tag'>{t('dict.system')}</Text>}
                  </View>
                  <Text className='op-row__meta'>
                    {t('dict.value')}: {it.value}
                  </Text>
                </View>
                <View className='op-row__actions'>
                  <Switch
                    checked={it.is_active !== false}
                    color='#14b8a6'
                    onChange={(e) => toggleActive(it, e.detail.value)}
                  />
                  {!it.is_system && (
                    <Text className='op-row__del' onClick={() => remove(it)}>
                      {t('dict.delete')}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))
      )}

      {form.open && (
        <View className='modal-mask' onClick={closeForm}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>
              {form.mode === 'create' ? t('dict.add') : t('dict.edit')}
            </Text>

            {form.mode === 'create' ? (
              <>
                <View className='form-field'>
                  <Text className='form-field__label'>{t('dict.formType')}</Text>
                  <Input
                    className='form-field__input'
                    value={form.type}
                    placeholder={t('dict.formType')}
                    onInput={(e) => setForm((p) => ({ ...p, type: e.detail.value }))}
                  />
                </View>
                <View className='form-field'>
                  <Text className='form-field__label'>{t('dict.formValue')}</Text>
                  <Input
                    className='form-field__input'
                    value={form.value}
                    placeholder={t('dict.formValue')}
                    onInput={(e) => setForm((p) => ({ ...p, value: e.detail.value }))}
                  />
                </View>
              </>
            ) : (
              <View className='op-form-static'>
                <Text className='op-form-static__text'>
                  {form.type} · {form.value}
                </Text>
              </View>
            )}

            <View className='form-field'>
              <Text className='form-field__label'>{t('dict.formLabel')}</Text>
              <Input
                className='form-field__input'
                value={form.label}
                placeholder={t('dict.formLabel')}
                onInput={(e) => setForm((p) => ({ ...p, label: e.detail.value }))}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>中文 (zh)</Text>
              <Input
                className='form-field__input'
                value={form.zh}
                placeholder={form.label}
                onInput={(e) => setForm((p) => ({ ...p, zh: e.detail.value }))}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>English (en)</Text>
              <Input
                className='form-field__input'
                value={form.en}
                placeholder={form.label}
                onInput={(e) => setForm((p) => ({ ...p, en: e.detail.value }))}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>ไทย (th)</Text>
              <Input
                className='form-field__input'
                value={form.th}
                placeholder={form.label}
                onInput={(e) => setForm((p) => ({ ...p, th: e.detail.value }))}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('dict.formSort')}</Text>
              <Input
                className='form-field__input'
                type='number'
                value={form.sort}
                placeholder='0'
                onInput={(e) => setForm((p) => ({ ...p, sort: e.detail.value }))}
              />
            </View>
            <View className='op-switch-row'>
              <Text className='form-field__label'>{t('dict.formActive')}</Text>
              <Switch
                checked={form.isActive}
                color='#14b8a6'
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.detail.value }))}
              />
            </View>

            <View className='modal-actions'>
              <View className='modal-btn modal-btn--ghost' onClick={closeForm}>
                <Text className='modal-btn__text'>{t('dict.cancel')}</Text>
              </View>
              <View
                className={`modal-btn modal-btn--primary ${saving ? 'modal-btn--disabled' : ''}`}
                onClick={() => {
                  if (saving) return
                  submit()
                }}
              >
                <Text className='modal-btn__text modal-btn__text--primary'>
                  {saving ? t('dict.saving') : t('dict.save')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      <BottomNav role='admin' active='settings' />
    </View>
  )
}
