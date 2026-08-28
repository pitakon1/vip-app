const fs = require('fs');
const { execSync } = require('child_process');

const scriptPath = 'c:\\Users\\lvyij\\.trae-cn\\work\\6a700740acac979f94c3fddd\\generate-mobile-pages.js';
let content = fs.readFileSync(scriptPath, 'utf-8');

// Fix: replace indexOf with lastIndexOf for HTML close comment
content = content.replace(
    "const htmlCloseIdx = shellContent.indexOf('-->', htmlOpenIdx + 4);",
    "const htmlCloseIdx = shellContent.lastIndexOf('-->');"
);

fs.writeFileSync(scriptPath, content, 'utf-8');
console.log('Patched script successfully.');
console.log('Contains lastIndexOf:', content.includes("lastIndexOf('-->')"));

// Now run the patched script
console.log('\nRunning patched script...');
execSync('node "' + scriptPath + '"', { stdio: 'inherit', cwd: 'e:\\work\\app\\vip app' });
