'use client';

import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Columns3,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  BOARD_COLUMN_IDS,
  type BoardCard,
  type BoardColumnId,
  type DispatchBoard,
  type DispatchStreamEvent,
} from '@shared/dispatch-board';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectField } from '@/components/ui/field';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { cn } from '@/lib/utils';
import { loadBoardCards, loadDispatchBoard } from './actions';
import { appendPage, mergeCards, toColumnsState, type ColumnsState } from './board-state';
import {
  boardSearchString,
  cardMatchesFilters,
  dayLabel,
  localDate,
  localTime,
  shiftDate,
  type BoardFilters,
} from './board-view';
import { KanbanColumn } from './kanban-column';
import { ResourceLanes } from './resource-lanes';
import { useDispatchStream } from './use-dispatch-stream';

export type BoardAccess = {
  /** Gán xe, hủy gán (OWNER, ADMIN, DISPATCHER). */
  assign: boolean;
  /** Tạo Order (nút ở trạng thái trống). */
  createOrder: boolean;
};

export type BoardOptions = {
  customers: { id: string; name: string }[];
  zones: string[];
};

type Props = {
  initialBoard: DispatchBoard;
  filters: BoardFilters;
  today: string;
  serverNow: number;
  timeZone: string;
  access: BoardAccess;
  options: BoardOptions;
};

const FLUSH_MS = 300;
const SEARCH_DEBOUNCE_MS = 350;

