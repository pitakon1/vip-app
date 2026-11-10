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

/**
 * 聊天时间统一出口：YYYY-MM-DD HH:mm:ss，按设备本地时区展示。
 * 后端 `created_at` 是无时区后缀的 UTC ISO 串（如 2026-11-10T06:32:05.123456），
 * 这里先补 Z 按 UTC 解析，再取本地时间字段，避免把 UTC 当本地时间直接截取展示。
 * 带时区标记（Z / +07:00）的输入按其自身偏移解析；无法解析时返回空串。
 */
export function fmtDateTime(value?: string | null): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const date = new Date(hasZone ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
