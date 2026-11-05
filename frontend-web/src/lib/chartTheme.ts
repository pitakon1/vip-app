/**
 * Chart.js 图表配色。
 *
 * 图表在 options 里直接写 hex 会与设计令牌脱节，主题调整时漏改。
 * 这里统一从 :root 上的 CSS 变量读取，令牌里确实没有的颜色才在 tokens.css 新增。
 * 新增图表色请用 `chartTheme.palette` / `--chart-N`，不要再写裸 hex。
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
    return token('--chart-1', '#0d9488')
  },
  get ink2(): string {
    return token('--rent-ink-2', '#55606c')
  },
  get ink3(): string {
    return token('--rent-ink-3', '#5f6b78')
  },
  get line(): string {
    return token('--rent-line', '#ece7df')
  },
  get surface(): string {
    return token('--rent-card', '#ffffff')
  },
  get legend(): string {
    return token('--chart-legend', '#5f6b78')
  },
  get tooltipBg(): string {
    return token('--chart-tooltip-bg', '#1c2733')
  },
  get tooltipInk(): string {
    return token('--chart-tooltip-ink', '#e8edf5')
  },
  get tooltipBorder(): string {
    return token('--chart-tooltip-border', '#243044')
  },
  /** 图表分类色板（顺序即 --chart-1..7），用于饼图/多系列/头像底色。 */
  get palette(): string[] {
    const colors = [1, 2, 3, 4, 5, 6, 7].map((i) => token(`--chart-${i}`, ''))
    return colors.filter(Boolean)
  },
  /** 按序取色，色板缺失时回退到主色，避免 undefined 传到 Chart.js。 */
  chart(index: number): string {
    const colors = this.palette
    if (!colors.length) return '#0d9488'
    return colors[Math.abs(index) % colors.length]
  },
}
