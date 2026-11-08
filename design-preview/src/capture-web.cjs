const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'shots');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  async function shot(url, name, wait = 2200) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(wait);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, name), fullPage: false });
    console.log('captured', name, '->', url);
  }

  await shot('http://localhost:3000/', 'web-home-before.png');
  await shot('http://localhost:3000/listings', 'web-listings-before.png', 2600);
  await shot('http://localhost:3000/listing/083da18c-7fd5-493d-8aa2-d5c79c26c912', 'web-detail-before.png', 2600);
  await shot('http://localhost:3000/login', 'web-login-before.png');

  await browser.close();
})();
