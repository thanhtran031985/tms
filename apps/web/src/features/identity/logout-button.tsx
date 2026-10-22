'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { logout } from './actions';

// Nút đăng xuất đứng riêng (dùng ở màn không có AppShell). Trong AppShell dùng UserMenu.
export function LogoutButton({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await logout();
          router.replace('/login');
          router.refresh();
        })
      }
    >
      {children}
    </Button>
  );
}
