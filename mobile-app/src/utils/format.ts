/** 多币种金额 / 日期展示工具（全端统一，修复 MYR 显示丢失问题）。 */

export const CURRENCY_SYMBOL: Record<string, string> = {
  THB: '฿',
  CNY: '¥',
  USD: '$',
  EUR: '€',
  MYR: 'RM ',
  RM: 'RM ',
};

/** 货币符号：未知币种回退为「币种代码 + 空格」，不再静默当成泰铢。 */
export function currencySymbol(currency?: string | null): string {
  const code = (currency || 'THB').toUpperCase();
  return CURRENCY_SYMBOL[code] ?? `${code} `;
}

/**
 * 金额统一出口：符号 + 千分位。
 * 空值（null / undefined / ''）显示 '—'，避免把「未填价格」渲染成 ฿0；
 * `displaySymbol=false` 只输出数字（用于自定义输入框旁单独摆放符号）。
 */
export function formatMoney(
  value?: number | string | null,
  currency?: string | null,
  displaySymbol = true,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!displaySymbol) return num.toLocaleString();
  return `${currencySymbol(currency)}${num.toLocaleString()}`;
}

/** 历史别名：等价于 formatMoney，保留以兼容既有调用点。 */
export const fmtMoney = formatMoney;

/** 日期：'short' 取 YYYY-MM-DD，'minute' 取到分钟（T→空格）；空值回退 '—'。 */
export function fmtDate(value?: string | null, style: 'short' | 'minute' = 'short'): string {
  if (!value) return '—';
  const s = String(value);
  return style === 'minute' ? s.replace('T', ' ').slice(0, 16) : s.replace('T', ' ').slice(0, 10);
}
