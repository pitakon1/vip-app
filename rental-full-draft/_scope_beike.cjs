// 读取 owner-dashboard 的 Beike overlay 块，作用域化到 .rent-app[data-ui="consumer"]
const fs = require('fs')

const src = fs.readFileSync('e:/app/vip-app-main/rental-full-draft/pages/owner-dashboard.html', 'utf8')
const blocks = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
const beike = blocks.find((b) => b.includes('Beike-style UI Overlay') || b.includes('贝壳找房风格覆盖层'))
if (!beike) throw new Error('beike block not found')

// 逐规则解析：把 CSS 拆成 selector 块
const rules = []
let rest = beike
const re = /([^{}]+)\{([^{}]*)\}/g
let m
while ((m = re.exec(rest)) !== null) {
  rules.push({ sel: m[1].trim(), body: m[2].trim() })
}

const out = []
for (const r of rules) {
  // 拆分选择器列表
  const sels = r.sel.split(',').map((s) => s.trim()).filter(Boolean)
  const scoped = []
  for (const s of sels) {
    // 跳过不属于 rent-app 布局的类（portal/mobile/pad 有各自布局文件）
    if (/\.rent-(portal|mobile|pad)__/.test(s)) continue
    if (/^body/.test(s)) {
      // body → 用作用域容器选择器模拟
      scoped.push('.rent-app[data-ui="consumer"]')
      continue
    }
    scoped.push(`.rent-app[data-ui="consumer"] ${s}`)
  }
  if (scoped.length === 0) continue
  out.push(`${scoped.join(',\n')} {\n  ${r.body}\n}`)
}

const header = `/* =========================================================
   Consumer Overlay — 用户端贝壳消费级风格（owner/employee）
   来源: 产品原型 Beike-style UI Overlay（作用域化处理）
   仅作用于 .rent-app[data-ui="consumer"] 内的元素
   ========================================================= */\n\n`

fs.writeFileSync(
  'e:/app/vip-app-main/frontend-web/src/styles/consumer-overlay.css',
  header + out.join('\n\n'),
  'utf8',
)
console.log(`scoped rules: ${out.length}`)
