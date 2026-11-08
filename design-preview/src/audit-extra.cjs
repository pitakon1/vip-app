// 补查：地图页、租约/交易详情页、签署页（invalid token 错误态）
const fs = require('fs')
const path = require('path')
const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright')

const OUT = path.resolve(__dirname, '..', 'audit-cards')
const SHOTS = path.join(OUT, 'screens')
const WEB = 'http://localhost:3000'

const login = async (email, pwd) => {
  const r = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(pwd)}`,
  })
  const j = await r.json()
  return j.data ?? j
}
const inspect = () => {
  const cards = [...document.querySelectorAll('.rent-card')].map((el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect()
    const visible = r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'
    return { visible, w: Math.round(r.width), h: Math.round(r.height), borderWidth: parseFloat(s.borderTopWidth) || 0, borderColor: s.borderTopColor, shadow: s.boxShadow, bg: s.backgroundColor, cls: el.className }
  }).filter((c) => c.visible)
  const pageBg = getComputedStyle(document.body).backgroundColor
  return {
    pageBg, total: cards.length,
    noBoundary: cards.filter((c) => c.borderWidth === 0 && c.shadow === 'none'),
    shadowOnly: cards.filter((c) => c.borderWidth === 0 && c.shadow !== 'none'),
    sample: cards.slice(0, 9),
  }
}
;(async () => {
  const browser = await chromium.launch()
  const extra = []
  const run = async (ctx, route, role, name) => {
    const p = await ctx.newPage()
    await p.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
    await p.waitForTimeout(1600)
    const info = await p.evaluate(inspect).catch(() => null)
    if (info) await p.screenshot({ path: path.join(SHOTS, name) }).catch(() => {})
    extra.push({ role, route, name, status: 'ok', finalUrl: p.url().replace(WEB, ''), total: info ? info.total : null, pageBg: info ? info.pageBg : null, noBoundary: info ? info.noBoundary.map(({ cls, bg }) => ({ cls, bg })) : [], shadowOnly: info ? info.shadowOnly : [], sample: info ? info.sample : [], errors: [], extra: ['补查'] })
    console.log(role, route, 'cards=', info ? info.total : 'n/a', 'bad=', info ? info.noBoundary.length : 'n/a')
    await p.close()
  }
  const mk = async (auth) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' })
    if (auth) await ctx.addInitScript((a) => {
      localStorage.setItem('token', a.access_token); localStorage.setItem('refresh_token', a.refresh_token); localStorage.setItem('user', JSON.stringify(a.user))
    }, auth)
    return ctx
  }

  const tenant = await login('tenant@viprental.com', 'tenant123')
  const tctx = await mk(tenant)
  const tp = await tctx.newPage()
  await tp.goto(`${WEB}/tenant/leases`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await tp.waitForTimeout(1800)
  const ids = await tp.evaluate(async () => {
    const token = localStorage.getItem('token')
    const h = { Authorization: `Bearer ${token}` }
    const pick = (o) => (o?.data?.items ?? o?.items ?? o?.data ?? [])
    const [l, d] = await Promise.all([
      fetch('/api/v1/leases', { headers: h }).then((r) => r.json()).catch(() => null),
      fetch('/api/v1/deals', { headers: h }).then((r) => r.json()).catch(() => null),
    ])
    return { lease: pick(l)[0]?.id ?? null, deal: pick(d)[0]?.id ?? null }
  }).catch(() => ({ lease: null, deal: null }))
  await tp.close()
  console.log('ids', ids)
  if (ids.lease) await run(tctx, `/tenant/leases/${ids.lease}`, 'tenant', 'tenant-lease-detail.png')
  await run(tctx, `/tenant/deals/${ids.deal || '00000000-0000-0000-0000-000000000000'}`, 'tenant', 'tenant-deal-detail.png')
  await tctx.close()

  const admin = await login('admin@viprental.com', 'admin123')
  const actx = await mk(admin)
  await run(actx, '/map', 'public', 'public-map.png')
  await actx.close()

  const pub = await mk(null)
  await run(pub, '/sign/invalid-token', 'public', 'public-sign-invalid.png')
  await pub.close()

  fs.writeFileSync(path.join(OUT, 'extra-report.json'), JSON.stringify(extra, null, 2))
  console.log(JSON.stringify(extra.map((e) => ({ route: e.route, total: e.total, bad: e.noBoundary.length, finalUrl: e.finalUrl })), null, 2))
  await browser.close()
})()
