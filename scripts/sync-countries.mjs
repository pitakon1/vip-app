#!/usr/bin/env node
/**
 * 国家/区号数据同步脚本（单一数据源 → 三端）
 *
 * 数据源：backend/app/data/countries.json（唯一需要手工维护的文件）
 * 生成：frontend-web / mobile-app / miniapp 各自的 src/data/countries.ts
 *
 * 用法：node scripts/sync-countries.mjs
 * 维护约定：只改 backend/app/data/countries.json，然后跑本脚本，不要手改生成文件。
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'backend', 'app', 'data', 'countries.json')
const TARGETS = [
  join(ROOT, 'frontend-web', 'src', 'data', 'countries.ts'),
  join(ROOT, 'mobile-app', 'src', 'data', 'countries.ts'),
  join(ROOT, 'miniapp', 'src', 'data', 'countries.ts'),
]

const raw = JSON.parse(readFileSync(SOURCE, 'utf8'))
if (!Array.isArray(raw) || raw.length < 200) {
  throw new Error('countries.json 数据不完整：期望 200+ 个国家/地区')
}

const body = `/**
 * 全球国家/地区 + 国际电话区号（自动生成，请勿手改）
 * 数据源：backend/app/data/countries.json
 * 重新生成：node scripts/sync-countries.mjs
 */
export interface Country {
  /** ISO 3166-1 alpha-2 */
  iso2: string
  /** 中文名 */
  zh: string
  /** 英文名 */
  en: string
  /** 国际区号（纯数字，如 "66"） */
  dial: string
  /** 可接受的本地号码位数（已去掉国内长途前缀 0）；缺省时按 4-15 位宽松校验 */
  lens?: number[]
  /** 意大利等少数国家在国际格式中保留前导 0 */
  keepZero?: boolean
}

interface RawCountry {
  i: string
  z: string
  e: string
  d: string
  l?: number[]
  k?: number
}

const RAW: RawCountry[] = ${JSON.stringify(raw)}

export const COUNTRIES: Country[] = RAW.map((r) => ({
  iso2: r.i,
  zh: r.z,
  en: r.e,
  dial: r.d,
  lens: r.l,
  keepZero: r.k === 1,
}))

export const COUNTRY_BY_ISO2: Record<string, Country> = {}
for (const c of COUNTRIES) COUNTRY_BY_ISO2[c.iso2] = c

/** 共享区号时优先展示的国家（+1 美国、+44 英国、+7 俄罗斯等） */
const DIAL_PRIMARY: Record<string, string> = {
  '1': 'US', '7': 'RU', '39': 'IT', '44': 'GB', '47': 'NO', '61': 'AU',
  '212': 'MA', '262': 'RE', '290': 'SH', '358': 'FI', '590': 'GP', '599': 'CW', '672': 'NF',
}

export const COUNTRY_BY_DIAL: Record<string, Country> = {}
for (const c of COUNTRIES) {
  if (!COUNTRY_BY_DIAL[c.dial] || c.iso2 === DIAL_PRIMARY[c.dial]) {
    COUNTRY_BY_DIAL[c.dial] = c
  }
}

export function dialOf(country: Country): string {
  return '+' + country.dial
}

export function flagEmoji(iso2: string): string {
  const code = (iso2 || '').toUpperCase()
  if (code.length !== 2) return ''
  let out = ''
  for (let i = 0; i < 2; i += 1) {
    const codePoint = 0x1f1e6 + code.charCodeAt(i) - 65
    if (codePoint < 0x1f1e6 || codePoint > 0x1f1ff) return ''
    out += String.fromCodePoint(codePoint)
  }
  return out
}

/** 展示名：中文语言用中文名，其余（英/泰）用英文名，避免多语言包体积 */
export function countryName(country: Country, lang?: string): string {
  return (lang || '').toLowerCase().startsWith('zh') ? country.zh : country.en
}

export function displayCountry(country: Country, lang?: string): string {
  return flagEmoji(country.iso2) + ' ' + countryName(country, lang) + ' +' + country.dial
}

export function findCountryByIso2(iso2: string): Country | undefined {
  return COUNTRY_BY_ISO2[(iso2 || '').toUpperCase()]
}

export function findCountryByDial(dial: string): Country | undefined {
  return COUNTRY_BY_DIAL[(dial || '').replace(/\\D/g, '')]
}

function prefixScore(country: Country, q: string): number {
  let score = 0
  if (country.zh.startsWith(q)) score += 2
  if (country.en.toLowerCase().startsWith(q)) score += 2
  if (country.dial === q.replace(/^\\+/, '')) score += 3
  return score
}

/** 按国家名（中文/英文）、ISO 代码、区号搜索；空关键词返回全量 */
export function searchCountries(keyword: string): Country[] {
  const q = (keyword || '').trim().toLowerCase()
  if (!q) return COUNTRIES
  const dialQuery = q.startsWith('+') ? q.slice(1) : (/^\\d+$/.test(q) ? q : '')
  const matched = COUNTRIES.filter((c) => {
    if (c.zh.toLowerCase().includes(q)) return true
    if (c.en.toLowerCase().includes(q)) return true
    if (c.iso2.toLowerCase().includes(q)) return true
    if (dialQuery && c.dial.startsWith(dialQuery)) return true
    return false
  })
  matched.sort((a, b) => {
    const diff = prefixScore(b, q) - prefixScore(a, q)
    return diff !== 0 ? diff : a.en.localeCompare(b.en)
  })
  return matched
}

/** 去掉分隔符与国内长途前缀 0（保留意大利等 keepZero 国家的前导 0） */
export function normalizeNationalNumber(country: Country, local: string): string {
  let digits = (local || '').replace(/\\D/g, '')
  if (!country.keepZero && digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

export function isValidNationalNumber(country: Country, local: string): boolean {
  const digits = normalizeNationalNumber(country, local)
  if (!digits) return false
  if (country.lens && country.lens.length) return country.lens.indexOf(digits.length) >= 0
  return digits.length >= 4 && digits.length <= 15
}

/** 提交后端的统一格式：+区号+本地号码 */
export function toE164(country: Country, local: string): string {
  const digits = normalizeNationalNumber(country, local)
  return digits ? '+' + country.dial + digits : ''
}

export function phoneLengthHint(country: Country): string {
  return country.lens && country.lens.length ? country.lens.join('/') : '4-15'
}

/** 从 locale（en-TH / th_TH / zh-Hans-CN）里解析国家 */
export function findCountryByLocale(locale?: string): Country | undefined {
  const parts = (locale || '').replace(/_/g, '-').split('-')
  for (const part of parts.slice(1)) {
    const iso = part.replace(/[^A-Za-z]/g, '').toUpperCase()
    if (iso.length === 2 && COUNTRY_BY_ISO2[iso]) return COUNTRY_BY_ISO2[iso]
  }
  return undefined
}

/**
 * 默认国家：locale 地区 → 语言（zh→CN / th→TH）→ 市场默认泰國。
 * 不使用写死的 +66 常量，避免新增市场时只能改代码。
 */
export function detectDefaultCountry(lang?: string, locale?: string): Country {
  const byLocale = findCountryByLocale(locale)
  if (byLocale) return byLocale
  const l = (lang || '').toLowerCase()
  if (l.startsWith('zh')) return COUNTRY_BY_ISO2['CN']
  return COUNTRY_BY_ISO2['TH']
}
`

for (const target of TARGETS) {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, body, 'utf8')
  console.log('generated', target, statSync(target).size + ' bytes')
}
console.log('countries:', raw.length)
