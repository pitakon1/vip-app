// 全站 .rent-card 去阴影影响核查：逐页渲染 + 截图 + 边界计算
const fs = require('fs')
const path = require('path')
const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright')

const OUT = path.resolve(__dirname, '..', 'audit-cards')
const SHOTS = path.join(OUT, 'screens')
const WEB = 'http://localhost:3000'
const DETAIL = '083da18c-7fd5-493d-8aa2-d5c79c26c912'

const login = async (email, pwd) => {
  const r = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(pwd)}`,
  })
  const j = await r.json()
  return j.data ?? j
}

const slug = (r) => r.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home'

const ADMIN_ROUTES = [
  '/dashboard', '/properties', `/properties/detail/${DETAIL}`, '/crm', '/leases', '/payments',
  '/contracts', '/verify', '/employees', '/settings', '/viewings', '/trend', '/commission-rules',
  '/audit-logs', '/sale-deals', '/distribution', '/markets', '/market-intelligence', '/company',
  '/employee/dashboard', '/employee/attendance', '/employee/performance', '/employee/contacts',
  '/system/users', '/system/partners', '/system/groups', '/system/permissions', '/system/departments',
  '/system/data-scopes', '/system/options', '/system/review-center', '/operations',
  '/operations/listing-review', '/operations/dedupe-review', '/attendance-manage',
  '/partner/members', '/partner/attendance', '/my-listings', '/broker-agreements',
]
const TENANT_ROUTES = [
  '/tenant/dashboard', '/tenant/my', '/tenant/payments', '/tenant/documents', '/tenant/services',
  '/tenant/maintenance', '/tenant/leases', '/tenant/deals', '/tenant/contracts', `/tenant/properties/${DETAIL}`,
]
const OWNER_ROUTES = ['/tenant/my-properties', '/tenant/income', '/tenant/marketing', '/tenant/my-listings']
const PUBLIC_ROUTES = ['/', '/listings', `/listing/${DETAIL}`]

const inspect = () => {
  const cards = [...document.querySelectorAll('.rent-card')]
    .map((el) => {
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const visible = r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'
      const bw = parseFloat(s.borderTopWidth) || 0
      return {
        visible,
        w: Math.round(r.width), h: Math.round(r.height),
        borderWidth: bw,
        borderColor: s.borderTopColor,
        shadow: s.boxShadow,
        bg: s.backgroundColor,
        cls: el.className,
      }
    })
    .filter((c) => c.visible)
  const pageBg = getComputedStyle(document.body).backgroundColor
  const bad = cards.filter((c) => c.borderWidth === 0 && c.shadow === 'none')
  const shadowOnly = cards.filter((c) => c.borderWidth === 0 && c.shadow !== 'none')
  return { pageBg, total: cards.length, bad, shadowOnly, cards: cards.slice(0, 9) }
}

;(async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch()
  const report = { generatedAt: new Date().toISOString(), pages: [] }

  const makeCtx = async (auth) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' })
    if (auth) {
      await ctx.addInitScript((a) => {
        localStorage.setItem('token', a.access_token)
        localStorage.setItem('refresh_token', a.refresh_token)
        localStorage.setItem('user', JSON.stringify(a.user))
      }, auth)
    }
    return ctx
  }

  const run = async (ctx, route, role, extra = []) => {
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)))
    let status = 'ok'
    await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { status = 'goto-failed' })
    await page.waitForTimeout(1500)
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
    const info = await page.evaluate(inspect).catch(() => null)
    const name = `${role}-${slug(route)}.png`
    if (info && info.total >= 0) await page.screenshot({ path: path.join(SHOTS, name) }).catch(() => {})
    report.pages.push({
      role, route, name, status, finalUrl: page.url().replace(WEB, ''),
      total: info ? info.total : null,
      pageBg: info ? info.pageBg : null,
      noBoundary: info ? info.bad.map((c) => ({ cls: c.cls, w: c.w, h: c.h, bg: c.bg })) : [],
      shadowOnly: info ? info.shadowOnly.map((c) => ({ cls: c.cls, w: c.w, h: c.h, shadow: c.shadow })) : [],
      sample: info ? info.cards : [],
      errors: errs,
      extra,
    })
    console.log(role, route, 'cards=', info ? info.total : 'n/a', 'bad=', info ? info.bad.length : 'n/a')
    await page.close()
  }

  // 公开页
  const pubCtx = await makeCtx(null)
  for (const r of PUBLIC_ROUTES) await run(pubCtx, r, 'public')
  await pubCtx.close()

  // 管理端
  const admin = await login('admin@viprental.com', 'admin123')
  const adminCtx = await makeCtx(admin)
  for (const r of ADMIN_ROUTES) await run(adminCtx, r, 'admin')
  await adminCtx.close()

  // 租客 + 业主
  const tenant = await login('tenant@viprental.com', 'tenant123')
  const tenantCtx = await makeCtx(tenant)
  for (const r of TENANT_ROUTES) await run(tenantCtx, r, 'tenant')
  const detailLinks = await (async () => {
    const p = await tenantCtx.newPage()
    const out = []
    for (const base of ['/tenant/leases', '/tenant/deals']) {
      await p.goto(`${WEB}${base}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
      await p.waitForTimeout(1500)
      const href = await p.evaluate((b) => {
        const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href') && x.getAttribute('href').includes(b + '/'))
        return a ? a.getAttribute('href') : null
      }, base).catch(() => null)
      if (href) out.push(href)
    }
    await p.close()
    return out
  })()
  for (const r of detailLinks) await run(tenantCtx, r, 'tenant', ['detail-link'])
  await tenantCtx.close()

  const owner = await login('owner@viprental.com', 'owner123')
  const ownerCtx = await makeCtx(owner)
  for (const r of OWNER_ROUTES) await run(ownerCtx, r, 'owner')
  await ownerCtx.close()

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  const badPages = report.pages.filter((p) => p.noBoundary.length)
  const shadowPages = report.pages.filter((p) => p.shadowOnly.length)
  console.log('\n=== SUMMARY ===')
  console.log('pages:', report.pages.length)
  console.log('noBoundaryPages:', badPages.map((p) => `${p.role} ${p.route} (${p.noBoundary.length})`).join(' | ') || 'none')
  console.log('shadowOnlyPages:', shadowPages.map((p) => `${p.role} ${p.route} (${p.shadowOnly.length})`).join(' | ') || 'none')
  await browser.close()
})()
