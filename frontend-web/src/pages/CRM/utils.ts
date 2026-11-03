import { chartTheme } from '@/lib/chartTheme'
import type { Lead } from '@/types'
import type { ImportRow } from './types'
import { CSV_DEFAULT_ORDER, CSV_HEADER_ALIASES, CURRENCY_SYMBOL } from './constants'

/** 头像底色：统一取图表色板，避免出现重复色导致相邻客户撞色 */
export const getAgentColor = (name?: string) => {
  const palette = chartTheme.palette
  if (!palette.length) return '#14b8a6'
  if (!name) return palette[0]
  return palette[name.charCodeAt(0) % palette.length]
}

export const getAgentInitial = (name?: string) => (name ? name.charAt(0) : '?')

export const formatBudget = (lead: Lead, notSetLabel: string): string => {
  const symbol = CURRENCY_SYMBOL[lead.budget_currency || 'THB'] || lead.budget_currency || 'THB'
  const min = lead.budget_min
  const max = lead.budget_max
  if (min != null && max != null) {
    return `${symbol} ${Number(min).toLocaleString()}-${Number(max).toLocaleString()}`
  }
  if (max != null) return `${symbol} ${Number(max).toLocaleString()}`
  if (min != null) return `${symbol} ${Number(min).toLocaleString()}`
  return notSetLabel
}

/** 卡片右上角徽标配色：后端线索没有 property_type，这里按真实「来源」渠道着色 */
export const sourceBadge = (source?: string): string => {
  if (!source) return 'rent-badge--info'
  const s = source.toLowerCase()
  if (source.includes('别墅') || s.includes('villa')) return 'rent-badge--primary'
  if (source.includes('商铺') || s.includes('shop')) return 'rent-badge--warning'
  return 'rent-badge--info'
}

/** 解析单行 CSV（支持双引号包裹字段，含逗号与转义引号） */
export const parseCsvLine = (line: string): string[] => {
  const cells: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

/** CSV 文本 → 线索创建入参（无姓名的行跳过） */
export const buildImportPayloads = (text: string): ImportRow[] => {
  const rows = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(parseCsvLine)
  if (rows.length === 0) return []

  const aliasLookup: Record<string, keyof ImportRow> = {}
  ;(Object.keys(CSV_HEADER_ALIASES) as (keyof ImportRow)[]).forEach((field) => {
    CSV_HEADER_ALIASES[field].forEach((alias) => {
      aliasLookup[alias.toLowerCase()] = field
    })
  })

  const head = rows[0].map((c) => c.toLowerCase())
  const hasHeader = head.some((c) => !!aliasLookup[c])
  const body = hasHeader ? rows.slice(1) : rows
  const order: (keyof ImportRow | undefined)[] = hasHeader ? head.map((c) => aliasLookup[c]) : CSV_DEFAULT_ORDER

  const payloads: ImportRow[] = []
  for (const cells of body) {
    const record: Partial<Record<keyof ImportRow, string | number>> = {}
    order.forEach((field, idx) => {
      if (!field) return
      const value = (cells[idx] ?? '').trim()
      if (!value) return
      record[field] = field === 'budget_max' ? Number(value.replace(/[^\d.]/g, '')) || undefined : value
    })
    const name = String(record.name ?? '').trim()
    if (!name) continue
    payloads.push({ ...record, name } as ImportRow)
  }
  return payloads
}
