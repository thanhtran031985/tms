// Sinh docs/DESIGN_SYSTEM.md từ designs/tokens.json và designs/README.md.
// Chạy lại mỗi khi tải bản thiết kế mới về designs/: node scripts/design-system.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'designs/tokens.json'), 'utf8'));
const readme = readFileSync(join(root, 'designs/README.md'), 'utf8');
const SOURCE = 'https://claude.ai/artifact/CjQUJpYnuGH3UMTPgY3Ygw';

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const themes = tokens.color.themes.map((t) => t.id);
const themeName = Object.fromEntries(tokens.color.themes.map((t) => [t.id, t.name]));
const val = (v) => (typeof v === 'object' && v !== null ? themes.map((t) => `${themeName[t]} \`${v[t]}\``).join(' · ') : `\`${v}\``);

// Mục 1: nguyên tắc lấy nguyên văn từ designs/README.md, hạ mỗi tiêu đề một cấp.
const intro = readme.split('\n## ')[0].replace(/^#.*\n/, '').trim();
const principles = readme.slice(readme.indexOf('\n## ')).replace(/\n## /g, '\n### ').trim();

let out = `# TMS Container — Design System

Nguồn duy nhất cho mọi màu, chữ, khoảng cách, bo góc, bóng và kích thước của TMS Container. **Không viết cứng mã hex, cỡ chữ px hay bo góc lẻ trong component**: luôn dùng token (biến CSS trong \`designs/tokens.css\` hoặc khóa theme Tailwind). Thiếu token thì thêm vào đây trước, rồi mới dùng.

Nguồn: bản thiết kế Claude Design "TMS Container" (${SOURCE}), bản tải về nằm trong \`designs/\` (\`tokens.json\`, \`tokens.css\`, \`README.md\`, \`components/*\`). Tệp này SINH RA bởi \`node scripts/design-system.mjs\`; khi thiết kế được cập nhật, tải lại \`designs/\` rồi chạy lại lệnh, không sửa tay.

Phiên bản token: ${tokens.version}. ${tokens.meta?.source ?? ''}

Token có hai giá trị được ghi dạng \`Sáng … · Tối …\`. Chế độ chọn bằng \`data-theme\` trên thẻ \`<html>\` (mặc định Sáng).

---

## 1. Nguyên tắc (từ bản thiết kế)

${intro}

${principles}

### Dùng trong mã
- Biến CSS: \`var(--<tên token>)\`, ví dụ \`var(--primary)\`, \`var(--space-12)\`, \`var(--radius-card)\`, \`var(--font-ui)\`.
- Tailwind: task 00 ánh xạ toàn bộ token vào theme (\`bg-surface\`, \`text-ink-soft\`, \`rounded-card\`, \`p-12\`…). Không dùng màu mặc định của Tailwind.
- Kiểu chữ dùng theo tên ở mục 3 (\`screen-title\`, \`body\`, \`code\`…), không ghép cỡ chữ lẻ.

---

## 2. Token màu

| Token | Giá trị | Dùng cho |
|---|---|---|
`;
for (const t of tokens.color.tokens) out += `| \`${t.name}\` | ${val(t.value)} | ${cell(t.usage)} |\n`;

out += `\n## 3. Chữ\n\nHọ chữ:\n`;
for (const [k, v] of Object.entries(tokens.type.families)) out += `- \`--font-${k}\`: ${v}\n`;
for (const g of tokens.type.groups) {
  out += `\n### ${g.name}\n\n| Kiểu | Cỡ | Dòng | Đậm | Giãn chữ | Dùng cho |\n|---|---|---|---|---|---|\n`;
  for (const s of g.styles) out += `| \`${s.name}\` | ${s.fontSize} | ${s.lineHeight ?? ''} | ${s.fontWeight ?? ''} | ${s.letterSpacing ?? '0'} | ${cell(s.usage)} |\n`;
}

const simple = [['4. Khoảng cách', 'spacing'], ['5. Bo góc', 'radius'], ['6. Bóng', 'shadow'], ['7. Kích thước', 'size']];
for (const [title, key] of simple) {
  out += `\n## ${title}\n\n| Token | Giá trị | Dùng cho |\n|---|---|---|\n`;
  for (const t of tokens[key].tokens) out += `| \`${t.name}\` | ${val(t.value)} | ${cell(t.usage)} |\n`;
}

out += `\n## 8. Thành phần và màn hình\n\nMỗi thư mục trong \`designs/components/\` có \`README.md\` (cách dùng, biến thể, trạng thái) và \`preview.html\` (xem trực tiếp, có công tắc 4 trạng thái). Kiểu dáng chung nằm trong \`designs/components/bundle.css\`. Cách chuyển sang React xem mục "Chuyển thiết kế Claude Design sang Next.js" trong \`CLAUDE.md\`.\n`;

writeFileSync(join(root, 'docs/DESIGN_SYSTEM.md'), out);
console.log(`docs/DESIGN_SYSTEM.md: ${tokens.color.tokens.length} màu, ${tokens.type.groups.reduce((n, g) => n + g.styles.length, 0)} kiểu chữ, ${out.length} ký tự`);