export function DispatchBoardView({
  initialBoard,
  filters,
  today,
  serverNow,
  timeZone,
  access,
  options,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [columns, setColumns] = useState<ColumnsState>(() => toColumnsState(initialBoard.columns));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingColumn, setLoadingColumn] = useState<BoardColumnId | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(serverNow);
  const [nowMs, setNowMs] = useState(serverNow);
  const [qText, setQText] = useState(filters.q);

  // "Bây giờ" chạy theo đồng hồ trình duyệt, cập nhật mỗi 30 giây (thẻ đếm ngược, vạch trên lịch xe).
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Tải lại từ máy chủ (Thử lại, nối lại SSE) thì lấy bảng mới làm gốc; làm mới làn xe thì giữ nguyên các cột đã tải.
  const resetColumnsNext = useRef(false);
  useEffect(() => {
    if (!resetColumnsNext.current) return;
    resetColumnsNext.current = false;
    setColumns(toColumnsState(initialBoard.columns));
    setSyncError(false);
    setLastSyncedAt(Date.now());
  }, [initialBoard]);
  const reloadFromServer = useCallback(() => {
    resetColumnsNext.current = true;
    startTransition(() => router.refresh());
  }, [router]);

  // ---- Bộ lọc nằm trên URL: đổi bộ lọc là điều hướng, máy chủ trả bảng mới.
  const navigate = useCallback(
    (patch: Partial<BoardFilters>) => {
      const next = { ...filters, ...patch };
      startTransition(() => {
        router.replace(`${pathname}${boardSearchString(next, today)}`, { scroll: false });
      });
    },
    [filters, pathname, router, today],
  );

  useEffect(() => {
    if (qText.trim() === filters.q) return;
    const timer = setTimeout(() => navigate({ q: qText.trim() }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [qText, filters.q, navigate]);

  // ---- Realtime: gom các container bị ảnh hưởng, tải lại đúng các thẻ đó rồi gộp vào bảng.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  });
  const lanesRefreshedAt = useRef(0);
  const queued = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshCards = useCallback(
    async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += 100) {
        const result = await loadBoardCards({
          date: filters.date,
          orderContainerIds: ids.slice(i, i + 100),
        });
        if (!result.ok) {
          setSyncError(true);
          return;
        }
        const wanted = result.data.cards.filter((c) => cardMatchesFilters(c, filtersRef.current));
        const dropped = result.data.cards
          .filter((c) => !cardMatchesFilters(c, filtersRef.current))
          .map((c) => c.orderContainerId);
        setColumns((current) =>
          mergeCards(current, wanted, [...result.data.removedIds, ...dropped]),
        );
      }
      setSyncError(false);
      setLastSyncedAt(Date.now());
      // Lịch xe và số đếm chiều hàng đến từ máy chủ: làm mới, không quá một lần mỗi 2 giây.
      if (Date.now() - lanesRefreshedAt.current > 2000) {
        lanesRefreshedAt.current = Date.now();
        startTransition(() => router.refresh());
      }
    },
    [filters.date, router],
  );

  const onEvent = useCallback(
    (event: DispatchStreamEvent) => {
      for (const id of event.orderContainerIds) queued.current.add(id);
      clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        const ids = [...queued.current];
        queued.current.clear();
        if (ids.length > 0) void refreshCards(ids);
      }, FLUSH_MS);
    },
    [refreshCards],
  );
  useEffect(() => () => clearTimeout(flushTimer.current), []);

  const { status, reconnect } = useDispatchStream({
    onEvent,
    // Có thể đã lỡ sự kiện lúc mất kết nối: tải lại cả bảng từ máy chủ.
    onReconnect: reloadFromServer,
  });
  const streamLost = status === 'lost';
  const showError = streamLost || syncError;

  const retry = () => {
    reconnect();
    reloadFromServer();
  };

  // ---- Tải thêm một cột.
  const loadMore = async (id: BoardColumnId) => {
    const cursor = columns[id].nextCursor;
    if (!cursor) return;
    setLoadingColumn(id);
    const result = await loadDispatchBoard({
      date: filters.date,
      zone: filters.zone,
      customerId: filters.customerId,
      direction: filters.direction,
      q: filters.q,
      column: id,
      cursor,
    });
    setLoadingColumn(null);
    const page = result.ok ? result.data.columns[id] : undefined;
    if (!page) {
      setSyncError(true);
      return;
    }
    setColumns((current) => appendPage(current, id, page));
  };

  const filtersActive = Boolean(
    filters.direction || filters.q || filters.zone || filters.customerId,
  );
  const total = useMemo(
    () => BOARD_COLUMN_IDS.reduce((sum, id) => sum + columns[id].total, 0),
    [columns],
  );
  const isToday = filters.date === today;
  const counts = initialBoard.directionCounts;
  const syncedLabel = localTime(lastSyncedAt, timeZone);

  return (
    <div
      className={cn('flex flex-col gap-16', pending && 'opacity-70')}
      aria-busy={pending || undefined}
    >
      <header className="flex flex-wrap items-center gap-12">
        <h1 className="m-0 text-screen-title text-ink">Điều vận</h1>
        <span className="text-body-sm text-ink-soft">
          {dayLabel(filters.date)}
          {isToday ? ` · ${localTime(nowMs, timeZone)}` : ''}
        </span>
        <span className="flex-1" />
        <div className="flex items-center gap-8">
          <IconButton
            aria-label="Ngày trước"
            onClick={() => navigate({ date: shiftDate(filters.date, -1) })}
          >
            <ChevronLeft className="size-20" aria-hidden="true" />
          </IconButton>
          <label className="sr-only" htmlFor="dispatch-date">
            Ngày điều vận
          </label>
          <input
            id="dispatch-date"
            type="date"
            value={filters.date}
            onChange={(event) => {
              if (event.target.value) navigate({ date: event.target.value });
            }}
            className="h-hit rounded-control border border-line-strong bg-surface px-12 text-body-sm text-ink"
          />
          <IconButton
            aria-label="Ngày sau"
            onClick={() => navigate({ date: shiftDate(filters.date, 1) })}
          >
            <ChevronRight className="size-20" aria-hidden="true" />
          </IconButton>
          {!isToday ? (
            <Button variant="secondary" size="sm" onClick={() => navigate({ date: today })}>
              Hôm nay
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-12">
        <FilterTabs
          label="Lọc theo chiều hàng"
          value={filters.direction ?? 'ALL'}
          onChange={(id) =>
            navigate({ direction: id === 'ALL' ? null : (id as 'IMPORT' | 'EXPORT') })
          }
          tabs={[
            { id: 'ALL', label: 'Tất cả', count: counts.ALL },
            { id: 'EXPORT', label: 'Xuất', count: counts.EXPORT },
            { id: 'IMPORT', label: 'Nhập', count: counts.IMPORT },
          ]}
        />
        <div className="relative min-w-[12.5rem] flex-[0_1_20rem]">
          <label htmlFor="dispatch-q" className="sr-only">
            Lọc theo số container, Order hoặc khách hàng
          </label>
          <Search
            className="pointer-events-none absolute left-12 top-1/2 size-18 -translate-y-1/2 text-ink-soft"
            aria-hidden="true"
          />
          <input
            id="dispatch-q"
            type="search"
            value={qText}
            onChange={(event) => setQText(event.target.value)}
            placeholder="Số cont, Order, khách hàng"
            className="h-hit w-full rounded-control border border-line-strong bg-surface pl-48 pr-12 text-body-sm text-ink placeholder:text-ink-soft"
          />
        </div>
        <div className="w-[12.5rem]">
          <SelectField
            label="Khách hàng"
            value={filters.customerId ?? ''}
            placeholder="Tất cả khách hàng"
            options={options.customers.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(event) => navigate({ customerId: event.target.value || null })}
          />
        </div>
        <div className="w-[10rem]">
          <SelectField
            label="Khu vực"
            value={filters.zone ?? ''}
            placeholder="Tất cả khu vực"
            options={options.zones.map((z) => ({ value: z, label: z }))}
            onChange={(event) => navigate({ zone: event.target.value || null })}
          />
        </div>
        {access.assign ? (
          <span className="pb-12 text-small text-ink-soft">
            Chọn một thẻ ở cột Chờ điều để gán xe
          </span>
        ) : null}
      </div>

      {showError ? (
        <Alert
          tone="crit"
          icon={<CircleAlert className="size-20" />}
          action={
            <Button variant="secondary" size="sm" onClick={retry}>
              <RefreshCw className="size-18" aria-hidden="true" />
              Thử lại
            </Button>
          }
        >
          <strong className="font-semibold text-crit">
            Không tải được thay đổi mới từ {syncedLabel}.
          </strong>{' '}
          Bảng dưới là bản lúc {syncedLabel}. Gán xe lúc này có thể trùng với người khác, hãy thử
          lại trước khi gán.
        </Alert>
      ) : null}

      {total === 0 && !filtersActive ? (
        <section className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={<Columns3 className="size-24" />}
            title={`Chưa có container nào cần điều ${isToday ? 'hôm nay' : `ngày ${filters.date.split('-').reverse().slice(0, 2).join('/')}`}`}
            description="Bảng điều vận lấy container từ các Order có khung lấy hoặc trả hàng trong ngày. Hiện chưa có Order nào như vậy. Tạo Order và nhập danh sách container để bắt đầu điều xe."
            action={
              access.createOrder ? (
                <Link href="/orders/new" className={buttonClass()}>
                  <Plus className="size-18" aria-hidden="true" />
                  Tạo Order
                </Link>
              ) : undefined
            }
          />
        </section>
      ) : (
        <>
          <section aria-label="Bảng container theo trạng thái" className="overflow-x-auto pb-4">
            <div className="grid min-w-board grid-cols-[repeat(6,minmax(var(--spacing-kcol),1fr))] gap-12">
              {BOARD_COLUMN_IDS.map((id) => (
                <KanbanColumn
                  key={id}
                  id={id}
                  column={columns[id]}
                  nowMs={nowMs}
                  timeZone={timeZone}
                  selectable={access.assign && id === 'WAITING'}
                  selectedId={selectedId}
                  onSelect={(card: BoardCard) =>
                    setSelectedId((current) =>
                      current === card.orderContainerId ? null : card.orderContainerId,
                    )
                  }
                  filtered={filtersActive}
                  loadingMore={loadingColumn === id}
                  onLoadMore={loadMore}
                />
              ))}
            </div>
          </section>
          {initialBoard.lanes ? (
            <ResourceLanes
              lanes={initialBoard.lanes}
              dayStart={initialBoard.dayStart}
              dayEnd={initialBoard.dayEnd}
              nowMs={nowMs}
              timeZone={timeZone}
              isToday={isToday && localDate(nowMs, timeZone) === filters.date}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
