import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TMS Container',
  description: 'Phần mềm điều hành vận tải container',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
