'use client';

import { Moon, Sun } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { setTheme } from './actions';
import type { Theme } from './constants';

type ThemeToggleProps = {
  initial: Theme;
  /** "labeled": nút có chữ (màn đăng nhập); "icon": chỉ icon (thanh trên). */
  variant?: 'labeled' | 'icon';
  className?: string;
};

// Đổi giao diện Sáng/Tối: áp dụng ngay lên <html data-theme> rồi lưu cookie.
export function ThemeToggle({ initial, variant = 'labeled', className }: ThemeToggleProps) {
  const [theme, setThemeState] = useState<Theme>(initial);
  const [, startTransition] = useTransition();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Chế độ tối' : 'Chế độ sáng';
  const icon =
    next === 'dark' ? (
      <Moon className="size-18" aria-hidden="true" />
    ) : (
      <Sun className="size-18" aria-hidden="true" />
    );

  const toggle = () => {
    document.documentElement.setAttribute('data-theme', next);
    setThemeState(next);
    startTransition(async () => {
      await setTheme({ theme: next });
    });
  };

  if (variant === 'icon') {
    return (
      <IconButton aria-label={label} onClick={toggle} className={className}>
        {icon}
      </IconButton>
    );
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={label}
      onClick={toggle}
      className={cn('border-line text-small font-normal', className)}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}
