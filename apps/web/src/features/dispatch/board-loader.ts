// Nạp dữ liệu cho trang Điều vận ở server: bảng Kanban + danh sách cho ô lọc khách hàng, khu vực.
import type { RequestContext } from '@core/lib/context';
import type { DispatchBoard } from '@shared/dispatch-board';
import { getDispatchService, getMasterDataService } from '@/server/services';
import type { BoardOptions } from './board';
import type { BoardFilters } from './board-view';

export async function loadBoardPage(
  ctx: RequestContext,
  filters: BoardFilters,
): Promise<{ board: DispatchBoard; options: BoardOptions }> {
  const master = getMasterDataService();
  const [board, customers, locations] = await Promise.all([
    getDispatchService().getDispatchBoard(ctx, {
      date: filters.date,
      zone: filters.zone,
      customerId: filters.customerId,
      direction: filters.direction,
      q: filters.q,
    }),
    // Danh sách chọn chỉ để lọc: thiếu quyền danh mục hay lỗi tạm thì bỏ trống, không làm hỏng cả bảng.
    master.list(ctx, 'customers').catch(() => []),
    master.list(ctx, 'locations').catch(() => []),
  ]);

  const zones = new Set<string>();
  for (const location of locations as { zone?: string | null }[]) {
    if (location.zone) zones.add(location.zone);
  }
  return {
    board,
    options: {
      customers: (customers as { id: string; name: string }[])
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      zones: [...zones].sort((a, b) => a.localeCompare(b, 'vi')),
    },
  };
}
