import { useState } from 'react'
import { View, Text, Input, Textarea, Button, ScrollView, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import useAuthStore from '@/stores/auth'
import StateBlock from '@/components/StateBlock'
import { propertyBindingsApi } from '@/services/api'
import { unwrapUploadResult } from '@/lib/api'
import { errorText } from '@/lib/errorText'
import { useI18n } from '@/i18n'
import './index.scss'

/**
 * C 端「添加我的房产」（/pages/property-binding/index）
 *
 * 产品模型：C 端只有一种用户，有的名下有房产、有的只是租房；
 * 任何登录用户都能看到入口并提交绑定申请。只有后台审核通过后才建立
 * 用户与房源的关联，「我的房产 / 收益 / 委托」才有数据。
 * 驳回后展示原因，可修改材料重新提交。
 */
interface BindingAttachment {
  name: string
  url: string
  size?: number | null
  content_type?: string | null
}

interface PropertyBinding {
  id: string
  kind?: 'claim' | 'new' | null
  status: 'pending' | 'approved' | 'rejected'
  address: string
  room_number: string
  size_sqm?: number | null
  property_type?: string | null
  note?: string | null
  attachments: BindingAttachment[]
  reject_reason?: string | null
  matched_property_id?: string | null
  created_at?: string | null
}

// 匹配到的系统内已有房源：选中即走「认领」，不选则按「新建房源」提交
interface MatchCandidate {
  property_id: string
  address: string
  room_number: string
  size_sqm?: number | null
  property_type?: string | null
}

const PROPERTY_TYPES = ['apartment', 'house', 'condo', 'villa', 'office', 'shop']
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp']
const MAX_SIZE = 20 * 1024 * 1024

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge--warning',
  approved: 'badge--success',
  rejected: 'badge--error'
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'pb.stPending',
  approved: 'pb.stApproved',
  rejected: 'pb.stRejected'
}

const extOf = (name: string) => {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

const pickList = (res: any): PropertyBinding[] => {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.items)) return res.data.items
  return []
}

