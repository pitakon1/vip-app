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
import { View, Text, ScrollView, Input, Textarea, Image } from '@tarojs/components'
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

// 签署区类型（法大大风格：手写 / 公章 / 日期）
const FIELD_TYPE_META: Record<string, string> = {
  signature: 'contract.field.signature',
  seal: 'contract.field.seal',
  date: 'contract.field.date'
}

const FIELD_TYPES = ['signature', 'seal', 'date'] as const

// 各模板的填充字段（与后端 esign_service.py 渲染函数 counters 保持一致）
// lease → render_contract_html；purchase → render_purchase_html；broker → render_broker_protocol_html
const TMPL_FIELDS: Record<string, { key: string; labelKey: string; numeric?: boolean }[]> = {
  lease: [
    { key: 'landlord_name', labelKey: 'contract.landlord' },
    { key: 'tenant_name', labelKey: 'contract.tenant' },
    { key: 'landlord_id_number', labelKey: 'contract.landlordId' },
    { key: 'tenant_id_number', labelKey: 'contract.tenantId' },
    { key: 'property_address', labelKey: 'contract.property' },
    { key: 'room_number', labelKey: 'contract.room' },
    { key: 'monthly_rent', labelKey: 'contract.rent', numeric: true },
    { key: 'deposit', labelKey: 'contract.deposit', numeric: true },
    { key: 'start_date', labelKey: 'contract.startDate' },
    { key: 'term_months', labelKey: 'contract.term', numeric: true }
  ],
  purchase: [
    { key: 'seller_name', labelKey: 'contract.sellerName' },
    { key: 'seller_id_number', labelKey: 'contract.sellerId' },
    { key: 'buyer_name', labelKey: 'contract.buyerName' },
    { key: 'buyer_id_number', labelKey: 'contract.buyerId' },
    { key: 'property_name', labelKey: 'contract.propertyName' },
    { key: 'room_number', labelKey: 'contract.room' },
    { key: 'property_area', labelKey: 'contract.area', numeric: true },
    { key: 'total_price', labelKey: 'contract.totalPrice', numeric: true },
    { key: 'price_per_sqm', labelKey: 'contract.pricePerSqm', numeric: true },
    { key: 'down_payment', labelKey: 'contract.downPayment', numeric: true },
    { key: 'delivery_date', labelKey: 'contract.deliveryDate' }
  ],
  broker: [
    { key: 'broker_name', labelKey: 'contract.brokerName' },
    { key: 'broker_company', labelKey: 'contract.brokerCompany' },
    { key: 'broker_phone', labelKey: 'contract.brokerPhone' },
    { key: 'broker_channel', labelKey: 'contract.brokerChannel' },
    { key: 'broker_id_number', labelKey: 'contract.brokerId' }
  ]
}

const emptyGen: Record<string, string> = { language: 'zh', kind: 'lease' }
;(Object.values(TMPL_FIELDS).flat() as { key: string }[]).forEach((f) => { emptyGen[f.key] = '' })

