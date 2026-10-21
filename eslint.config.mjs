import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const webFiles = ['apps/web/**/*.{ts,tsx,js,mjs}'];

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
    // Nghiệp vụ không được dùng client db thô: phải đi qua getTenantDb(ctx) hoặc repo có điều kiện tenantId (ADR-003, task 01).
    files: ['packages/core/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/lib/db', '**/lib/db/client', '**/lib/db/client.*', '@core/lib/db/client'],
              message:
                'Không import client db thô trong modules. Dùng getTenantDb(ctx) hoặc repo có điều kiện tenantId.',
            },
          ],
        },
      ],
    },
  },
);
