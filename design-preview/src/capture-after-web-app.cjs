// 阶段 0/1 改动后的真实页面截图：Web 1440×900 + App（Expo Web）
const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'after');
const WEB = 'http://localhost:3000';
const APP = 'http://localhost:8081';
const DETAIL_ID = '083da18c-7fd5-493d-8aa2-d5c79c26c912';

async function loginToken(email, password) {
  const res = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
  });
  const body = await res.json();
  return (body.data ?? body).access_token;
}

(async () => {
  const browser = await chromium.launch();

  // ---------- Web ----------
  const webCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
  });
  const page = await webCtx.newPage();
  page.on('pageerror', (e) => console.log('WEB_PAGE_ERR', e.message.slice(0, 200)));

  async function shot(url, name, wait = 2500) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(wait);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, name), fullPage: false });
    console.log('captured', name);
  }

  await shot(`${WEB}/`, 'web-home.png');
  await shot(`${WEB}/listings`, 'web-listings.png', 3000);
  await shot(`${WEB}/listing/${DETAIL_ID}`, 'web-detail.png', 3200);
  await shot(`${WEB}/login`, 'web-login.png');
  await webCtx.close();

  // ---------- App（Expo Web）----------
  async function appShot(email, password, name) {
    const token = await loginToken(email, password);
    const ctx = await browser.newContext({
      viewport: { width: 430, height: 900 },
      deviceScaleFactor: 2,
      locale: 'zh-CN',
    });
    await ctx.addInitScript((t) => {
      try {
        window.localStorage.setItem('auth_token', t);
      } catch (e) {}
    }, token);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('APP_PAGE_ERR', name, e.message.slice(0, 200)));
    await p.goto(APP, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(9000);
    await p.screenshot({ path: path.join(OUT, name), fullPage: false });
    console.log('captured', name);
    await ctx.close();
  }

  await appShot('admin@viprental.com', 'admin123', 'app-admin-home.png');
  await appShot('tenant@viprental.com', 'tenant123', 'app-tenant-home.png');

  await browser.close();
})();
