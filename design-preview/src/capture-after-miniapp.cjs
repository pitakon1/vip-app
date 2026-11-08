// 小程序无微信开发者工具：用 HTML 复刻按 375×812 渲染并截图
const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'after');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 540, height: 900 }, deviceScaleFactor: 3, locale: 'zh-CN' });
  const page = await ctx.newPage();

  for (const [file, out] of [
    ['replica-tenant-home.html', 'miniapp-tenant-home-replica.png'],
    ['replica-login.html', 'miniapp-login-replica.png'],
  ]) {
    await page.goto('file:///' + path.join(DIR, file).replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.locator('#frame').screenshot({ path: path.join(DIR, out) });
    console.log('captured', out);
  }

  await browser.close();
})();
