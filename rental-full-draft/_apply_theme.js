const fs = require("fs");
const path = require("path");

const pagesDir = path.resolve(__dirname, "..", "rental-full-draft", "pages");

// ordered replacements (longer/more specific first where needed)
const replacements = [
  // dark-mode primary
  ["#6b82f5", "#2dd4bf"],
  // rgba indigo -> teal (20,184,166 = #14b8a6)
  [/rgba\(\s*66\s*,\s*99\s*,\s*235/g, "rgba(20,184,166"],
  // hover/darker indigo
  ["#3b51d4", "#0d9488"],
  // main primary
  ["#4263eb", "#14b8a6"],
  // light sidebar active
  ["#eef2ff", "#d9f2ee"],
  // light background
  ["#f5f7fa", "#f2faf8"],
  // focus ring style uses primary directly so covered
];

function trans(str) {
  for (const [from, to] of replacements) {
    if (typeof from === "string") {
      str = str.split(from).join(to);
    } else {
      str = str.replace(from, to);
    }
  }
  return str;
}

let files = fs.readdirSync(pagesDir).filter((f) => f.endsWith(".html"));
let changed = 0;
for (const f of files) {
  const p = path.join(pagesDir, f);
  const orig = fs.readFileSync(p, "utf8");
  const next = trans(orig);
  if (next !== orig) {
    fs.writeFileSync(p, next, "utf8");
    changed++;
  }
}
console.log("processed pages:", files.length, "| changed:", changed);