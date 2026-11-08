const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(ROOT, 'shots', '_index-check.png') });
  await browser.close();
})();
