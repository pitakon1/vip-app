const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');
const path = require('path');
const OUT = path.resolve(__dirname, '..', 'shots');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // 进入邮箱登录表单屏
  const emailBtn = page.getByRole('button', { name: /邮箱|Email/i }).first();
  if (await emailBtn.count()) {
    await emailBtn.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, 'web-login-form-before.png') });
    console.log('captured email form');
  } else {
    console.log('email button not found');
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log(bodyText.slice(0, 500));
  await browser.close();
})();
