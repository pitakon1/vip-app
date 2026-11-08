const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'shots');
const URL = 'file:///' + path.join(ROOT, 'samples.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();

  // 单帧高清
  const hi = await browser.newContext({ viewport: { width: 3000, height: 1000 }, deviceScaleFactor: 2 });
  const hp = await hi.newPage();
  await hp.goto(URL, { waitUntil: 'load' });
  await hp.waitForTimeout(600);
  for (let i = 1; i <= 8; i++) {
    for (const side of ['before', 'after']) {
      const el = hp.locator(`#s${i}-${side}`);
      await el.screenshot({ path: path.join(OUT, `sample${i}-${side}.png`) });
      console.log(`sample${i}-${side}.png`);
    }
  }
  await hi.close();

  // 并排合成（含标题与来源徽标）
  const lo = await browser.newContext({ viewport: { width: 3000, height: 1000 }, deviceScaleFactor: 1 });
  const lp = await lo.newPage();
  await lp.goto(URL, { waitUntil: 'load' });
  await lp.waitForTimeout(600);
  for (let i = 1; i <= 8; i++) {
    const el = lp.locator(`#pair-${i}`);
    await el.screenshot({ path: path.join(OUT, `sample${i}-pair.png`) });
    console.log(`sample${i}-pair.png`);
  }
  await lo.close();
  await browser.close();
})();
