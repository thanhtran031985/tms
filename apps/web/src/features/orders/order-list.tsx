'use client';

import { ChevronRight, CircleAlert, FileText, Plus, RefreshCw, SearchX } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ORDER_TYPES } from '@shared/enums';
import { ORDER_TYPE_LABELS } from '@shared/labels';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectField, TextField } from '@/components/ui/field';
import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import { SubText, WorkTableCard } from '@/components/ui/work-table';
import { formatRemaining } from '@/lib/deadline';
import { formatMoney, formatShortDateTime, formatTime, vnDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { confirmOrder, listOrders } from './actions';
import {
  ContainerStatusChip,
  DeadlineText,
  OrderStatusChip,
  PortReadinessCell,
} from './order-chips';
import {
  OPEN_STATUSES,
  hasAmount,
  orderFreight,
  isActiveContainer,
  isDeliveredContainer,
  needsAction,
  tabOfStatus,
  unpricedContainers,
  type OrderAccess,
  type OrderListItemDto,
  type OrderTab,
} from './order-types';

// Màn danh sách Order (Screen04): H1 nói việc cần xử lý, tab trạng thái có số đếm, bộ lọc, chọn nhiều để xác nhận Order nháp,
// dòng mở rộng hiện container. Tải đủ rồi lọc ở client (chưa phân trang). Nạp lại lỗi thì GIỮ dữ liệu cũ + giờ tải lần cuối + Thử lại.
type Props = {
  initialRows: OrderListItemDto[];
  access: OrderAccess;
  /** Thời điểm server render (ms), để lần vẽ đầu của server và client giống nhau. */
  serverNow: number;
};

const ALL = '';
type TypeFilter = '' | (typeof ORDER_TYPES)[number];

const TAB_LABELS: Record<OrderTab, string> = {
  all: 'Tất cả',
  open: 'Đang thực hiện',
  draft: 'Nháp',
  delivered: 'Đã giao',
  billed: 'Đã đối soát / hóa đơn',
  cancelled: 'Đã hủy',
};
const TAB_ORDER: OrderTab[] = ['all', 'open', 'draft', 'delivered', 'billed', 'cancelled'];

type BulkResult = {
  confirmed: number;
  failures: { orderId: string; orderNo: string; message: string }[];
};

export function OrderList({ initialRows, access, serverNow }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [now, setNow] = useState(serverNow);
  const [loadedAt, setLoadedAt] = useState(serverNow);
  const [reloadError, setReloadError] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [tab, setTab] = useState<OrderTab>('all');
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState(ALL);
  const [line, setLine] = useState(ALL);
  const [type, setType] = useState<TypeFilter>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function reload() {
    setReloading(true);
    try {
      const result = await listOrders({});
      if (result.ok) {
        setRows(result.data);
        setLoadedAt(Date.now());
        setNow(Date.now());
        setReloadError(false);
      } else {
        setReloadError(true);
      }
    } catch {
      setReloadError(true);
    } finally {
      setReloading(false);
    }
  }

  const customers = useMemo(
    () => [...new Map(rows.map((r) => [r.customerId, r.customerName])).entries()],
    [rows],
  );
  const lines = useMemo(
    () => [
      ...new Map(
        rows.flatMap((r) =>
          r.shippingLineId && r.shippingLineName
            ? [[r.shippingLineId, r.shippingLineName] as const]
            : [],
        ),
      ).entries(),
    ],
    [rows],
  );

  // Lọc theo mọi điều kiện trừ tab trạng thái; đếm tab theo cùng bộ lọc.
  const byFilters = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (customer !== ALL && r.customerId !== customer) return false;
      if (line !== ALL && r.shippingLineId !== line) return false;
      if (type !== '' && r.orderType !== type) return false;
      const day = vnDay(r.createdAt);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!needle) return true;
      return (
        r.orderNo.toLowerCase().includes(needle) ||
        r.bookingOrBlNo.toLowerCase().includes(needle) ||
        r.customerName.toLowerCase().includes(needle) ||
        r.containers.some((c) => c.containerNo?.toLowerCase().includes(needle))
      );
    });
  }, [rows, search, customer, line, type, from, to]);

  const tabs: FilterTab[] = TAB_ORDER.map((id) => ({
    id,
    label: TAB_LABELS[id],
    count:
      id === 'all'
        ? byFilters.length
        : byFilters.filter((r) => tabOfStatus(r.status) === id).length,
  }));
  const visible = byFilters.filter((r) => tab === 'all' || tabOfStatus(r.status) === tab);

  function clearFilters() {
    setTab('all');
    setSearch('');
    setCustomer(ALL);
    setLine(ALL);
    setType('');
    setFrom('');
    setTo('');
  }

  // ---- H1: việc cần xử lý và hạn gần nhất
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const openContainers = open.reduce(
    (sum, r) => sum + r.containers.filter((c) => needsAction(c)).length,
    0,
  );
  const nearest = open
    .filter((r) => r.cutOffAt)
    .sort((a, b) => new Date(a.cutOffAt!).getTime() - new Date(b.cutOffAt!).getTime())[0];
  const headline =
    open.length === 0
      ? 'Không có Order nào cần xử lý'
      : `${open.length} Order có ${openContainers} container cần xử lý${
          nearest
            ? `. Hạn gần nhất: cut-off ${nearest.vesselVoyage ?? nearest.orderNo} lúc ${formatTime(nearest.cutOffAt!)}, ${formatRemaining(new Date(nearest.cutOffAt!).getTime() - now).toLowerCase()}`
            : ''
        }`;
  const totalContainers = rows.reduce(
    (sum, r) => sum + r.containers.filter(isActiveContainer).length,
    0,
  );

  // ---- Chọn nhiều và xác nhận hàng loạt
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedDrafts = selectedRows.filter((r) => r.status === 'DRAFT');
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });
  }
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  async function confirmDrafts() {
    setBulkBusy(true);
    setBulkResult(null);
    const result: BulkResult = { confirmed: 0, failures: [] };
    for (const order of selectedDrafts) {
      try {
        const response = await confirmOrder({ id: order.id, version: order.version });
        if (response.ok) {
          result.confirmed += 1;
        } else if (response.code === 'PRICE_MISSING') {
          result.failures.push({
            orderId: order.id,
            orderNo: order.orderNo,
            message: `container dòng ${response.details?.lines ?? ''} chưa có giá, cần nhập giá tay`,
          });
        } else {
          result.failures.push({
            orderId: order.id,
            orderNo: order.orderNo,
            message: response.message,
          });
        }
      } catch {
        result.failures.push({
          orderId: order.id,
          orderNo: order.orderNo,
          message: 'không gửi được yêu cầu, kiểm tra kết nối mạng',
        });
      }
    }
    setBulkResult(result);
    setSelected(new Set(result.failures.map((f) => f.orderId)));
    setBulkBusy(false);
    await reload();
  }

  // ---- Giao diện
  const toolbar = (
    <div className="flex flex-col gap-12">
      <FilterTabs
        label="Lọc theo trạng thái Order"
        tabs={tabs}
        value={tab}
        onChange={(id) => setTab(id as OrderTab)}
      />
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <TextField
            label="Tìm trong danh sách"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Số Order, Booking/B/L hoặc số cont"
          />
        </div>
        <SelectField
          label="Khách hàng"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          options={customers.map(([value, label]) => ({ value, label }))}
          placeholder="Tất cả khách"
        />
        <SelectField
          label="Hãng tàu"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          options={lines.map(([value, label]) => ({ value, label }))}
          placeholder="Tất cả hãng"
        />
        <SelectField
          label="Chiều"
          value={type}
          onChange={(e) => setType(e.target.value as TypeFilter)}
          options={ORDER_TYPES.map((value) => ({ value, label: ORDER_TYPE_LABELS[value] }))}
          placeholder="Tất cả chiều"
        />
        <div className="grid grid-cols-2 gap-8 sm:col-span-2">
          <TextField
            label="Tạo từ ngày"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            label="Đến ngày"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const alert = reloadError ? (
    <Alert
      tone="warn"
      icon={<CircleAlert className="size-20" />}
      action={
        <Button variant="secondary" size="sm" onClick={reload} loading={reloading}>
          <RefreshCw className="size-18" aria-hidden="true" />
          Thử lại
        </Button>
      }
    >
      Không tải được dữ liệu mới. Đang hiện danh sách lúc {formatTime(loadedAt)}, có thể đã cũ.
    </Alert>
  ) : null;

  const bulk =
    selected.size > 0 ? (
      <div
        role="region"
        aria-label="Thao tác hàng loạt"
        className="flex flex-wrap items-center gap-12 border-t border-line bg-info-soft px-20 py-10"
      >
        <span className="text-label text-ink">
          Đã chọn {selected.size} Order
          {selectedDrafts.length !== selected.size ? ` (${selectedDrafts.length} đơn nháp)` : ''}
        </span>
        <span className="flex-1" />
        {access.write ? (
          <Button
            size="sm"
            onClick={confirmDrafts}
            loading={bulkBusy}
            disabled={selectedDrafts.length === 0}
          >
            Xác nhận Order nháp
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
          Bỏ chọn
        </Button>
      </div>
    ) : null;

  const columnCount = 10;
  const th =
    'whitespace-nowrap border-b border-line bg-surface-2 px-12 py-10 text-left text-caption text-ink-soft';

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-wrap items-start justify-between gap-12">
        <div className="min-w-0 flex-1">
          <h1 className="text-screen-title text-ink">{headline}</h1>
          <p className="mt-4 text-ink-soft">
            {rows.length} Order · {totalContainers} container
          </p>
        </div>
        {access.write ? (
          <Link href="/orders/new" className={buttonClass()}>
            <Plus className="size-20" aria-hidden="true" />
            Tạo Order
          </Link>
        ) : null}
      </div>

      {bulkResult ? (
        <Alert
          tone={bulkResult.failures.length === 0 ? 'ok' : 'warn'}
          icon={<CircleAlert className="size-20" />}
        >
          <p>
            Đã xác nhận {bulkResult.confirmed} Order.
            {bulkResult.failures.length > 0
              ? ` ${bulkResult.failures.length} Order chưa xác nhận được:`
              : ''}
          </p>
          {bulkResult.failures.length > 0 ? (
            <ul className="mt-4 list-disc pl-20">
              {bulkResult.failures.map((f) => (
                <li key={f.orderId}>
                  <Link href={`/orders/${f.orderId}`} className="font-mono text-ink underline">
                    {f.orderNo}
                  </Link>
                  : {f.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <WorkTableCard
        title="Danh sách Order"
        meta="Bấm mũi tên để xem container của từng Order"
        toolbar={toolbar}
        alert={alert}
        footer={
          rows.length === 0
            ? 'Chưa có Order nào'
            : `Đang hiện ${visible.length} trên ${rows.length} Order`
        }
      >
        {bulk}
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-24" />}
            title="Chưa có Order nào"
            description="Mỗi Order ứng với một Booking hoặc B/L và có thể gồm nhiều container. Order mới tạo sẽ hiện ở đây."
            action={
              access.write ? (
                <Link href="/orders/new" className={buttonClass()}>
                  <Plus className="size-20" aria-hidden="true" />
                  Tạo Order đầu tiên
                </Link>
              ) : undefined
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-24" />}
            title="Không có Order phù hợp"
            description="Không có Order nào khớp bộ lọc hoặc nhóm trạng thái đang chọn. Xóa bộ lọc để xem toàn bộ."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Xóa bộ lọc
              </Button>
            }
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-table border-collapse">
              <caption className="sr-only">Danh sách Order</caption>
              <thead>
                <tr>
                  <th scope="col" className={cn(th, 'w-48 pl-20')}>
                    <label className="flex min-h-hit min-w-hit cursor-pointer items-center justify-center">
                      <span className="sr-only">Chọn tất cả Order đang hiện</span>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        className="size-20 cursor-pointer accent-primary"
                      />
                    </label>
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Mở rộng</span>
                  </th>
                  <th scope="col" className={th}>
                    Order · Booking/B/L
                  </th>
                  <th scope="col" className={th}>
                    Khách hàng
                  </th>
                  <th scope="col" className={th}>
                    Hãng tàu · tàu/chuyến
                  </th>
                  <th scope="col" className={th}>
                    Chiều
                  </th>
                  <th scope="col" className={th}>
                    Cut-off
                  </th>
                  <th scope="col" className={th}>
                    Container
                  </th>
                  <th scope="col" className={cn(th, 'text-right')}>
                    Tổng cước
                  </th>
                  <th scope="col" className={cn(th, 'pr-20')}>
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <OrderRows
                    key={order.id}
                    order={order}
                    now={now}
                    isOpen={expanded.has(order.id)}
                    isSelected={selected.has(order.id)}
                    onToggleOpen={() => setExpanded((prev) => toggle(prev, order.id))}
                    onToggleSelect={() => setSelected((prev) => toggle(prev, order.id))}
                    columnCount={columnCount}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkTableCard>
    </div>
  );
}

const cell = 'border-b border-line px-12 py-10 align-top text-body-sm';

function OrderRows({
  order,
  now,
  isOpen,
  isSelected,
  onToggleOpen,
  onToggleSelect,
  columnCount,
}: {
  order: OrderListItemDto;
  now: number;
  isOpen: boolean;
  isSelected: boolean;
  onToggleOpen: () => void;
  onToggleSelect: () => void;
  columnCount: number;
}) {
  const active = order.containers.filter(isActiveContainer);
  const delivered = active.filter(isDeliveredContainer).length;
  const pending = OPEN_STATUSES.includes(order.status) ? active.filter(needsAction).length : 0;
  const unpriced = unpricedContainers(order.containers);
  const priced = active.filter(hasAmount).length;
  const isDraft = order.status === 'DRAFT';
  const cancelled = order.containers.length - active.length;
  const percent = active.length === 0 ? 0 : Math.round((delivered / active.length) * 100);
  const panelId = `containers-${order.id}`;

  return (
    <Fragment>
      <tr className="hover:bg-surface-2">
        <td className={cn(cell, 'pl-20')}>
          <label className="flex min-h-hit min-w-hit cursor-pointer items-center justify-center">
            <span className="sr-only">Chọn {order.orderNo}</span>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="size-20 cursor-pointer accent-primary"
            />
          </label>
        </td>
        <td className={cell}>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={`${isOpen ? 'Thu gọn' : 'Xem'} container của ${order.orderNo}`}
            onClick={onToggleOpen}
            className="inline-flex size-hit cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            <ChevronRight
              className={cn('size-20 transition-transform duration-150', isOpen && 'rotate-90')}
              aria-hidden="true"
            />
          </button>
        </td>
        <td className={cell}>
          <Link
            href={`/orders/${order.id}`}
            className="block whitespace-nowrap font-mono font-semibold text-ink underline"
          >
            {order.orderNo}
          </Link>
          <SubText>
            {order.orderType === 'IMPORT' ? 'B/L' : 'Booking'}{' '}
            <span className="font-mono">{order.bookingOrBlNo}</span>
          </SubText>
        </td>
        <td className={cell}>{order.customerName}</td>
        <td className={cell}>
          <span className="block font-medium">{order.shippingLineName ?? '—'}</span>
          {order.vesselVoyage ? <SubText>{order.vesselVoyage}</SubText> : null}
        </td>
        <td className={cell}>{ORDER_TYPE_LABELS[order.orderType]}</td>
        <td className={cell}>
          {order.cutOffAt && OPEN_STATUSES.includes(order.status) ? (
            <DeadlineText at={order.cutOffAt} now={now} />
          ) : order.cutOffAt ? (
            <span className="whitespace-nowrap">{formatShortDateTime(order.cutOffAt)}</span>
          ) : (
            <span className="text-ink-soft">—</span>
          )}
        </td>
        <td className={cell}>
          {active.length === 0 ? (
            <span className="block font-semibold">{cancelled} cont đã hủy</span>
          ) : (
            <>
              <span className="block whitespace-nowrap font-semibold">
                {delivered}/{active.length} đã giao
              </span>
              <span
                aria-hidden="true"
                className="mt-4 block h-6 w-full max-w-form rounded-pill bg-surface-2"
              >
                <span
                  className="block h-full rounded-pill bg-primary"
                  style={{ width: `${percent}%` }}
                />
              </span>
              {pending > 0 ? (
                <span className="mt-4 block whitespace-nowrap text-small font-semibold text-warn">
                  {pending} cont cần xử lý
                </span>
              ) : null}
            </>
          )}
        </td>
        <td className={cn(cell, 'text-right')}>
          {order.status === 'CANCELLED' ? (
            <span className="text-ink-soft">Không thu</span>
          ) : priced === 0 ? (
            <span className="inline-flex items-center gap-4 font-semibold text-crit">
              <CircleAlert className="size-14" aria-hidden="true" />
              Chưa có giá
            </span>
          ) : (
            <>
              <span className="block whitespace-nowrap font-semibold">
                {formatMoney(orderFreight(order), order.currency)}
              </span>
              {isDraft ? <span className="block text-small text-ink-soft">Giá dự kiến</span> : null}
              {unpriced.length > 0 ? (
                <span className="flex items-center justify-end gap-4 text-small text-crit">
                  <CircleAlert className="size-14" aria-hidden="true" />+ {unpriced.length} cont
                  chưa có giá
                </span>
              ) : null}
            </>
          )}
        </td>
        <td className={cn(cell, 'pr-20')}>
          <OrderStatusChip status={order.status} />
        </td>
      </tr>
      {isOpen ? (
        <tr id={panelId}>
          <td colSpan={columnCount} className="border-b border-line bg-surface-2 py-8 pl-72 pr-20">
            <ContainerMiniTable order={order} now={now} />
            <div className="pt-10">
              <Link
                href={`/orders/${order.id}`}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                Mở chi tiết {order.orderNo}
              </Link>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function ContainerPrice({
  container,
}: {
  container: OrderListItemDto['containers'][number];
}) {
  if (container.status === 'CANCELLED') return <span className="text-ink-soft">Đã hủy</span>;
  if (container.priceState === 'missing') {
    return (
      <span className="block text-crit">
        <span className="inline-flex items-center gap-4 font-semibold">
          <CircleAlert className="size-14" aria-hidden="true" />
          Chưa có giá
        </span>
        <span className="block text-small">Cần nhập giá tay</span>
      </span>
    );
  }
  return (
    <>
      <span className="block whitespace-nowrap font-semibold">
        {formatMoney(container.priceAmount ?? '0')}
      </span>
      {container.priceState === 'preview' ? (
        <span className="block text-small text-ink-soft">Giá dự kiến</span>
      ) : null}
      {container.isManualPrice ? (
        <span className="block text-small text-ink-soft">Giá tay</span>
      ) : null}
      {container.repriceRequired ? (
        <span className="block text-small text-warn">Cần tính lại giá</span>
      ) : null}
    </>
  );
}

function ContainerMiniTable({ order, now }: { order: OrderListItemDto; now: number }) {
  const th =
    'whitespace-nowrap border-b border-line px-8 py-6 text-left text-caption text-ink-soft';
  const td = 'border-b border-line px-8 py-8 align-top text-body-sm';
  if (order.containers.length === 0) {
    return <p className="py-8 text-ink-soft">Order này chưa có container.</p>;
  }
  return (
    <table className="w-full border-collapse" aria-label={`Container của ${order.orderNo}`}>
      <thead>
        <tr>
          <th scope="col" className={th}>
            Số cont
          </th>
          <th scope="col" className={th}>
            Loại
          </th>
          <th scope="col" className={th}>
            Trạng thái cont
          </th>
          <th scope="col" className={th}>
            Cảng / bãi
          </th>
          <th scope="col" className={th}>
            Hạn DEM
          </th>
          <th scope="col" className={th}>
            Hạn DET
          </th>
          <th scope="col" className={cn(th, 'text-right')}>
            Cước
          </th>
          <th scope="col" className={th}>
            Xe · tài xế
          </th>
          <th scope="col" className={th}>
            ePOD
          </th>
        </tr>
      </thead>
      <tbody>
        {order.containers.map((c) => {
          const hold = c.portReadiness === 'HOLD_CUSTOMS' || c.portReadiness === 'HOLD_LINE';
          return (
            <tr key={c.id}>
              <td className={cn(td, 'whitespace-nowrap font-mono font-semibold')}>
                {c.containerNo ?? (
                  <span className="font-sans font-normal text-ink-soft">Chưa có số</span>
                )}
              </td>
              <td className={cn(td, 'font-mono')}>{c.containerType}</td>
              <td className={td}>
                <ContainerStatusChip status={c.status} />
              </td>
              <td className={td}>
                <PortReadinessCell value={c.portReadiness} />
              </td>
              <td className={td}>
                <DeadlineText
                  at={c.demFreeUntil}
                  now={now}
                  hold={hold && Boolean(c.demFreeUntil)}
                />
              </td>
              <td className={td}>
                <DeadlineText at={c.detFreeUntil} now={now} />
              </td>
              <td className={cn(td, 'text-right')}>
                <ContainerPrice container={c} />
              </td>
              <td className={cn(td, 'whitespace-nowrap text-ink-soft')}>Chưa có xe</td>
              <td className={td}>
                {c.isEpodVerified ? (
                  <span className="text-ok">Đã xác minh</span>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
