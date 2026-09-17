/** 多币种金额 / 日期展示工具（全端统一，修复 MYR 显示丢失问题）。 */

const CURRENCY_SYMBOL: Record<string, string> = {
  THB: '฿',
  CNY: '¥',
  USD: '$',
  EUR: '€',
  MYR: 'RM ',
  RM: 'RM ',
};

/** 金额：符号 + 千分位；未知币种回退 ฿。 */
export function fmtMoney(value?: number | string | null, currency?: string | null): string {
  const sym = CURRENCY_SYMBOL[currency || 'THB'] ?? '฿';
  return `${sym}${Number(value || 0).toLocaleString()}`;
}

/** 日期：'short' 取 YYYY-MM-DD，'minute' 取到分钟（T→空格）；空值回退 '—'。 */
export function fmtDate(value?: string | null, style: 'short' | 'minute' = 'short'): string {
  if (!value) return '—';
  const s = String(value);
  return style === 'minute' ? s.replace('T', ' ').slice(0, 16) : s.replace('T', ' ').slice(0, 10);
}
