// Tải Fira Sans (400/500/600/700) và Fira Code (500) từ Google Fonts về apps/web/public/fonts
// và sinh apps/web/src/app/fonts.css với tên họ chữ "Fira Sans"/"Fira Code" khớp tokens.css.
// Chạy: node scripts/fetch-fonts.mjs (chỉ cần chạy lại khi đổi phiên bản hoặc độ đậm chữ).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps', 'web', 'public', 'fonts');
const cssFile = join(root, 'apps', 'web', 'src', 'app', 'fonts.css');
const SUBSETS = new Set(['latin', 'latin-ext', 'vietnamese']);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SOURCES = [
  'https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Fira+Code:wght@500&display=swap',
];

mkdirSync(outDir, { recursive: true });
let out = '/* Sinh bởi scripts/fetch-fonts.mjs từ Google Fonts (giấy phép OFL). Không sửa tay. */\n';

for (const source of SOURCES) {
  const css = await (await fetch(source, { headers: { 'User-Agent': UA } })).text();
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)];
  for (const [, subset, face] of blocks) {
    if (!SUBSETS.has(subset)) continue;
    const family = /font-family:\s*'([^']+)'/.exec(face)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(face)?.[1];
    const url = /url\((https:[^)]+\.woff2)\)/.exec(face)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(face)?.[1];
    if (!family || !weight || !url || !range) throw new Error(`Khối @font-face lạ: ${face}`);
    const file = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight}-${subset}.woff2`;
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(join(outDir, file), bytes);
    out += `@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('/fonts/${file}') format('woff2');\n  unicode-range: ${range};\n}\n`;
    console.log(`${file} ${bytes.length} byte`);
  }
}
writeFileSync(cssFile, out);
console.log(`Đã ghi ${cssFile}`);
