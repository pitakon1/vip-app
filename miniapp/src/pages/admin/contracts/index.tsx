/**
 * 员工 / 管理端「电子合同」管理页。
 *
 * 共用后端 contractsApi（员工可见全量，可生成 / 追加签署方 / 复制签署链接 /
 * 推送签署通知 / 编辑 / 作废 / 上传电子合同文件）。
 *
 * 只读字段由后端返回，`can_edit` 为 false 时仅展示、隐藏全部写操作。
 * 功能图标一律 SVG；文本全部走 i18n 三语。
 */
import { useCallback, useState } from 'react'
import { View, Text, ScrollView, Input, Textarea } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { contractsApi } from '@/services/api'
import { iconStyle, type IconKey } from '@/utils/icons'
import ShellHeader from '@/components/ShellHeader'
import BottomNav from '@/components/BottomNav'
import StateBlock from '@/components/StateBlock'
import { useI18n } from '@/i18n'
import './index.scss'

const unwrap = (d: any): any => d?.data ?? d ?? {}

const fmtDate = (x?: string) => (x ? String(x).replace('T', ' ').slice(0, 16) : '-')

const stripHtml = (html?: string) =>
  (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const LANG_OPTIONS: string[] = ['zh', 'en', 'th']

const STATUS_META: Record<string, string> = {
  draft: 'contract.status.draft',
  sent: 'contract.status.sent',
  partially_signed: 'contract.status.partially_signed',
  signed: 'contract.status.signed',
  voided: 'contract.status.voided',
  completed: 'contract.status.completed'
}

const SOURCE_META: Record<string, string> = {
  generated: 'contract.sourceGenerated',
  uploaded: 'contract.sourceUploaded'
}

const ROLE_META: Record<string, string> = {
  landlord: 'contract.roleLandlord',
  owner: 'contract.roleLandlord',
  tenant: 'contract.roleTenant',
  witness: 'contract.roleWitness',
  agent: 'contract.roleAgent'
}

const emptyGen = {
  landlord_name: '',
  tenant_name: '',
  property_address: '',
  room_number: '',
  monthly_rent: '',
  deposit: '',
  term_months: '',
  start_date: '',
  language: 'zh'
}

export default function AdminContractsPage() {
  const { t } = useI18n()
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 详情
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 弹层开关
  const [showGen, setShowGen] = useState(false)
  const [genForm, setGenForm] = useState({ ...emptyGen })
  const [genBusy, setGenBusy] = useState(false)

  const [showParty, setShowParty] = useState(false)
  const [partyForm, setPartyForm] = useState({ name: '', email: '', role: 'tenant' })
  const [partyBusy, setPartyBusy] = useState(false)

  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({ title: '', content_html: '' })
  const [editBusy, setEditBusy] = useState(false)

  const [showVoid, setShowVoid] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)

  // 动作级繁忙（link-send / send / upload）
  const [busyAct, setBusyAct] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await contractsApi.list()
      const d = unwrap(res)
      const items: any[] = Array.isArray(d) ? d : d?.items || []
      setList(items)
    } catch (error) {
      console.error('[AdminContracts] 获取合同失败', error)
      Taro.showToast({ title: t('contract.loadFail'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [t])

  useDidShow(() => {
    void load()
  })

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res: any = await contractsApi.get(id)
      const d = unwrap(res)
      setDetail({ ...d, content_html: d.content_html || '' })
    } catch (error) {
      console.error('[AdminContracts] 加载合同失败', error)
      Taro.showToast({ title: t('contract.loadFail'), icon: 'none' })
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => setDetail(null)

  /* ===== 生成合同 ===== */
  const submitGenerate = async () => {
    setGenBusy(true)
    const counters: any = {}
    if (genForm.landlord_name) counters.landlord_name = genForm.landlord_name
    if (genForm.tenant_name) counters.tenant_name = genForm.tenant_name
    if (genForm.property_address) counters.property_address = genForm.property_address
    if (genForm.room_number) counters.room_number = genForm.room_number
    if (genForm.monthly_rent) counters.monthly_rent = genForm.monthly_rent
    if (genForm.deposit) counters.deposit = genForm.deposit
    if (genForm.term_months) counters.term_months = genForm.term_months
    if (genForm.start_date) counters.start_date = genForm.start_date
    try {
      await contractsApi.generate({ counters, language: genForm.language, kind: 'lease' })
      Taro.showToast({ title: t('contract.generateDone'), icon: 'success' })
      setShowGen(false)
      setGenForm({ ...emptyGen })
      await load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.generateTitle'), icon: 'none' })
    } finally {
      setGenBusy(false)
    }
  }

  /* ===== 复制签署链接 ===== */
  const handleShareLink = async (partyId: string) => {
    if (!detail?.id) return
    setBusyAct(`link-${partyId}`)
    try {
      const res: any = await contractsApi.createShareLink(detail.id, partyId)
      const d = unwrap(res)
      const url = d?.url || d?.token || ''
      if (!url) {
        Taro.showToast({ title: t('contract.linkCopied'), icon: 'none' })
        return
      }
      await Taro.setClipboardData({ data: String(url) })
      Taro.showToast({ title: t('contract.linkCopied'), icon: 'none' })
      await openDetail(detail.id)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.copyLink'), icon: 'none' })
    } finally {
      setBusyAct(null)
    }
  }

  /* ===== 发送签署通知 ===== */
  const handleSend = async () => {
    if (!detail?.id) return
    setBusyAct('send')
    try {
      await contractsApi.sendContract(detail.id, {})
      Taro.showToast({ title: t('contract.sendDone'), icon: 'success' })
      await openDetail(detail.id)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.sendNotice'), icon: 'none' })
    } finally {
      setBusyAct(null)
    }
  }

  /* ===== 追加签署方 ===== */
  const submitParty = async () => {
    if (!detail?.id || !partyForm.name.trim()) {
      Taro.showToast({ title: t('contract.insert'), icon: 'none' })
      return
    }
    setPartyBusy(true)
    try {
      await contractsApi.addParty(detail.id, {
        name: partyForm.name.trim(),
        email: partyForm.email.trim() || undefined,
        role: partyForm.role || 'tenant'
      })
      Taro.showToast({ title: t('contract.addParty'), icon: 'success' })
      setShowParty(false)
      setPartyForm({ name: '', email: '', role: 'tenant' })
      await openDetail(detail.id)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.addParty'), icon: 'none' })
    } finally {
      setPartyBusy(false)
    }
  }

  /* ===== 编辑 ===== */
  const startEdit = () => {
    if (!detail) return
    setEditForm({ title: detail?.title ?? '', content_html: detail?.content_html ?? '' })
    setShowEdit(true)
  }
  const submitEdit = async () => {
    if (!detail?.id) return
    setEditBusy(true)
    try {
      await contractsApi.updateContract(detail.id, {
        title: editForm.title.trim(),
        content_html: editForm.content_html
      })
      Taro.showToast({ title: t('contract.save'), icon: 'success' })
      setShowEdit(false)
      await openDetail(detail.id)
      await load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.editContent'), icon: 'none' })
    } finally {
      setEditBusy(false)
    }
  }

  /* ===== 作废 ===== */
  const doVoid = async () => {
    if (!detail?.id) return
    setVoidBusy(true)
    try {
      await contractsApi.voidContract(detail.id, voidReason.trim() || undefined)
      Taro.showToast({ title: t('contract.void'), icon: 'none' })
      setShowVoid(false)
      setVoidReason('')
      closeDetail()
      await load()
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.void'), icon: 'none' })
    } finally {
      setVoidBusy(false)
    }
  }

  /* ===== 上传电子合同 ===== */
  const handleUpload = () => {
    if (!detail?.id) return
    Taro.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['doc', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'txt', 'xls', 'xlsx']
    }).then(async (res) => {
      const file = res?.tempFiles?.[0]
      if (!file?.path) return
      setBusyAct('upload')
      try {
        // Taro.uploadFile 返回 UploadTask，用 success/fail 判断
        await new Promise<void>((resolve, reject) => {
          const task: any = contractsApi.uploadFile(detail.id, file.path)
          if (task && typeof task.success === 'function') {
            task.success((r: any) => {
              const ok = (r?.statusCode || 200) < 300
              if (ok) resolve()
              else reject(new Error(r?.errMsg || 'upload failed'))
            })
            task.fail((err: any) => reject(err))
          } else {
            Promise.resolve(task).then(() => resolve()).catch(reject)
          }
        })
        Taro.showToast({ title: t('contract.uploadDone'), icon: 'success' })
        await openDetail(detail.id)
      } catch (e: any) {
        Taro.showToast({ title: e?.message || t('contract.upload'), icon: 'none' })
      } finally {
        setBusyAct(null)
      }
    })
  }

  const canEdit = !!detail?.can_edit
  const detailId = detail?.id as string | undefined

  const renderBadge = (cls: string, text: string) => (
    <Text className={`ac-badge ${cls}`}>{text}</Text>
  )

  const sourceBadge = (src?: string) =>
    renderBadge('ac-badge--primary', t(SOURCE_META[src || ''] || 'contract.sourceGenerated'))

  const statusBadge = (status?: string) => {
    const s = status || 'draft'
    const cls =
      s === 'signed' || s === 'completed'
        ? 'ac-badge--success'
        : s === 'voided'
          ? 'ac-badge--error'
          : s === 'draft'
            ? 'ac-badge--default'
            : 'ac-badge--warning'
    return renderBadge(cls, t(STATUS_META[s]))
  }

  const field = (label: string, value?: string, selectable?: boolean) => (
    <View className='ac-detail__field'>
      <Text className='ac-detail__field-label'>{label}</Text>
      <Text className='ac-detail__field-value' userSelect={selectable}>{value || '-'}</Text>
    </View>
  )

  return (
    <View className='ac-page'>
      <ShellHeader title={t('contract.manage')} />

      {detail ? (
        /* ===== 详情 ===== */
        <ScrollView scrollY>
          <View className='ac-detail__back' onClick={closeDetail}>
            <View className='icon-svg' style={iconStyle('close', 26)} />
            <Text className='ac-detail__back-text'>{t('common.back')}</Text>
          </View>

          <View className='ac-detail__meta-card'>
            <View className='ac-card__top'>
              <Text className='ac-card__no'>{detail?.title || t('contract.unknown')}</Text>
              <View className='ac-card__meta'>
                {sourceBadge(detail?.source)}
                {statusBadge(detail?.status)}
              </View>
            </View>
            <Text className='ac-card__title'>{detail?.title || t('contract.unknown')}</Text>
            {field(t('contract.kind'), detail?.kind)}
            {field(t('contract.language'), detail?.language)}
            {field(t('contract.created_at'), fmtDate(detail?.created_at))}
            {detail?.file_path ? field(t('contract.upload'), detail.file_path, true) : null}
          </View>

          <Text className='ac-detail__section-title'>{t('contract.parties')}</Text>
          {Array.isArray(detail?.parties) && detail.parties.length
            ? detail.parties.map((p: any, idx: number) => {
                const statusText = p?.signed
                  ? t('contract.signed')
                  : p?.declined_at
                    ? t('contract.declined')
                    : t('contract.unsigned')
                const statusCls = p?.signed
                  ? 'ac-badge--success'
                  : p?.declined_at
                    ? 'ac-badge--error'
                    : 'ac-badge--warning'
                return (
                  <View key={p?.id ?? idx} className='ac-party'>
                    <View className='ac-party__head'>
                      <View className='ac-party__id'>
                        <Text className='ac-party__name'>{p?.name || t('contract.unknown')}</Text>
                        {p?.role ? (
                          renderBadge('ac-badge--primary', t(ROLE_META[p.role] || 'contract.roleOther'))
                        ) : null}
                      </View>
                      {renderBadge(statusCls, statusText)}
                    </View>
                    {p?.email ? (
                      <Text className='ac-party__meta'>{t('contract.email')}：{p.email}</Text>
                    ) : null}
                    {p?.phone ? (
                      <Text className='ac-party__meta'>{t('contract.phone')}：{p.phone}</Text>
                    ) : null}
                    {p?.signed_at ? (
                      <Text className='ac-party__meta'>{t('contract.signedAt')}：{fmtDate(p.signed_at)}</Text>
                    ) : null}
                    {p?.decline_reason ? (
                      <Text className='ac-party__meta'>{t('contract.declineReason')}：{p.decline_reason}</Text>
                    ) : null}
                    {canEdit && !p?.signed && p?.id ? (
                      <View className='ac-party__actions'>
                        <View
                          className={`ac-btn ac-btn--ghost ${busyAct === `link-${p.id}` ? 'ac-btn--disabled' : ''}`}
                          onClick={() => handleShareLink(String(p.id))}
                        >
                          <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.copyLink')}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )
              })
            : <Text className='ac-state__text'>{t('contract.empty')}</Text>}

          {canEdit ? (
            <>
              <Text className='ac-detail__section-title'>{t('contract.manage')}</Text>
              <View className='ac-detail__actions'>
                <View className={`ac-btn ac-btn--ghost ${busyAct === 'send' ? 'ac-btn--disabled' : ''}`} onClick={handleSend}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.sendNotice')}</Text>
                </View>
                <View className='ac-btn ac-btn--ghost' onClick={() => setShowParty(true)}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.addParty')}</Text>
                </View>
                <View className='ac-btn ac-btn--ghost' onClick={startEdit}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.edit')}</Text>
                </View>
                <View className={`ac-btn ac-btn--ghost ${busyAct === 'upload' ? 'ac-btn--disabled' : ''}`} onClick={handleUpload}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.upload')}</Text>
                </View>
                <View className='ac-btn ac-btn--danger-outline' onClick={() => setShowVoid(true)}>
                  <Text className='ac-btn__text ac-btn__text--danger'>{t('contract.void')}</Text>
                </View>
              </View>
            </>
          ) : (
            <Text className='ac-detail__readonly'>{t('contract.onlyEditable')}</Text>
          )}

          {!!detail?.content_html && (
            <>
              <Text className='ac-detail__section-title'>{t('contract.content')}</Text>
              <View className='ac-content'>
                <View className='ac-content__inner'>
                  <Text userSelect>{stripHtml(detail.content_html)}</Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        /* ===== 列表 ===== */
        <View>
          <View className='ac-gen-btn' onClick={() => setShowGen(true)}>
            <View className='icon-svg' style={{ ...iconStyle('edit', 34), filter: 'brightness(0) invert(1)' }} />
            <Text className='ac-gen-btn__text'>{t('contract.generateTitle')}</Text>
          </View>
          <View className='ac-section-head'>
            <Text className='ac-section-head__title'>{t('contract.manage')}</Text>
            <Text className='ac-section-head__count'>{t('contract.countUnit', { n: list.length })}</Text>
          </View>

          {loading ? (
            <StateBlock loading text={t('pub.loading')} />
          ) : list.length === 0 ? (
            <View className='ac-state'>
              <View className='icon-svg' style={iconStyle('doc', 72)} />
              <Text className='ac-state__text'>{t('contract.empty')}</Text>
              <Text className='ac-state__desc'>{t('contract.emptyHint')}</Text>
            </View>
          ) : (
            list.map((c: any) => (
              <View key={c.id} className='ac-card' onClick={() => openDetail(c.id)}>
                <View className='ac-card__top'>
                  <Text className='ac-card__no'>{String(c.id).slice(0, 8).toUpperCase()}</Text>
                  <View className='ac-card__meta'>
                    {sourceBadge(c.source)}
                    {statusBadge(c.status)}
                  </View>
                </View>
                <Text className='ac-card__title'>{c.title || t('contract.unknown')}</Text>
                <View className='ac-card__divider' />
                <View className='ac-card__row'>
                  <Text className='ac-card__row-text'>{fmtDate(c.created_at)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* ===== 生成合同弹层 ===== */}
      {showGen && (
        <View className='ac-mask' onClick={() => setShowGen(false)}>
          <View className='ac-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='ac-sheet__head'>
              <Text className='ac-sheet__title'>{t('contract.generateTitle')}</Text>
              <View className='ac-sheet__close' onClick={() => setShowGen(false)}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
            <ScrollView scrollY>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.landlord')}</Text>
                <Input className='ac-field__input' value={genForm.landlord_name} placeholder={t('contract.landlord')} onInput={(e: any) => setGenForm({ ...genForm, landlord_name: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.tenant')}</Text>
                <Input className='ac-field__input' value={genForm.tenant_name} placeholder={t('contract.tenant')} onInput={(e: any) => setGenForm({ ...genForm, tenant_name: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.property')}</Text>
                <Input className='ac-field__input' value={genForm.property_address} placeholder={t('contract.property')} onInput={(e: any) => setGenForm({ ...genForm, property_address: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.room')}</Text>
                <Input className='ac-field__input' value={genForm.room_number} placeholder={t('contract.room')} onInput={(e: any) => setGenForm({ ...genForm, room_number: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.rent')}</Text>
                <Input className='ac-field__input' value={genForm.monthly_rent} type='number' placeholder={t('contract.rent')} onInput={(e: any) => setGenForm({ ...genForm, monthly_rent: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.deposit')}</Text>
                <Input className='ac-field__input' value={genForm.deposit} type='number' placeholder={t('contract.deposit')} onInput={(e: any) => setGenForm({ ...genForm, deposit: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.term')}</Text>
                <Input className='ac-field__input' value={genForm.term_months} type='number' placeholder={t('contract.term')} onInput={(e: any) => setGenForm({ ...genForm, term_months: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.startDate')}</Text>
                <Input className='ac-field__input' value={genForm.start_date} placeholder='YYYY-MM-DD' onInput={(e: any) => setGenForm({ ...genForm, start_date: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.language')}</Text>
                <View className='ac-lang-row'>
                  {LANG_OPTIONS.map((l) => (
                    <View
                      key={l}
                      className={`ac-chip ${genForm.language === l ? 'ac-chip--active' : ''}`}
                      onClick={() => setGenForm({ ...genForm, language: l })}
                    >
                      <Text className='ac-chip__text'>{l.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
            <View className={`ac-submit ${genBusy ? 'ac-btn--disabled' : ''}`} onClick={() => { if (!genBusy) void submitGenerate() }}>
              <Text className='ac-submit__text'>{genBusy ? t('pub.loading') : t('contract.generateSubmit')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ===== 追加签署方弹层 ===== */}
      {showParty && (
        <View className='ac-mask' onClick={() => setShowParty(false)}>
          <View className='ac-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='ac-sheet__head'>
              <Text className='ac-sheet__title'>{t('contract.addParty')}</Text>
              <View className='ac-sheet__close' onClick={() => setShowParty(false)}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
            <ScrollView scrollY>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.name')}</Text>
                <Input className='ac-field__input' value={partyForm.name} placeholder={t('contract.name')} onInput={(e: any) => setPartyForm({ ...partyForm, name: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.email')}</Text>
                <Input className='ac-field__input' value={partyForm.email} placeholder={t('contract.email')} onInput={(e: any) => setPartyForm({ ...partyForm, email: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.role')}</Text>
                <View className='ac-lang-row'>
                  {(['tenant', 'landlord', 'witness'] as const).map((r) => (
                    <View
                      key={r}
                      className={`ac-chip ${partyForm.role === r ? 'ac-chip--active' : ''}`}
                      onClick={() => setPartyForm({ ...partyForm, role: r })}
                    >
                      <Text className='ac-chip__text'>{t(ROLE_META[r] || 'contract.roleOther')}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
            <View className={`ac-submit ${partyBusy ? 'ac-btn--disabled' : ''}`} onClick={() => { if (!partyBusy) void submitParty() }}>
              <Text className='ac-submit__text'>{partyBusy ? t('pub.loading') : t('contract.confirm')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ===== 编辑弹层 ===== */}
      {showEdit && (
        <View className='ac-mask' onClick={() => setShowEdit(false)}>
          <View className='ac-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='ac-sheet__head'>
              <Text className='ac-sheet__title'>{t('contract.editContent')}</Text>
              <View className='ac-sheet__close' onClick={() => setShowEdit(false)}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
            <ScrollView scrollY>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.titleLabel')}</Text>
                <Input className='ac-field__input' value={editForm.title} placeholder={t('contract.titleLabel')} onInput={(e: any) => setEditForm({ ...editForm, title: e.detail.value })} />
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.contentLabel')}</Text>
                <Textarea className='ac-field__input ac-field__area' value={editForm.content_html} placeholder={t('contract.contentLabel')} onInput={(e: any) => setEditForm({ ...editForm, content_html: e.detail.value })} />
              </View>
            </ScrollView>
            <View className={`ac-submit ${editBusy ? 'ac-btn--disabled' : ''}`} onClick={() => { if (!editBusy) void submitEdit() }}>
              <Text className='ac-submit__text'>{editBusy ? t('pub.loading') : t('contract.save')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ===== 作废弹层 ===== */}
      {showVoid && (
        <View className='ac-mask' onClick={() => setShowVoid(false)}>
          <View className='ac-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='ac-sheet__head'>
              <Text className='ac-sheet__title'>{t('contract.voidTitle')}</Text>
              <View className='ac-sheet__close' onClick={() => setShowVoid(false)}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
            <Text className='ac-hint'>{t('contract.voidConfirm')}</Text>
            <View className='ac-field'>
              <Input className='ac-field__input' value={voidReason} placeholder={t('contract.voidReason')} onInput={(e: any) => setVoidReason(e.detail.value)} />
            </View>
            <View className={`ac-submit ac-submit--danger ${voidBusy ? 'ac-btn--disabled' : ''}`} onClick={() => { if (!voidBusy) void doVoid() }}>
              <Text className='ac-submit__text'>{voidBusy ? t('pub.loading') : t('contract.void')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 底部导航：合同页继承首页高亮 */}
      <BottomNav role='admin' active='dashboard' />
    </View>
  )
}