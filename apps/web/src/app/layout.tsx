import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { parseTheme, THEME_COOKIE } from '@/features/theme/constants';
import './globals.css';

export const metadata: Metadata = {
  title: 'TMS Container',
  description: 'Phần mềm điều hành vận tải container',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Giao diện Sáng/Tối lấy từ cookie để máy chủ render đúng ngay từ đầu, không nháy.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="vi" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
