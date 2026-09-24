/** 货币符号：USD→$ / CNY→¥ / MYR→RM / 其它（默认 THB）→฿ */
export const currencySymbol = (c?: string | null) =>
  c === 'USD' ? '$' : c === 'CNY' ? '¥' : c === 'MYR' ? 'RM ' : '฿';
