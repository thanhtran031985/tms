'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { logout } from '@/features/identity/actions';

type UserMenuProps = { name: string; roleLabel: string };

// Người dùng hiện tại (avatar chữ cái đầu, tên, vai trò). Bấm mở menu nhỏ có "Đăng xuất".
export function UserMenu({ name, roleLabel }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initial = name.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() ?? '?';

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = () => {
    startTransition(async () => {
      await logout();
      router.replace('/login');
      router.refresh();
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Tài khoản ${name}, ${roleLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex h-hit items-center gap-8 rounded-control px-8 text-left text-body-sm text-ink transition-colors duration-150 ease-out hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className="flex size-28 flex-none items-center justify-center rounded-pill bg-primary text-chip text-on-primary"
        >
          {initial}
        </span>
        <span className="leading-tight">
          <span className="block font-semibold">{name}</span>
          <span className="text-chip font-normal text-ink-soft">{roleLabel}</span>
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-10 mt-4 min-w-nav rounded-control border border-line bg-surface p-4 shadow-popover"
        >
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={pending}
            className="flex h-hit w-full items-center gap-8 rounded-chip px-12 text-left text-body-sm text-ink transition-colors duration-150 ease-out hover:bg-surface-2 disabled:cursor-progress disabled:text-ink-soft"
          >
            <LogOut className="size-18" aria-hidden="true" />
            <span>{pending ? 'Đang đăng xuất…' : 'Đăng xuất'}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
