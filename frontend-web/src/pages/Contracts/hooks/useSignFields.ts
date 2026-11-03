/**
 * 签署框放置编辑器（指定位置 / 关键字两种模式）的状态与动作。
 *
 * 纯结构拆分自 pages/Contracts/index.tsx：坐标换算、拖拽落框、
 * 关键字检索与字段增删的请求参数完全保持不变。
 */
import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { message } from 'antd'
import { useTranslation } from 'react-i18next'
import { contractsApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import { DEFAULT_KEYWORD_BY_TYPE } from '../contractTypes'
import type { Contract, KeywordHit, Party, SignField } from '../contractTypes'

export type ContractDetail = {
  contract?: Contract
  parties: Party[]
  signFields?: SignField[]
}

export function useSignFields({
  detail,
  setDetail,
}: {
  detail: ContractDetail
  setDetail: Dispatch<SetStateAction<ContractDetail>>
}) {
  const { t } = useTranslation()

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

  // 开放式签名：已落框签署框“拖动改位”的会话上下文（坐标均为页面百分比）
  const movingRef = useRef<{
    ix: number
    cx: number
    cy: number
    w: number
    h: number
    sx: number
    sy: number
    lx: number
    ly: number
    moved: boolean
  } | null>(null)

  // 打开签署框编辑器：初始化签名方选择为第一个未签方；若合同有 PDF 则逐页加载页图
  const openPreview = () => {
    if (!detail.contract) return
    setPreviewOpen(true)
    setFields([...(detail.signFields || [])])
    const firstPending = detail.parties.find((p) => !p.signed)
    setFieldParty(firstPending?.id || detail.parties[0]?.id || '')
    loadPdfPages()
  }

  // pdf 页图加载：按 pdf_page_count 逐页 fetch blob → objectURL（关闭时释放）
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

  // 由拖放位置换算成签署框：x/y/w/h 均为页面宽高的百分比(0-100)，落点作为框中心。
  const createFieldBox = (el: HTMLElement, clientX: number, clientY: number, type: string, party: string, page: number): SignField => {
    const rect = el.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    let fw = 140
    let fh = 48
    if (type === 'seal') {
      fw = 110
      fh = 110
    } else if (type === 'date') {
      fw = 110
      fh = 32
    }
    const w = (fw / rect.width) * 100
    const h = (fh / rect.height) * 100
    return {
      party_id: party || null,
      field_type: type,
      page,
      x: Math.max(0, x - w / 2),
      y: Math.max(0, y - h / 2),
      w,
      h,
      required: true,
      signed: false,
    }
  }

  // 开放式签名“拖拽克隆”落框：从侧栏可拖拽源项拖到文档某页释放 → 新建签署框并 POST 无 id 新增落库。
  const placeFieldDrop = (e: React.DragEvent, page: number) => {
    e.preventDefault()
    const box = e.currentTarget as HTMLElement
    if (!box || !detail.contract) return
    const f = createFieldBox(box, e.clientX, e.clientY, fieldType, fieldParty, page)
    // 先入本地显示，POST 成功后回写带 id 的字段
    setFields((prev) => [...prev, f])
    contractsApi
      .saveSignFields(detail.contract.id, [f] as unknown as Record<string, unknown>[])
      .then((res) => {
        const saved = res?.data?.sign_fields
        if (Array.isArray(saved) && saved[0]) {
          const nf = saved[0] as SignField
          setFields((prev) => prev.map((x) => (x === f ? nf : x)))
          setDetail((d) => {
            const existing = d.signFields || []
            const idx = existing.findIndex((x) => x.id === nf.id)
            const next = idx >= 0 ? existing.map((x, i) => (i === idx ? nf : x)) : [...existing, nf]
            return { ...d, signFields: next }
          })
        }
      })
      .catch((err) => message.error(errorText(err, t('contracts.errFieldsSave'))))
  }

  // 已落框签署框的“拖动改位”：pointer 事件实时改位置，松手后带 id POST /sign-fields 更新 x/y。
  const onFieldDown = (e: React.PointerEvent, f: SignField, i: number) => {
    if (f.signed) return
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const parent = el.offsetParent as HTMLElement | null
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    movingRef.current = {
      ix: i,
      cx: e.clientX,
      cy: e.clientY,
      w: rect.width,
      h: rect.height,
      sx: f.x,
      sy: f.y,
      lx: f.x,
      ly: f.y,
      moved: false,
    }
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onFieldMove = (e: React.PointerEvent, f: SignField, i: number) => {
    const m = movingRef.current
    if (!m || m.ix !== i) return
    const dx = ((e.clientX - m.cx) / m.w) * 100
    const dy = ((e.clientY - m.cy) / m.h) * 100
    const nx = Math.min(100 - f.w, Math.max(0, m.sx + dx))
    const ny = Math.min(100 - f.h, Math.max(0, m.sy + dy))
    if (Math.abs(nx - m.lx) > 0.001 || Math.abs(ny - m.ly) > 0.001) {
      m.moved = true
      m.lx = nx
      m.ly = ny
      setFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, x: nx, y: ny } : x)))
    }
  }

  const onFieldUp = (e: React.PointerEvent, f: SignField, i: number) => {
    const m = movingRef.current
    if (!m || m.ix !== i) return
    movingRef.current = null
    if (!m.moved || !f.id || !detail.contract) return
    contractsApi
      .saveSignFields(detail.contract.id, [
        {
          id: f.id,
          party_id: f.party_id,
          field_type: f.field_type,
          page: f.page,
          x: m.lx,
          y: m.ly,
          w: f.w,
          h: f.h,
          required: f.required,
        },
      ] as unknown as Record<string, unknown>[])
      .then((res) => {
        const saved = res?.data?.sign_fields
        if (Array.isArray(saved) && saved[0]) {
          const nf = saved[0] as SignField
          setFields((prev) => prev.map((x, xi) => (xi === i ? nf : x)))
        }
      })
      .catch((err) => message.error(errorText(err, t('contracts.errFieldsSave'))))
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
      .then((res) => {
        message.success(t('contracts.msgFieldsSaved'))
        const saved = res?.data?.sign_fields
        if (Array.isArray(saved)) {
          setDetail((d) => ({ ...d, signFields: saved as SignField[] }))
          setFields(saved as SignField[])
        }
      })
      .catch((err) => {
        message.error(errorText(err, t('contracts.errFieldsSave')))
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
        .catch((err) => {
          message.error(errorText(err, t('contracts.errFieldsDel')))
        })
    } else {
      // 未保存的临时框直接移除
      setFields((prev) => prev.filter((x) => x !== f))
    }
  }

  const partyName = (partyId: string | null) =>
    detail.parties.find((p) => p.id === partyId)?.name || t('contracts.anyParty')

  const pdfAvailable = !!detail.contract?.pdf_available

  // 关键字签署默认词：回填对应签署方式的关键字占位（须与合同正文文字一致，故固定字面量而非按 UI 语言翻译）
  const setDefaultKeyword = () => setKeywordInput(DEFAULT_KEYWORD_BY_TYPE[fieldType] || '电子印章盖章处')

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
      .then((res) => {
        const hits = res?.data?.hits
        setKeywordHits(Array.isArray(hits) ? hits : [])
        setKeywordCount(res?.data?.count ?? (Array.isArray(hits) ? hits.length : 0))
      })
      .catch((err) => {
        if (err?.response?.status === 404) setKeywordHits([])
        message.error(errorText(err, t('contracts.keywordSearchFail')))
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
      .then((res) => {
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
      .catch((err) => {
        message.error(errorText(err, t('contracts.keywordFieldFail')))
      })
  }

  // 关闭编辑器：释放 PDF 页图 objectURL
  const closePreview = () => {
    pdfPages.forEach((u) => URL.revokeObjectURL(u))
    setPdfPages([])
    setPreviewOpen(false)
  }

  return {
    previewOpen,
    fields,
    setFields,
    fieldType,
    setFieldType,
    fieldParty,
    setFieldParty,
    pdfPages,
    pdfLoading,
    keywordInput,
    setKeywordInput,
    keywordHits,
    keywordCount,
    keywordSearching,
    previewMode,
    setPreviewMode,
    openPreview,
    loadPdfPages,
    placeFieldDrop,
    onFieldDown,
    onFieldMove,
    onFieldUp,
    saveFields,
    deleteField,
    partyName,
    pdfAvailable,
    setDefaultKeyword,
    handleKeywordSearch,
    handleKeywordPlace,
    closePreview,
  }
}

export type SignFieldsState = ReturnType<typeof useSignFields>
