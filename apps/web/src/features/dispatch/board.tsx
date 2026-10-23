'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Columns3,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  startTransition as reactStartTransition,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  BOARD_COLUMN_IDS,
  type BoardCard,
  type BoardColumnId,
  type DispatchBoard,
  type DispatchStreamEvent,
  type ResourceLane,
} from '@shared/dispatch-board';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectField } from '@/components/ui/field';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { cn } from '@/lib/utils';
import {
  assignResources,
  cancelAssignment,
  createSingleTrip,
  loadBoardCards,
  loadDispatchBoard,
} from './actions';
import { AssignPanel, type AssignSelection } from './assign-panel';
import { performAssign, safeCall, type AssignDeps, type AssignOutcome } from './assign-flow';
import {
  appendPage,
  applyOptimisticAssign,
  applyOptimisticLane,
  mergeCards,
  toColumnsState,
  type ColumnsState,
  type OptimisticAssign,
} from './board-state';
import {
  boardSearchString,
  cardMatchesFilters,
  dayLabel,
  localDate,
  localTime,
  shiftDate,
  type BoardFilters,
} from './board-view';
import { ConfirmDialog } from './confirm-dialog';
import { DispatchCard } from './dispatch-card';
import { describeDispatchError, type DispatchErrorView } from './error-messages';
import { KanbanColumn } from './kanban-column';
import { laneCollisionDetection, laneKeyboardCoordinates } from './lane-dnd';
import { ResourceLanes } from './resource-lanes';
import { useDispatchStream } from './use-dispatch-stream';