export default function AdminContractsPage() {
  const { t } = useI18n()
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 详情
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 弹层开关
  const [showGen, setShowGen] = useState(false)
  const [genForm, setGenForm] = useState<Record<string, string>>({ ...emptyGen })
  const [genBusy, setGenBusy] = useState(false)
  const [tmplList, setTmplList] = useState<any[]>([])

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

  // 签署区（法大大风格）
  const [showField, setShowField] = useState(false)
  const [pdfNumPages, setPdfNumPages] = useState(0)
  const [fieldForm, setFieldForm] = useState({
    partyId: '',
    fieldType: 'signature',
    page: '1',
    x: '',
    y: ''
  })
  const [fieldPage, setFieldPage] = useState(1)
  const [mark, setMark] = useState<{ x: string; y: string }>({ x: '', y: '' })
  const [fieldBusy, setFieldBusy] = useState(false)
  // 验签报告
  const [verifyReport, setVerifyReport] = useState<any | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)

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
    try {
      const r: any = await contractsApi.listTemplates()
      const td = unwrap(r)
      setTmplList(Array.isArray(td) ? td : [])
    } catch (error) {
      console.error('[AdminContracts] 获取合同模板失败', error)
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
      setPdfNumPages(Number((d as any)?.pdf_page_count) || 0)
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
    const kind = genForm.kind || 'lease'
    const counters: any = {}
    ;(TMPL_FIELDS[kind] || []).forEach((f) => {
      if (genForm[f.key]) counters[f.key] = genForm[f.key]
    })
    try {
      await contractsApi.generate({ counters, language: genForm.language, kind })
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
      await contractsApi.sendContract(detail.id, { channel: 'sms' })
      Taro.showToast({ title: t('contract.sendDone'), icon: 'success' })
      await openDetail(detail.id)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.sendNotice'), icon: 'none' })
    } finally {
      setBusyAct(null)
    }
  }

  /* ===== 签署区（法大大风格） ===== */
  const openField = () => {
    setShowField(true)
    setFieldPage(1)
    setMark({ x: '', y: '' })
    setFieldForm({ partyId: '', fieldType: 'signature', page: '1', x: '', y: '' })
  }

  // 在正文 / 页图上点按落框：把触点坐标换算为页面百分比，直接落库无需手填坐标
  const onTapPlace = (e: any) => {
    const touch = (e?.touches && e?.touches[0]) || e?.changedTouches?.[0] || null
    if (!touch || touch.pageX == null) return
    const pageInstance = Taro.getCurrentInstance()?.page
    const q = (pageInstance ? Taro.createSelectorQuery().in(pageInstance) : Taro.createSelectorQuery())
    q.select('#signfield-canvas').boundingClientRect((rect: any) => {
      if (!rect || !rect.width || !rect.height) return
      const x = ((touch.pageX - rect.left) / rect.width) * 100
      const y = ((touch.pageY - rect.top) / rect.height) * 100
      const xf = Math.max(0, Math.min(100, x)).toFixed(1)
      const yf = Math.max(0, Math.min(100, y)).toFixed(1)
      setMark({ x: xf, y: yf })
      setFieldForm((prev) => ({ ...prev, page: String(fieldPage), x: xf, y: yf }))
    }).exec()
  }

  const submitAddField = async () => {
    if (!detail?.id || !fieldForm.partyId || !fieldForm.fieldType) {
      Taro.showToast({ title: t('contract.insert'), icon: 'none' })
      return
    }
    setFieldBusy(true)
    try {
      const page = Number(fieldForm.page) || 1
      const x = Number(fieldForm.x) || 50
      const y = Number(fieldForm.y) || 50
      await contractsApi.saveSignFields(detail.id, [
        {
          party_id: fieldForm.partyId,
          field_type: fieldForm.fieldType,
          page,
          x,
          y,
          // 页面百分比坐标：x/y/w/h 统一为 0-100 的百分比
          w: fieldForm.fieldType === 'date' ? 16 : 24,
          h: fieldForm.fieldType === 'date' ? 3 : 5,
          required: true
        }
      ])
      Taro.showToast({ title: t('contract.fieldSaved'), icon: 'success' })
      setShowField(false)
      setFieldForm({ partyId: '', fieldType: 'signature', page: '1', x: '', y: '' })
      await openDetail(detail.id)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.saveFields'), icon: 'none' })
    } finally {
      setFieldBusy(false)
    }
  }

  const submitDefaultLayout = async () => {
    if (!detail?.id) return
    setFieldBusy(true)
    try {
      const parties = Array.isArray(detail.parties) ? detail.parties.filter((p: any) => !p?.signed && p?.id) : []
      const fields: any[] = parties.flatMap((p: any, i: number) => {
        const base = String(p.id)
        const y = 55 + i * 15
        const type =
          p?.sign_method === 'seal'
            ? 'seal'
            : p?.sign_method === 'date'
              ? 'date'
              : 'signature'
        return [
          // 页面百分比坐标：x/y/w/h 统一为 0-100 的百分比
          { party_id: base, field_type: type, page: 1, x: 30, y, w: 24, h: 5, required: true },
          { party_id: base, field_type: 'date', page: 1, x: 56, y, w: 14, h: 3, required: true }
        ]
      })
      if (!fields.length) {
        Taro.showToast({ title: t('contract.empty'), icon: 'none' })
        return
      }
      await contractsApi.saveSignFields(detail.id, fields)
      Taro.showToast({ title: t('contract.fieldSaved'), icon: 'success' })
      setShowField(false)
      await openDetail(detail.id)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.saveFields'), icon: 'none' })
    } finally {
      setFieldBusy(false)
    }
  }

  const handleDeleteField = async (fieldId: string) => {
    if (!detail?.id) return
    setBusyAct(`del-${fieldId}`)
    try {
      await contractsApi.deleteSignField(detail.id, fieldId)
      Taro.showToast({ title: t('contract.fieldDeleted'), icon: 'none' })
      await openDetail(detail.id)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.deleteField'), icon: 'none' })
    } finally {
      setBusyAct(null)
    }
  }

  /* ===== 验签 ===== */
  const handleVerify = async () => {
    if (!detail?.id) return
    setVerifyLoading(true)
    try {
      const res: any = await contractsApi.verify(detail.id)
      setVerifyReport(unwrap(res))
    } catch (e: any) {
      Taro.showToast({ title: e?.message || t('contract.verify'), icon: 'none' })
    } finally {
      setVerifyLoading(false)
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

  // 当前选中模板的范本正文（后端用空字段渲染出的标准样张）
  const genTemplateSource = tmplList.length ? tmplList : [{ kind: 'lease' }, { kind: 'purchase' }, { kind: 'broker' }]
  const genPreviewHtml = genTemplateSource.find((x: any) => x.kind === genForm.kind)?.content_html || ''
  const genPreviewText = genPreviewHtml
    ? stripHtml(genPreviewHtml)
    : (TMPL_FIELDS[genForm.kind || 'lease'] || []).map((f) => `· ${t(f.labelKey)}: ____`).join('\n')

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

  const partyName = (partyId?: string) =>
    (Array.isArray(detail?.parties) ? detail.parties.find((p: any) => String(p?.id) === String(partyId)) : null)?.name || t('contract.unknown')

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

          {/* ===== 签署区（法大大风格） ===== */}
          <Text className='ac-detail__section-title'>{t('contract.signFields')}</Text>
          {Array.isArray(detail?.sign_fields) && detail.sign_fields.length ? (
            detail.sign_fields.map((f: any, idx: number) => {
              const isSigned = !!f?.signed
              return (
                <View key={f?.id ?? idx} className='ac-party'>
                  <View className='ac-party__head'>
                    <View className='ac-party__id'>
                      <Text className='ac-party__name'>{partyName(f?.party_id)}</Text>
                      {renderBadge('ac-badge--primary', t(FIELD_TYPE_META[f?.field_type] || 'contract.field.signature'))}
                    </View>
                    {isSigned
                      ? renderBadge('ac-badge--success', t('contract.signed'))
                      : renderBadge('ac-badge--warning', t('contract.unsigned'))}
                  </View>
                  <Text className='ac-party__meta'>
                    {t('contract.page')} {f?.page ?? 1}
                  </Text>
                  {isSigned && f?.signed_at ? (
                    <Text className='ac-party__meta'>{t('contract.signedAt')}：{fmtDate(f.signed_at)}</Text>
                  ) : null}
                  {canEdit && !isSigned && f?.id ? (
                    <View className='ac-party__actions'>
                      <View
                        className={`ac-btn ac-btn--ghost ${busyAct === `del-${f.id}` ? 'ac-btn--disabled' : ''}`}
                        onClick={() => handleDeleteField(String(f.id))}
                      >
                        <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.deleteField')}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )
            })
          ) : (
            <Text className='ac-state__text'>{t('contract.empty')}</Text>
          )}

          {canEdit ? (
            <>
              <Text className='ac-detail__section-title'>{t('contract.manage')}</Text>
              <View className='ac-detail__actions'>
                <View className='ac-btn ac-btn--ghost' onClick={openField}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.addSignField')}</Text>
                </View>
                <View className={`ac-btn ac-btn--ghost ${fieldBusy ? 'ac-btn--disabled' : ''}`} onClick={() => { if (!fieldBusy) void submitDefaultLayout() }}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.defaultLayout')}</Text>
                </View>
                <View className={`ac-btn ac-btn--ghost ${busyAct === 'send' ? 'ac-btn--disabled' : ''}`} onClick={handleSend}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.sendNotice')}</Text>
                </View>
                <View className='ac-btn ac-btn--ghost' onClick={() => setShowParty(true)}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.addParty')}</Text>
                </View>
                <View className={`ac-btn ac-btn--ghost ${verifyLoading ? 'ac-btn--disabled' : ''}`} onClick={() => { if (!verifyLoading) void handleVerify() }}>
                  <Text className='ac-btn__text ac-btn__text--ghost'>{t('contract.verify')}</Text>
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
                <Text className='ac-field__label'>{t('contract.formTemplate')}</Text>
                <View className='ac-lang-row'>
                  {(tmplList.length ? tmplList : [{ kind: 'lease' }, { kind: 'purchase' }, { kind: 'broker' }]).map((tmpl: any) => {
                    const k = tmpl.kind
                    return (
                      <View
                        key={k}
                        className={`ac-chip ${genForm.kind === k ? 'ac-chip--active' : ''}`}
                        onClick={() => setGenForm({ ...genForm, kind: k })}
                      >
                        <Text className='ac-chip__text'>{t(`contract.tmpl.${k}`)}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
              <View className='ac-preview'>
                <Text className='ac-preview__title'>{t('contract.templatePreview')}</Text>
                <ScrollView scrollY className='ac-preview__box'>
                  <Text userSelect>{genPreviewText}</Text>
                </ScrollView>
              </View>
              {(TMPL_FIELDS[genForm.kind || 'lease'] || []).map((f) => (
                <View className='ac-field' key={f.key}>
                  <Text className='ac-field__label'>{t(f.labelKey)}</Text>
                  <Input
                    className='ac-field__input'
                    value={genForm[f.key]}
                    type={f.numeric ? 'number' : 'text'}
                    placeholder={t(f.labelKey)}
                    onInput={(e: any) => setGenForm({ ...genForm, [f.key]: e.detail.value })}
                  />
                </View>
              ))}
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

      {/* ===== 添加签署区弹层 ===== */}
      {showField && (
        <View className='ac-mask' onClick={() => setShowField(false)}>
          <View className='ac-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='ac-sheet__head'>
              <Text className='ac-sheet__title'>{t('contract.addSignField')}</Text>
              <View className='ac-sheet__close' onClick={() => setShowField(false)}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
            <ScrollView scrollY>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.parties')}</Text>
                <View className='ac-lang-row'>
                  {(Array.isArray(detail?.parties) ? detail.parties : []).map((p: any) => (
                    <View
                      key={p?.id}
                      className={`ac-chip ${fieldForm.partyId === String(p?.id) ? 'ac-chip--active' : ''}`}
                      onClick={() => setFieldForm({ ...fieldForm, partyId: String(p?.id) })}
                    >
                      <Text className='ac-chip__text'>{p?.name || t('contract.unknown')}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View className='ac-field'>
                <Text className='ac-field__label'>{t('contract.fieldType')}</Text>
                <View className='ac-lang-row'>
                  {FIELD_TYPES.map((ft) => (
                    <View
                      key={ft}
                      className={`ac-chip ${fieldForm.fieldType === ft ? 'ac-chip--active' : ''}`}
                      onClick={() => setFieldForm({ ...fieldForm, fieldType: ft })}
                    >
                      <Text className='ac-chip__text'>{t(FIELD_TYPE_META[ft])}</Text>
                    </View>
                  ))}
                </View>
              </View>
              {/* 可视化落框：在正文 / 页图上点按即可定位，无需手填坐标 */}
              <View className='ac-field'>
                <Text className='ac-field__label'>
                  {t('contract.tapToPlace')}{mark.x ? ` · ${t('contract.page')} ${fieldPage} · X${mark.x} · Y${mark.y}` : ''}
                </Text>
                <View
                  id='signfield-canvas'
                  className='ac-field-canvas'
                  onClick={onTapPlace}
                >
                  {pdfNumPages > 0 ? (
                    <Image
                      src={contractsApi.pdfPageUrl(detail.id, fieldPage)}
                      mode='widthFix'
                      className='ac-field-canvas__img'
                    />
                  ) : (
                    <Text className='ac-field-canvas__html' userSelect>
                      {stripHtml(detail.content_html)}
                    </Text>
                  )}
                  {mark.x !== '' && (
                    <View
                      className='ac-field-canvas__mark'
                      style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
                    />
                  )}
                </View>
                {pdfNumPages > 1 && (
                  <View className='ac-lang-row' style={{ marginTop: 8 }}>
                    <View className={`ac-chip ${fieldPage <= 1 ? 'ac-chip--disabled' : ''}`} onClick={() => { if (fieldPage > 1) setFieldPage((p) => p - 1) }}>
                      <Text className='ac-chip__text'>{t('contract.prevPage')}</Text>
                    </View>
                    <View className={`ac-chip ${fieldPage >= pdfNumPages ? 'ac-chip--disabled' : ''}`} onClick={() => { if (fieldPage < pdfNumPages) setFieldPage((p) => p + 1) }}>
                      <Text className='ac-chip__text'>{t('contract.nextPage')}</Text>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
            <View className={`ac-submit ${fieldBusy ? 'ac-btn--disabled' : ''}`} onClick={() => { if (!fieldBusy) void submitAddField() }}>
              <Text className='ac-submit__text'>{fieldBusy ? t('pub.loading') : t('contract.saveFields')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ===== 验签报告弹层 ===== */}
      {verifyReport && (
        <View className='ac-mask' onClick={() => setVerifyReport(null)}>
          <View className='ac-sheet' onClick={(e) => { if (typeof e === 'object') e.stopPropagation?.() }}>
            <View className='ac-sheet__head'>
              <Text className='ac-sheet__title'>{t('contract.report')}</Text>
              <View className='ac-sheet__close' onClick={() => setVerifyReport(null)}>
                <View className='icon-svg' style={iconStyle('close', 30)} />
              </View>
            </View>
            <ScrollView scrollY>
              {field(
                t('contract.tampered'),
                verifyReport?.tampered ? t('contract.yes') : t('contract.no')
              )}
              {verifyReport?.document_hash
                ? field(t('contract.documentHash'), String(verifyReport.document_hash), true)
                : null}
              {verifyReport?.sign_types_summary !== undefined && verifyReport?.sign_types_summary !== null
                ? field(t('contract.signTypesSummary'), String(verifyReport.sign_types_summary), true)
                : null}
              <Text className='ac-detail__section-title'>{t('contract.signTypesSummary')}</Text>
              {Array.isArray(verifyReport?.signatures) && verifyReport.signatures.length ? (
                verifyReport.signatures.map((s: any, i: number) => (
                  <View className='ac-party' key={i}>
                    <View className='ac-party__head'>
                      <View className='ac-party__id'>
                        <Text className='ac-party__name'>{t(FIELD_TYPE_META[s?.method] || 'contract.field.signature')}</Text>
                      </View>
                      {s?.signature_success
                        ? renderBadge('ac-badge--success', t('contract.signatureSuccess'))
                        : renderBadge('ac-badge--error', t('contract.signatureFailed'))}
                    </View>
                    {s?.signed_at ? <Text className='ac-party__meta'>{t('contract.signedAt')}：{fmtDate(s.signed_at)}</Text> : null}
                    {s?.ip ? <Text className='ac-party__meta'>{t('contract.signatureIp')}：{String(s.ip)}</Text> : null}
                    {s?.signature_hash ? <Text className='ac-party__meta' selectable>{t('contract.signatureHash')}：{String(s.signature_hash)}</Text> : null}
                  </View>
                ))
              ) : (
                <Text className='ac-state__text'>{t('contract.empty')}</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* 底部导航：合同页继承首页高亮 */}
      <BottomNav role='admin' active='dashboard' />
    </View>
  )
}