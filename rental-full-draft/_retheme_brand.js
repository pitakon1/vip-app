const fs = require('fs');
const path = require('path');

const files = [];

function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (e.name.endsWith('.html')) files.push(p);
  }
}
['pages', 'partials'].forEach(collect);

const LOGO = '../assets/haofang-logo.jpg';
const imgStyle =
  'width:auto;max-height:34px;object-fit:contain;border-radius:6px;background:#fff;padding:3px;flex-shrink:0;display:inline-block;';

function textRebrand(s) {
  // company legal names
  s = s.replace(/RentFlow Property Management Sdn\. Bhd\./g, 'HaoFang Property Management Sdn. Bhd.');
  s = s.replace(/RentFlow PM Sdn\. Bhd\./g, 'HaoFang PM Sdn. Bhd.');
  // sidebar/portal name spans -> keep only role label
  const roleSpans = [
    [/RentFlow<br>管理后台/g, '管理后台'],
    [/RentFlow 管理后台<\/span>/g, '管理后台</span>'],
    [/RentFlow 员工端<\/span>/g, '员工端</span>'],
    [/RentFlow 员工<\/span>/g, '员工</span>'],
    [/RentFlow 业主端<\/span>/g, '业主端</span>'],
    [/RentFlow 业主<\/span>/g, '业主</span>'],
    [/RentFlow 租客端<\/span>/g, '租客端</span>'],
    [/RentFlow 租客中心<\/span>/g, '租客中心</span>'],
    [/RentFlow 租客<\/span>/g, '租客</span>'],
  ];
  for (const [re, rep] of roleSpans) s = s.replace(re, rep);
  // versioned / descriptive footers keep full brand name
  s = s.replace(/RentFlow 管理后台 · v2\.4\.1/g, 'HaoFang.World 管理后台 · v2.4.1');
  s = s.replace(/RentFlow 数字化租住平台/g, 'HaoFang.World 数字化租住平台');
  s = s.replace(/欢迎使用 RentFlow（已读）>/g, '欢迎使用 HaoFang.World（已读）>');
  s = s.replace(/欢迎使用 RentFlow<\/span>/g, '欢迎使用 HaoFang.World</span>');
  s = s.replace(/RentFlow × 贝壳/g, 'HaoFang.World × 贝壳');
  s = s.replace(/RentFlow 业主端 v1\.7/g, 'HaoFang.World 业主端 v1.7');
  s = s.replace(/RentFlow 员工端 —/g, 'HaoFang.World 员工端 —');
  // bare-wordmark spans (pad/mini/mobile) collapse to empty so the logo image
  // (which already contains the wordmark) is not duplicated
  s = s.replace(/rent-(sidebar|portal|mobile|pad)__name">RentFlow<\/span>/g, (m) =>
    m.replace('RentFlow</span>', '&nbsp;</span>')
  );
  // catch-all rebrand
  s = s.replace(/RentFlow/g, 'HaoFang.World');
  return s;
}

function embedLogo(s) {
  // replace the four generic "R" logo-marks with the real brand image
  s = s.replace(
    /<div class="rent-(sidebar|portal|mobile|pad)__logo">R<\/div>/g,
    (m, cls) => `<img class="rent-${cls}__logo" src="${LOGO}" alt="HaoFang.World" style="${imgStyle}">`
  );
  // login hero brand -> full wordmark image
  s = s.replace(
    /<div class="rent-login-brand">\s*<div class="rent-login-brand__mark">[\s\S]*?<\/svg>\s*<\/div>\s*<div class="rent-login-brand__name">[\s\S]*?<\/div>\s*<\/div>/,
    `<div class="rent-login-brand">\n        <img class="rent-login-brand__img" src="${LOGO}" alt="HaoFang.World" style="width:200px;height:auto;object-fit:contain;border-radius:12px;background:#fff;padding:10px;">\n    </div>`
  );
  return s;
}

let imgCount = 0, textCount = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = (s.match(/<div class="rent-[a-z]+__logo">R<\/div>/g) || []).length +
    (/(rent-login-brand__name")/.test(s) ? 1 : 0);
  let s2 = textRebrand(s);
  const tStart = (s.match(/RentFlow/g) || []).length;
  s2 = embedLogo(s2);
  const tEnd = (s2.match(/RentFlow/g) || []).length;
  const imgAfter = (s2.match(/class="rent-[a-z]+__logo" src=/g) || []).length;
  if (s2 !== s) {
    fs.writeFileSync(f, s2, 'utf8');
    textCount += tStart - tEnd;
    imgCount += imgAfter;
  }
}
console.log(`Processed ${files.length} HTML files.`);
console.log(`Logo image marks embedded: ${imgCount}`);
console.log(`RentFlow text occurrences removed: ${textCount}`);
console.log('Remaining RentFlow occurrences across pages/partials:');
const remaining = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const n = (s.match(/RentFlow/g) || []).length;
  if (n > 0) remaining.push(`${n}\t${f.replace(/\\/g, '/')}`);
}
console.log(remaining.length ? remaining.join('\n') : '  none');