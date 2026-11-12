import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { chatApi } from '@/services/api'
import type { Lead } from '@/types'
import { errorText } from '@/lib/errorText'

/** 联系客户：直接拨打与 Web 内发消息 */
export function useLeadContact() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleCall = (lead: Lead) => {
    if (!lead.phone) {
      message.warning(t('crm.warnNoPhone'))
      return
    }
    window.location.href = `tel:${lead.phone.replace(/\s/g, '')}`
  }

  // Web 内发消息（按手机号/邮箱解析客户账号并创建会话）
  const handleChat = async (lead: Lead) => {
    const phone = (lead.phone || '').trim()
    const email = (lead.email || '').trim()
    if (!phone && !email) {
      message.warning(t('crm.warnNoContact'))
      return
    }
    try {
      const res = await chatApi.createConversation({
        title: lead.name || t('crm.defaultConvTitle'),
        // 后端按 lead_id 走多路识别：线索关联账号 → 邮箱 → 归一化手机号
        lead_id: lead.id,
        ...(phone ? { participant_phones: [phone] } : {}),
        ...(email ? { participant_emails: [email] } : {}),
      })
      const conv = res.data?.data ?? res.data
      if (!conv?.id) throw new Error(t('crm.errConvCreate'))
      navigate(`/chat?id=${conv.id}`)
    } catch (err) {
      message.error(errorText(err, t('crm.errNoAccount')))
    }
  }

  return { handleCall, handleChat }
}
