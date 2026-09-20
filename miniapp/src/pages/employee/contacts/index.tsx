import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import './index.scss'

interface Colleague {
  id: string
  full_name?: string | null
  position?: string | null
  department?: string | null
  phone?: string | null
  [key: string]: any
}

// 部门 → 色调
const DEPT_TONE: Record<string, string> = {
  销售部: 'primary',
  运营部: 'success',
  技术部: 'info',
  财务部: 'warning'
}

const TONE_CLASS: Record<string, string> = {
  primary: 'primary',
  success: 'success',
  info: 'info',
  warning: 'warning'
}

const getTone = (e: Colleague): string => {
  if (e.department && DEPT_TONE[e.department]) return DEPT_TONE[e.department]
  return 'primary'
}

function pickList(res: any): Colleague[] {
  const d = res?.data ?? res ?? {}
  const items = Array.isArray(d) ? d : d?.items ?? []
  return items
}

export default function EmployeeContactsPage() {
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const fetchAll = async () => {
    setLoading(true)
    try {
      const res = await employeesApi.list({ page: 1, page_size: 500 })
      setColleagues(pickList(res))
    } catch {
      setColleagues([])
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    fetchAll()
  })

  const visible = colleagues.filter((e) => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return true
    const name = (e.full_name || '').toLowerCase()
    const pos = (e.position || '').toLowerCase()
    const phone = (e.phone || '').toLowerCase()
    const dept = (e.department || '').toLowerCase()
    return name.includes(kw) || pos.includes(kw) || phone.includes(kw) || dept.includes(kw)
  })

  // 按部门分组（保持接口返回的首现顺序）
  const groups: { name: string; items: Colleague[] }[] = []
  visible.forEach((e) => {
    const name = e.department || '其他'
    let g = groups.find((it) => it.name === name)
    if (!g) {
      g = { name, items: [] }
      groups.push(g)
    }
    g.items.push(e)
  })

  const callPhone = (phone?: string | null) => {
    if (!phone) return
    Taro.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') }).catch(() => {})
  }

  const sendMessage = () => {
    Taro.navigateTo({ url: '/pages/chat/list/index' })
  }

  const renderItem = (e: Colleague) => {
    const tone = TONE_CLASS[getTone(e)] || 'primary'
    const initial = (e.full_name || '?').charAt(0)
    return (
      <View key={e.id || e.full_name} className='c-item'>
        <View className={`c-avatar c-avatar--${tone}`}>
          <Text className='c-avatar__text'>{initial}</Text>
        </View>
        <View className='c-item__body'>
          <Text className='c-item__name'>{e.full_name || '-'}</Text>
          <Text className='c-item__pos'>{e.position || '员工'}</Text>
          {e.phone ? <Text className='c-item__phone'>{e.phone}</Text> : null}
        </View>
        <View className='c-item__ops'>
          <View className='c-op' hoverClass='c-op--hover' onClick={sendMessage}>
            <Text className='c-op__text'>聊</Text>
          </View>
          {e.phone ? (
            <View
              className='c-op c-op--primary'
              hoverClass='c-op--hover'
              onClick={() => callPhone(e.phone)}
            >
              <Text className='c-op__text c-op__text--primary'>拨</Text>
            </View>
          ) : null}
        </View>
      </View>
    )
  }

  return (
    <View className='c-page'>
      <View className='page-container'>
        {/* 搜索 */}
        <View className='c-search'>
          <Text className='c-search__icon'>搜</Text>
          <Input
            className='c-search__input'
            value={keyword}
            placeholder='搜索姓名/部门/电话'
            placeholderClass='c-search__placeholder'
            onInput={(e: any) => setKeyword(e.detail.value)}
          />
        </View>

        {loading && colleagues.length === 0 ? (
          <View className='c-state'>
            <View className='c-state__spinner' />
            <Text className='c-state__title'>正在加载通讯录</Text>
          </View>
        ) : groups.length === 0 ? (
          <View className='c-state'>
            <Text className='c-state__icon'>员</Text>
            <Text className='c-state__title'>暂无同事信息</Text>
            <Text className='c-state__desc'>换个关键词试试</Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.name} className='c-group'>
              <View className='c-group__head'>
                <Text className='c-group__title'>{g.name}</Text>
                <View className={`c-dept c-dept--${TONE_CLASS[getTone({ department: g.name } as Colleague)] || 'primary'}`}>
                  <Text className='c-dept__text'>{g.items.length} 人</Text>
                </View>
              </View>
              {g.items.map((e) => renderItem(e))}
            </View>
          ))
        )}
      </View>

      <BottomNav role='employee' active='contacts' />
    </View>
  )
}