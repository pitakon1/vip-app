/**
 * 支付发起工具：解析后端 /payments/{id}/pay 的返回，决定跳转方式。
 * 后端可能返回两类结果：
 *  - checkout_url：托管收银台地址（Stripe / Wise 等）→ 直接跳转支付页
 *  - qr_code_data：扫码支付内容（PromptPay / 微信 / 支付宝 等）→ 展示二维码
 */
export type PayResolution =
  | { kind: 'url'; url: string }
  | { kind: 'qr'; qr: string }
  | { kind: 'none' };

/** 账单展示分桶，与后端 `bill_bucket` 同口径：
 *  - received：已结清（succeeded）
 *  - pending：未结清（pending / processing / failed）且未过截止日
 *  - overdue：未结清且 due_date 已过（逾期只看 due_date，不看 status）
 *  - closed：已关闭（refunded / expired / disputed），不再催缴
 */
export type BillBucket = 'received' | 'pending' | 'overdue' | 'closed';

const UNPAID_STATUSES = ['pending', 'processing', 'failed'];
const CLOSED_STATUSES = ['refunded', 'expired', 'disputed'];

export function billBucket(
  p: { status?: string | null; due_date?: string | null },
  now: number = Date.now(),
): BillBucket {
  const status = String(p.status ?? 'pending').toLowerCase();
  if (status === 'succeeded') return 'received';
  if (CLOSED_STATUSES.includes(status)) return 'closed';
  if (!UNPAID_STATUSES.includes(status)) return 'closed';
  const due = p.due_date ? new Date(p.due_date).getTime() : NaN;
  return !Number.isNaN(due) && due < now ? 'overdue' : 'pending';
}

export const isUnpaid = (p: { status?: string | null; due_date?: string | null }) =>
  ['pending', 'overdue'].includes(billBucket(p));

export const isOverdue = (p: { status?: string | null; due_date?: string | null }) =>
  billBucket(p) === 'overdue';

/** processing 已提交渠道/凭证，不能重复发起扣款（后端会 409） */
export const canPayBill = (p: { status?: string | null; due_date?: string | null }) => {
  const status = String(p.status ?? '').toLowerCase();
  return status !== 'succeeded' && status !== 'processing' && isUnpaid(p);
};

export function resolvePayment(data: any): PayResolution {
  const checkoutUrl: unknown = data?.checkout_url ?? data?.url;
  const qr: unknown = data?.qr_code_data ?? data?.qr_code ?? data?.qr;

  if (typeof checkoutUrl === 'string' && /^https?:\/\//i.test(checkoutUrl.trim())) {
    return { kind: 'url', url: checkoutUrl.trim() };
  }
  if (typeof qr === 'string' && qr.trim()) {
    return { kind: 'qr', qr: qr.trim() };
  }
  // 相对占位链接（未接通真实渠道的演示地址）没有真实支付页，属无法跳转
  return { kind: 'none' };
}