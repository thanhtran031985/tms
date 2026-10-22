import type { ComponentProps } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Button theo designs/components/Button: primary / secondary / ghost, cỡ mặc định 48px và sm 40px.
// loading: disabled + aria-busy, giữ nền primary, icon xoay (tắt chuyển động khi người dùng chọn giảm chuyển động).
const base =
  'inline-flex items-center justify-center gap-8 rounded-control border border-transparent text-center no-underline transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-ink-soft aria-busy:disabled:cursor-progress aria-busy:disabled:border-transparent aria-busy:disabled:bg-primary aria-busy:disabled:text-on-primary';

const variants = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover hover:text-on-primary',
  secondary: 'border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink',
} as const;

const sizes = {
  md: 'h-button px-20 text-button',
  sm: 'h-ctl px-14 text-body-sm font-semibold',
} as const;

export type ButtonStyleProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function buttonClass(
  { variant = 'primary', size = 'md' }: ButtonStyleProps = {},
  extra?: string,
) {
  return cn(base, variants[variant], sizes[size], extra);
}

type ButtonProps = ComponentProps<'button'> &
  ButtonStyleProps & {
    /** Đang gửi: nút khóa, hiện spinner, giữ nguyên nền. */
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle
          className="size-20 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}

type IconButtonProps = ComponentProps<'button'> & { bare?: boolean; 'aria-label': string };

// Nút chỉ có icon 44x44, bắt buộc aria-label.
export function IconButton({ bare = false, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-hit w-hit items-center justify-center rounded-control border transition-colors duration-150 ease-out hover:bg-surface-2',
        bare
          ? 'border-transparent bg-transparent text-ink-soft hover:text-ink'
          : 'border-line bg-surface text-ink',
        className,
      )}
      {...rest}
    />
  );
}
