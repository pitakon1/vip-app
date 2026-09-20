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