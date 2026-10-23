import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Các component layout và display phỏng theo hệ thống Dash Mantine Components (Mantine v8),
// sử dụng toàn bộ Design Tokens và Tailwind của dự án TMS.

// ---------------------------------------------------------------------------
// 1. Paper & Card
// ---------------------------------------------------------------------------

export type PaperProps = ComponentPropsWithoutRef<'div'> & {
  withBorder?: boolean;
  shadow?: 'none' | 'xs' | 'sm' | 'md' | 'popover';
  radius?: 'none' | 'control' | 'card-sm' | 'card' | 'pill';
  p?: '0' | '8' | '12' | '16' | '20' | '24';
};

const RADIUS_CLASSES: Record<NonNullable<PaperProps['radius']>, string> = {
  none: 'rounded-none',
  control: 'rounded-control',
  'card-sm': 'rounded-card-sm',
  card: 'rounded-card',
  pill: 'rounded-pill',
};

const SHADOW_CLASSES: Record<NonNullable<PaperProps['shadow']>, string> = {
  none: '',
  xs: 'shadow-xs',
  sm: 'shadow-sm',
  md: 'shadow-md',
  popover: 'shadow-popover',
};

const PADDING_CLASSES: Record<NonNullable<PaperProps['p']>, string> = {
  '0': 'p-0',
  '8': 'p-8',
  '12': 'p-12',
  '16': 'p-16',
  '20': 'p-20',
  '24': 'p-24',
};

