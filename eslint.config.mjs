import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const webFiles = ['apps/web/**/*.{ts,tsx,js,mjs}'];

// Dùng regex khớp đúng đường dẫn client: mẫu kiểu gitignore sẽ chặn luôn cả lib/db/schema và lib/db/tenant-db.
const rawDbPattern = {
  regex: '(^|/)lib/db(/index|/client)?(\\.[jt]s)?$',
  message:
    'Không import client db thô trong modules. Dùng getTenantDb(ctx) hoặc repo có điều kiện tenantId.',
};

const systemDbPattern = {
  regex: '(^|/)lib/db/system-db(\\.[jt]s)?$',
  message:
    'system-db (bảng toàn cục) chỉ dành cho modules/identity. Module khác dùng getTenantDb(ctx).',
};

const unsafeExecutorSelector = {
  selector: "MemberExpression[property.name='_unsafeExecutor']",
  message: '_unsafeExecutor chỉ dùng trong lib/ (numbering, audit), không dùng trong modules.',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'designs/**',
      'docs/**',
      'prompts/**',
      'scripts/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Quy tắc Next.js + React chỉ áp dụng cho apps/web.
  ...nextVitals.map((config) => ({ ...config, files: webFiles })),
  {
    files: webFiles,
    settings: { next: { rootDir: 'apps/web' } },
  },
  {
    // Nghiệp vụ không được dùng client db thô: phải đi qua getTenantDb(ctx) hoặc repo có điều kiện tenantId (ADR-003).
    files: ['packages/core/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [rawDbPattern] }],
      'no-restricted-syntax': ['error', unsafeExecutorSelector],
    },
  },
  {
    // system-db (bảng toàn cục users, tenants) chỉ dành cho module identity.
    files: ['packages/core/modules/**/*.ts'],
    ignores: ['packages/core/modules/identity/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [rawDbPattern, systemDbPattern] }],
    },
  },
);
