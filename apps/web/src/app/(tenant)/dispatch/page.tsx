import { toTenantDate } from '@core/lib/time';
import { DispatchBoardView } from '@/features/dispatch/board';
import { loadBoardPage } from '@/features/dispatch/board-loader';
import { parseBoardSearch } from '@/features/dispatch/board-view';
import { requireDispatchPage } from '@/features/dispatch/dispatch-page-auth';

export const dynamic = 'force-dynamic';

// Bảng điều vận Kanban. Ngày và bộ lọc nằm trên URL (search params) để chia sẻ link.
export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ctx, access, now } = await requireDispatchPage();
  const today = toTenantDate(new Date(now), ctx.timezone);
  const filters = parseBoardSearch(await searchParams, today);
  const { board, options } = await loadBoardPage(ctx, filters);

  return (
    <DispatchBoardView
      key={JSON.stringify(filters)}
      initialBoard={board}
      filters={filters}
      today={today}
      serverNow={now}
      timeZone={ctx.timezone}
      access={access}
      options={options}
    />
  );
}
