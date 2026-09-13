const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'src');
function collect(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (/\.css$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = collect(ROOT, []);

const repl = [
  ['#3072f6', '#14b8a6'],
  ['#5b7cfa', '#14b8a6'],
  ['#3b82f6', '#14b8a6'],
  ['#9333ea', '#0d9488'],
  ['#5b3fd6', '#0d9488'],
  ['#c7d2fe', '#99f6e4'],
  ['#748ffc', '#14b8a6'],
  ['#a5b4fc', '#99f6e4'],
  ['#f0f5ff', '#f2faf8'],
  ['#f5f6fa', '#f2faf8'],
  ['#e4393c', '#0d9488'],
];

let total = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [from, to] of repl) {
    const n = s.split(from).length - 1;
    total += n;
    s = s.split(from).join(to);
  }
  if (s !== before) fs.writeFileSync(f, s, 'utf8');
}

console.log(`Files: ${files.length}, tokens replaced: ${total}`);
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const left = repl.filter(([from]) => s.includes(from)).map(([from]) => from);
  if (left.length) console.log('LEFT:', f.replace(ROOT, '.'), left.join(','));
}
console.log('done');