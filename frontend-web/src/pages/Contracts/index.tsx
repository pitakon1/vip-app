import { useEffect, useRef, useState } from 'react'
import { message, Modal, Segmented } from 'antd'
import { useNavigate } from 'react-router-dom'
import { FileTextOutlined, HomeOutlined, TeamOutlined } from '@ant-design/icons'
import { contractsApi, signAssetsApi, fetchPdfPageUrl } from '@/services/api'
import { useTranslation } from 'react-i18next'
import './contracts.css'

interface TemplateOption {
  kind: string
  title: string
  content_html?: string
}

interface FieldDef {
  key: string
  label: string
  type?: 'number' | 'date'
}

// 合同模板 → 需填写的 counters 字段（key 与后端 esign_service 渲染函数保持一致）
const templateKindFields: Record<string, FieldDef[]> = {
  lease: [
    { key: 'landlord_name', label: 'contracts.fLandlord' },
    { key: 'tenant_name', label: 'contracts.fTenant' },
    { key: 'property_address', label: 'contracts.fProperty' },
    { key: 'monthly_rent', label: 'contracts.fRent', type: 'number' },
    { key: 'term_months', label: 'contracts.fMonths', type: 'number' },
  ],
  purchase: [
    { key: 'seller_name', label: 'contracts.fpSeller' },
    { key: 'buyer_name', label: 'contracts.fpBuyer' },
    { key: 'property_address', label: 'contracts.fpProperty' },
    { key: 'room_number', label: 'contracts.fpRoom' },
    { key: 'property_area', label: 'contracts.fpArea', type: 'number' },
    { key: 'total_price', label: 'contracts.fpTotal', type: 'number' },
    { key: 'down_payment', label: 'contracts.fpDown', type: 'number' },
    { key: 'delivery_date', label: 'contracts.fpDelivery', type: 'date' },
  ],
  broker: [
    { key: 'broker_name', label: 'contracts.fbName' },
    { key: 'broker_company', label: 'contracts.fbCompany' },
    { key: 'broker_phone', label: 'contracts.fbPhone' },
    { key: 'broker_channel', label: 'contracts.fbChannel' },
    { key: 'broker_id_number', label: 'contracts.fbId' },
  ],
}

const templateIcons: Record<string, React.ReactNode> = {
  lease: <HomeOutlined />,
  purchase: <FileTextOutlined />,
  broker: <TeamOutlined />,
}

interface Contract {
  id: string
  title: string
  status: string
  language?: string
  document_hash?: string
  content_html?: string
  created_at?: string
  source?: string
  file_path?: string
  can_edit?: boolean
  pdf_available?: boolean
  pdf_page_count?: number
}

interface Party {
  id: string
  name: string
  role: string
  signed?: boolean
  signature?: string
  email?: string
  phone?: string
  declined_at?: string
  decline_reason?: string
  sign_url?: string
  sign_method?: string
  real_name_verified?: boolean
}

// 签署区字段（与后端 SignFieldType / GET /contracts/{id} sign_fields 一致）
interface SignField {
  id?: string
  party_id: string | null
  field_type: string // signature | seal | date
  page: number
  x: number
  y: number
  w: number
  h: number
  required: boolean
  signed: boolean
  signed_at?: string | null
}

// 关键字签署命中项（与 POST /keyword-search 返回的 hit 一致；坐标一律语义化展示）
interface KeywordHit {
  page: number
  x: number
  y: number
  w: number
  h: number
  text?: string
}

// 签名/印章资产（与 signAssetsApi 返回一致）
interface SignAsset {
  id: string
  name: string
  asset_type: string // handwrite | seal
  source: string // drew | upload | imprint
  data_url: string
  created_at?: string
}

// 放置签署框时可选的 field_type（手写签名 / 公章 / 日期）
const FIELD_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'signature', label: 'fieldSig' },
  { value: 'seal', label: 'fieldSeal' },
  { value: 'date', label: 'fieldDate' },
]

// 可选 field_type → 签署 method（后端 SignMethod）；seal 走公司章
const FIELD_METHOD: Record<string, string> = {
  signature: 'personal_handwrite',
  seal: 'company_seal',
  date: 'date',
}

const statusLabel: Record<string, string> = {
  draft: 'contracts.stDraft',
  sent: 'contracts.stPendingSign',
  partially_signed: 'contracts.stPendingSign',
  signed: 'contracts.stSigned',
  completed: 'contracts.stCompleted',
  voided: 'contracts.stVoided',
  expired: 'contracts.stExpired',
  rejected: 'contracts.stRejected',
}

const sourceLabel: Record<string, string> = {
  generated: 'contracts.sourceGenerated',
  uploaded: 'contracts.sourceUploaded',
}

// 上传白名单（与后端一致）：pdf / word / 常见图片
const UPLOAD_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif'

