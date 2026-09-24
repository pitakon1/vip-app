/**
 * Chart.js 图表配色。
 *
 * 图表在 options 里直接写 hex 会与设计令牌脱节，主题调整时漏改。
 * 这里统一从 :root 上的 CSS 变量读取，令牌里确实没有的颜色才在 tokens.css 新增。
 */

/** 读取设计令牌（CSS 变量）的值，取不到时回退到默认色，避免图表因空值渲染异常。 */
export const token = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * 图表常用色。用 getter 而非一次性常量，保证读取发生在渲染时，
 * 此时 tokens.css 一定已注入。
 */
export const chartTheme = {
  get primary(): string {
    return token('--rent-primary', '#14b8a6')
  },
  get ink2(): string {
    return token('--rent-ink-2', '#55606c')
  },
  get ink3(): string {
    return token('--rent-ink-3', '#98a1ab')
  },
  get line(): string {
    return token('--rent-line', '#ece7df')
  },
  get legend(): string {
    return token('--chart-legend', '#64748b')
  },
  get tooltipBorder(): string {
    return token('--chart-tooltip-bg', '#243044')
  },
}
