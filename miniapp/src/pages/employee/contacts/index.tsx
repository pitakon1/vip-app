import { useEffect, useRef, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi } from '@/services/api'
import BottomNav from '@/components/BottomNav'
import { useI18n } from '@/i18n'
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
  const { t } = useI18n()
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 通讯录必须走 `/employees/directory`：员工角色可访问，且只返回协作所需的
  // 联系方式（不含佣金/薪资）。此前调的是 admin-only 的 `/employees`，
  // 员工角色会 403，页面只能落成「暂无同事信息」的空态。
  // 另外原本传 `page_size: 500` 拉全量，后端硬顶 100 会静默截断；
  // 现在改成关键词下推服务端搜索，不再依赖单次拉全量。
  const fetchDirectory = async (kw = '') => {
    setLoading(true)
    try {
      const res = await employeesApi.directory(kw.trim() ? { keyword: kw.trim() } : undefined)
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
    fetchDirectory()
  })

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
  }, [])

  // 输入时前端先即时过滤（下面 visible），同时防抖触发服务端搜索，
  // 避免同事数超过一页时搜不到本页之外的同事。
  const onKeywordChange = (value: string) => {
    setKeyword(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchDirectory(value)
    }, 300)
  }

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
    const name = e.department || t('common.other')
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
          <Text className='c-item__pos'>{e.position || t('perm.role.employee')}</Text>
          {e.phone ? <Text className='c-item__phone'>{e.phone}</Text> : null}
        </View>
        <View className='c-item__ops'>
          <View className='c-op' hoverClass='c-op--hover' onClick={sendMessage}>
            <Text className='c-op__text'>{t('contacts.chatIcon')}</Text>
          </View>
          {e.phone ? (
            <View
              className='c-op c-op--primary'
              hoverClass='c-op--hover'
              onClick={() => callPhone(e.phone)}
            >
              <Text className='c-op__text c-op__text--primary'>{t('contacts.callIcon')}</Text>
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
          <Text className='c-search__icon'>{t('contacts.searchIcon')}</Text>
          <Input
            className='c-search__input'
            value={keyword}
            placeholder={t('contacts.searchPlaceholder')}
            placeholderClass='c-search__placeholder'
            onInput={(e: any) => onKeywordChange(e.detail.value)}
          />
        </View>

        {loading && colleagues.length === 0 ? (
          <View className='c-state'>
            <View className='c-state__spinner' />
            <Text className='c-state__title'>{t('contacts.loading')}</Text>
          </View>
        ) : groups.length === 0 ? (
          <View className='c-state'>
            <Text className='c-state__icon'>{t('contacts.emptyIcon')}</Text>
            <Text className='c-state__title'>{t('contacts.empty')}</Text>
            <Text className='c-state__desc'>{t('contacts.emptyDesc')}</Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.name} className='c-group'>
              <View className='c-group__head'>
                <Text className='c-group__title'>{g.name}</Text>
                <View className={`c-dept c-dept--${TONE_CLASS[getTone({ department: g.name } as Colleague)] || 'primary'}`}>
                  <Text className='c-dept__text'>{t('contacts.peopleCount', { n: g.items.length })}</Text>
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