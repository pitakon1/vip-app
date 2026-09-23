import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminPermissionsApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 管理端 · 角色权限配置（对齐 Web 端 /system/permissions）。
 *
 * 后端 RBAC 读写（GET/PUT /admin/permissions/roles/{role}）早已就绪，但小程序端
 * 一直没有入口，管理员在小程序里无法调整任何角色的权限。
 */
interface PermissionItem {
  code: string
  name: string
  description?: string | null
}

/** 角色顺序对齐 Web 端 System/Permissions.tsx（文案走 i18n：perm.role.*） */
const ROLE_KEYS = ['admin', 'agent', 'employee', 'owner', 'tenant']

/** 权限点 code → i18n key（system:settings → perm.system.settings），缺失时回落后端中文 */
const permKey = (code: string) => `perm.${code.replace(/:/g, '.')}`

export default function AdminPermissionsPage() {
  const { t } = useI18n()
  const [categories, setCategories] = useState<Record<string, PermissionItem[]>>({})
  const [roles, setRoles] = useState<Record<string, string[]>>({})
  const [role, setRole] = useState('admin')
  const [checked, setChecked] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  /** 类目文案（后端 Permission.category 取值） */
  const catLabel = (cat: string) => {
    const label = t(`perm.cat.${cat}`)
    return label === `perm.cat.${cat}` ? cat : label
  }
  /** 权限点名 / 描述：优先 i18n，缺失时回落后端返回的中文 */
  const permName = (p: PermissionItem) => {
    const label = t(permKey(p.code))
    return label === permKey(p.code) ? p.name : label
  }
  const permDesc = (p: PermissionItem) => {
    if (!p.description) return ''
    const desc = t(`${permKey(p.code)}.desc`)
    return desc === `${permKey(p.code)}.desc` ? p.description : desc
  }

  // 一次拉全量（权限点分组 + 各角色分配），切换角色只做本地切换，不重复请求
  const load = async () => {
    setLoading(true)
    try {
      const res: any = await adminPermissionsApi.list()
      const d = res?.data ?? res
      setCategories(d?.categories ?? {})
      setRoles(d?.roles ?? {})
    } catch (error) {
      console.error('[AdminPermissions] 加载权限失败', error)
      Taro.showToast({ title: t('perm.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 切换角色 / 重新拉取 / 保存成功后，勾选态回到该角色的最新分配
  useEffect(() => {
    setChecked(roles[role] ?? [])
  }, [role, roles])

  const total = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0)

  const toggle = (code: string) =>
    setChecked((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))

  const toggleCat = (codes: string[]) => {
    const allOn = codes.length > 0 && codes.every((c) => checked.includes(c))
    setChecked((prev) =>
      allOn ? prev.filter((c) => !codes.includes(c)) : Array.from(new Set([...prev, ...codes]))
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      const res: any = await adminPermissionsApi.setRole(role, checked)
      const d = res?.data ?? res
      const saved: string[] = d?.permissions ?? checked
      setRoles((prev) => ({ ...prev, [role]: saved }))
      Taro.showToast({
        title: t('perm.savedToast', { label: t(`perm.role.${role}`) }),
        icon: 'success'
      })
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('perm.saveFailed'), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className='pm-page'>
      {/* 角色切换 */}
      <ScrollView scrollX className='pm-roles'>
        {ROLE_KEYS.map((key) => (
          <View
            key={key}
            className={`pm-role ${role === key ? 'pm-role--active' : ''}`}
            onClick={() => setRole(key)}
          >
            <Text className='pm-role__text'>{t(`perm.role.${key}`)}</Text>
          </View>
        ))}
      </ScrollView>

      {loading ? (
        <View className='pm-state'>
          <Text className='pm-state__text'>{t('perm.loading')}</Text>
        </View>
      ) : (
        <>
          <Text className='pm-summary'>
            {t('perm.selectedCount', { n: checked.length, total })}
          </Text>

          {/* 按类目一键全选 */}
          <View className='pm-quick'>
            {Object.entries(categories).map(([cat, perms]) => {
              const codes = perms.map((p) => p.code)
              const allOn = codes.length > 0 && codes.every((c) => checked.includes(c))
              const someOn = codes.some((c) => checked.includes(c))
              return (
                <View
                  key={cat}
                  className={`pm-quick__item ${allOn || someOn ? 'pm-quick__item--on' : ''}`}
                  onClick={() => toggleCat(codes)}
                >
                  <Text className='pm-quick__text'>
                    {allOn ? '✓' : someOn ? '·' : '+'} {t('perm.selectAll')} · {catLabel(cat)}
                  </Text>
                </View>
              )
            })}
          </View>

          {/* 权限点分组勾选 */}
          {Object.entries(categories).map(([cat, perms]) => (
            <View key={cat} className='pm-card'>
              <Text className='pm-card__title'>{catLabel(cat)}</Text>
              {perms.map((p) => {
                const on = checked.includes(p.code)
                return (
                  <View key={p.code} className='pm-perm' onClick={() => toggle(p.code)}>
                    <View className={`pm-perm__box ${on ? 'pm-perm__box--on' : ''}`}>
                      {on && <Text className='pm-perm__tick'>✓</Text>}
                    </View>
                    <View className='pm-perm__body'>
                      <Text className='pm-perm__name'>{permName(p)}</Text>
                      {!!p.description && (
                        <Text className='pm-perm__desc'>{permDesc(p)}</Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          ))}
        </>
      )}

      {/* 保存（固定在底部导航之上） */}
      <View className='pm-save-bar'>
        <View
          className={`pm-save-btn ${saving || loading ? 'pm-save-btn--disabled' : ''}`}
          onClick={() => {
            if (saving || loading) return
            save()
          }}
        >
          <Text className='pm-save-btn__text'>{saving ? t('perm.saving') : t('perm.save')}</Text>
        </View>
      </View>

      {/* 底部导航：系统设置继承「我的」高亮 */}
      <BottomNav role='admin' active='settings' />
    </View>
  )
}
