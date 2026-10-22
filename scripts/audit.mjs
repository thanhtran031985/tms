// Quét lỗ hổng phụ thuộc production: `pnpm audit:deps` (spec 08 mục 2).
// Lỗi mức cao trở lên làm lệnh thoát mã 1. Nếu máy chủ audit của npm không trả lời (hết thời gian, 5xx),
// thử lại vài lần rồi báo cảnh báo thay vì làm CI đỏ vì lý do hạ tầng bên ngoài, không phải lỗ hổng.
import { spawnSync } from 'node:child_process';

const ATTEMPTS = 3;
const UNREACHABLE = /ERR_PNPM_AUDIT_BAD_RESPONSE/;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const result = spawnSync('pnpm', ['audit', '--prod', '--audit-level', 'high'], {
    encoding: 'utf8',
    shell: true,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);

  if (result.status === 0) process.exit(0);
  if (!UNREACHABLE.test(output)) process.exit(result.status ?? 1);

  console.warn(`Lần ${attempt}/${ATTEMPTS}: máy chủ audit không trả lời.`);
}

console.warn('::warning::Không gọi được máy chủ audit của npm sau 3 lần; bỏ qua quét lỗ hổng lần này.');
process.exit(0);
