/**
 * 合同详情及其行内操作（发送通知 / 复制签署链接 / 编辑 / 追加签署方 / 作废 / 拒签）。
 *
 * 纯结构拆分自 pages/Contracts/index.tsx：详情字段映射、请求参数与
 * 成功/失败文案完全保持不变。
 */
import { useState } from 'react'
import { Modal, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { contractsApi } from '@/services/api'
import { errorText } from '@/lib/errorText'
import { absSignUrl } from '../contractTypes'
import type { Contract, Party, SignField } from '../contractTypes'

export function useContractDetail({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation()

  const [detail, setDetail] = useState<{
    contract?: Contract
    parties: Party[]
    signFields?: SignField[]
  }>({ parties: [], signFields: [] })

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
  // 拒签
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineParty, setDeclineParty] = useState('')
  const [declineReason, setDeclineReason] = useState('')

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

  // 写剪贴板：优先 Clipboard API；非安全上下文（http 局域网 IP，真机联调常见）下
  // navigator.clipboard 不存在，会直接抛错导致「复制签署链接」必失败，兜底用
  // 隐藏 textarea + execCommand（该命令在 http 下仍可用）。
  const copyText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      if (!document.execCommand('copy')) throw new Error('execCommand-copy-failed')
    } finally {
      document.body.removeChild(ta)
    }
  }

  // 复制签署链接
  const handleCopyLink = async (partyId: string) => {
    if (!detail.contract) return
    try {
      const res = await contractsApi.createShareLink(detail.contract.id, partyId)
      const { url } = res.data || {}
      if (!url) throw new Error('no url')
      await copyText(absSignUrl(url))
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
      .then((res) => {
        message.success(t('contracts.msgSent'))
        const urls = res?.data?.results
        if (Array.isArray(urls)) {
          const text = urls.filter(Boolean).join('\n')
          if (text) message.info(text)
        }
      })
      .catch((err) => {
        message.error(errorText(err, t('contracts.errSend')))
      })
  }

  // 编辑合同
  const openEdit = () => {
    const c = detail.contract
    if (!c) return
    setEditTitle(c.title)
    // 必须载入现有正文：原来置空会导致「只改标题」也把正文写成空串并重算哈希
    setEditContent(c.content_html ?? '')
    setEditOpen(true)
  }

  const handleEditSave = () => {
    const c = detail.contract
    if (!c) return
    const titleChanged = editTitle.trim() !== c.title
    const contentChanged = editContent !== (c.content_html ?? '')
    if (!titleChanged && !contentChanged) {
      message.info(t('contracts.noChanges'))
      return
    }
    // 正文变更会重算 document_hash，属于不可逆留痕变更，先二次确认
    const save = () => {
      const payload: { title?: string; content_html?: string } = { title: editTitle }
      if (contentChanged) payload.content_html = editContent
      contractsApi
        .updateContract(c.id, payload)
        .then(() => {
          message.success(t('contracts.msgEdited'))
          setEditOpen(false)
          onChanged()
          handleOpen(c.id)
        })
        .catch((err) => message.error(errorText(err, t('contracts.errEdit'))))
    }
    if (contentChanged) {
      Modal.confirm({
        title: t('contracts.confirmOverwriteTitle'),
        content: t('contracts.confirmOverwriteBody'),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk: save,
      })
    } else {
      save()
    }
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
      .catch((err) => {
        message.error(errorText(err, t('contracts.errAddParty')))
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
        onChanged()
        handleOpen(detail.contract!.id)
      })
      .catch((err) => {
        message.error(errorText(err, t('contracts.errVoid')))
      })
  }

  const canEdit = detail.contract?.can_edit

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
        onChanged()
      })
      .catch((err) => {
        message.error(errorText(err, t('contracts.declineFail')))
      })
  }

  return {
    detail,
    setDetail,
    canEdit,
    handleOpen,
    handleCopyLink,
    handleSend,
    openEdit,
    handleEditSave,
    setEditOpen,
    editOpen,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    partyOpen,
    setPartyOpen,
    partyForm,
    setPartyForm,
    handleAddParty,
    voidOpen,
    setVoidOpen,
    voidReason,
    setVoidReason,
    handleVoid,
    declineOpen,
    setDeclineOpen,
    declineParty,
    setDeclineParty,
    declineReason,
    setDeclineReason,
    openDecline,
    handleDecline,
  }
}

export type ContractDetailState = ReturnType<typeof useContractDetail>
