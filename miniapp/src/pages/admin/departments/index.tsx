import { useEffect, useState } from 'react'
import { View, Text, Input, Switch } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminDepartmentsApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 管理端 · 部门管理（对齐 Web 端 /system/departments）。
 *
 * 后端部门树接口（GET /admin/departments/tree，含 member_count）已就绪；小程序端
 * 提供部门层级维护（新增根/新增下级/编辑/删除）。成员归属（/assign）在 Web 端完成。
 */
interface DeptNode {
  id: string
  name: string
  code: string
  parent_id?: string | null
  leader_id?: string | null
  leader_name?: string | null
  sort?: number
  is_active?: boolean
  member_count?: number
  children?: DeptNode[]
}

interface FlatRow {
  node: DeptNode
  depth: number
}

/** 树 → 带层级的扁平数组（按深度缩进渲染） */
function flatten(nodes: DeptNode[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  nodes.forEach((n) => {
    out.push({ node: n, depth })
    if (n.children?.length) flatten(n.children, depth + 1, out)
  })
  return out
}

interface FormState {
  open: boolean
  mode: 'create' | 'edit'
  id: string
  parentId: string | null
  parentName: string
  name: string
  code: string
  sort: string
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  open: false,
  mode: 'create',
  id: '',
  parentId: null,
  parentName: '',
  name: '',
  code: '',
  sort: '0',
  isActive: true
}

export default function AdminDepartmentsPage() {
  const { t } = useI18n()
  const [rows, setRows] = useState<FlatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const load = async () => {
    setLoading(true)
    try {
      const res: any = await adminDepartmentsApi.tree()
      const list: DeptNode[] = Array.isArray(res) ? res : res?.data ?? res?.items ?? []
      setRows(flatten(list))
    } catch (error) {
      console.error('[AdminDepartments] 加载部门失败', error)
      Taro.showToast({ title: t('dept.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = (parent?: DeptNode) =>
    setForm({
      ...EMPTY_FORM,
      open: true,
      mode: 'create',
      parentId: parent?.id ?? null,
      parentName: parent?.name ?? ''
    })

  const openEdit = (node: DeptNode) =>
    setForm({
      open: true,
      mode: 'edit',
      id: node.id,
      parentId: node.parent_id ?? null,
      parentName: '',
      name: node.name,
      code: node.code,
      sort: String(node.sort ?? 0),
      isActive: node.is_active !== false
    })

  const closeForm = () => setForm(EMPTY_FORM)

  const submit = async () => {
    const name = form.name.trim()
    const code = form.code.trim()
    if (!name || !code) {
      Taro.showToast({ title: t('dept.requiredName'), icon: 'none' })
      return
    }
    setSaving(true)
    try {
      if (form.mode === 'create') {
        await adminDepartmentsApi.create({
          name,
          code,
          parent_id: form.parentId,
          sort: Number(form.sort) || 0
        })
        Taro.showToast({ title: t('dept.createOk'), icon: 'success' })
      } else {
        await adminDepartmentsApi.update(form.id, {
          name,
          code,
          sort: Number(form.sort) || 0,
          is_active: form.isActive
        })
        Taro.showToast({ title: t('dept.updateOk'), icon: 'success' })
      }
      closeForm()
      load()
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('dept.saveFailed'), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (node: DeptNode) => {
    const res = await Taro.showModal({
      title: t('dept.delete'),
      content: t('dept.deleteConfirm'),
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    try {
      await adminDepartmentsApi.remove(node.id)
      Taro.showToast({ title: t('dept.deleteOk'), icon: 'success' })
      load()
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('dept.removeFailed'), icon: 'none' })
    }
  }

  return (
    <View className='dm-page'>
      <ShellHeader title={t('dept.title')} />

      <View className='dm-toolbar'>
        <Text className='dm-toolbar__desc'>{t('dept.subtitle')}</Text>
        <View className='dm-add' onClick={() => openCreate()}>
          <Text className='dm-add__text'>+ {t('dept.add')}</Text>
        </View>
      </View>

      {loading ? (
        <View className='dm-state'>
          <Text className='dm-state__text'>{t('common.loading')}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View className='dm-state'>
          <Text className='dm-state__text'>{t('dept.empty')}</Text>
        </View>
      ) : (
        <View className='dm-list'>
          {rows.map(({ node, depth }) => (
            <View
              key={node.id}
              className='dm-card'
              style={{ marginLeft: `${depth * 28}rpx` }}
            >
              <View className='dm-card__head'>
                <View className='dm-card__title-row'>
                  <Text className='dm-card__name'>{node.name}</Text>
                  {node.is_active === false && (
                    <Text className='dm-tag dm-tag--off'>{t('dept.inactive')}</Text>
                  )}
                </View>
                <Text className='dm-card__code'>{node.code}</Text>
              </View>
              <View className='dm-card__meta'>
                <Text className='dm-card__meta-text'>
                  {t('dept.members')} · {node.member_count ?? 0}
                </Text>
                {node.leader_name && (
                  <Text className='dm-card__meta-text'>{node.leader_name}</Text>
                )}
              </View>
              <View className='dm-card__actions'>
                <Text className='dm-act' onClick={() => openCreate(node)}>
                  + {t('dept.add')}
                </Text>
                <Text className='dm-act' onClick={() => openEdit(node)}>
                  {t('dept.edit')}
                </Text>
                <Text className='dm-act dm-act--danger' onClick={() => remove(node)}>
                  {t('dept.delete')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {form.open && (
        <View className='modal-mask' onClick={closeForm}>
          <View className='modal-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-sheet__title'>
              {form.mode === 'create' ? t('dept.add') : t('dept.edit')}
            </Text>
            {form.mode === 'create' && form.parentName && (
              <Text className='dm-form-hint'>{form.parentName}</Text>
            )}

            <View className='form-field'>
              <Text className='form-field__label'>{t('dept.formName')}</Text>
              <Input
                className='form-field__input'
                value={form.name}
                placeholder={t('dept.formName')}
                onInput={(e) => setForm((p) => ({ ...p, name: e.detail.value }))}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('dept.formCode')}</Text>
              <Input
                className='form-field__input'
                value={form.code}
                placeholder={t('dept.formCode')}
                onInput={(e) => setForm((p) => ({ ...p, code: e.detail.value }))}
              />
            </View>
            <View className='form-field'>
              <Text className='form-field__label'>{t('dept.formSort')}</Text>
              <Input
                className='form-field__input'
                type='number'
                value={form.sort}
                placeholder='0'
                onInput={(e) => setForm((p) => ({ ...p, sort: e.detail.value }))}
              />
            </View>
            {form.mode === 'edit' && (
              <View className='dm-switch-row'>
                <Text className='form-field__label'>{t('dept.formActive')}</Text>
                <Switch
                  checked={form.isActive}
                  color='#14b8a6'
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.detail.value }))}
                />
              </View>
            )}

            <View className='modal-actions'>
              <View className='modal-btn modal-btn--ghost' onClick={closeForm}>
                <Text className='modal-btn__text'>{t('dept.cancel')}</Text>
              </View>
              <View
                className={`modal-btn modal-btn--primary ${saving ? 'modal-btn--disabled' : ''}`}
                onClick={() => {
                  if (saving) return
                  submit()
                }}
              >
                <Text className='modal-btn__text modal-btn__text--primary'>
                  {saving ? t('dept.saving') : t('dept.save')}
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
