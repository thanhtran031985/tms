// Sinh docs/tasks/dashboard.html từ bảng trong docs/tasks/README.md và progress.md của từng task.
// Chạy: pnpm tasks:dashboard (hoặc node scripts/tasks-dashboard.mjs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tasksDir = join(root, 'docs', 'tasks');
const readme = readFileSync(join(tasksDir, 'README.md'), 'utf8');

const STATUS = {
  '⬜': ['Chưa làm', 'todo'],
  '🔄': ['Đang làm', 'doing'],
  '❓': ['Có code chưa rà soát', 'review'],
  '⚠️': ['Khác task.md', 'diff'],
  '❌': ['Thiếu', 'missing'],
  '✅': ['Xong', 'done'],
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const rows = [];
let header = null;
for (const line of readme.split('\n')) {
  if (!line.startsWith('|')) { if (header && rows.length) header = null; continue; }
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (!header) { if (cells.includes('Trạng thái')) header = cells; continue; }
  if (/^-+$/.test(cells[0])) continue;
  const get = (name) => cells[header.indexOf(name)] ?? '';
  const taskCell = get('Task');
  const m = taskCell.match(/\[([^\]]+)\]\(([^)]+)\)\s*[—-]?\s*(.*)/);
  rows.push({
    num: get('#'),
    slug: m ? m[1] : taskCell,
    title: m ? m[3] : '',
    status: get('Trạng thái'),
    deps: get('Phụ thuộc'),
    branch: get('Nhánh git').replace(/`/g, ''),
  });
}

function steps(slug) {
  const p = join(tasksDir, slug, 'progress.md');
  if (!existsSync(p)) return null;
  let total = 0, done = 0;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const c = line.split('|').slice(1, -1).map((x) => x.trim());
    if (c.length >= 3 && /^\d+$/.test(c[0])) { total++; if (c[2].includes('✅')) done++; }
  }
  return total ? { total, done } : null;
}

const warnings = [];
const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, 0]));
const body = rows.map((r) => {
  const key = Object.keys(STATUS).find((k) => r.status.includes(k));
  if (key) counts[key]++; else warnings.push(`${r.slug}: ký hiệu trạng thái lạ "${r.status}"`);
  const [label, cls] = key ? STATUS[key] : ['Không rõ', 'unknown'];
  const s = steps(r.slug);
  const bar = s ? `<div class="bar"><span style="width:${(100 * s.done) / s.total}%"></span></div><small>${s.done}/${s.total} bước</small>` : '<small>chưa có progress.md</small>';
  return `<tr><td class="mono">${esc(r.num)}</td><td><a href="${esc(r.slug)}/task.md">${esc(r.slug)}</a><div>${esc(r.title)}</div></td><td><span class="chip ${cls}">${esc(r.status)} ${label}</span></td><td>${bar}</td><td class="mono">${esc(r.deps)}</td><td class="mono">${esc(r.branch)}</td></tr>`;
}).join('\n');

const summary = Object.entries(counts).map(([k, n]) => `<span class="chip ${STATUS[k][1]}">${k} ${STATUS[k][0]}: ${n}</span>`).join(' ');
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Task TMS</title>
<style>
:root{--bg:#F6F8FB;--surface:#fff;--line:#E2E8F0;--ink:#0F172A;--soft:#475569;--primary:#2563EB}
body{margin:0;padding:24px;background:var(--bg);color:var(--ink);font:16px/1.5 "Fira Sans",system-ui,sans-serif}
h1{font-size:28px;margin:0 0 8px}table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:16px}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:15px}th{background:#F1F5F9;color:var(--soft);font-weight:600}
td div{color:var(--soft)}a{color:var(--primary);font-weight:600}.mono{font-family:"Fira Code",ui-monospace,monospace}
.chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:14px;font-weight:500;white-space:nowrap}
.todo{background:#F1F5F9;color:#334155}.doing{background:#DBEAFE;color:#1E40AF}.review{background:#FEF3C7;color:#92400E}.diff{background:#FFEDD5;color:#9A3412}.missing{background:#FEE2E2;color:#991B1B}.done{background:#DCFCE7;color:#166534}.unknown{background:#E5E7EB;color:#374151}
.bar{width:120px;height:8px;background:#E2E8F0;border-radius:999px;overflow:hidden}.bar span{display:block;height:100%;background:var(--primary)}
.warn{background:#FEF3C7;color:#92400E;padding:8px 12px;border-radius:8px;margin-top:12px}
</style>
<h1>Task TMS Container</h1><p>${summary}</p>
${warnings.length ? `<div class="warn">${warnings.map(esc).join('<br>')}</div>` : ''}
<table><tr><th>#</th><th>Task</th><th>Trạng thái</th><th>Tiến độ</th><th>Phụ thuộc</th><th>Nhánh git</th></tr>
${body}</table><p><small>Sinh lúc ${new Date().toLocaleString('vi-VN')} từ docs/tasks/README.md. Không sửa tay.</small></p></html>`;

writeFileSync(join(tasksDir, 'dashboard.html'), html);
console.log(`dashboard.html: ${rows.length} task${warnings.length ? `, ${warnings.length} cảnh báo` : ''}`);