export default function PropertyBindingPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<PropertyBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [address, setAddress] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [sizeSqm, setSizeSqm] = useState('')
  const [typeIndex, setTypeIndex] = useState(0)
  const [note, setNote] = useState('')
  const [attachments, setAttachments] = useState<BindingAttachment[]>([])
  const [matches, setMatches] = useState<MatchCandidate[]>([])
  const [matching, setMatching] = useState(false)
  const [matchSearched, setMatchSearched] = useState(false)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const typeLabels = PROPERTY_TYPES.map((p) => t(`pb.type.${p}`))

  const fetchMine = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res: any = await propertyBindingsApi.mine()
      setItems(pickList(res))
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    if (!useAuthStore.getState().token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    void fetchMine()
  })

  const pending = items.find((i) => i.status === 'pending')
  const approved = items.find((i) => i.status === 'approved')

  const resetMatch = () => {
    setMatches([])
    setMatchSearched(false)
    setSelectedPropertyId(null)
  }

  const resetForm = () => {
    setAddress('')
    setRoomNumber('')
    setSizeSqm('')
    setTypeIndex(0)
    setNote('')
    setAttachments([])
    resetMatch()
  }

  const prefillFrom = (b: PropertyBinding) => {
    setAddress(b.address || '')
    setRoomNumber(b.room_number || '')
    setSizeSqm(b.size_sqm != null ? String(b.size_sqm) : '')
    const idx = PROPERTY_TYPES.indexOf(String(b.property_type))
    setTypeIndex(idx >= 0 ? idx : 0)
    setNote(b.note || '')
    setAttachments(b.attachments || [])
    // 认领类申请保留原目标；新建类重新匹配
    setMatches([])
    setMatchSearched(b.kind === 'claim')
    setSelectedPropertyId(b.kind === 'claim' ? b.matched_property_id || null : null)
    Taro.pageScrollTo({ scrollTop: 0, duration: 200 })
  }

  const runMatch = async () => {
    if (!address.trim() || !roomNumber.trim()) {
      Taro.showToast({ title: t('pb.warnMatchFields'), icon: 'none' })
      return
    }
    setMatching(true)
    try {
      const res: any = await propertyBindingsApi.match({
        address: address.trim(),
        room_number: roomNumber.trim()
      })
      const payload = res?.data?.items ? res.data : res?.items ? res : res?.data
      setMatches(Array.isArray(payload?.items) ? payload.items : [])
      setMatchSearched(true)
      // 命中多个时不替用户决定
      setSelectedPropertyId(null)
    } catch (e: any) {
      Taro.showToast({ title: errorText(e, t('pb.errMatch')), icon: 'none' })
    } finally {
      setMatching(false)
    }
  }

  // 地址 / 房号变化后旧匹配结果失效
  const changeAddress = (v: string) => {
    setAddress(v)
    resetMatch()
  }

  const changeRoom = (v: string) => {
    setRoomNumber(v)
    resetMatch()
  }

  const handlePickFiles = async () => {
    if (uploading) return
    try {
      let picked: Array<{ path: string; name: string; size: number }> = []
      if (typeof (Taro as any).chooseMessageFile === 'function') {
        const res: any = await Taro.chooseMessageFile({
          count: 5,
          type: 'file',
          extension: ['pdf', 'jpg', 'jpeg', 'png', 'webp']
        })
        picked = (res.tempFiles || []).map((f: any) => ({
          path: f.path,
          name: f.name || 'proof',
          size: Number(f.size) || 0
        }))
      } else {
        const res: any = await Taro.chooseImage({
          count: 5,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera']
        })
        picked = (res.tempFilePaths || []).map((p: string) => ({
          path: p,
          name: p.slice(p.lastIndexOf('/') + 1) || 'proof.jpg',
          size: 0
        }))
      }
      if (!picked.length) return
      for (const f of picked) {
        if (!ALLOWED_EXT.includes(extOf(f.name))) {
          Taro.showToast({ title: t('pb.errUpload'), icon: 'none' })
          return
        }
        if (f.size > MAX_SIZE) {
          Taro.showToast({ title: t('pb.errUpload'), icon: 'none' })
          return
        }
      }
      setUploading(true)
      Taro.showLoading({ title: t('pb.uploading'), mask: true })
      const uploaded: BindingAttachment[] = []
      for (const f of picked) {
        const up: any = await propertyBindingsApi.uploadAttachment(f.path)
        const payload: any = unwrapUploadResult<any>(up) ?? up
        if (!payload?.url) throw new Error('upload failed')
        uploaded.push({
          name: payload.name || f.name,
          url: payload.url,
          size: payload.size ?? f.size ?? null,
          content_type: payload.content_type || null
        })
      }
      setAttachments((prev) => [...prev, ...uploaded])
      Taro.hideLoading()
    } catch (e: any) {
      Taro.hideLoading()
      Taro.showToast({ title: errorText(e, t('pb.errUpload')), icon: 'none' })
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    if (!address.trim()) {
      Taro.showToast({ title: t('pb.warnAddress'), icon: 'none' })
      return
    }
    if (!roomNumber.trim()) {
      Taro.showToast({ title: t('pb.warnRoom'), icon: 'none' })
      return
    }
    if (!attachments.length) {
      Taro.showToast({ title: t('pb.warnAttachments'), icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      await propertyBindingsApi.create({
        // 选中匹配房源 → 认领；未选中 → 新建待审房源
        kind: selectedPropertyId ? 'claim' : 'new',
        property_id: selectedPropertyId || undefined,
        address: address.trim(),
        room_number: roomNumber.trim(),
        size_sqm: sizeSqm.trim() ? Number(sizeSqm) : undefined,
        property_type: PROPERTY_TYPES[typeIndex],
        note: note.trim() || undefined,
        attachments
      })
      Taro.showToast({ title: t('pb.submitOk'), icon: 'success' })
      resetForm()
      await fetchMine()
    } catch (e: any) {
      Taro.showToast({ title: errorText(e, t('pb.errSubmit')), icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const openMyProperties = () => Taro.navigateTo({ url: '/pages/owner/properties/index' })

  return (
    <ScrollView className='pb-page' scrollY>
      <View className='pb-subtitle'>{t('pb.subtitle')}</View>

      {approved && (
        <View className='pb-card'>
          <Text className='pb-approved'>
            {t('pb.approvedHint', { address: `${approved.address} ${approved.room_number}` })}
          </Text>
          <Text className='pb-link' onClick={openMyProperties}>{t('pb.view')}</Text>
        </View>
      )}

      <View className='section-title'>
        <Text>{t('pb.formTitle')}</Text>
      </View>

      <View className='pb-card'>
        {pending ? (
          <View className='pb-pending'>
            <Text className='pb-pending__title'>{t('pb.pendingTitle')}</Text>
            <Text className='pb-pending__sub'>{t('pb.pendingSub')}</Text>
          </View>
        ) : (
          <>
            <Text className='pb-hint pb-review-notice'>{t('pb.reviewNotice')}</Text>
            <View className='pb-item'>
              <Text className='pb-label'>{t('pb.fieldAddress')} *</Text>
              <Input
                className='pb-input'
                placeholder={t('pb.phAddress')}
                value={address}
                onInput={(e) => changeAddress(e.detail.value)}
              />
            </View>

            <View className='pb-item'>
              <Text className='pb-label'>{t('pb.fieldRoom')} *</Text>
              <Input
                className='pb-input'
                placeholder={t('pb.phRoom')}
                value={roomNumber}
                onInput={(e) => changeRoom(e.detail.value)}
              />
            </View>

            {/* 审核准入：先匹配系统内已有房源，命中即认领，未命中才新建 */}
            <View className='pb-item'>
              <Text className='pb-label'>{t('pb.matchLabel')}</Text>
              <View className='pb-match-btn' onClick={() => void runMatch()}>
                <Text>{matching ? t('pb.matching') : t('pb.matchBtn')}</Text>
              </View>
              <Text className='pb-hint'>{t('pb.matchHint')}</Text>
              {matchSearched && matches.length === 0 && (
                <Text className='pb-hint'>{t('pb.matchNone')}</Text>
              )}
              {matches.length > 0 && (
                <View className='pb-match-list'>
                  <Text className='pb-hint'>{t('pb.matchFound', { n: matches.length })}</Text>
                  {matches.map((m) => (
                    <View
                      key={m.property_id}
                      className={`pb-match-item ${selectedPropertyId === m.property_id ? 'pb-match-item--active' : ''}`}
                      onClick={() => setSelectedPropertyId(m.property_id)}
                    >
                      <Text className='pb-match-item__radio'>
                        {selectedPropertyId === m.property_id ? '●' : '○'}
                      </Text>
                      <View className='pb-match-item__body'>
                        <Text className='pb-match-item__title'>{m.address} · {m.room_number}</Text>
                        <Text className='pb-match-item__meta'>
                          {m.size_sqm ? `${m.size_sqm} m² · ` : ''}
                          {t(`pb.type.${PROPERTY_TYPES.includes(String(m.property_type)) ? m.property_type : 'apartment'}`)}
                        </Text>
                      </View>
                    </View>
                  ))}
                  <Text className='pb-hint'>
                    {selectedPropertyId ? t('pb.claimSelected') : t('pb.claimPickHint')}
                  </Text>
                </View>
              )}
            </View>

            <View className='pb-item'>
              <Text className='pb-label'>{t('pb.fieldSize')}</Text>
              <Input
                className='pb-input'
                type='digit'
                placeholder={t('pb.phSize')}
                value={sizeSqm}
                onInput={(e) => setSizeSqm(e.detail.value)}
              />
            </View>

            <View className='pb-item'>
              <Text className='pb-label'>{t('pb.fieldType')}</Text>
              <Picker
                mode='selector'
                range={typeLabels}
                value={typeIndex}
                onChange={(e) => setTypeIndex(Number(e.detail.value))}
              >
                <View className='pb-picker'>
                  <Text>{typeLabels[typeIndex]}</Text>
                  <Text className='pb-picker__arrow'>›</Text>
                </View>
              </Picker>
            </View>

            <View className='pb-item'>
              <Text className='pb-label'>{t('pb.fieldNote')}</Text>
              <Textarea
                className='pb-textarea'
                placeholder={t('pb.phNote')}
                value={note}
                onInput={(e) => setNote(e.detail.value)}
              />
            </View>

            <View className='pb-item'>
              <Text className='pb-label'>{t('pb.fieldAttachments')} *</Text>
              <Text className='pb-hint'>{t('pb.hintAttachments')}</Text>
              <View className='pb-upload' onClick={() => void handlePickFiles()}>
                <Text>{uploading ? t('pb.uploading') : t('pb.upload')}</Text>
              </View>
              {attachments.map((a) => (
                <View key={a.url} className='pb-file'>
                  <Text className='pb-file__name'>{a.name}</Text>
                  <Text
                    className='pb-file__remove'
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                  >
                    {t('pb.remove')}
                  </Text>
                </View>
              ))}
            </View>

            <Button
              className='pb-submit'
              type='primary'
              loading={submitting}
              disabled={submitting || uploading}
              onClick={() => void handleSubmit()}
            >
              {submitting ? t('pb.submitting') : t('pb.submit')}
            </Button>
          </>
        )}
      </View>

      <View className='section-title'>
        <Text>{t('pb.myApps')}</Text>
      </View>

      {loading && items.length === 0 && <StateBlock loading text={t('common.loading')} />}
      {!loading && loadError && items.length === 0 && (
        <StateBlock
          error
          text={t('pb.loadFailed')}
          retryText={t('common.tapRetry')}
          onRetry={() => void fetchMine()}
        />
      )}
      {!loading && !loadError && items.length === 0 && (
        <>
          <StateBlock empty text={t('pb.empty')} icon='doc' />
          <Text className='pb-empty-hint'>{t('pb.emptySub')}</Text>
        </>
      )}

      {items.map((b) => (
        <View key={b.id} className='pb-app'>
          <View className='pb-app__top'>
            <Text className='pb-app__addr'>{b.address} · {b.room_number}</Text>
            <Text className={`badge ${STATUS_BADGE[b.status] || 'badge--neutral'}`}>
              {t(STATUS_LABEL[b.status] || 'pb.stPending')}
            </Text>
          </View>
          <Text className='pb-app__meta'>
            {t(b.kind === 'claim' ? 'pb.kindClaim' : 'pb.kindNew')}
            {' · '}
            {t(`pb.type.${PROPERTY_TYPES.includes(String(b.property_type)) ? b.property_type : 'apartment'}`)}
            {b.size_sqm ? ` · ${b.size_sqm} m²` : ''}
            {b.created_at ? ` · ${b.created_at.slice(0, 10)}` : ''}
          </Text>
          {b.status === 'rejected' && b.reject_reason ? (
            <Text className='pb-app__reject'>{b.reject_reason}</Text>
          ) : null}
          {b.status === 'rejected' && (
            <Text className='pb-link' onClick={() => prefillFrom(b)}>{t('pb.resubmit')}</Text>
          )}
          {b.status === 'approved' && (
            <Text className='pb-link' onClick={openMyProperties}>{t('pb.view')}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  )
}
