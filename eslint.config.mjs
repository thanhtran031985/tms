import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      'designs/**',
      'docs/**',
      'prompts/**',
      'scripts/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Nghiệp vụ không được dùng client db thô: phải đi qua getTenantDb(ctx) hoặc repo có tenantId (ADR-003, task 01).
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