export type BoardAccess = {
  /** Gán xe, hủy gán (OWNER, ADMIN, DISPATCHER). */
  assign: boolean;
  /** Ghi đè giờ lái khi vượt giới hạn (chỉ ADMIN). */
  overrideHours: boolean;
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

type Target = { cardId: string; tractorId: string | null };
type UndoInfo = { tripId: string; version: number; containerId: string; label: string };
type Notice =
  | { id: number; kind: 'ok'; text: string; extra: string[]; undo: UndoInfo }
  | { id: number; kind: 'info' | 'error'; text: string };
// Nội dung thông báo chưa có id (id do showNotice gán).
type NoticeInput =
  | { kind: 'ok'; text: string; extra: string[]; undo: UndoInfo }
  | { kind: 'info' | 'error'; text: string };
type Extras = { confirmMissingWeight?: boolean; overrideReason?: string };
type PendingConfirm = {
  view: DispatchErrorView;
  cardId: string;
  selection: AssignSelection;
  extras: Extras;
};

type OptimisticState = { columns: ColumnsState; lanes: ResourceLane[] | null };
type OptimisticAction = OptimisticAssign & { card: BoardCard };

const FLUSH_MS = 300;
const SEARCH_DEBOUNCE_MS = 350;
const NOTICE_MS = 8000;

// Thông báo đọc cho trình đọc màn hình khi kéo thẻ bằng bàn phím (mặc định của dnd-kit là tiếng Anh).
const ANNOUNCEMENTS = {
  onDragStart: () =>
    'Đã nhấc thẻ container. Dùng phím mũi tên để chọn làn xe, Space để thả, Esc để hủy.',
  onDragOver: ({ over }: { over: { id: string | number } | null }) =>
    over
      ? `Đang ở trên làn ${String(over.id).replace('lane-', 'xe ')}.`
      : 'Chưa ở trên làn xe nào.',
  onDragEnd: ({ over }: { over: { id: string | number } | null }) =>
    over ? 'Đã thả thẻ vào làn xe. Chọn tài xế và rơ moóc ở bảng gán xe.' : 'Đã thả, chưa chọn xe.',
  onDragCancel: () => 'Đã hủy kéo thẻ.',
};
const SCREEN_READER = {
  draggable:
    'Để kéo thẻ bằng bàn phím, bấm Space, dùng phím mũi tên chọn làn xe rồi bấm Space để thả. Esc để hủy.',
};

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
  const [target, setTarget] = useState<Target | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [loadingColumn, setLoadingColumn] = useState<BoardColumnId | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(serverNow);
  const [nowMs, setNowMs] = useState(serverNow);
  const [qText, setQText] = useState(filters.q);
  const [assigning, setAssigning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const noticeSeq = useRef(0);

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

  // ---- Tải lại đúng các thẻ bị ảnh hưởng rồi gộp vào bảng (sau thao tác của mình và theo sự kiện SSE).
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
          reactStartTransition(() => setSyncError(true));
          return;
        }
        const wanted = result.data.cards.filter((c) => cardMatchesFilters(c, filtersRef.current));
        const dropped = result.data.cards
          .filter((c) => !cardMatchesFilters(c, filtersRef.current))
          .map((c) => c.orderContainerId);
        // Bọc trong transition để cập nhật cùng lượt với trạng thái optimistic đang chờ kết thúc (không nháy thẻ).
        reactStartTransition(() =>
          setColumns((current) =>
            mergeCards(current, wanted, [...result.data.removedIds, ...dropped]),
          ),
        );
      }
      reactStartTransition(() => {
        setSyncError(false);
        setLastSyncedAt(Date.now());
      });
      // Lịch xe và số đếm chiều hàng đến từ máy chủ: làm mới, không quá một lần mỗi 2 giây.
      if (Date.now() - lanesRefreshedAt.current > 2000) {
        lanesRefreshedAt.current = Date.now();
        reactStartTransition(() => router.refresh());
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

  // ---- Optimistic UI (Rule 3): thẻ dời ngay, lỗi thì React trả về trạng thái thật khi thao tác kết thúc.
  const baseState = useMemo<OptimisticState>(
    () => ({ columns, lanes: initialBoard.lanes }),
    [columns, initialBoard.lanes],
  );
  const [view, applyOptimistic] = useOptimistic(
    baseState,
    (state: OptimisticState, action: OptimisticAction): OptimisticState => ({
      columns: applyOptimisticAssign(state.columns, action),
      lanes: applyOptimisticLane(state.lanes, action, action.card),
    }),
  );

  const findCard = useCallback(
    (id: string) =>
      BOARD_COLUMN_IDS.flatMap((c) => columns[c].cards).find((c) => c.orderContainerId === id),
    [columns],
  );
  const targetCard = target
    ? view.columns.WAITING.cards.find((c) => c.orderContainerId === target.cardId)
    : undefined;

  const showNotice = useCallback((next: NoticeInput) => {
    noticeSeq.current += 1;
    setNotice({ ...next, id: noticeSeq.current } as Notice);
  }, []);
  useEffect(() => {
    if (notice?.kind !== 'ok') return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const deps = useMemo<AssignDeps>(
    () => ({
      createSingleTrip: (input) => safeCall(() => createSingleTrip(input)),
      assignResources: (input) => safeCall(() => assignResources(input)),
    }),
    [],
  );

  const submitAssign = (cardId: string, selection: AssignSelection, extras: Extras = {}) => {
    const card = findCard(cardId);
    if (!card) return;
    setNotice(null);
    setAssigning(true);
    startTransition(async () => {
      applyOptimistic({
        containerId: card.orderContainerId,
        tractorId: selection.tractor.id,
        tractorPlate: selection.tractor.label,
        trailerPlate: selection.trailer.label,
        driverName: selection.driver.label,
        card,
      });
      const outcome: AssignOutcome = await performAssign(deps, {
        card,
        driverId: selection.driver.id,
        tractorId: selection.tractor.id,
        trailerId: selection.trailer.id,
        ...extras,
      });

      if (outcome.ok) {
        await refreshCards([card.orderContainerId]);
        const label = card.containerNo ?? 'container';
        reactStartTransition(() => {
          setAssigning(false);
          setTarget(null);
          showNotice({
            kind: 'ok',
            text: `Đã gán ${selection.tractor.label} cho ${label}.`,
            extra: outcome.warnings.filter((w) => w.severity !== 'info').map((w) => w.message),
            undo: {
              tripId: outcome.trip.id,
              version: outcome.trip.version,
              containerId: card.orderContainerId,
              label,
            },
          });
        });
        return;
      }

      const errorView = describeDispatchError(outcome.error, {
        canOverrideHours: access.overrideHours,
      });
      if (outcome.createdTrip || errorView.kind === 'stale') {
        await refreshCards([card.orderContainerId]);
      }
      reactStartTransition(() => {
        setAssigning(false);
        if (errorView.kind === 'confirm-weight' || errorView.kind === 'override-hours') {
          setConfirm({ view: errorView, cardId: card.orderContainerId, selection, extras });
        } else {
          showNotice({ kind: 'error', text: errorView.text });
        }
      });
    });
  };

  const undoAssign = (undo: UndoInfo) => {
    setNotice(null);
    startTransition(async () => {
      const result = await safeCall(() =>
        cancelAssignment({ tripId: undo.tripId, version: undo.version }),
      );
      if (result.ok) {
        await refreshCards([undo.containerId]);
        reactStartTransition(() =>
          showNotice({
            kind: 'info',
            text: `Đã hoàn tác: ${undo.label} quay về cột Chờ điều.`,
          }),
        );
        return;
      }
      const errorView = describeDispatchError(result);
      if (errorView.kind === 'stale') await refreshCards([undo.containerId]);
      reactStartTransition(() => showNotice({ kind: 'error', text: errorView.text }));
    });
  };

  // ---- Kéo thả (dnd-kit): chuột kéo cả thẻ, bàn phím dùng nút kéo của thẻ đang chọn.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: laneKeyboardCoordinates }),
  );
  const onDragStart = (event: DragStartEvent) => setDraggingId(String(event.active.id));
  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const tractorId = event.over?.data.current?.tractorId as string | undefined;
    if (tractorId) setTarget({ cardId: String(event.active.id), tractorId });
  };
  const draggingCard = draggingId ? findCard(draggingId) : undefined;

  const filtersActive = Boolean(
    filters.direction || filters.q || filters.zone || filters.customerId,
  );
  const total = useMemo(
    () => BOARD_COLUMN_IDS.reduce((sum, id) => sum + view.columns[id].total, 0),
    [view.columns],
  );
  const isToday = filters.date === today;
  const counts = initialBoard.directionCounts;
  const syncedLabel = localTime(lastSyncedAt, timeZone);

  return (
    <div
      className={cn('flex flex-col gap-16', pending && !assigning && 'opacity-70')}
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
            Chọn một thẻ ở cột Chờ điều để gán xe, hoặc kéo thẻ vào làn xe
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

      {notice ? (
        <Alert
          tone={notice.kind === 'error' ? 'crit' : notice.kind === 'ok' ? 'ok' : 'info'}
          icon={
            notice.kind === 'error' ? (
              <CircleAlert className="size-20" />
            ) : (
              <CircleCheck className="size-20" />
            )
          }
          action={
            <span className="flex flex-none items-center gap-8">
              {notice.kind === 'ok' ? (
                <Button variant="secondary" size="sm" onClick={() => undoAssign(notice.undo)}>
                  Hoàn tác
                </Button>
              ) : null}
              <IconButton bare aria-label="Đóng thông báo" onClick={() => setNotice(null)}>
                <X className="size-18" aria-hidden="true" />
              </IconButton>
            </span>
          }
        >
          <span data-notice={notice.kind}>{notice.text}</span>
          {notice.kind === 'ok' && notice.extra.length > 0 ? (
            <ul className="m-0 mt-4 list-disc pl-20 text-small text-ink-soft">
              {notice.extra.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
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
        <DndContext
          sensors={sensors}
          collisionDetection={laneCollisionDetection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDraggingId(null)}
          accessibility={{ announcements: ANNOUNCEMENTS, screenReaderInstructions: SCREEN_READER }}
        >
          <section aria-label="Bảng container theo trạng thái" className="overflow-x-auto pb-4">
            <div className="grid min-w-board grid-cols-[repeat(6,minmax(var(--spacing-kcol),1fr))] gap-12">
              {BOARD_COLUMN_IDS.map((id) => (
                <KanbanColumn
                  key={id}
                  id={id}
                  column={view.columns[id]}
                  nowMs={nowMs}
                  timeZone={timeZone}
                  selectable={access.assign && id === 'WAITING'}
                  selectedId={target?.cardId ?? null}
                  onSelect={(card: BoardCard) =>
                    setTarget((current) =>
                      current?.cardId === card.orderContainerId
                        ? null
                        : { cardId: card.orderContainerId, tractorId: null },
                    )
                  }
                  filtered={filtersActive}
                  loadingMore={loadingColumn === id}
                  onLoadMore={loadMore}
                />
              ))}
            </div>
          </section>

          {access.assign && target && targetCard ? (
            <AssignPanel
              key={`${target.cardId}:${target.tractorId ?? ''}`}
              card={targetCard}
              timeZone={timeZone}
              initialTractorId={target.tractorId}
              busy={assigning}
              onSubmit={(selection) => submitAssign(targetCard.orderContainerId, selection)}
              onClose={() => setTarget(null)}
            />
          ) : null}

          {view.lanes ? (
            <ResourceLanes
              lanes={view.lanes}
              dayStart={initialBoard.dayStart}
              dayEnd={initialBoard.dayEnd}
              nowMs={nowMs}
              timeZone={timeZone}
              isToday={isToday && localDate(nowMs, timeZone) === filters.date}
              droppable={access.assign}
            />
          ) : null}

          <DragOverlay>
            {draggingCard ? (
              <DispatchCard
                card={draggingCard}
                nowMs={nowMs}
                timeZone={timeZone}
                selectable={false}
                selected={false}
                onSelect={() => undefined}
                dragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.view.kind === 'override-hours'
            ? 'Ghi đè giờ lái tối đa'
            : 'Gán khi chưa có khối lượng'
        }
        confirmLabel={confirm?.view.kind === 'override-hours' ? 'Ghi đè và gán xe' : 'Vẫn gán xe'}
        {...(confirm?.view.kind === 'override-hours' ? { reasonLabel: 'Lý do ghi đè' } : {})}
        onCancel={() => setConfirm(null)}
        onConfirm={(reason) => {
          if (!confirm) return;
          const next: Extras =
            confirm.view.kind === 'override-hours'
              ? { ...confirm.extras, overrideReason: reason }
              : { ...confirm.extras, confirmMissingWeight: true };
          setConfirm(null);
          submitAssign(confirm.cardId, confirm.selection, next);
        }}
      >
        {confirm?.view.text}
      </ConfirmDialog>
    </div>
  );
}
