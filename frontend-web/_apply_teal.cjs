const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const TARGETS = [path.join(ROOT, 'src'), path.join(ROOT, 'index.html')];

function collect(dir, out) {
  const st = fs.statSync(dir);
  if (st.isFile()) {
    if (/\.(ts|tsx|css|html)$/.test(dir)) out.push(dir);
    return out;
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (/\.(ts|tsx|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = TARGETS.flatMap((d) => (fs.existsSync(d) ? collect(d, []) : []));

const colorRepl = [
  ['#6b82f5', '#2dd4bf'],
  [/rgba\(\s*66\s*,\s*99\s*,\s*235\s*,\s*/g, 'rgba(20, 184, 166, '],
  [/rgba\(\s*66\s*,\s*99\s*,\s*235/g, 'rgba(20, 184, 166'],
  ['#3b51d4', '#0d9488'],
  ['#4263eb', '#14b8a6'],
  ['#eef2ff', '#d9f2ee'],
  ['#f5f7fa', '#f2faf8'],
  ['#6d28d9', '#0d9488'],
  ['#7c3aed', '#14b8a6'],
];

const brandRepl = [
  ['RentFlow Property Management (Thailand) Co., Ltd.', 'HaoFang Property Management (Thailand) Co., Ltd.'],
  ['RentFlow', 'HaoFang.World'],
];

let colorCount = 0;
let brandCount = 0;

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [from, to] of colorRepl) {
    if (typeof from === 'string') {
      const n = s.split(from).length - 1;
      colorCount += n;
      s = s.split(from).join(to);
    } else {
      s = s.replace(from, to);
      // count via match
    }
  }
  for (const [from, to] of brandRepl) {
    const n = s.split(from).length - 1;
    brandCount += n;
    s = s.split(from).join(to);
  }
  if (s !== before) fs.writeFileSync(f, s, 'utf8');
}

console.log(`Files processed: ${files.length}`);
console.log(`Color tokens replaced: ${colorCount}`);
console.log(`Brand strings replaced: ${brandCount}`);
console.log('Remaining indigo/legacy checks:');
const leftover = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (/4263eb|3b51d4|6b82f5|eef2ff|f5f7fa|66\s*,\s*99\s*,\s*235|RentFlow/.test(s)) {
    leftover.push(f.replace(ROOT, '.'));
  }
}
console.log(leftover.length ? leftover.join('\n') : '  none');