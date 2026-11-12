﻿﻿﻿/**
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
import type { CallbackEvent, Contract, ContractSubscription, Party, SignField } from '../contractTypes'

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
  // 签署顺序编排
  const [signOrderOpen, setSignOrderOpen] = useState(false)
  // 免登录签署链接二维码
  const [qrOpen, setQrOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [qrPartyName, setQrPartyName] = useState('')
  // 签署完成回调
  const [callbackOpen, setCallbackOpen] = useState(false)
  const [callbackEvents, setCallbackEvents] = useState<CallbackEvent[]>([])
  // 多回调地址订阅（GET /contracts/{id}/subscriptions）：与单地址 callback_url 并存
  const [callbackSubscriptions, setCallbackSubscriptions] = useState<ContractSubscription[]>([])
  const [callbackSecret, setCallbackSecret] = useState('')
  const [callbackSaving, setCallbackSaving] = useState(false)

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
          can_revoke: data.can_revoke,
          can_submit_approval: data.can_submit_approval,
          approval: data.approval || null,
          pdf_available: data.pdf_available,
          pdf_page_count: data.pdf_page_count,
          // 计算态与新增编排字段：不映射会导致详情页横幅、下载按钮、过期提示全部失效
          signature_health: data.signature_health,
          signed_pdf_available: data.signed_pdf_available,
          expires_at: data.expires_at,
          expired: data.expired,
          sign_order_type: data.sign_order_type,
          callback_url: data.callback_url,
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
          reminded_count: p.reminded_count,
          last_reminded_at: p.last_reminded_at,
          sign_url: p.sign_url,
          sign_token_expires_at: p.sign_token_expires_at,
          sign_method: p.sign_method,
          real_name_verified: !!p.real_name_verified_at,
          sign_order: p.sign_order,
          can_sign_now: p.can_sign_now,
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

  // 复制签署链接：reuse=true 复用未过期令牌，避免再次点击把已发出的链接作废
  const handleCopyLink = async (partyId: string) => {
    if (!detail.contract) return
    try {
      const res = await contractsApi.createShareLink(detail.contract.id, partyId, {
        reuse: true,
      })
      const { url } = res.data || {}
      if (!url) throw new Error('no url')
      await copyText(absSignUrl(url))
      message.success(t('contracts.msgLinkCopied'))
    } catch {
      message.error(t('contracts.errCopyLink'))
    }
  }

  // 展示签署链接二维码：reuse=true 复用未过期令牌，避免把刚复制出去的链接弄失效
  const handleShowQr = async (partyId: string) => {
    const c = detail.contract
    if (!c) return
    try {
      const res = await contractsApi.createShareLink(c.id, partyId, { reuse: true })
      const { url, qr_data_url, party_name } = res.data || {}
      if (!url) throw new Error('no url')
      const party = detail.parties.find((p) => p.id === partyId)
      setQrPartyName(party?.name || party_name || '')
      setQrUrl(absSignUrl(url))
      setQrDataUrl(qr_data_url || '')
      setQrOpen(true)
    } catch {
      message.error(t('contracts.errQr'))
    }
  }

  // 重新生成签署链接（二次确认）：旧链接立即失效，新链接按 3 天签发并写操作留痕
  const handleRotateLink = (partyId: string) => {
    const c = detail.contract
    if (!c) return
    const party = detail.parties.find((p) => p.id === partyId)
    Modal.confirm({
      title: t('contracts.rotateLinkConfirmTitle'),
      content: t('contracts.rotateLinkConfirmBody', { name: party?.name || '' }),
      okText: t('contracts.rotateLinkOk'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await contractsApi.createShareLink(c.id, partyId, { rotate: true })
          if (!res.data?.url) throw new Error('no url')
          message.success(t('contracts.msgLinkRotated'))
          onChanged()
        } catch (err) {
          message.error(errorText(err, t('contracts.errRotateLink')))
        }
      },
    })
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
        // 命中审批规则但未通过：后端 409 APPROVAL_REQUIRED，给出可操作提示
        if (err?.response?.status === 409 && err?.response?.data?.detail === 'APPROVAL_REQUIRED') {
          message.error(t('contracts.approval.sendBlocked'))
          handleOpen(detail.contract!.id)
          return
        }
        message.error(errorText(err, t('contracts.errSend')))
      })
  }

  // 提交审批：命中规则则进入 pending_approval，未命中提示无需审批
  const handleSubmitApproval = async () => {
    const c = detail.contract
    if (!c) return
    try {
      const res = await contractsApi.submitApproval(c.id)
      if (res.data?.requires_approval) message.success(t('contracts.approval.msgSubmitted'))
      else message.info(t('contracts.approval.msgNotRequired'))
      onChanged()
      handleOpen(c.id)
    } catch (err) {
      message.error(errorText(err, t('contracts.approval.errSubmit')))
    }
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
  const canRevoke = detail.contract?.can_revoke

  // 撤回（二次确认）：终态 revoked，旧签署链接立即失效；已签完成的不给入口（走作废）
  // 催办：不传 partyId 即全部未签方一键催办；同一方 24 小时内重复催办会被后端抑制
  const handleRemind = async (partyId?: string) => {
    const c = detail.contract
    if (!c) return
    try {
      const res = await contractsApi.remind(c.id, partyId)
      const reminded = res.data?.reminded ?? 0
      const throttled = res.data?.throttled ?? 0
      if (reminded > 0) {
        message.success(t('contracts.msgReminded', { n: reminded }))
      } else if (throttled > 0) {
        message.info(t('contracts.msgRemindThrottled'))
      }
      onChanged()
      handleOpen(c.id)
    } catch (err) {
      message.error(errorText(err, t('contracts.errRemind')))
    }
  }

  const handleRevoke = () => {
    const c = detail.contract
    if (!c) return
    Modal.confirm({
      title: t('contracts.revokeConfirmTitle'),
      content: t('contracts.revokeConfirmBody'),
      okText: t('contracts.revokeOk'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await contractsApi.revokeContract(c.id)
          message.success(t('contracts.msgRevoked'))
          onChanged()
          handleOpen(c.id)
        } catch (err) {
          message.error(errorText(err, t('contracts.errRevoke')))
        }
      },
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
        onChanged()
      })
      .catch((err) => {
        message.error(errorText(err, t('contracts.declineFail')))
      })
  }

  // 保存签署顺序：type=parallel 时清空序号；sequential 时只提交未签方序号
  const handleSaveSignOrder = (
    type: 'parallel' | 'sequential',
    orders: { party_id: string; order: number }[],
  ) => {
    const c = detail.contract
    if (!c) return
    contractsApi
      .setSignOrder(c.id, { type, orders: type === 'sequential' ? orders : [] })
      .then(() => {
        message.success(t('contracts.msgSignOrderSaved'))
        setSignOrderOpen(false)
        handleOpen(c.id)
        onChanged()
      })
      .catch((err) => message.error(errorText(err, t('contracts.errSignOrder'))))
  }

  const loadCallbackEvents = (contractId: string) => {
    contractsApi
      .listCallbacks(contractId)
      .then((res) => setCallbackEvents(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCallbackEvents([]))
  }

  const loadCallbackSubscriptions = (contractId: string) => {
    contractsApi
      .listSubscriptions(contractId)
      .then((res) => setCallbackSubscriptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCallbackSubscriptions([]))
  }

  const openCallback = () => {
    const c = detail.contract
    if (!c) return
    setCallbackSecret('')
    setCallbackEvents([])
    setCallbackSubscriptions([])
    setCallbackOpen(true)
    loadCallbackEvents(c.id)
    loadCallbackSubscriptions(c.id)
  }

  // 保存回调配置：单地址 + 多订阅地址分两步调（后端确为两个接口）：
  // 1) POST /callback 保存主地址；2) 按勾选结果 DELETE /subscriptions/{id} 或 POST /subscriptions。
  // url 留空即关闭主地址回调；首次配置会返回明文 secret（仅此一次）。
  const handleSaveCallback = (
    url: string,
    removedSubscriptionIds: string[] = [],
    newSubscriptionUrls: string[] = [],
  ) => {
    const c = detail.contract
    if (!c) return
    setCallbackSaving(true)
    ;(async () => {
      try {
        const res = await contractsApi.setCallback(c.id, url.trim())
        let secret = res.data?.callback_secret || ''
        for (const subscriptionId of removedSubscriptionIds) {
          await contractsApi.removeSubscription(c.id, subscriptionId)
        }
        for (const subscriptionUrl of newSubscriptionUrls) {
          const added = await contractsApi.addSubscription(c.id, { url: subscriptionUrl })
          secret = secret || added.data?.callback_secret || ''
        }
        message.success(t('contracts.msgCallbackSaved'))
        setCallbackSecret(secret)
        handleOpen(c.id)
        loadCallbackEvents(c.id)
        loadCallbackSubscriptions(c.id)
      } catch (err) {
        message.error(errorText(err, t('contracts.errCallback')))
      } finally {
        setCallbackSaving(false)
      }
    })()
  }

  const handleRetryCallback = () => {
    const c = detail.contract
    if (!c) return
    contractsApi
      .retryCallback(c.id)
      .then((res) => {
        if (res.data?.status === 'delivered') message.success(t('contracts.msgCallbackRetried'))
        else message.warning(res.data?.last_error || t('contracts.errCallbackRetry'))
        loadCallbackEvents(c.id)
      })
      .catch((err) => message.error(errorText(err, t('contracts.errCallbackRetry'))))
  }

  return {
    detail,
    setDetail,
    canEdit,
    canRevoke,
    handleRevoke,
    handleOpen,
    handleCopyLink,
    handleShowQr,
    handleRotateLink,
    qrOpen,
    setQrOpen,
    qrDataUrl,
    qrUrl,
    qrPartyName,
    handleSend,
    handleSubmitApproval,
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
    handleRemind,
    signOrderOpen,
    setSignOrderOpen,
    handleSaveSignOrder,
    callbackOpen,
    setCallbackOpen,
    callbackEvents,
    callbackSubscriptions,
    callbackSecret,
    callbackSaving,
    openCallback,
    handleSaveCallback,
    handleRetryCallback,
  }
}

export type ContractDetailState = ReturnType<typeof useContractDetail>
