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

/**
 * 单价（金额/㎡）统一出口，与 Web `lib/money.ts` 的 `formatUnitPrice` 同口径：
 * 固定两位小数 + `/㎡` 后缀，避免 `฿692.308 THB/㎡` 这类三位小数、币种重复的写法。
 */
export function formatUnitPrice(
  value?: number | string | null,
  currency?: string | null,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  return `${formatMoney(Number(num.toFixed(2)), currency)}/㎡`;
}

/** 面积统一出口：数值 + 单位（单位随语言传入，如 ㎡ / sqm / ตร.ม.），空值 '—'。 */
export function formatArea(value?: number | string | null, unit = '㎡'): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toLocaleString()} ${unit}`;
}

/**
 * 数值缩写统一出口（图表柱值、区域均价等窄位展示）：
 * 中文用「万」，英文/泰文用 K/M；千位以下不缩写（保留千分位）。
 */
export function formatCompactNumber(
  value?: number | string | null,
  lang: string = 'zh',
): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const abs = Math.abs(num);
  const trim = (s: string) => s.replace(/\.0$/, '');
  if (abs < 1000) return num.toLocaleString();
  if (lang === 'zh') {
    if (abs >= 10000) return `${trim((num / 10000).toFixed(1))}万`;
    return num.toLocaleString();
  }
  if (abs >= 1000000) return `${trim((num / 1000000).toFixed(1))}M`;
  return `${trim((num / 1000).toFixed(1))}K`;
}

/**
 * 日期：'short' 取 YYYY-MM-DD，'minute' 取到分钟；空值回退 '—'。
 * 带时分秒的值统一走 fmtDateTime（无时区后缀按 UTC 解析 → 设备本地时间），
 * 不再直接截取后端原始串，避免 UTC 与本地时区混用；纯日期本身不涉及时区换算，原样取日期段。
 */
export function fmtDate(value?: string | null, style: 'short' | 'minute' = 'short'): string {
  if (!value) return '—';
  const raw = String(value).trim();
  if (!raw) return '—';
  if (!raw.includes('T') && !raw.includes(':')) return raw.slice(0, 10);
  const local = fmtDateTime(raw);
  if (!local) return '—';
  return style === 'minute' ? local.slice(0, 16) : local.slice(0, 10);
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