const Contracts = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [detail, setDetail] = useState<{ contract?: Contract; parties: Party[]; signFields?: SignField[] }>({ parties: [], signFields: [] })
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)
  const [kind, setKind] = useState('lease')
  const [language, setLanguage] = useState('zh')
  // 生成表单字段值：key 即后端 counters 字段名
  const [form, setForm] = useState<Record<string, string>>({
    landlord_name: '张三',
    tenant_name: '李四',
    property_address: '曼谷 · Sukhumvit 38 号公寓',
    monthly_rent: '25000',
    term_months: '12',
  })

  // 签署框放置（发起方/员工）：预览 + 拖放签署区
  const [previewOpen, setPreviewOpen] = useState(false)
  const [fields, setFields] = useState<SignField[]>([])
  const [fieldType, setFieldType] = useState('signature')
  const [fieldParty, setFieldParty] = useState('')
  // PDF 页图（pdf_available 时作为放置背景，逐页叠加）
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const [pdfLoading, setPdfLoading] = useState(false)

  // 关键字签署（在放置签署框编辑器内）
  const [keywordInput, setKeywordInput] = useState('')
  const [keywordHits, setKeywordHits] = useState<KeywordHit[]>([])
  const [keywordCount, setKeywordCount] = useState(0)
  const [keywordSearching, setKeywordSearching] = useState(false)
  // 双栏放置编辑器：签署方式（指定位置 / 关键字）
  const [previewMode, setPreviewMode] = useState<'position' | 'keyword'>('position')

  // 拒签
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineParty, setDeclineParty] = useState('')
  const [declineReason, setDeclineReason] = useState('')

  // 我的签名/印章资产库
  const [sigLibOpen, setSigLibOpen] = useState(false)
  const [sigAssets, setSigAssets] = useState<SignAsset[]>([])
  const [sigAssetType, setSigAssetType] = useState('handwrite')
  const [sigAssetName, setSigAssetName] = useState('')
  const [sigUploading, setSigUploading] = useState(false)

  // 上传电子合同
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  // 编辑合同
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  // 追加签署方
  const [partyOpen, setPartyOpen] = useState(false)
  const [partyForm, setPartyForm] = useState({ name: '', email: '', role: 'tenant' })
  // 作废合同
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const sigFileRef = useRef<HTMLInputElement>(null)

  const loadList = () => {
    contractsApi
      .list()
      .then((res) => setContracts(res.data || []))
      .catch(() => message.warning(t('contracts.errList')))
  }
  useEffect(loadList, [])

  // 加载可用模板列表；失败时静默回退到内置三端默认项
  useEffect(() => {
    contractsApi
      .listTemplates()
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : null))
      .catch(() => setTemplates(null))
  }, [])

  const handleGenerate = () => {
    const counters: Record<string, unknown> = { currency: 'THB' }
    for (const f of templateKindFields[kind] || []) {
      const v = form[f.key]
      if (v === '' || v == null) continue
      counters[f.key] = f.type === 'number' ? Number(v) : v
    }
    contractsApi
      .generate({
        language,
        kind,
        counters,
      })
      .then(() => {
        message.success(t('contracts.msgGenerated'))
        loadList()
      })
      .catch(() => message.error(t('contracts.errGenerate')))
  }

  // 上传电子合同
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPendingFile(f)
  }

  const handleUploadConfirm = async () => {
    if (!pendingFile) return
    setUploading(true)
    try {
      // 后端 /contracts/{id}/upload 只给「已存在」的合同挂载文件，且无「仅建空合同」端点。
      // 因此先借 generate 建一条合同记录（title 取文件名），再把文件挂上去标为 uploaded。
      const genRes: any = await contractsApi.generate({
        language: 'zh',
        counters: { title: pendingFile.name.replace(/\.[^.]+$/, '') },
      })
      const cid = genRes?.data?.id
      if (!cid) throw new Error('no contract id')
      await contractsApi.uploadFile(cid, pendingFile)
      message.success(t('contracts.msgUploaded'))
      setPendingFile(null)
      loadList()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(detail || t('contracts.errUpload'))
    } finally {
      setUploading(false)
    }
  }

  const handleOpen = (id: string) => {
    contractsApi.get(id).then((res) => {
      const data = res.data
      setDetail({
        contract: {
          id: data.id,
          title: data.title,
          status: data.status,
          language: data.language,
          document_hash: data.document_hash,
          content_html: data.content_html,
          source: data.source,
          file_path: data.file_path,
          can_edit: data.can_edit,
          pdf_available: data.pdf_available,
          pdf_page_count: data.pdf_page_count,
        },
        parties: (data.parties || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          signed: p.signed,
          signature: p.signature,
          email: p.email,
          phone: p.phone,
          declined_at: p.declined_at,
          decline_reason: p.decline_reason,
          sign_url: p.sign_url,
          sign_method: p.sign_method,
          real_name_verified: !!p.real_name_verified_at,
        })),
        signFields: (data.sign_fields || []).map((f: any) => ({
          id: f.id,
          party_id: f.party_id,
          field_type: f.field_type,
          page: f.page,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          required: f.required,
          signed: f.signed,
          signed_at: f.signed_at,
        })),
      })
    })
  }

  // 打开签署框编辑器：初始化签名方选择为第一个未签方；若合同有 PDF 则逐页加载页图
  const openPreview = () => {
    if (!detail.contract) return
    setPreviewOpen(true)
    setFields([...(detail.signFields || [])])
    const firstPending = detail.parties.find((p) => !p.signed)
    setFieldParty(firstPending?.id || detail.parties[0]?.id || '')
    loadPdfPages()
  }

  // pdF 页图加载：按 pdf_page_count 逐页 fetch blob → objectURL（关闭时释放）
  const loadPdfPages = () => {
    setPdfPages([])
    const c = detail.contract
    const n = c?.pdf_page_count || 0
    if (!c?.pdf_available || n <= 0) return
    setPdfLoading(true)
    Promise.all(
      Array.from({ length: n }, (_, i) => contractsApi.pdfPage(c.id, i + 1)),
    )
      .then(setPdfPages)
      .catch(() => message.warning(t('contracts.errPdfLoad')))
      .finally(() => setPdfLoading(false))
  }

  // 在预览上点击添加一个未持久化的签署框（点击前选取 field_type 与归属方）
  // 坐标一律存页面宽高的百分比(0-100)：x/y/w/h 由点击位置相对当前页容器换算。
  const placeField = (e: React.MouseEvent, page = 1) => {
    const box = e.currentTarget as HTMLElement
    if (!box) return
    const rect = box.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    let fw = 140
    let fh = 48
    if (fieldType === 'seal') {
      fw = 110
      fh = 110
    } else if (fieldType === 'date') {
      fw = 110
      fh = 32
    }
    const w = (fw / rect.width) * 100
    const h = (fh / rect.height) * 100
    // 点击处作为签署框中心 → 换算左上角（百分比）
    setFields((prev) => [
      ...prev,
      {
        party_id: fieldParty || null,
        field_type: fieldType,
        page,
        x: Math.max(0, x - w / 2),
        y: Math.max(0, y - h / 2),
        w,
        h,
        required: true,
        signed: false,
      },
    ])
  }

  // 保存签署框：新增 + 改动一并 upsert
  const saveFields = () => {
    if (!detail.contract) return
    if (fields.length === 0) {
      message.warning(t('contracts.noFields'))
      return
    }
    contractsApi
      .saveSignFields(detail.contract.id, fields as unknown as Record<string, unknown>[])
      .then((res: any) => {
        message.success(t('contracts.msgFieldsSaved'))
        const saved = res?.data?.sign_fields
        if (Array.isArray(saved)) {
          setDetail((d) => ({ ...d, signFields: saved as SignField[] }))
          setFields(saved as SignField[])
        }
      })
      .catch((err: any) => {
        const d = err?.response?.data?.detail
        message.error(d || t('contracts.errFieldsSave'))
      })
  }

  // 删除未签署框
  const deleteField = (f: SignField) => {
    if (!detail.contract) return
    if (f.id) {
      contractsApi
        .deleteSignField(detail.contract.id, f.id)
        .then(() => {
          setFields((prev) => prev.filter((x) => x.id !== f.id))
          setDetail((d) => ({
            ...d,
            signFields: (d.signFields || []).filter((x) => x.id !== f.id),
          }))
        })
        .catch((err: any) => {
          const d = err?.response?.data?.detail
          message.error(d || t('contracts.errFieldsDel'))
        })
    } else {
      // 未保存的临时框直接移除
      setFields((prev) => prev.filter((x) => x !== f))
    }
  }

  const partyName = (partyId: string | null) =>
    detail.parties.find((p) => p.id === partyId)?.name || t('contracts.anyParty')

  const pdfAvailable = !!detail.contract?.pdf_available

  // 已放置签署框的覆盖层渲染（坐标均为页面宽高百分比）
  const renderField = (f: SignField, i: number) => (
    <div
      key={f.id || `tmp-${i}`}
      className={f.signed ? 'rent-field-placed rent-field-placed--signed' : 'rent-field-placed'}
      style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="rent-field-placed__tag">
        {f.signed ? '✓' : ''}
        {t(`contracts.fType_${f.field_type || 'signature'}`) || f.field_type}
      </div>
      <div className="rent-field-placed__party">{partyName(f.party_id)}</div>
      {!f.signed && (
        <button
          className="rent-field-placed__del"
          title={t('common.delete')}
          onClick={(e) => {
            e.stopPropagation()
            deleteField(f)
          }}
        >
          ×
        </button>
      )}
    </div>
  )

  // 复制签署链接
  const handleCopyLink = async (partyId: string) => {
    if (!detail.contract) return
    try {
      const res = await contractsApi.createShareLink(detail.contract.id, partyId)
      const { url } = res.data || {}
      if (!url) throw new Error('no url')
      await navigator.clipboard.writeText(url)
      message.success(t('contracts.msgLinkCopied'))
    } catch {
      message.error(t('contracts.errCopyLink'))
    }
  }

  // 发送签署通知
  const handleSend = () => {
    if (!detail.contract) return
    contractsApi
      .sendContract(detail.contract.id)
      .then((res: any) => {
        message.success(t('contracts.msgSent'))
        const urls = res?.data?.results
        if (Array.isArray(urls)) {
          const text = urls.filter(Boolean).join('\n')
          if (text) message.info(text)
        }
      })
      .catch((err: any) => {
        const d = err?.response?.data?.detail
        message.error(d || t('contracts.errSend'))
      })
  }

  // 编辑合同
  const openEdit = () => {
    const c = detail.contract
    if (!c) return
    setEditTitle(c.title)
    setEditContent('')
    setEditOpen(true)
  }

  const handleEditSave = () => {
    if (!detail.contract) return
    contractsApi
      .updateContract(detail.contract.id, { title: editTitle, content_html: editContent })
      .then(() => {
        message.success(t('contracts.msgEdited'))
        setEditOpen(false)
        loadList()
        handleOpen(detail.contract!.id)
      })
      .catch(() => message.error(t('contracts.errEdit')))
  }

  // 追加签署方
  const handleAddParty = () => {
    if (!detail.contract) return
    if (!partyForm.name.trim()) {
      message.warning(t('contracts.blankName'))
      return
    }
    contractsApi
      .addParty(detail.contract.id, {
        name: partyForm.name.trim(),
        email: partyForm.email.trim() || undefined,
        role: partyForm.role,
      })
      .then(() => {
        message.success(t('contracts.msgPartyAdded'))
        setPartyOpen(false)
        setPartyForm({ name: '', email: '', role: 'tenant' })
        handleOpen(detail.contract!.id)
      })
      .catch((err: any) => {
        const d = err?.response?.data?.detail
        message.error(d || t('contracts.errAddParty'))
      })
  }

  // 作废
  const handleVoid = () => {
    if (!detail.contract) return
    contractsApi
      .voidContract(detail.contract.id, voidReason.trim() || undefined)
      .then(() => {
        message.success(t('contracts.msgVoided'))
        setVoidOpen(false)
        setVoidReason('')
        loadList()
        handleOpen(detail.contract!.id)
      })
      .catch((err: any) => {
        const d = err?.response?.data?.detail
        message.error(d || t('contracts.errVoid'))
      })
  }

  const canEdit = detail.contract?.can_edit

  // 关键字签署：在 PDF 中查找关键字命中位置
  const handleKeywordSearch = () => {
    if (!detail.contract) return
    const kw = keywordInput.trim()
    if (!kw) {
      message.warning(t('contracts.keywordBlank'))
      return
    }
    setKeywordSearching(true)
    setKeywordHits([])
    contractsApi
      .keywordSearch(detail.contract.id, kw)
      .then((res: any) => {
        const hits = res?.data?.hits
        setKeywordHits(Array.isArray(hits) ? hits : [])
        setKeywordCount(res?.data?.count ?? (Array.isArray(hits) ? hits.length : 0))
      })
      .catch((err: any) => {
        if (err?.response?.status === 404) setKeywordHits([])
        message.error(err?.response?.data?.detail || t('contracts.keywordSearchFail'))
      })
      .finally(() => setKeywordSearching(false))
  }

  // 关键字签署：按命中位置（index）创建签署区字段
  const handleKeywordPlace = (index: number) => {
    if (!detail.contract) return
    contractsApi
      .keywordFields(detail.contract.id, {
        keyword: keywordInput.trim(),
        party_id: fieldParty || undefined,
        field_type: fieldType,
        index,
      })
      .then((res: any) => {
        const f = res?.data?.field
        if (!f) throw new Error('no field')
        const newField: SignField = {
          id: f.id,
          party_id: f.party_id ?? null,
          field_type: f.field_type || fieldType,
          page: f.page,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          required: !!f.required,
          signed: !!f.signed,
          signed_at: f.signed_at ?? null,
        }
        setFields((prev) => [...prev, newField])
        setDetail((d) => ({ ...d, signFields: [...(d.signFields || []), newField] }))
        message.success(t('contracts.keywordFieldCreated'))
      })
      .catch((err: any) => {
        message.error(err?.response?.data?.detail || t('contracts.keywordFieldFail'))
      })
  }

  // 拒签：打开弹窗（选择签署方 + 填写原因）
  const openDecline = (partyId: string) => {
    setDeclineParty(partyId)
    setDeclineReason('')
    setDeclineOpen(true)
  }

  const handleDecline = () => {
    if (!detail.contract) return
    if (!declineParty) {
      message.warning(t('contracts.declinePickParty'))
      return
    }
    contractsApi
      .decline(detail.contract.id, declineParty, declineReason.trim())
      .then(() => {
        message.success(t('contracts.declined'))
        setDeclineOpen(false)
        setDeclineReason('')
        // 刷新合同详情（签约方拒签态 +（可能）合同状态 rejected）
        handleOpen(detail.contract!.id)
        loadList()
      })
      .catch((err: any) => {
        message.error(err?.response?.data?.detail || t('contracts.declineFail'))
      })
  }

  // 签名资产库：载入列表
  const loadSignAssets = () => {
    signAssetsApi
      .list()
      .then((res) => setSigAssets(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSigAssets([]))
  }

  const openSigLib = (type: string = 'handwrite') => {
    setSigAssetType(type)
    setSigAssetName('')
    loadSignAssets()
    setSigLibOpen(true)
  }

  // 文件 → base64（不含 data: 头的裸串，供印模接口）
  const fileToRawBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => {
        const dataUrl = String(r.result || '')
        resolve(dataUrl.substring(dataUrl.indexOf(',') + 1))
      }
      r.onerror = reject
      r.readAsDataURL(file)
    })

  // 处理签名资产上传：seal → 印模盖章接口（自动透明抠图）；handwrite → 直接保存 data_url
  const handleSigFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const name = sigAssetName.trim() || (sigAssetType === 'seal' ? t('contracts.mySeal') : t('contracts.mySign'))
    setSigUploading(true)
    try {
      if (sigAssetType === 'seal') {
        const imageBase64 = await fileToRawBase64(f)
        await signAssetsApi.imprint({ name, image_base64: imageBase64 })
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result || ''))
          r.onerror = reject
          r.readAsDataURL(f)
        })
        await signAssetsApi.create({ name, asset_type: 'handwrite', source: 'upload', data_url: dataUrl })
      }
      message.success(t('contracts.sigSaved'))
      setSigAssetName('')
      loadSignAssets()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || t('contracts.sigSaveFail'))
    } finally {
      setSigUploading(false)
    }
  }

  const handleSigRemove = (asset: SignAsset) => {
    signAssetsApi
      .remove(asset.id)
      .then(() => {
        setSigAssets((prev) => prev.filter((a) => a.id !== asset.id))
        message.success(t('contracts.sigRemoved'))
      })
      .catch((err: any) => message.error(err?.response?.data?.detail || t('contracts.sigSaveFail')))
  }

  const sigAssetTypeLabel = (t2: string) =>
    t2 === 'seal' ? t('contracts.mySeal') : t('contracts.mySign')
  const sigSourceLabel = (s: string) =>
    s === 'imprint' ? t('contracts.srcImprint') : s === 'upload' ? t('contracts.srcUpload') : t('contracts.srcDrew')

  // 模板选择（选项来自后端列表，失败时回退内置三端）
  const tmplSource: TemplateOption[] =
    templates && templates.length
      ? templates
      : (['lease', 'purchase', 'broker'] as const).map((k) => ({ kind: k, title: k }))
  const tmplOptions = tmplSource.map((tp) => ({
    value: tp.kind,
    label: (
      <span>
        {templateIcons[tp.kind]}
        <span style={{ marginLeft: 6 }}>{t(`contract.tmpl.${tp.kind}`)}</span>
      </span>
    ),
  }))
  const tmplFields = templateKindFields[kind] || []
  // 当前选中模板的范本正文（后端用空字段渲染出的标准样张）
  const tmplPreviewHtml = tmplSource.find((tp) => tp.kind === kind)?.content_html || ''

  return (
    <div className="rent-main">
      <div className="rent-page-header">
        <div>
          <h2 className="rent-page-header__title">{t('contracts.title')}</h2>
          <p className="rent-page-header__subtitle">{t('contracts.subtitle')}</p>
        </div>
      </div>

      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('contracts.genTitle')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('contracts.genHint')}</span>
        </div>
        <div className="rent-card__body">
          <div className="rent-field rent-mb-3">
            <label className="rent-label">{t('contract.formTemplate')}</label>
            <Segmented
              options={tmplOptions}
              value={kind}
              onChange={(v) => setKind(v as string)}
              block
            />
          </div>
          {tmplPreviewHtml && (
            <div className="rent-contract-preview rent-mb-3">
              <div className="rent-contract-preview__title">{t('contract.templatePreview')}</div>
              <div className="rent-contract-preview__box">
                <div
                  className="rent-contract-html"
                  style={{ lineHeight: 1.8, fontSize: 14, wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{ __html: String(tmplPreviewHtml) }}
                />
              </div>
            </div>
          )}
          <div className="rent-grid rent-grid--3 rent-mb-3">
            {tmplFields.map((f) => (
              <div className="rent-field" key={f.key}>
                <label className="rent-label">{t(f.label)}</label>
                <input
                  className="rent-input"
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="rent-grid rent-grid--3 rent-mb-3">
            <div className="rent-field">
              <label className="rent-label">{t('contracts.fLanguage')}</label>
              <select className="rent-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="zh">{t('contracts.langZh')}</option>
                <option value="en">English</option>
                <option value="th">ไทย</option>
              </select>
            </div>
          </div>
          <div className="rent-flex" style={{ justifyContent: 'flex-end' }}>
            <button className="rent-btn rent-btn--primary" onClick={handleGenerate}>
              {t('contracts.generate')}
            </button>
          </div>
        </div>
      </div>

      {/* 上传电子合同 */}
      <div className="rent-card rent-mb-5">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('contracts.uploadTitle')}</h3>
          <span className="rent-text-sm rent-text-muted">{t('contracts.uploadHint')}</span>
        </div>
        <div className="rent-card__body">
          {!pendingFile ? (
            <button className="rent-btn rent-btn--primary" onClick={() => fileInputRef.current?.click()}>
              {t('contracts.pickFile')}
            </button>
          ) : (
            <div className="rent-flex" style={{ gap: 12, alignItems: 'center' }}>
              <span className="rent-text-bold">{pendingFile.name}</span>
              <button className="rent-btn rent-btn--primary rent-btn--sm" disabled={uploading} onClick={handleUploadConfirm}>
                {t('contracts.upload')}
              </button>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" disabled={uploading} onClick={() => setPendingFile(null)}>
                {t('common.cancel')}
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            style={{ display: 'none' }}
            onChange={handleFilePicked}
          />
        </div>
      </div>

      <div className="rent-card">
        <div className="rent-card__header">
          <h3 className="rent-card__title">{t('contracts.listTitle')}</h3>
        </div>
        <div className="rent-card__body" style={{ padding: 0 }}>
          <div className="rent-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="rent-table">
              <thead>
                <tr>
                  <th>{t('contracts.thTitle')}</th>
                  <th>{t('contracts.thSource')}</th>
                  <th>{t('contracts.thLanguage')}</th>
                  <th>{t('contracts.thStatus')}</th>
                  <th>{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="rent-empty">{t('contracts.noContracts')}</div>
                    </td>
                  </tr>
                ) : (
                  contracts.map((c) => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => handleOpen(c.id)}>
                      <td>
                        <div className="rent-text-bold">{c.title}</div>
                        {c.document_hash && (
                          <div className="rent-text-sm rent-text-muted">hash: {c.document_hash.slice(0, 16)}…</div>
                        )}
                      </td>
                      <td>
                        <span className="rent-badge rent-badge--neutral">
                          {sourceLabel[c.source || ''] ? t(sourceLabel[c.source || '']) : (c.source || '-')}
                        </span>
                      </td>
                      <td>{c.language || '-'}</td>
                      <td>
                        <span className="rent-badge rent-badge--neutral">{statusLabel[c.status] ? t(statusLabel[c.status]) : c.status}</span>
                      </td>
                      <td>
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={(e) => { e.stopPropagation(); handleOpen(c.id) }}>
                          {t('contracts.open')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detail.contract && (
        <div className="rent-card rent-mt-5">
          <div className="rent-card__header">
            <h3 className="rent-card__title">{detail.contract.title}</h3>
            <span className="rent-badge rent-badge--neutral">
              {statusLabel[detail.contract.status] ? t(statusLabel[detail.contract.status]) : detail.contract.status}
            </span>
          </div>
          <div className="rent-card__body">
            <div className="rent-grid rent-grid--2 rent-mb-3">
              {detail.parties.length === 0 ? (
                <div className="rent-empty">{t('contracts.noParties')}</div>
              ) : (
                detail.parties.map((p) => (
                  <div key={p.id} className="rent-contract-party">
                    <div>
                      <div className="rent-text-bold">
                        {p.name}
                        {p.signed ? (
                          <span className="rent-badge rent-badge--success" style={{ marginLeft: 8 }}>{t('contracts.stSigned')}</span>
                        ) : null}
                      </div>
                      <div className="rent-text-sm rent-text-muted">{t('contracts.roleLabel', { r: p.role })}</div>
                      {(p.email || p.phone) && (
                        <div className="rent-text-sm rent-text-muted">{p.email} {p.phone}</div>
                      )}
                      {p.declined_at && (
                        <div className="rent-text-sm" style={{ color: 'var(--rent-danger, #dc2626)' }}>
                          {t('contracts.declinedAt', { at: p.declined_at })}
                          {p.decline_reason ? `：${p.decline_reason}` : ''}
                        </div>
                      )}
                      {p.sign_url && (
                        <div className="rent-text-sm rent-text-muted">url: {p.sign_url}</div>
                      )}
                    </div>
                    <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
                      {!p.signed && canEdit && (
                        <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => handleCopyLink(p.id)}>
                          {t('contracts.copyLink')}
                        </button>
                      )}
                      {!p.signed && !p.declined_at && canEdit && (
                        <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={() => openDecline(p.id)}>
                          {t('contracts.decline')}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            {canEdit && (
              <div className="rent-flex" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <button className="rent-btn rent-btn--primary rent-btn--sm" onClick={handleSend}>
                  {t('contracts.sendNotice')}
                </button>
                <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={openPreview}>
                  {t('contracts.placeFields')}
                </button>
                <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => openSigLib('handwrite')}>
                  {t('contracts.mySignLib')}
                </button>
                <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={openEdit}>
                  {t('contracts.edit')}
                </button>
                <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => setPartyOpen(true)}>
                  + {t('contracts.addParty')}
                </button>
                <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={() => setVoidOpen(true)}>
                  {t('contracts.void')}
                </button>
              </div>
            )}
            <div className="rent-flex" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="rent-btn rent-btn--ghost rent-btn--sm" onClick={() => navigate(`/verify?id=${detail.contract!.id}`)}>
                {t('contracts.verify')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑合同 */}
      <Modal
        open={editOpen}
        title={t('contracts.edit')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onOk={handleEditSave}
        onCancel={() => setEditOpen(false)}
      >
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.thTitle')}</label>
          <input className="rent-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
        </div>
        <div className="rent-field">
          <label className="rent-label">HTML</label>
          <textarea
            className="rent-input"
            rows={8}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="<h1>...</h1>"
          />
        </div>
      </Modal>

      {/* 追加签署方 */}
      <Modal
        open={partyOpen}
        title={t('contracts.addParty')}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onOk={handleAddParty}
        onCancel={() => setPartyOpen(false)}
      >
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.fName')}</label>
          <input className="rent-input" value={partyForm.name} onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })} />
        </div>
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.fEmail')}</label>
          <input className="rent-input" value={partyForm.email} onChange={(e) => setPartyForm({ ...partyForm, email: e.target.value })} />
        </div>
        <div className="rent-field">
          <label className="rent-label">{t('contracts.fRole')}</label>
          <select className="rent-input" value={partyForm.role} onChange={(e) => setPartyForm({ ...partyForm, role: e.target.value })}>
            <option value="tenant">tenant</option>
            <option value="landlord">landlord</option>
            <option value="agent">agent</option>
            <option value="witness">witness</option>
          </select>
        </div>
      </Modal>

      {/* 作废合同 */}
      <Modal
        open={voidOpen}
        title={t('contracts.voidTitle')}
        okText={t('contracts.void')}
        okButtonProps={{ danger: true }}
        cancelText={t('common.cancel')}
        onOk={handleVoid}
        onCancel={() => setVoidOpen(false)}
      >
        <div className="rent-field">
          <label className="rent-label">{t('contracts.voidReason')}</label>
          <textarea className="rent-input" rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
        </div>
      </Modal>

      {/* 签署框放置编辑器（发起方/员工）：预览 + 点击放置 + 列表删除 */}
      <Modal
        open={previewOpen}
        title={t('contracts.placeFields')}
        width={1160}
        okText={t('contracts.saveFields')}
        cancelText={t('common.cancel')}
        onOk={saveFields}
        onCancel={() => {
          pdfPages.forEach((u) => URL.revokeObjectURL(u))
          setPdfPages([])
          setPreviewOpen(false)
        }}
        styles={{ body: { maxHeight: '75vh', overflow: 'auto' } }}
      >
        <div className="kf-layout">
          {/* 左：签署配置 */}
          <aside className="kf-config">
            {/* 签署方式：指定位置 / 关键字 */}
            <div className="rent-card">
              <div className="rent-card__body">
                <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signMethod')}</div>
                <Segmented
                  block
                  value={previewMode}
                  onChange={(v) => setPreviewMode(v as 'position' | 'keyword')}
                  options={[
                    { value: 'position', label: t('contracts.methodPosition') },
                    { value: 'keyword', label: t('contracts.methodKeyword') },
                  ]}
                />
              </div>
            </div>

            {previewMode === 'position' ? (
              <div className="rent-card">
                <div className="rent-card__body">
                  <div className="rent-field" style={{ marginBottom: 12 }}>
                    <label className="rent-label">{t('contracts.fieldType')}</label>
                    <Segmented
                      block
                      options={FIELD_TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
                      value={fieldType}
                      onChange={(v) => setFieldType(v as string)}
                    />
                  </div>
                  <div className="rent-field">
                    <label className="rent-label">{t('contracts.fieldAssignee')}</label>
                    <select className="rent-input" value={fieldParty} onChange={(e) => setFieldParty(e.target.value)}>
                      <option value="">{t('contracts.anyParty')}</option>
                      {detail.parties.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}（{p.role}）</option>
                      ))}
                    </select>
                  </div>
                  <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.placeHint')}</div>
                </div>
              </div>
            ) : (
              <div className="rent-card">
                <div className="rent-card__body">
                  <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.keywordSign')}</div>
                  <div className="rent-flex" style={{ gap: 8 }}>
                    <input
                      className="rent-input"
                      value={keywordInput}
                      placeholder={t('contracts.keywordPlaceholder')}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleKeywordSearch() }}
                    />
                    <button className="rent-btn rent-btn--ghost rent-btn--sm" disabled={keywordSearching} onClick={handleKeywordSearch}>
                      {keywordSearching ? t('common.loading') : t('contracts.searchKeyword')}
                    </button>
                  </div>
                  {keywordHits.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 6 }}>
                        {t('contracts.keywordHitsFound', { n: keywordCount })}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {keywordHits.map((hit, i) => (
                          <button
                            key={`${hit.page}-${i}`}
                            type="button"
                            className="rent-btn rent-btn--ghost rent-btn--sm"
                            onClick={() => handleKeywordPlace(i)}
                          >
                            {t('contracts.keywordHitItem', { page: hit.page })}
                            {hit.text ? ` · ${hit.text}` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : keywordInput.trim() !== '' && !keywordSearching ? (
                    <div className="rent-text-sm rent-text-muted" style={{ marginTop: 8 }}>{t('contracts.keywordNoHit')}</div>
                  ) : null}
                </div>
              </div>
            )}

            {/* 电子印章资产块 */}
            <div className="rent-card">
              <div className="rent-card__body">
                <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.sealAsset')}</div>
                {sigAssets.filter((a) => a.asset_type === 'seal').length ? (
                  <div className="kf-parties">
                    {sigAssets.filter((a) => a.asset_type === 'seal').map((a) => (
                      <div key={a.id} className="kf-party">
                        <img src={a.data_url} alt={a.name} style={{ width: 36, height: 36, objectFit: 'contain', background: '#fff', border: '1px solid var(--rent-line, #e6eaf0)', borderRadius: 6 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                          <div className="rent-text-sm rent-text-muted">{sigSourceLabel(a.source)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="kf-asset-empty">
                    <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 8 }}>{t('contracts.sealEmpty')}</div>
                    <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openSigLib('seal')}>{t('contracts.makeSeal')}</button>
                  </div>
                )}
              </div>
            </div>

            {/* 手写签名资产块 */}
            <div className="rent-card">
              <div className="rent-card__body">
                <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.signAsset')}</div>
                {sigAssets.filter((a) => a.asset_type === 'handwrite').length ? (
                  <div className="kf-parties">
                    {sigAssets.filter((a) => a.asset_type === 'handwrite').map((a) => (
                      <div key={a.id} className="kf-party">
                        <img src={a.data_url} alt={a.name} style={{ width: 36, height: 36, objectFit: 'contain', background: '#fff', border: '1px solid var(--rent-line, #e6eaf0)', borderRadius: 6 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                          <div className="rent-text-sm rent-text-muted">{sigSourceLabel(a.source)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="kf-asset-empty">
                    <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 8 }}>{t('contracts.signEmpty')}</div>
                    <button type="button" className="rent-btn rent-btn--primary rent-btn--sm" onClick={() => openSigLib('handwrite')}>{t('contracts.setSign')}</button>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* 右：文档区 */}
          <main className="kf-doc">
            <div className="rent-card">
              <div className="rent-card__body">
                <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.docArea')}</div>
                <div
                  onClick={(e) => placeField(e, 1)}
                  style={{
                    position: 'relative',
                    border: '1px solid var(--rent-line, #e6eaf0)',
                    maxHeight: 520,
                    overflow: 'auto',
                    background: '#fff',
                    cursor: 'crosshair',
                  }}
                >
                  {pdfAvailable ? (
                    pdfLoading ? (
                      <div className="rent-text-sm rent-text-muted" style={{ padding: 8 }}>{t('common.loading')}</div>
                    ) : pdfPages.length === 0 ? (
                      <div className="rent-text-sm rent-text-muted" style={{ padding: 8 }}>{t('contracts.errPdfLoad')}</div>
                    ) : (
                      pdfPages.map((url, pi) => (
                        <div
                          key={pi}
                          onClick={(e) => placeField(e, pi + 1)}
                          style={{ position: 'relative', background: '#fff' }}
                        >
                          <img src={url} alt={`page ${pi + 1}`} style={{ display: 'block', width: '100%' }} />
                          {fields.filter((f) => f.page === pi + 1).map((f, i) => renderField(f, i))}
                        </div>
                      ))
                    )
                  ) : (
                    <>
                      <div
                        className="rent-contract-html"
                        style={{ width: 800, maxWidth: '100%', margin: '0 auto', lineHeight: 1.9, fontSize: 14, wordBreak: 'break-word' }}
                        dangerouslySetInnerHTML={{ __html: String(detail.contract?.content_html || detail.contract?.title || '') }}
                      />
                      {fields.filter((f) => f.page === 1).map((f, i) => renderField(f, i))}
                    </>
                  )}
                  {fields.length === 0 && (
                    <div className="rent-text-sm rent-text-muted" style={{ padding: 8 }}>{t('contracts.noFields')}</div>
                  )}
                </div>

                {/* 字段列表 */}
                <div style={{ marginTop: 12 }}>
                  <div className="rent-text-bold" style={{ marginBottom: 6 }}>{t('contracts.fieldList')}</div>
                  {fields.length === 0 ? (
                    <div className="rent-text-sm rent-text-muted">{t('contracts.noFields')}</div>
                  ) : (
                    fields.map((f, i) => (
                      <div key={f.id || `row-${i}`} className="rent-contract-party" style={{ marginBottom: 6 }}>
                        <div>
                          <span className="rent-text-bold">
                            {f.signed ? '✓ ' : ''}
                            {t(`contracts.fType_${f.field_type || 'signature'}`) || f.field_type}
                          </span>
                          <span className="rent-text-sm rent-text-muted" style={{ marginLeft: 8 }}>
                            {partyName(f.party_id)} · {t('contracts.page', { n: f.page ?? 1 })}
                          </span>
                          {f.signed && (
                            <span className="rent-badge rent-badge--success" style={{ marginLeft: 8 }}>{t('contracts.stSigned')}</span>
                          )}
                        </div>
                        {!f.signed && (
                          <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={() => deleteField(f)}>
                            {t('contracts.deleteField')}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </Modal>

      {/* 拒签弹窗：选择签署方 + 填写原因 */}
      <Modal
        open={declineOpen}
        title={t('contracts.declineTitle')}
        okText={t('contracts.decline')}
        okButtonProps={{ danger: true }}
        cancelText={t('common.cancel')}
        onOk={handleDecline}
        onCancel={() => setDeclineOpen(false)}
      >
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.fieldAssignee')}</label>
          <select className="rent-input" value={declineParty} onChange={(e) => setDeclineParty(e.target.value)}>
            {detail.parties.filter((p) => !p.signed && !p.declined_at).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.role}）
              </option>
            ))}
          </select>
        </div>
        <div className="rent-field">
          <label className="rent-label">{t('contracts.declineReason')}</label>
          <textarea className="rent-input" rows={3} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
        </div>
      </Modal>

      {/* 我的签名/印章资产库：列表 + 上传签名/印模 */}
      <Modal
        open={sigLibOpen}
        title={t('contracts.mySignLib')}
        width={720}
        okText={t('common.close')}
        okButtonProps={{ style: { display: 'none' } }}
        cancelText={t('common.close')}
        onCancel={() => setSigLibOpen(false)}
      >
        <div style={{ marginBottom: 16 }}>
          <div className="rent-text-bold" style={{ marginBottom: 8 }}>{t('contracts.myAssets')}</div>
          {sigAssets.length === 0 ? (
            <div className="rent-text-sm rent-text-muted">{t('contracts.noSigAssets')}</div>
          ) : (
            <div className="rent-grid rent-grid--3" style={{ gap: 12 }}>
              {sigAssets.map((a) => (
                <div key={a.id} className="rent-contract-party" style={{ padding: 8, alignItems: 'center' }}>
                  <img src={a.data_url} alt={a.name} style={{ width: 72, height: 72, objectFit: 'contain', background: '#fff', border: '1px solid var(--rent-line, #e6eaf0)', borderRadius: 8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rent-text-sm rent-text-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                    <div className="rent-text-sm rent-text-muted">
                      {sigAssetTypeLabel(a.asset_type)} · {sigSourceLabel(a.source)}
                    </div>
                    <button className="rent-btn rent-btn--danger rent-btn--sm" onClick={() => handleSigRemove(a)}>
                      {t('contracts.deleteField')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.sigAddTitle')}</label>
          <Segmented
            block
            options={[
              { value: 'handwrite', label: t('contracts.mySign') },
              { value: 'seal', label: t('contracts.mySeal') },
            ]}
            value={sigAssetType}
            onChange={(v) => setSigAssetType(v as string)}
          />
        </div>
        <div className="rent-field" style={{ marginBottom: 12 }}>
          <label className="rent-label">{t('contracts.sigName')}</label>
          <input className="rent-input" value={sigAssetName} placeholder={sigAssetType === 'seal' ? t('contracts.mySeal') : t('contracts.mySign')} onChange={(e) => setSigAssetName(e.target.value)} />
        </div>
        <div className="rent-flex" style={{ gap: 8, alignItems: 'center' }}>
          <button className="rent-btn rent-btn--primary rent-btn--sm" disabled={sigUploading} onClick={() => sigFileRef.current?.click()}>
            {sigUploading ? t('common.loading') : t('contracts.sigPickFile')}
          </button>
          <span className="rent-text-sm rent-text-muted">
            {sigAssetType === 'seal' ? t('contracts.sealImprintHint') : t('contracts.signUploadHint')}
          </span>
          <input ref={sigFileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleSigFile} />
        </div>
      </Modal>
    </div>
  )
}

export default Contracts