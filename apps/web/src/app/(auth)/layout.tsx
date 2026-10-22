import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AuthShell } from '@/features/identity/auth-shell';
import { parseTheme, THEME_COOKIE } from '@/features/theme/constants';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <AuthShell theme={theme}>{children}</AuthShell>;
}
