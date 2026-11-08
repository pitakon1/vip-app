// after3：详情页有图状态 + 管理端 / 业主端房源卡暖灰占位复验
const fs = require('fs');
const path = require('path');
const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', 'after3');
const WEB = 'http://localhost:3000';
const DETAIL = '083da18c-7fd5-493d-8aa2-d5c79c26c912';

const login = async (email, pwd) => {
  const r = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(pwd)}`,
  });
  const j = await r.json();
  return j.data ?? j;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const evidence = {};

  // ---------- 详情页（公开，有图） ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await p.goto(`${WEB}/listing/${DETAIL}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1800);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'web-detail-photos.png') });

  const gallery = p.locator('.pub-gallery');
  if (await gallery.count()) {
    await gallery.first().screenshot({ path: path.join(OUT, 'web-detail-gallery.png') });
  }

  evidence.detail = await p.evaluate(() => {
    const g = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const c = getComputedStyle(e);
      return { text: (e.textContent || '').trim().slice(0, 24), color: c.color, bg: c.backgroundColor, fs: c.fontSize, weight: c.fontWeight };
    };
    const imgs = [...document.querySelectorAll('.pub-gallery img')];
    return {
      title: g('.pub-detail__title'),
      priceMain: g('.pub-price-block__main'),
      gallery: g('.pub-gallery'),
      galleryImages: imgs.length,
      mainImage: imgs[0] ? { src: imgs[0].getAttribute('src'), naturalWidth: imgs[0].naturalWidth, naturalHeight: imgs[0].naturalHeight } : null,
      thumbnails: imgs.slice(1).map((i) => ({ src: i.getAttribute('src'), naturalWidth: i.naturalWidth })),
      empty: document.querySelector('.pub-gallery__empty') ? true : false,
    };
  });
  evidence.webErrors = errs;
  await ctx.close();

  // ---------- 管理端 / 业主端房源卡 ----------
  const authedShot = async (email, pwd, url, name) => {
    const auth = await login(email, pwd);
    if (!auth?.access_token) throw new Error(`login failed: ${email}`);
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
    await c.addInitScript((a) => {
      try {
        localStorage.setItem('token', a.access_token);
        localStorage.setItem('refresh_token', a.refresh_token);
        localStorage.setItem('user', JSON.stringify(a.user));
      } catch (e) {}
    }, auth);
    const page = await c.newPage();
    await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, name) });
    const info = await page.evaluate(() => {
      const card = document.querySelector('.rent-prop-card__banner');
      const cs = card ? getComputedStyle(card) : null;
      const icon = document.querySelector('.rent-prop-card__banner-icon');
      return {
        cardCount: document.querySelectorAll('.rent-prop-card').length,
        banner: card ? { bg: cs.backgroundColor, dataPhoto: card.getAttribute('data-photo') } : null,
        icon: icon ? { opacity: getComputedStyle(icon).opacity, color: getComputedStyle(icon).color } : null,
        legacyInlineBg: card ? card.style.background : null,
      };
    });
    evidence[name] = info;
    console.log('captured', name, JSON.stringify(info));
    await c.close();
  };

  await authedShot('admin@viprental.com', 'admin123', '/properties', 'web-admin-properties.png');
  await authedShot('owner@viprental.com', 'owner123', '/tenant/my-properties', 'web-owner-properties.png');

  fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await browser.close();
})();