export function Paper({
  children,
  withBorder = true,
  shadow = 'none',
  radius = 'card',
  p = '16',
  className,
  ...props
}: PaperProps) {
  return (
    <div
      className={cn(
        'bg-surface text-ink transition-colors',
        withBorder && 'border border-line',
        RADIUS_CLASSES[radius],
        SHADOW_CLASSES[shadow],
        PADDING_CLASSES[p],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type CardProps = PaperProps & {
  children: ReactNode;
};

export function Card({ children, className, ...props }: CardProps) {
  return (
    <Paper className={cn('overflow-hidden', className)} {...props}>
      {children}
    </Paper>
  );
}

export function CardSection({
  children,
  withBorder = false,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & { withBorder?: boolean }) {
  return (
    <div
      className={cn(
        '-mx-16 first:-mt-16 last:-mb-16',
        withBorder && 'border-b border-line pb-12 mb-12 first:border-t-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. ThemeIcon
// ---------------------------------------------------------------------------

export type ThemeIconVariant = 'light' | 'filled' | 'outline' | 'subtle';
export type ThemeIconColor = 'primary' | 'ok' | 'warn' | 'crit' | 'neutral' | 'accent';
export type ThemeIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const ICON_SIZE_CLASSES: Record<ThemeIconSize, string> = {
  xs: 'size-20 text-caption',
  sm: 'size-28 text-small',
  md: 'size-36 text-body-sm',
  lg: 'size-44 text-body',
  xl: 'size-52 text-section-title',
};

const ICON_COLOR_CLASSES: Record<ThemeIconVariant, Record<ThemeIconColor, string>> = {
  light: {
    primary: 'bg-info-soft text-primary',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    crit: 'bg-crit-soft text-crit',
    neutral: 'bg-surface-2 text-ink-soft',
    accent: 'bg-warn-soft text-accent',
  },
  filled: {
    primary: 'bg-primary text-on-primary',
    ok: 'bg-ok text-on-primary',
    warn: 'bg-warn text-on-primary',
    crit: 'bg-crit text-on-primary',
    neutral: 'bg-surface-2 text-ink',
    accent: 'bg-accent text-on-primary',
  },
  outline: {
    primary: 'border border-primary text-primary bg-transparent',
    ok: 'border border-ok text-ok bg-transparent',
    warn: 'border border-warn text-warn bg-transparent',
    crit: 'border border-crit text-crit bg-transparent',
    neutral: 'border border-line-strong text-ink-soft bg-transparent',
    accent: 'border border-accent text-accent bg-transparent',
  },
  subtle: {
    primary: 'text-primary bg-transparent hover:bg-info-soft',
    ok: 'text-ok bg-transparent hover:bg-ok-soft',
    warn: 'text-warn bg-transparent hover:bg-warn-soft',
    crit: 'text-crit bg-transparent hover:bg-crit-soft',
    neutral: 'text-ink-soft bg-transparent hover:bg-surface-2',
    accent: 'text-accent bg-transparent hover:bg-warn-soft',
  },
};

export function ThemeIcon({
  children,
  size = 'md',
  radius = 'control',
  variant = 'light',
  color = 'primary',
  className,
}: {
  children: ReactNode;
  size?: ThemeIconSize;
  radius?: 'control' | 'card' | 'pill';
  variant?: ThemeIconVariant;
  color?: ThemeIconColor;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold',
        ICON_SIZE_CLASSES[size],
        RADIUS_CLASSES[radius],
        ICON_COLOR_CLASSES[variant][color],
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. ActionIcon
// ---------------------------------------------------------------------------

export type ActionIconProps = ComponentPropsWithoutRef<'button'> & {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'subtle' | 'light' | 'outline' | 'filled';
  color?: ThemeIconColor;
  radius?: 'control' | 'card' | 'pill';
  loading?: boolean;
};

const ACTION_ICON_SIZES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'size-28 min-h-28 min-w-28 text-small',
  md: 'size-36 min-h-36 min-w-36 text-body-sm',
  lg: 'size-hit min-h-hit min-w-hit text-body',
};

export function ActionIcon({
  children,
  size = 'md',
  variant = 'subtle',
  color = 'neutral',
  radius = 'control',
  loading = false,
  className,
  disabled,
  type = 'button',
  ...props
}: ActionIconProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50',
        ACTION_ICON_SIZES[size],
        RADIUS_CLASSES[radius],
        ICON_COLOR_CLASSES[variant][color],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 4. Badge (Mantine Style)
// ---------------------------------------------------------------------------

export type MantineBadgeProps = ComponentPropsWithoutRef<'span'> & {
  variant?: 'light' | 'filled' | 'outline' | 'dot';
  color?: ThemeIconColor;
  size?: 'xs' | 'sm' | 'md';
  radius?: 'chip-sm' | 'chip' | 'pill';
  leftSection?: ReactNode;
  rightSection?: ReactNode;
};

const BADGE_SIZES = {
  xs: 'px-6 py-1 text-caption font-semibold gap-4',
  sm: 'px-8 py-2 text-chip-sm font-bold gap-4',
  md: 'px-10 py-3 text-chip font-bold gap-6',
};

const BADGE_RADIUS = {
  'chip-sm': 'rounded-chip-sm',
  chip: 'rounded-chip',
  pill: 'rounded-pill',
};

const BADGE_COLORS: Record<
  NonNullable<MantineBadgeProps['variant']>,
  Record<ThemeIconColor, string>
> = {
  light: {
    primary: 'bg-info-soft text-primary',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    crit: 'bg-crit-soft text-crit',
    neutral: 'bg-surface-2 text-ink-soft',
    accent: 'bg-warn-soft text-accent',
  },
  filled: {
    primary: 'bg-primary text-on-primary',
    ok: 'bg-ok text-on-primary',
    warn: 'bg-warn text-on-primary',
    crit: 'bg-crit text-on-primary',
    neutral: 'bg-off text-on-primary',
    accent: 'bg-accent text-on-primary',
  },
  outline: {
    primary: 'border border-primary text-primary bg-transparent',
    ok: 'border border-ok text-ok bg-transparent',
    warn: 'border border-warn text-warn bg-transparent',
    crit: 'border border-crit text-crit bg-transparent',
    neutral: 'border border-line text-ink-soft bg-transparent',
    accent: 'border border-accent text-accent bg-transparent',
  },
  dot: {
    primary: 'bg-surface-2 text-ink border border-line',
    ok: 'bg-surface-2 text-ink border border-line',
    warn: 'bg-surface-2 text-ink border border-line',
    crit: 'bg-surface-2 text-ink border border-line',
    neutral: 'bg-surface-2 text-ink-soft border border-line',
    accent: 'bg-surface-2 text-ink border border-line',
  },
};

const DOT_COLORS: Record<ThemeIconColor, string> = {
  primary: 'bg-primary',
  ok: 'bg-ok',
  warn: 'bg-warn',
  crit: 'bg-crit',
  neutral: 'bg-ink-soft',
  accent: 'bg-accent',
};

export function MantineBadge({
  children,
  variant = 'light',
  color = 'primary',
  size = 'sm',
  radius = 'chip',
  leftSection,
  rightSection,
  className,
  ...props
}: MantineBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap',
        BADGE_SIZES[size],
        BADGE_RADIUS[radius],
        BADGE_COLORS[variant][color],
        className,
      )}
      {...props}
    >
      {variant === 'dot' ? (
        <span
          className={cn('size-6 shrink-0 rounded-full', DOT_COLORS[color])}
          aria-hidden="true"
        />
      ) : null}
      {leftSection ? <span className="flex-none">{leftSection}</span> : null}
      <span>{children}</span>
      {rightSection ? <span className="flex-none">{rightSection}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 5. KPI Stat Card (Dash Mantine Components Metric Card Pattern)
// ---------------------------------------------------------------------------

export type KpiStatCardProps = {
  label: string;
  value: string | number;
  icon: ReactNode;
  color?: ThemeIconColor;
  badge?: ReactNode;
  description?: ReactNode;
  className?: string;
  onClick?: () => void;
};

export function KpiStatCard({
  label,
  value,
  icon,
  color = 'primary',
  badge,
  description,
  className,
  onClick,
}: KpiStatCardProps) {
  const isClickable = Boolean(onClick);
  return (
    <Card
      withBorder
      p="16"
      radius="card"
      className={cn(
        'flex flex-col justify-between transition-all duration-150',
        isClickable && 'cursor-pointer hover:border-primary/50 hover:bg-surface-2/40',
        className,
      )}
      onClick={onClick}
    >
      <div>
        <div className="flex items-center justify-between gap-12">
          <span className="text-caption font-bold uppercase tracking-wider text-ink-soft">
            {label}
          </span>
          <ThemeIcon size="md" color={color} variant="light" radius="control">
            {icon}
          </ThemeIcon>
        </div>

        <div className="mt-8 flex items-baseline justify-between gap-8">
          <span className="text-kpi-figure font-bold tracking-tight text-ink">{value}</span>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      </div>

      {description ? (
        <div className="mt-8 border-t border-line/60 pt-8 text-caption text-ink-soft">
          {description}
        </div>
      ) : null}
    </Card>
  );
}
