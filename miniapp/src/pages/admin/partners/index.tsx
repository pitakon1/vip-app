import { useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { adminPartnersApi, adminUsersApi } from '@/services/api'
import { MAX_PAGE_SIZE } from '@/lib/api'
import { fmtDate } from '@/utils/format'
import ShellHeader from '@/components/ShellHeader'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

interface PartnerItem {
  id: string
  name: string
  contact_name?: string | null
  contact_phone?: string | null
  license_no?: string | null
  admin_user_id?: string | number | null
  admin_name?: string | null
  status?: string
  is_active?: boolean
  member_count?: number
  created_at?: string
  [key: string]: any
}

const AVAILABLE_STATUS = ['active', 'inactive']

const btn = (loading: boolean, text: string, cls = '', onClick?: () => void) => (
  <View
    className={`pn-btn ${cls} ${loading ? 'pn-btn--disabled' : ''}`}
    onClick={() => {
      if (!loading && onClick) onClick()
    }}
  >
    <Text className='pn-btn__text'>{text}</Text>
  </View>
)

export default function AdminPartnersPage() {
  const { t } = useI18n()
  const [list, setList] = useState<PartnerItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')

  // 表单面板
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PartnerItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    contact_name: '',
    contact_phone: '',
    license_no: '',
    admin_user_id: ''
  })
  const [adminLabel, setAdminLabel] = useState('')
  // 可指定为合作公司管理员候选（平台侧既有账号），用于选择管理员
  const [candidates, setCandidates] = useState<any[]>([])

  const callPhone = (phone?: string) => {
    if (!phone) return
    Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {})
  }

  const loadAdmins = async () => {
    try {
      const res: any = await adminUsersApi.list({
        user_type: 'platform',
        page: 1,
        page_size: MAX_PAGE_SIZE
      })
      const d = res?.data ?? res
      setCandidates(Array.isArray(d) ? d : d?.items || [])
    } catch (error) {
      console.error('[AdminPartners] 加载管理员候选失败', error)
    }
  }

  const fetchList = async () => {
    setLoading(true)
    try {
      const res: any = await adminPartnersApi.list({
        keyword: query || undefined,
        page: 1,
        page_size: MAX_PAGE_SIZE
      })
      const d = res?.data ?? res
      const items: PartnerItem[] = Array.isArray(d) ? d : d?.items || []
      setList(items)
      setTotal(Number(d?.total ?? items.length))
    } catch (error) {
      console.error('[AdminPartners] 获取合作公司失败', error)
      Taro.showToast({ title: t('partner.loadFailed'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchList()
    loadAdmins()
  })

  const handleSearch = () => setQuery(keyword.trim())

  const activeMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    list.forEach((p) => {
      map[String(p.id)] = p.is_active !== false && p.status !== 'inactive'
    })
    return map
  }, [list])

  const visible = useMemo(() => {
    const kw = query.toLowerCase()
    return list.filter((p) => {
      if (filter && activeMap[String(p.id)] !== (filter === 'active')) return false
      if (!kw) return true
      return [p.name, p.contact_name, p.contact_phone, p.license_no]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
  }, [list, filter, activeMap, query])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', contact_name: '', contact_phone: '', license_no: '', admin_user_id: '' })
    setAdminLabel('')
    setShowForm(true)
  }

  const openEdit = (p: PartnerItem) => {
    setEditing(p)
    setForm({
      name: p.name || '',
      contact_name: p.contact_name || '',
      contact_phone: p.contact_phone || '',
      license_no: p.license_no || '',
      admin_user_id: String(p.admin_user_id || '')
    })
    setAdminLabel(p.admin_name || '')
    setShowForm(true)
  }

  const pickAdmin = async () => {
    const names = candidates.map((c) =>
      `${c.full_name || c.username || t('partner.pickAdminPlaceholder')} · ${c.email || ''}`
    )
    if (names.length === 0) {
      Taro.showToast({ title: t('partner.pickAdminPlaceholder'), icon: 'none' })
      return
    }
    const sheet = await Taro.showActionSheet({ itemList: names }).catch(() => null)
    if (!sheet) return
    const picked = candidates[sheet.tapIndex]
    setForm((f) => ({ ...f, admin_user_id: String(picked.id) }))
    setAdminLabel(`${picked.full_name || picked.username || ''} · ${picked.email || ''}`)
  }

  const toggleActive = async (p: PartnerItem) => {
    const active = p.is_active !== false && p.status !== 'inactive'
    const res = await Taro.showModal({
      title: t('partner.title'),
      content: active ? t('partner.confirmDeactivate', { name: p.name }) : t('partner.confirmActivate', { name: p.name })
    })
    if (!res.confirm) return
    try {
      if (active) {
        await adminPartnersApi.deactivate(p.id)
        Taro.showToast({ title: t('partner.deactivated'), icon: 'success' })
      } else {
        await adminPartnersApi.activate(p.id)
        Taro.showToast({ title: t('partner.activated'), icon: 'success' })
      }
      fetchList()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('partner.loadFailed'), icon: 'none' })
    }
  }

  const validate = () => {
    if (!form.name.trim()) {
      Taro.showToast({ title: t('partner.nameRequired'), icon: 'none' })
      return false
    }
    if (!form.admin_user_id) {
      Taro.showToast({ title: t('partner.adminRequired'), icon: 'none' })
      return false
    }
    return true
  }

  const save = async () => {
    if (saving || !validate()) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim(),
      contact_phone: form.contact_phone.trim(),
      license_no: form.license_no.trim(),
      admin_user_id: form.admin_user_id
    }
    try {
      if (editing) {
        await adminPartnersApi.update(editing.id, payload)
        Taro.showToast({ title: t('partner.saved'), icon: 'success' })
      } else {
        await adminPartnersApi.create(payload)
        Taro.showToast({ title: t('partner.created'), icon: 'success' })
      }
      setShowForm(false)
      fetchList()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('partner.loadFailed'), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof typeof form) => (e: any) =>
    setForm((f) => ({ ...f, [key]: e.detail.value }))

  return (
    <View className='pn-page'>
      <ShellHeader title={t('nav.partners')} />

      {/* 顶部操作条 */}
      <View className='pn-topbar'>
        <View className='pn-search'>
          <Input
            className='pn-search__input'
            value={keyword}
            placeholder={t('partner.searchPlaceholder')}
            confirmType='search'
            onInput={(e: any) => setKeyword(e.detail.value)}
            onConfirm={handleSearch}
          />
          <View className='pn-search__btn' onClick={handleSearch}>
            <Text className='pn-search__btn-text'>{t('acc.search')}</Text>
          </View>
        </View>
        <View className='pn-add' onClick={openCreate}>
          <Text className='pn-add__text'>{t('partner.create')}</Text>
        </View>
      </View>

      {/* 状态筛选 */}
      <ScrollView scrollX className='pn-chips'>
        {(['', ...AVAILABLE_STATUS] as const).map((key) => (
          <View
            key={key || 'all'}
            className={`pn-chip ${filter === key ? 'pn-chip--active' : ''}`}
            onClick={() => setFilter(String(key))}
          >
            <Text className='pn-chip__text'>
              {key === '' ? t('userType.all') : key === 'active' ? t('partner.active') : t('partner.inactive')}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* 新建/编辑表单面板 */}
      {showForm && (
        <View className='pn-form'>
          <Text className='pn-form__title'>
            {editing ? t('partner.editTitle') : t('partner.newTitle')}
          </Text>
          <View className='pn-form__row'>
            <Text className='pn-form__label'>{t('partner.detailName')}</Text>
            <Input
              className='pn-form__input'
              value={form.name}
              placeholder={t('partner.detailNamePlaceholder')}
              onInput={set('name')}
            />
          </View>
          <View className='pn-form__row'>
            <Text className='pn-form__label'>{t('partner.detailContact')}</Text>
            <Input
              className='pn-form__input'
              value={form.contact_name}
              placeholder={t('partner.detailContactPlaceholder')}
              onInput={set('contact_name')}
            />
          </View>
          <View className='pn-form__row'>
            <Text className='pn-form__label'>{t('partner.detailPhone')}</Text>
            <Input
              className='pn-form__input'
              type='number'
              value={form.contact_phone}
              placeholder={t('partner.detailPhonePlaceholder')}
              onInput={set('contact_phone')}
            />
          </View>
          <View className='pn-form__row'>
            <Text className='pn-form__label'>{t('partner.detailLicense')}</Text>
            <Input
              className='pn-form__input'
              value={form.license_no}
              placeholder={t('partner.detailLicensePlaceholder')}
              onInput={set('license_no')}
            />
          </View>
          <View className='pn-form__row'>
            <Text className='pn-form__label'>{t('partner.pickAdmin')}</Text>
            <View className='pn-form__pick' onClick={pickAdmin}>
              <Text className={adminLabel ? 'pn-form__pick-text' : 'pn-form__pick-placeholder'}>
                {adminLabel || t('partner.pickAdminPlaceholder')}
              </Text>
            </View>
          </View>
          <View className='pn-form__actions'>
            {btn(saving, t('acc.cancel'), 'pn-btn--ghost', () => setShowForm(false))}
            {btn(saving, saving ? t('acc.saving') : t('acc.save'), 'pn-btn--primary', save)}
          </View>
        </View>
      )}

      <View className='pn-section-head'>
        <Text className='pn-section-head__title'>{t('partner.title')}</Text>
        <Text className='pn-section-head__count'>{t('partner.countPeople', { n: visible.length })}</Text>
      </View>

      <ScrollView scrollY className='pn-list'>
        {loading && visible.length === 0 && <StateBlock loading text={t('acc.loading')} />}
        {!loading && visible.length === 0 && (
          <View className='pn-state'>
            <Text className='pn-state__text'>{t('partner.empty')}</Text>
          </View>
        )}

        {visible.map((p) => {
          const active = activeMap[String(p.id)]
          return (
            <View key={p.id} className={`pn-card ${active ? '' : 'pn-card--dim'}`}>
              <View className='pn-card__head'>
                <View className='pn-card__head-left'>
                  <Text className='pn-card__name'>{p.name || '-'}</Text>
                  {!!p.license_no && <Text className='pn-card__license'>{t('partner.licenseNo')} {p.license_no}</Text>}
                </View>
                <Text className={`badge ${active ? 'badge--success' : 'badge--neutral'}`}>
                  {active ? t('partner.active') : t('partner.inactive')}
                </Text>
              </View>

              <View className='pn-card__meta'>
                <View className='pn-card__meta-row'>
                  <Text className='pn-card__meta-label'>{t('partner.contactName')}</Text>
                  <Text className='pn-card__meta-value'>{p.contact_name || '-'}</Text>
                </View>
                {!!p.contact_phone && (
                  <View className='pn-card__meta-row' onClick={() => callPhone(p.contact_phone)}>
                    <Text className='pn-card__meta-label'>{t('partner.contactPhone')}</Text>
                    <Text className='pn-card__meta-value pn-card__meta-value--link'>{p.contact_phone}</Text>
                  </View>
                )}
                <View className='pn-card__meta-row'>
                  <Text className='pn-card__meta-label'>{t('partner.admin')}</Text>
                  <Text className='pn-card__meta-value'>{p.admin_name || '-'}</Text>
                </View>
              </View>

              <View className='pn-card__foot'>
                <Text className='pn-card__foot-members'>{t('partner.memberCount', { n: p.member_count ?? 0 })}</Text>
                <Text className='pn-card__foot-date'>{t('partner.createdAt', { date: fmtDate(p.created_at) })}</Text>
              </View>

              <View className='pn-card__actions'>
                <View className='pn-act pn-act--edit' onClick={() => openEdit(p)}>{t('partner.edit')}</View>
                <View className='pn-act pn-act--warn' onClick={() => toggleActive(p)}>
                  {active ? t('partner.deactivate') : t('partner.activate')}
                </View>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}