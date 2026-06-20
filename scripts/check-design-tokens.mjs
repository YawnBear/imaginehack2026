import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "app");
const tokenFile = path.join(appDir, "red-broadcast-tokens.css");
const violations = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

for (const file of walk(appDir)) {
  if (file === tokenFile || !/\.(css|ts|tsx)$/.test(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(line)) {
      violations.push(`${path.relative(root, file)}:${index + 1} contains a raw color`);
    }
    if (/--sc-|--background|--foreground/.test(line)) {
      violations.push(`${path.relative(root, file)}:${index + 1} uses a retired token`);
    }
  });
}

if (violations.length) {
  console.error("Red Broadcast token violations:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Red Broadcast tokens: all UI files are compliant.");
