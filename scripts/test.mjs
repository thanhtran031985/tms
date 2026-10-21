// Chạy test cho cả workspace hoặc một package: `pnpm test` · `pnpm test --filter core -- money`.
// pnpm chuyển nguyên `--filter core -- money` vào script gốc, nên cần tách ra ở đây.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const filterAt = args.findIndex((a) => a === '--filter' || a === '-F');
const filter = filterAt >= 0 ? args[filterAt + 1] : undefined;
const extra = args.filter((a, i) => a !== '--' && i !== filterAt && i !== filterAt + 1);

const pnpmArgs = filter
  ? ['--filter', filter, 'test', ...extra]
  : ['-r', '--if-present', 'test', ...extra];
const result = spawnSync('pnpm', pnpmArgs, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
