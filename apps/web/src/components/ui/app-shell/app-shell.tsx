import type { ReactNode } from 'react';
import { TmsMark } from '@/components/brand/tms-mark';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import type { Theme } from '@/features/theme/constants';
import { GlobalSearch } from './global-search';
import { NavMenu } from './nav-menu';
import { UserMenu } from './user-menu';
import { TenantSwitch } from './tenant-switch';

// AppShell theo designs/components/AppShell: thanh bên 240px, thanh trên, vùng nội dung tối đa 1240px.
// Màn hẹp (dưới 640px): thanh bên thành dải trên cùng, menu xếp dọc.
export type AppShellProps = {
  tenantName: string;
  /** Người dùng thuộc nhiều công ty thì có nút đổi công ty. */
  canSwitchTenant: boolean;
  userName: string;
  roleLabel: string;
  theme: Theme;
  children: ReactNode;
};

export function AppShell({
  tenantName,
  canSwitchTenant,
  userName,
  roleLabel,
  theme,
  children,
}: AppShellProps) {
  return (
    <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] bg-bg text-ink sm:grid-cols-[var(--size-nav)_minmax(0,1fr)]">
      <nav
        aria-label="Điều hướng chính"
        className="flex flex-col gap-4 border-b border-line bg-surface px-12 py-16 sm:border-r sm:border-b-0"
      >
        <div className="flex items-center gap-10 px-8 pb-16 pt-4 font-bold">
          <TmsMark size={28} />
          <span>TMS Container</span>
        </div>
        <NavMenu />
      </nav>

      <div className="flex min-w-0 flex-col">
        <header className="flex flex-wrap items-center gap-12 border-b border-line bg-surface px-16 py-12 sm:px-24">
          <TenantSwitch tenantName={tenantName} canSwitch={canSwitchTenant} />

          <GlobalSearch />

          <span className="flex items-center gap-8 text-small text-ink-soft">
            <span
              aria-hidden="true"
              className="size-8 animate-pulse rounded-pill bg-ok motion-reduce:animate-none"
            />
            Trực tiếp
          </span>

          <div className="flex items-center gap-12">
            <ThemeToggle initial={theme} variant="icon" />
            <UserMenu name={userName} roleLabel={roleLabel} />
          </div>
        </header>

        <main id="main" className="w-full max-w-content p-16 sm:p-24">
          {children}
        </main>
      </div>
    </div>
  );
}
