import { useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import { employeesApi } from '@/services/api'
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

const DEPARTMENTS = ['全部', '销售部', '运营部', '技术部', '财务部']

// 接口不可用/为空时回退示例数据（与 Web 端风格一致）
const STATIC_CONTACTS: Colleague[] = [
  { id: 's1', full_name: '王明华', position: '销售经理', department: '销售部', phone: '+60 12-345 6789' },
  { id: 's2', full_name: '李婷婷', position: '销售代表', department: '销售部', phone: '+60 12-888 2233' },
  { id: 's3', full_name: '张伟强', position: '运营主管', department: '运营部', phone: '+60 16-220 4455' },
  { id: 's4', full_name: '陈晓琳', position: '运营专员', department: '运营部', phone: '+60 11-557 8899' },
  { id: 's5', full_name: '刘建国', position: '技术总监', department: '技术部', phone: '+60 18-332 1100' },
  { id: 's6', full_name: '黄思琪', position: '前端工程师', department: '技术部', phone: '+60 17-661 2456' },
  { id: 's7', full_name: '周建华', position: '财务主管', department: '财务部', phone: '+60 15-778 9900' },
  { id: 's8', full_name: '吴美玲', position: '会计', department: '财务部', phone: '+60 13-229 6677' }
]

const EMERGENCY_CONTACTS = [
  { name: '赵国栋', position: '总经理', phone: '+60 12-999 0001', tone: 'primary' },
  { name: '孙慧敏', position: '人力资源主管', phone: '+60 12-999 0002', tone: 'success' },
  { name: '周凯文', position: 'IT 技术支持', phone: '+60 12-999 0003', tone: 'info' }
]

const CHANNELS = [
  { label: '服务热线', value: '02-888-8888', copyable: true },
  { label: '咨询邮箱', value: 'support@viprental.co.th', copyable: true },
  { label: '办公地址', value: '曼谷 · 素坤逸路 88 号', copyable: false },
  { label: '工作时间', value: '周一至周日 09:00 - 18:00', copyable: false }
]

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
  const [department, setDepartment] = useState('全部')

  const fetchAll = async () => {
    setLoading(true)
    try {
      const res = await employeesApi.list({ pageSize: 500 })
      const items = pickList(res)
      setColleagues(items.length ? items : STATIC_CONTACTS)
    } catch {
      setColleagues(STATIC_CONTACTS)
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
    if (department !== '全部' && (e.department || '') !== department) return false
    const kw = keyword.trim().toLowerCase()
    if (!kw) return true
    const name = (e.full_name || '').toLowerCase()
    const pos = (e.position || '').toLowerCase()
    const phone = (e.phone || '').toLowerCase()
    return name.includes(kw) || pos.includes(kw) || phone.includes(kw)
  })

  const copy = (value: string) => {
    Taro.setClipboardData({
      data: value,
      success: () => Taro.showToast({ title: '已复制', icon: 'none' })
    })
  }

  const renderCard = (e: Colleague, emergency = false) => {
    const tone = getTone(e)
    const toneClass = TONE_CLASS[tone] || 'primary'
    const initial = (e.full_name || '?').charAt(0)
    return (
      <View key={e.id || e.full_name} className='c-card c-card--row'>
        <View className={`c-avatar c-avatar--${toneClass}`}>
          <Text className='c-avatar__text'>{initial}</Text>
        </View>
        <View className='c-card__body'>
          <View className='c-card__top'>
            <Text className='c-card__name'>{e.full_name || '-'}</Text>
            {e.department ? (
              <View className={`c-dept c-dept--${toneClass}`}>
                <Text className='c-dept__text'>{e.department}</Text>
              </View>
            ) : null}
          </View>
          <Text className='c-card__pos'>{e.position || (emergency ? '紧急联系人' : '同事')}</Text>
          {e.phone ? (
            <View className='c-card__phone' onClick={() => copy(e.phone!)}>
              <Text className='c-card__phone-text'>{e.phone}</Text>
              <Text className='c-card__copy'>复制</Text>
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
          <Text className='c-search__icon'>⌕</Text>
          <Input
            className='c-search__input'
            value={keyword}
            placeholder='按姓名、职位或电话搜索'
            placeholderClass='c-search__placeholder'
            onInput={(e: any) => setKeyword(e.detail.value)}
          />
        </View>

        {/* 部门筛选 */}
        <ScrollView scrollX className='c-deps' showScrollbar={false}>
          <View className='c-deps__row'>
            {DEPARTMENTS.map((d) => (
              <View
                key={d}
                className={`c-dep ${department === d ? 'c-dep--active' : ''}`}
                onClick={() => setDepartment(d)}
              >
                <Text className={`c-dep__text ${department === d ? 'c-dep__text--active' : ''}`}>{d}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <Text className='c-count'>共 {visible.length} 位同事</Text>

        {loading && colleagues.length === 0 ? (
          <View className='c-state'>
            <View className='c-state__spinner' />
            <Text className='c-state__title'>正在加载通讯录</Text>
          </View>
        ) : visible.length === 0 ? (
          <View className='c-state'>
            <Text className='c-state__icon'>员</Text>
            <Text className='c-state__title'>没有找到同事</Text>
            <Text className='c-state__desc'>换个关键词或部门试试</Text>
          </View>
        ) : (
          <View className='c-list'>
            {visible.map((e) => renderCard(e))}
          </View>
        )}

        {/* 紧急联系人 */}
        <View className='c-sec'>
          <View className='c-sec__title-row'>
            <View className='c-sec__icon c-sec__icon--error'>
              <Text className='c-sec__icon-text'>!</Text>
            </View>
            <Text className='c-sec__title'>紧急联系人</Text>
            <View className='c-badge c-badge--error'>
              <Text className='c-badge__text'>7×24 应急</Text>
            </View>
          </View>
        </View>
        <View className='c-list'>
          {EMERGENCY_CONTACTS.map((c) => renderCard({ ...c, id: c.name, full_name: c.name }, true))}
        </View>

        {/* 平台服务渠道 */}
        <View className='c-sec'>
          <View className='c-sec__title-row'>
            <View className='c-sec__icon'>
              <Text className='c-sec__icon-text'>服</Text>
            </View>
            <Text className='c-sec__title'>平台服务渠道</Text>
          </View>
        </View>
        <View className='c-card'>
          {CHANNELS.map((ch) => (
            <View key={ch.label} className='c-row'>
              <View className='c-row__info'>
                <Text className='c-row__label'>{ch.label}</Text>
                <Text className='c-row__value'>{ch.value}</Text>
              </View>
              {ch.copyable && (
                <View className='c-row__copy' onClick={() => copy(ch.value)}>
                  <Text className='c-row__copy-text'>复制</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}