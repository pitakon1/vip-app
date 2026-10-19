import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminDataScopesApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import ShellHeader from '@/components/ShellHeader'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * 管理端 · 数据范围（对齐 Web 端 /system/data-scopes）。
 *
 * 后端接口（GET /admin/data-scopes 等）已就绪：按角色配置默认可见范围，并对个别
 * 用户做例外覆盖。生效优先级：用户级覆盖 → 角色级配置 → 内置默认。
 */
interface RoleScope {
  role: string
  scope: string
  configured?: boolean
}

interface UserScope {
  user_id: string
  full_name?: string | null
  email?: string | null
  role?: string | null
  scope: string
  configured?: boolean
}

/** scope 取值 → i18n 键（缺失时回落后端原始值） */
const SCOPE_KEY: Record<string, string> = {
  self: 'scope.self',
  department: 'scope.department',
  department_and_below: 'scope.departmentAndBelow',
  all: 'scope.all'
}

export default function AdminDataScopesPage() {
  const { t } = useI18n()
  const [roles, setRoles] = useState<RoleScope[]>([])
  const [users, setUsers] = useState<UserScope[]>([])
  const [values, setValues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const scopeLabel = (scope: string) => {
    const key = SCOPE_KEY[scope]
    if (!key) return scope
    const label = t(key)
    return label === key ? scope : label
  }

  const roleLabel = (role: string) => {
    const key = `perm.role.${role}`
    const label = t(key)
    return label === key ? role : label
  }

  const load = async () => {
    setLoading(true)
    try {
      const res: any = await adminDataScopesApi.get()
      const d = res?.data ?? res
      setRoles(d?.roles ?? [])
      setUsers(d?.users ?? [])
      setValues(d?.values ?? [])
    } catch (error) {
      console.error('[AdminDataScopes] 加载数据范围失败', error)
      Taro.showToast({ title: t('scope.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const setRole = async (role: string, scope: string) => {
    if (scope === roles.find((r) => r.role === role)?.scope) return
    try {
      await adminDataScopesApi.setRole(role, scope)
      setRoles((prev) =>
        prev.map((r) => (r.role === role ? { ...r, scope, configured: true } : r))
      )
      Taro.showToast({ title: t('scope.saved'), icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('scope.saveFailed'), icon: 'none' })
    }
  }

  const clearUser = async (row: UserScope) => {
    const res = await Taro.showModal({
      title: t('scope.clear'),
      content: t('scope.clearConfirm'),
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    try {
      await adminDataScopesApi.clearUser(row.user_id)
      setUsers((prev) => prev.filter((u) => u.user_id !== row.user_id))
      Taro.showToast({ title: t('scope.cleared'), icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title: error?.message || t('scope.clearFailed'), icon: 'none' })
    }
  }

  return (
    <View className='ds-page'>
      <ShellHeader title={t('scope.title')} />

      {loading ? (
        <View className='ds-state'>
          <Text className='ds-state__text'>{t('common.loading')}</Text>
        </View>
      ) : (
        <>
          {/* 角色默认数据范围 */}
          <View className='ds-card'>
            <Text className='ds-card__title'>{t('scope.roleSection')}</Text>
            {roles.map((row) => (
              <View key={row.role} className='ds-role'>
                <View className='ds-role__head'>
                  <Text className='ds-role__name'>{roleLabel(row.role)}</Text>
                  <Text className='ds-role__flag'>
                    {row.configured ? t('scope.configured') : t('scope.builtinDefault')}
                  </Text>
                </View>
                <View className='ds-chips'>
                  {values.map((v) => (
                    <View
                      key={v}
                      className={`ds-chip ${row.scope === v ? 'ds-chip--on' : ''}`}
                      onClick={() => setRole(row.role, v)}
                    >
                      <Text className='ds-chip__text'>{scopeLabel(v)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* 用户级覆盖 */}
          <View className='ds-card'>
            <Text className='ds-card__title'>{t('scope.userSection')}</Text>
            {users.length === 0 ? (
              <Text className='ds-empty'>{t('scope.userEmpty')}</Text>
            ) : (
              users.map((row) => (
                <View key={row.user_id} className='ds-user'>
                  <View className='ds-user__body'>
                    <Text className='ds-user__name'>{row.full_name || row.email || row.user_id}</Text>
                    <Text className='ds-user__meta'>
                      {roleLabel(row.role || '')} · {scopeLabel(row.scope)}
                    </Text>
                  </View>
                  <Text className='ds-user__clear' onClick={() => clearUser(row)}>
                    {t('scope.clear')}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      )}

      <BottomNav role='admin' active='settings' />
    </View>
  )
}
