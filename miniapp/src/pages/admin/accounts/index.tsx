import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { request } from '@/lib/api'
import './index.scss'

interface Account {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  groups: string[]
  employee?: { employee_code?: string; department?: string; position?: string }
}

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  agent: '经纪人',
  employee: '员工',
  owner: '业主',
  tenant: '租客',
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [resetTarget, setResetTarget] = useState<Account | null>(null)
  const [newPwd, setNewPwd] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const res: any = await request({ url: '/admin/users?page_size=100', method: 'GET' })
      const d = res ?? {}
      setAccounts(d.items ?? [])
    } catch (e) {
      console.error('[Accounts] 加载失败', e)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchData()
  })

  const toggle = async (acc: Account) => {
    try {
      await request({ url: `/admin/users/${acc.id}/${acc.is_active ? 'deactivate' : 'activate'}`, method: 'POST' })
      Taro.showToast({ title: acc.is_active ? '已停用' : '已启用', icon: 'success' })
      fetchData()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '操作失败', icon: 'none' })
    }
  }

  const resetPwd = async () => {
    if (!resetTarget) return
    if (!newPwd || newPwd.length < 6) {
      Taro.showToast({ title: '新密码至少 6 位', icon: 'none' })
      return
    }
    try {
      await request({ url: `/admin/users/${resetTarget.id}/reset-password`, method: 'POST', data: { new_password: newPwd } })
      Taro.showToast({ title: '密码已重置', icon: 'success' })
      setResetTarget(null)
      setNewPwd('')
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '重置失败', icon: 'none' })
    }
  }

  return (
    <View className='ac-page'>
      <View className='ac-page__head'>
        <Text className='ac-page__title'>账号管理</Text>
        <Text className='ac-page__sub'>共 {accounts.length} 个账号 · 完整管理请在 Web 后台</Text>
      </View>

      {loading && accounts.length === 0 ? (
        <View className='ac-state'>
          <Text className='ac-state__title'>正在加载</Text>
        </View>
      ) : accounts.length === 0 ? (
        <View className='ac-state'>
          <Text className='ac-state__title'>暂无账号</Text>
        </View>
      ) : (
        accounts.map((acc) => (
          <View key={acc.id} className='ac-card'>
            <View className='ac-card__main'>
              <View className='ac-avatar'>{`${(acc.full_name || '?').charAt(0).toUpperCase()}`}</View>
              <View className='ac-card__body'>
                <Text className='ac-card__name'>{acc.full_name}</Text>
                <Text className='ac-card__email'>{acc.email}</Text>
                <View className='ac-card__meta'>
                  <Text className='ac-tag'>{ROLE_LABEL[acc.role] || acc.role}</Text>
                  {acc.employee?.department ? <Text className='ac-card__dept'>{acc.employee.department}</Text> : null}
                  {acc.groups?.length ? <Text className='ac-card__dept'>{acc.groups.join(' / ')}</Text> : null}
                </View>
              </View>
              <View className='ac-switch' onClick={() => toggle(acc)}>
                <View className={`ac-switch__dot ${acc.is_active ? 'ac-switch__dot--on' : ''}`} />
                <Text className={`ac-switch__text ${acc.is_active ? 'ac-switch__text--on' : ''}`}>
                  {acc.is_active ? '启用' : '停用'}
                </Text>
              </View>
            </View>
            <View className='ac-card__foot' onClick={() => { setResetTarget(acc); setNewPwd('') }}>
              <Text className='ac-card__reset'>重置密码 ›</Text>
            </View>
          </View>
        ))
      )}

      {/* 重置密码弹层 */}
      {resetTarget && (
        <View className='ac-mask' onClick={() => setResetTarget(null)}>
          <View className='ac-modal' onClick={(e) => e.stopPropagation()}>
            <Text className='ac-modal__title'>重置密码 · {resetTarget.full_name}</Text>
            <Input
              className='ac-modal__input'
              password
              placeholder='输入新密码（至少 6 位）'
              value={newPwd}
              onInput={(e) => setNewPwd(e.detail.value)}
            />
            <View className='ac-modal__actions'>
              <View className='ac-modal__btn ac-modal__btn--ghost' onClick={() => setResetTarget(null)}>
                <Text className='ac-modal__btn-text ac-modal__btn-text--ghost'>取消</Text>
              </View>
              <View className='ac-modal__btn ac-modal__btn--primary' onClick={resetPwd}>
                <Text className='ac-modal__btn-text ac-modal__btn-text--primary'>确认重置</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}