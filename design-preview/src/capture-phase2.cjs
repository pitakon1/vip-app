const fs = require('fs');
const path = require('path');
const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', 'after4');
const login = async (email, pwd) => {
  const r = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(pwd)}`,
  });
  return (await r.json()).data;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ev = {};

  // Web 列表卡 hover 阴影（单层）
  const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const p1 = await c1.newPage();
  await p1.goto('http://localhost:3000/listings', { waitUntil: 'networkidle', timeout: 60000 });
  await p1.waitForTimeout(1200);
  const card = p1.locator('.rent-prop-search-card').first();
  await card.hover();
  await p1.waitForTimeout(400);
  ev.listCardHover = await card.evaluate((el) => {
    const s = getComputedStyle(el);
    return { boxShadow: s.boxShadow, borderColor: s.borderColor, transform: s.transform };
  });
  await p1.screenshot({ path: path.join(OUT, 'web-listings-hover.png') });

  // 内部详情页 rent-detail-card 已去阴影
  const a = await login('admin@viprental.com', 'admin123');
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  await c2.addInitScript((t) => {
    localStorage.setItem('token', t.access_token);
    localStorage.setItem('refresh_token', t.refresh_token);
    localStorage.setItem('user', JSON.stringify(t.user));
  }, a);
  const p2 = await c2.newPage();
  await p2.goto('http://localhost:3000/properties', { waitUntil: 'networkidle', timeout: 60000 });
  await p2.waitForTimeout(2000);
  const first = p2.locator('.rent-prop-card').first();
  if (await first.count()) {
    await first.click();
    await p2.waitForTimeout(1500);
    ev.detailCard = await p2.evaluate(() => {
      const el = document.querySelector('.rent-detail-card');
      return el ? { boxShadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).border } : null;
    });
    await p2.screenshot({ path: path.join(OUT, 'web-detail-internal.png') });
  }
  await c1.close(); await c2.close();

  // App（Expo Web）租客首页 / 管理员首页
  for (const [email, pwd, file] of [
    ['tenant@viprental.com', 'tenant123', 'app-tenant-home.png'],
    ['admin@viprental.com', 'admin123', 'app-admin-home.png'],
  ]) {
    const auth = await login(email, pwd);
    const c = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
    await c.addInitScript((t) => { try { localStorage.setItem('auth_token', t.access_token); } catch (e) {} }, auth);
    const p = await c.newPage();
    await p.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(4000);
    await p.screenshot({ path: path.join(OUT, file) });
    await c.close();
  }

  fs.writeFileSync(path.join(OUT, 'phase2-evidence.json'), JSON.stringify(ev, null, 2));
  console.log(JSON.stringify(ev, null, 2));
  await browser.close();
})();
