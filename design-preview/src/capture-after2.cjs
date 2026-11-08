// after2：Web 三页 + App 两页，并记录 computed style 作为达标证据
const fs = require('fs');
const path = require('path');
const { chromium } = require('E:/app/vip-app-main/frontend-web/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', 'after2');
const WEB = 'http://localhost:3000';
const APP = 'http://localhost:8081';
const DETAIL = '083da18c-7fd5-493d-8aa2-d5c79c26c912';

const loginToken = async (email, pwd) => {
  const r = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(pwd)}`,
  });
  const j = await r.json();
  return (j.data ?? j).access_token;
};

(async () => {
  const browser = await chromium.launch();
  const evidence = {};

  // ---------- Web ----------
  const wctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const wp = await wctx.newPage();
  const errs = [];
  wp.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));

  const shot = async (url, name) => {
    await wp.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await wp.waitForTimeout(2200);
    await wp.evaluate(() => window.scrollTo(0, 0));
    await wp.waitForTimeout(200);
    await wp.screenshot({ path: path.join(OUT, name) });
    console.log('captured', name);
  };

  await shot(`${WEB}/`, 'web-home.png');
  evidence.home = await wp.evaluate(() => {
    const g = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const c = getComputedStyle(e);
      return { color: c.color, bg: c.backgroundColor, fs: c.fontSize, weight: c.fontWeight };
    };
    return {
      decorCount: document.querySelectorAll('[class*="rent-search-hero__decor"]').length,
      subtitle: g('.rent-search-hero__subtitle'),
      tag: g('.rent-search-hero__tag'),
      noPhotoBanner: g(".rent-prop-search-card__banner[data-photo='false']"),
      cardPrice: g('.rent-prop-search-card__price'),
    };
  });

  await shot(`${WEB}/listings`, 'web-listings.png');
  evidence.listings = await wp.evaluate(() => {
    const g = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const c = getComputedStyle(e);
      return { color: c.color, bg: c.backgroundColor };
    };
    return {
      decorCount: document.querySelectorAll('[class*="rent-search-hero__decor"]').length,
      subtitle: g('.rent-search-hero__subtitle'),
      noPhotoBanner: g(".rent-prop-search-card__banner[data-photo='false']"),
    };
  });

  await shot(`${WEB}/listing/${DETAIL}`, 'web-detail.png');
  evidence.detail = await wp.evaluate(() => {
    const g = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const c = getComputedStyle(e);
      return { text: (e.textContent || '').trim().slice(0, 24), color: c.color, bg: c.backgroundColor, fs: c.fontSize, weight: c.fontWeight };
    };
    return {
      title: g('.pub-detail__title'),
      priceMain: g('.pub-price-block__main'),
      gallery: g('.pub-gallery'),
      empty: g('.pub-gallery__empty'),
    };
  });
  evidence.webErrors = errs;
  await wctx.close();

  // ---------- App（Expo Web）----------
  const appShot = async (email, pwd, name) => {
    const token = await loginToken(email, pwd);
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('auth_token', t); } catch (e) {} }, token);
    const p = await ctx.newPage();
    await p.goto(APP, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(9000);
    await p.screenshot({ path: path.join(OUT, name) });
    const info = await p.evaluate(() => {
      const tb = document.querySelector('[role="tablist"]');
      const rect = (e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
      const labels = tb ? [...tb.querySelectorAll('div,span')].filter((e) => !e.children.length && (e.textContent || '').trim()) : [];
      return { viewportH: window.innerHeight, tabbar: tb ? rect(tb) : null, labels: labels.slice(0, 4).map((e) => ({ t: (e.textContent || '').trim().slice(0, 4), r: rect(e), lh: getComputedStyle(e).lineHeight })) };
    });
    evidence[name] = info;
    console.log('captured', name, JSON.stringify(info.tabbar));
    await ctx.close();
  };

  await appShot('admin@viprental.com', 'admin123', 'app-admin-home.png');
  await appShot('tenant@viprental.com', 'tenant123', 'app-tenant-home.png');

  fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await browser.close();
})();
