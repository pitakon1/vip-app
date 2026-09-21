/** 多币种展示工具（A7：泰铢为主，人民币/美元/欧元/马币展示）。 */
import api from '@/lib/api'

export type Currency = 'THB' | 'CNY' | 'USD' | 'EUR' | 'RM'

export const CURRENCY_SYMBOL: Record<string, string> = {
  THB: '฿',
  CNY: '¥',
  USD: '$',
  EUR: '€',
  RM: 'RM ',
}

// 基准换算率：THB=1（与后端 app/services/pricing.py 保持一致；RM 为产品原型展示币种）
const RATES: Record<string, number> = { THB: 1, CNY: 5.2, USD: 36, EUR: 39, RM: 10 }

/** 按符号格式化金额：THB 显示 ฿ + 千分位，其余显示符号 + 千分位。 */
export function formatMoney(
  value: number,
  currency: string = 'THB',
  displaySymbol = true,
): string {
  const num = Number(value || 0)
  const code = (currency || 'THB').toUpperCase()
  if (!displaySymbol) return num.toLocaleString()
  const symbol = CURRENCY_SYMBOL[code] || `${code} `
  return `${symbol}${num.toLocaleString()}`
}

/** 泰铢 → 目标币种 展示换算。 */
export function convertCurrency(
  amountThb: number,
  to: string = 'THB',
): number {
  const rate = RATES[to.toUpperCase()] || 1
  return Number((Number(amountThb || 0) / rate).toFixed(2))
}

/** 目标币种金额 → 泰铢。 */
export function toThb(amount: number, from: string = 'THB'): number {
  const rate = RATES[from.toUpperCase()] || 1
  return Number((Number(amount || 0) * rate).toFixed(2))
}

/**
 * 从服务端拉取最新汇率，覆盖文件内的兜底值。
 *
 * 为什么改成拉取而不是硬编码：内置 `CNY = 5.2` 与市场实际（约 4.97）偏离 4.6%，
 * 双币并排展示时会直接把人民币报价算错。汇率交给服务端统一管理后（`GET
 * /public/exchange-rates`），将来接实时汇率源只需要改后端一处。
 *
 * 拉取失败时保持兜底值——汇率是展示增强，不该因它让页面挂掉。
 */
export async function loadRates(): Promise<void> {
  try {
    const res = await api.get('/public/exchange-rates')
    const rates = res.data?.rates_to_thb
    if (rates && typeof rates === 'object') {
      Object.assign(RATES, rates)
      RATES.THB = 1
    }
  } catch {
    // 静默降级
  }
}

export { RATES }
