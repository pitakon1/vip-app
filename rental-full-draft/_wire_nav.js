const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'pages');
const PROCESS_DIRS = ['pages', 'partials'];

function collect(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p).forEach((x) => out.push(x));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// ordered [keyword, baseFileStem] — first match wins (most-specific first)
// base resolved to current role+view variant when that file exists.
const FAMILY = {
  admin: [
    ['退出登录', 'login'], ['退出', 'login'],
    ['编辑房源', 'property-detail'],
    ['返回房源列表', 'properties'], ['查看文档', 'leases'], ['编辑信息', 'properties'],
    ['新建合同', 'leases'], ['查看合同', 'leases'],
    ['查看详情', 'property-detail'], ['了解更多', 'property-detail'], ['详情', 'property-detail'],
    ['联系租客', 'crm'], ['联系客户', 'crm'], ['全部客户', 'crm'], ['去跟进', 'crm'], ['发送消息', 'crm'],
    ['添加同事', 'employees'],
    ['去催收', 'payments'], ['最近缴费记录', 'payments'],
  ],
  owner: [
    ['退出登录', 'login'], ['退出', 'login'],
    ['编辑房源', 'property-detail'], ['编辑信息', 'property-detail'],
    ['查看详情', 'property-detail'], ['了解更多', 'property-detail'], ['详情', 'property-detail'],
    ['确认预估价并挂牌', 'consign'], ['确认挂牌', 'consign'],
    ['查看文档', 'documents'],
    ['联系客服', 'services'], ['预约服务', 'services'],
    ['去催收', 'payments'], ['最近缴费记录', 'payments'],
  ],
  employee: [
    ['退出登录', 'login'], ['退出', 'login'],
    ['房源浏览', 'property-browse'],
    ['返回房源列表', 'property-browse'],
    ['查看详情', 'property-browse'], ['了解更多', 'property-browse'], ['详情', 'property-browse'],
    ['全部客户', 'contacts'], ['联系租客', 'contacts'], ['联系客户', 'contacts'], ['去跟进', 'contacts'], ['发送消息', 'contacts'],
    ['今日行程', 'calendar'], ['查看行程', 'calendar'], ['设置带看时段', 'calendar'],
  ],
  tenant: [
    ['退出登录', 'login'], ['退出', 'login'],
    ['返回房源列表', 'property-browse'],
    ['查看详情', 'property-detail'], ['了解更多', 'property-detail'],
    ['二手房', 'property-detail'],
    ['新盘在售', 'property-browse'], ['海景现房', 'property-browse'], ['城市地标', 'property-browse'],
    ['在售楼盘', 'property-browse'],
    ['更多评价', null], ['更多', 'property-browse'],
    ['详情', 'property-detail'],
    ['购房订单', 'purchase'], ['立即购买套餐', 'purchase'],
    ['我的收藏', 'profile'], ['浏览足迹', 'profile'], ['编辑资料', 'profile'], ['编辑信息', 'profile'],
    ['我的委托找房', 'consign'], ['委托找房', 'consign'], ['卖房估价', 'consign'], ['确认挂牌', 'consign'],
    ['预约服务', 'services'], ['联系客服', 'services'], ['预约记录', 'services'],
    ['维修记录', 'maintenance'],
    ['查看合同', 'documents'], ['查看文档', 'documents'],
    ['发送消息', 'messages'],
    // explicitly non-navigation: leave as-is
    ['联系师傅', null], ['评价', null],
  ],
};

function stripTags(s) {
  return s
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchBase(text, list) {
  if (!text) return null;
  for (const [kw, base] of list) {
    if (text.includes(kw)) return base;
  }
  return null;
}

function resolveTarget(prefix, view, base) {
  if (base === 'login') return 'login.html';
  const desktop = `${prefix}-${base}.html`;
  const cand = view ? `${prefix}-${view}-${base}.html` : desktop;
  return fs.existsSync(path.join(BASE, cand)) ? cand : desktop;
}

const ANCHOR_RE = /<a\b[^>]*>[\s\S]*?<\/a>/g;

let changedLinks = 0;
const stats = {};

for (const dir of PROCESS_DIRS) {
  for (const f of collect(path.join(__dirname, dir))) {
    const name = path.basename(f);
    if (name === 'login.html') continue; // already wired
    const m = /^(admin|owner|employee|tenant)(?:-(pad|mobile|mini))?-(.+?)\.html$/.exec(name);
    if (!m) continue;
    const prefix = m[1];
    const view = m[2] || '';
    const map = FAMILY[prefix];
    if (!map) continue;

    let s = fs.readFileSync(f, 'utf8');
    let changedInFile = 0;
    s = s.replace(ANCHOR_RE, function (a) {
      if (!/href=["']#["']/.test(a)) return a;
      const text = stripTags(a);
      const base = matchBase(text, map);
      if (!base) return a;
      const target = resolveTarget(prefix, view, base);
      const out = a.replace(/(href=)["']#["']/, '$1"' + target + '"');
      if (out === a) return a;
      changedInFile++;
      return out;
    });
    if (changedInFile > 0) {
      fs.writeFileSync(f, s, 'utf8');
      changedLinks += changedInFile;
      stats[name] = changedInFile;
    }
  }
}

console.log(`Links rewired: ${changedLinks} across ${Object.keys(stats).length} files.`);
console.log('Remaining href="#" (should only be added-controls/filter/tags):');
let remaining = 0;
for (const f of PROCESS_DIRS.flatMap((d) => collect(path.join(__dirname, d)))) {
  const s = fs.readFileSync(f, 'utf8');
  const n = (s.match(/href="#"/g) || []).length;
  remaining += n;
}
console.log(`  ${remaining}`);