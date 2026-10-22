'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { fail, ok, type Result } from '@shared/result';
import { THEME_COOKIE } from './constants';

const themeSchema = z.object({ theme: z.enum(['light', 'dark']) });

// Lưu lựa chọn giao diện sáng/tối vào cookie để máy chủ render đúng theme ngay từ đầu (không nháy).
// Không cần đăng nhập vì chỉ là tùy chọn hiển thị trên trình duyệt này.
export async function setTheme(raw: unknown): Promise<Result<{ theme: 'light' | 'dark' }>> {
  const parsed = themeSchema.safeParse(raw);
  if (!parsed.success) return fail('VALIDATION_ERROR');
  (await cookies()).set(THEME_COOKIE, parsed.data.theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return ok({ theme: parsed.data.theme });
}
