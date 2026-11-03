import { formatMoney } from '@/lib/money'

// 业绩/佣金一律泰铢口径（后端 base currency 为 THB）。
// 此前写死 'RM'：`formatMoney` 只加币种符号、不做汇率换算，所以显示出来的
// "RM 28,400" 其实是 28,400 泰铢——符号错了、数字也没换。
export const fmtMoney = (v: number) => formatMoney(v, 'THB')

// 柱图值紧凑展示：28400 -> 28.4k
export const fmtCompact = (v: number) => {
  const n = Number(v || 0)
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
