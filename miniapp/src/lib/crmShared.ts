/**
 * 管理端 / 员工端 CRM 共用逻辑。
 *
 * 两个 CRM 页此前各自内联了完全相同的一份「格式化 + 筛选 + 统计 + 联系客户」代码，
 * 收敛到此处避免双份维护。注意 STAGE_META / FILTERS 两页文案不同（管理端「意向/已约看」，
 * 员工端「咨询中/看房中」），属于有意为之，不在此处合并。
 */
import Taro from '@tarojs/taro'
import { chatApi } from '@/services/api'

/** 一次拉全量的分页大小（后端硬顶 100）。 */
export const PAGE_SIZE = 100

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  THB: '',
  EUR: '€',
  USD: '$'
}

/** CRM 金额展示：符号 + 千分位（THB 无符号）。 */
export const fmtMoney = (v?: number, currency?: string) =>
  `${CURRENCY_SYMBOL[currency || 'THB'] || ''}${Number(v || 0).toLocaleString()}`

/** 日期：取 MM-DD。 */
export const fmtDate = (v?: string) => (v ? String(v).slice(5, 10) : '-')

/** 线索行（后端字段，两页共用的子集）。 */
export interface LeadLike {
  id?: string
  name?: string
  phone?: string
  email?: string
  stage?: string
  created_at?: string
  [key: string]: any
}

/** 阶段 + 关键词的客户端筛选（接口一次拉全量）。 */
export function filterLeads<T extends LeadLike>(leads: T[], stage: string, query: string): T[] {
  const kw = query.toLowerCase()
  return leads.filter((l) => {
    if (stage && l.stage !== stage) return false
    if (!kw) return true
    return [l.name, l.phone, l.email]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(kw))
  })
}

/** 按已加载线索实时计算统计（接口不提供分阶段计数）。 */
export function computeLeadStats(leads: LeadLike[], total: number) {
  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return {
    total: total || leads.length,
    intent: leads.filter((l) => l.stage === 'inquiring').length,
    closed: leads.filter((l) => l.stage === 'closed').length,
    newThisMonth: leads.filter((l) => String(l.created_at || '').startsWith(monthPrefix)).length
  }
}

/** 拨打客户电话。 */
export const callPhone = (phone?: string) => {
  if (!phone) return
  Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {})
}

/** 联系客户：小程序内发消息（按手机号/邮箱解析客户账号并创建会话）。 */
export async function chatCustomer(l: { name?: string; phone?: string; email?: string }) {
  const phone = (l.phone || '').trim()
  const email = (l.email || '').trim()
  if (!phone && !email) {
    Taro.showToast({ title: '客户未留电话/邮箱，无法发消息', icon: 'none' })
    return
  }
  try {
    const res: any = await chatApi.createConversation({
      title: (l.name || '客户咨询').trim(),
      ...(phone ? { participant_phones: [phone] } : {}),
      ...(email ? { participant_emails: [email] } : {})
    })
    const conv = res?.data ?? res
    if (!conv?.id) throw new Error('会话创建失败')
    Taro.navigateTo({ url: `/pages/chat/detail/index?id=${conv.id}` })
  } catch (error: any) {
    Taro.showToast({
      title: error?.message || '客户未注册账号，请先通过电话/邮箱联系',
      icon: 'none'
    })
  }
}
