'use client';

import {
  Banknote,
  Check,
  CheckCircle,
  ChevronRight,
  CircleAlert,
  Clock,
  ExternalLink,
  FileEdit,
  FileText,
  Plus,
  RefreshCw,
  SearchX,
  Truck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ORDER_TYPES } from '@shared/enums';
import { ORDER_TYPE_LABELS } from '@shared/labels';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectField, TextField } from '@/components/ui/field';
import { ActionIcon, KpiStatCard, MantineBadge, Paper, ThemeIcon } from '@/components/ui/mantine';
import { SubText } from '@/components/ui/work-table';
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
  isActiveContainer,
  isDeliveredContainer,
  needsAction,
  orderFreight,
  tabOfStatus,
  unpricedContainers,
  type OrderAccess,
  type OrderListItemDto,
  type OrderTab,
} from './order-types';

// Màn danh sách Order (Screen04) được nâng cấp theo chuẩn Dash Mantine Components (Mantine v8):
// - Header với hành động chính (Tạo Order, Làm mới dữ liệu)
// - 4 Thẻ chỉ số KPI (KPI Stat Cards): Cần xử lý, Đang vận chuyển, Đơn nháp/Chờ chốt, Doanh thu tạm tính
// - Thanh lọc Paper kết hợp Mantine Tabs (SegmentedControl) có số đếm và bộ lọc lưới
// - Bảng dữ liệu Mantine Table có dòng mở rộng lồng Container Mini Table
// - Thanh thao tác hàng loạt kiểu Mantine Alert/Floating bar
// - 4 trạng thái dữ liệu (bình thường, trống, lỗi giữ dữ liệu cũ, lọc không ra kết quả).

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

  const tabs = TAB_ORDER.map((id) => ({
    id,
    label: TAB_LABELS[id],
    count:
      id === 'all'
        ? byFilters.length
        : byFilters.filter((r) => tabOfStatus(r.status) === id).length,
  }));
  const visible = byFilters.filter((r) => tab === 'all' || tabOfStatus(r.status) === tab);

  const hasActiveFilters =
    search.trim() !== '' ||
    customer !== ALL ||
    line !== ALL ||
    type !== '' ||
    from !== '' ||
    to !== '';

  function clearFilters() {
    setTab('all');
    setSearch('');
    setCustomer(ALL);
    setLine(ALL);
    setType('');
    setFrom('');
    setTo('');
  }

  // ---- Dữ liệu thống kê KPI (Dash Mantine Components Metric Cards)
  const openOrders = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const openContainers = openOrders.reduce(
    (sum, r) => sum + r.containers.filter((c) => needsAction(c)).length,
    0,
  );
  const inProgressOrders = rows.filter(
    (r) => r.status === 'IN_PROGRESS' || r.status === 'PARTIALLY_DELIVERED',
  );
  const draftOrders = rows.filter((r) => r.status === 'DRAFT');
  const unpricedCount = draftOrders.reduce(
    (sum, r) => sum + unpricedContainers(r.containers).length,
    0,
  );
  const totalContainers = rows.reduce(
    (sum, r) => sum + r.containers.filter(isActiveContainer).length,
    0,
  );
  const deliveredContainers = rows.reduce(
    (sum, r) => sum + r.containers.filter(isDeliveredContainer).length,
    0,
  );
  const nearest = openOrders
    .filter((r) => r.cutOffAt)
    .sort((a, b) => new Date(a.cutOffAt!).getTime() - new Date(b.cutOffAt!).getTime())[0];

  const totalEstimatedRevenue = rows
    .filter((r) => r.status !== 'CANCELLED')
    .reduce((sum, r) => sum + Number(orderFreight(r)) + Number(r.totalSurchargeAmount), 0);

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

  const columnCount = 10;
  const th =
    'whitespace-nowrap border-b border-line bg-surface-2/60 px-12 py-10 text-left text-caption font-bold uppercase tracking-wider text-ink-soft';

  return (
    <div className="flex flex-col gap-20">
      {/* 1. Header Trang kiểu Mantine App Header */}
      <div className="flex flex-wrap items-center justify-between gap-12">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-8">
            <h1 className="text-screen-title font-bold text-ink">Quản lý Đơn hàng</h1>
            <MantineBadge color="primary" variant="light" size="sm">
              {rows.length} Order
            </MantineBadge>
            <MantineBadge color="neutral" variant="outline" size="sm">
              {totalContainers} container
            </MantineBadge>
          </div>
          <p className="mt-4 text-small text-ink-soft">
            Theo dõi danh sách Booking/B/L, điều phối container, tra giá và kiểm soát hạn cut-off,
            DEM/DET.
          </p>
        </div>

        <div className="flex items-center gap-8">
          <ActionIcon
            variant="outline"
            size="lg"
            color="neutral"
            onClick={reload}
            loading={reloading}
            aria-label="Tải lại danh sách"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={cn('size-18', reloading && 'animate-spin')} />
          </ActionIcon>

          {access.write ? (
            <Link href="/orders/new" className={buttonClass()}>
              <Plus className="size-18" aria-hidden="true" />
              Tạo Order mới
            </Link>
          ) : null}
        </div>
      </div>

      {/* 2. Cụm thẻ thống kê KPI (Mantine Stat Cards Pattern) */}
      <div className="grid grid-cols-1 gap-16 sm:grid-cols-2 lg:grid-cols-4">
        <KpiStatCard
          label="Cần điều vận"
          value={openOrders.length}
          icon={<Clock className="size-20" />}
          color={nearest ? 'warn' : 'primary'}
          badge={
            <MantineBadge color={openContainers > 0 ? 'warn' : 'ok'} variant="light" size="sm">
              {openContainers} cont
            </MantineBadge>
          }
          description={
            nearest ? (
              <span className="flex items-center gap-4 text-warn font-semibold">
                <CircleAlert className="size-14 shrink-0" />
                Hạn gần: {nearest.vesselVoyage ?? nearest.orderNo} (
                {formatRemaining(new Date(nearest.cutOffAt!).getTime() - now)})
              </span>
            ) : (
              'Không có hạn gấp trong 8 giờ tới'
            )
          }
          onClick={() => setTab('open')}
        />

        <KpiStatCard
          label="Đang vận chuyển"
          value={inProgressOrders.length}
          icon={<Truck className="size-20" />}
          color="primary"
          badge={
            <MantineBadge color="primary" variant="light" size="sm">
              {deliveredContainers}/{totalContainers} đã giao
            </MantineBadge>
          }
          description={
            <span>{totalContainers - deliveredContainers} container đang chạy trên lộ trình</span>
          }
          onClick={() => setTab('open')}
        />

        <KpiStatCard
          label="Đơn nháp / Chờ chốt"
          value={draftOrders.length}
          icon={<FileEdit className="size-20" />}
          color={unpricedCount > 0 ? 'crit' : 'neutral'}
          badge={
            unpricedCount > 0 ? (
              <MantineBadge color="crit" variant="light" size="sm">
                {unpricedCount} cont thiếu giá
              </MantineBadge>
            ) : (
              <MantineBadge color="ok" variant="light" size="sm">
                Đủ bảng giá
              </MantineBadge>
            )
          }
          description="Chọn nhiều đơn nháp để xác nhận hàng loạt"
          onClick={() => setTab('draft')}
        />

        <KpiStatCard
          label="Doanh thu tạm tính"
          value={`${formatMoney(totalEstimatedRevenue)} ₫`}
          icon={<Banknote className="size-20" />}
          color="ok"
          badge={
            <MantineBadge color="ok" variant="light" size="sm">
              {rows.length - draftOrders.length} đơn chốt
            </MantineBadge>
          }
          description="Gồm cước container + phụ phí thu khách"
        />
      </div>

      {/* 3. Cảnh báo lỗi tải lại (Mantine Alert style) */}
      {reloadError ? (
        <Alert
          tone="warn"
          icon={<CircleAlert className="size-20" />}
          action={
            <Button variant="secondary" size="sm" onClick={reload} loading={reloading}>
              <RefreshCw className="size-16" aria-hidden="true" />
              Thử lại
            </Button>
          }
        >
          Không tải được dữ liệu mới. Đang hiện danh sách lúc {formatTime(loadedAt)}, có thể đã cũ.
        </Alert>
      ) : null}

      {/* 4. Kết quả xác nhận hàng loạt */}
      {bulkResult ? (
        <Alert
          tone={bulkResult.failures.length === 0 ? 'ok' : 'warn'}
          icon={<CircleAlert className="size-20" />}
        >
          <p className="font-semibold">
            Đã xác nhận thành công {bulkResult.confirmed} Order.
            {bulkResult.failures.length > 0
              ? ` Có ${bulkResult.failures.length} Order chưa xác nhận được:`
              : ''}
          </p>
          {bulkResult.failures.length > 0 ? (
            <ul className="mt-4 list-disc pl-20 text-small">
              {bulkResult.failures.map((f) => (
                <li key={f.orderId}>
                  <Link
                    href={`/orders/${f.orderId}`}
                    className="font-mono font-bold text-ink underline"
                  >
                    {f.orderNo}
                  </Link>
                  : {f.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      {/* 5. Khối Lọc Mantine Toolbar (Paper + Segmented Tabs + Inputs Grid) */}
      <Paper withBorder shadow="xs" radius="card" p="16" className="flex flex-col gap-16">
        {/* Hàng Tab kiểu Mantine Tabs/SegmentedControl */}
        <div className="flex flex-wrap items-center justify-between gap-12 border-b border-line pb-12">
          <div
            className="flex flex-wrap items-center gap-6"
            role="tablist"
            aria-label="Lọc theo trạng thái Order"
          >
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id as OrderTab)}
                  className={cn(
                    'inline-flex min-h-hit cursor-pointer items-center gap-8 rounded-control px-12 py-6 text-small font-semibold transition-all duration-150',
                    active
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <span>{t.label}</span>
                  <span
                    className={cn(
                      'rounded-pill px-6 py-1 text-caption font-bold',
                      active ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-2 text-ink-soft',
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-small">
              <X className="size-14" aria-hidden="true" />
              Xóa bộ lọc ({[search, customer, line, type, from, to].filter(Boolean).length})
            </Button>
          ) : null}
        </div>

        {/* Lưới bộ lọc Mantine Inputs Grid */}
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-4">
            <div className="relative">
              <TextField
                label="Tìm kiếm trong danh sách"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Số Order, Booking/B/L hoặc số cont..."
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="absolute right-8 top-32 cursor-pointer p-4 text-ink-soft hover:text-ink"
                >
                  <X className="size-16" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="lg:col-span-2">
            <SelectField
              label="Khách hàng"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              options={customers.map(([val, lab]) => ({ value: val, label: lab }))}
              placeholder="Tất cả khách hàng"
            />
          </div>

          <div className="lg:col-span-2">
            <SelectField
              label="Hãng tàu"
              value={line}
              onChange={(e) => setLine(e.target.value)}
              options={lines.map(([val, lab]) => ({ value: val, label: lab }))}
              placeholder="Tất cả hãng tàu"
            />
          </div>

          <div className="lg:col-span-2">
            <SelectField
              label="Chiều vận chuyển"
              value={type}
              onChange={(e) => setType(e.target.value as TypeFilter)}
              options={ORDER_TYPES.map((value) => ({ value, label: ORDER_TYPE_LABELS[value] }))}
              placeholder="Tất cả chiều"
            />
          </div>

          <div className="grid grid-cols-2 gap-8 sm:col-span-2 lg:col-span-2">
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
      </Paper>

      {/* 6. Thanh thao tác hàng loạt kiểu Mantine Floating Alert */}
      {selected.size > 0 ? (
        <Paper
          withBorder
          shadow="sm"
          radius="control"
          p="12"
          className="flex flex-wrap items-center justify-between gap-12 bg-info-soft/70 border-primary/30"
          role="region"
          aria-label="Thao tác hàng loạt"
        >
          <div className="flex items-center gap-8">
            <ThemeIcon size="sm" color="primary" variant="filled" radius="pill">
              <Check className="size-14" />
            </ThemeIcon>
            <span className="text-small font-bold text-ink">Đã chọn {selected.size} Order</span>
            {selectedDrafts.length > 0 ? (
              <MantineBadge color="primary" variant="light" size="sm">
                {selectedDrafts.length} đơn nháp
              </MantineBadge>
            ) : null}
          </div>

          <div className="flex items-center gap-8">
            {access.write ? (
              <Button
                size="sm"
                onClick={confirmDrafts}
                loading={bulkBusy}
                disabled={selectedDrafts.length === 0}
              >
                <CheckCircle className="size-16" aria-hidden="true" />
                Xác nhận Order nháp ({selectedDrafts.length})
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="size-16" aria-hidden="true" />
              Bỏ chọn
            </Button>
          </div>
        </Paper>
      ) : null}

      {/* 7. Khối Bảng Danh sách Order kiểu Mantine Table Card */}
      <Paper withBorder shadow="xs" radius="card" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-12 border-b border-line bg-surface px-20 py-12">
          <div>
            <h2 className="text-section-title font-bold text-ink">Danh sách Order & Container</h2>
            <p className="text-caption text-ink-soft">
              Bấm biểu tượng mũi tên để mở rộng và xem danh sách container chi tiết
            </p>
          </div>
          <MantineBadge color="neutral" variant="light" size="sm">
            {rows.length === 0 ? '0 Order' : `Hiện ${visible.length} / ${rows.length} Order`}
          </MantineBadge>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-24" />}
            title="Chưa có Order nào"
            description="Mỗi Order ứng với một Booking hoặc B/L và có thể gồm nhiều container. Tạo Order mới để bắt đầu quản lý."
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
            description="Không có Order nào khớp với bộ lọc hoặc nhóm trạng thái đang chọn. Hãy xóa bộ lọc để xem toàn bộ danh sách."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Xóa bộ lọc
              </Button>
            }
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-table border-collapse">
              <caption className="sr-only">Danh sách Order và Container</caption>
              <thead>
                <tr>
                  <th scope="col" className={cn(th, 'w-48 pl-20')}>
                    <label className="flex min-h-hit min-w-hit cursor-pointer items-center justify-center">
                      <span className="sr-only">Chọn tất cả Order đang hiển thị</span>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        className="size-18 cursor-pointer accent-primary"
                      />
                    </label>
                  </th>
                  <th scope="col" className={cn(th, 'w-48')}>
                    <span className="sr-only">Mở rộng chi tiết</span>
                  </th>
                  <th scope="col" className={th}>
                    Order · Booking/B/L
                  </th>
                  <th scope="col" className={th}>
                    Khách hàng
                  </th>
                  <th scope="col" className={th}>
                    Hãng tàu · Tàu/Chuyến
                  </th>
                  <th scope="col" className={th}>
                    Chiều
                  </th>
                  <th scope="col" className={th}>
                    Cut-off
                  </th>
                  <th scope="col" className={th}>
                    Tiến độ Container
                  </th>
                  <th scope="col" className={cn(th, 'text-right')}>
                    Tổng cước
                  </th>
                  <th scope="col" className={cn(th, 'pr-20')}>
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
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

        <div className="flex items-center justify-between border-t border-line px-20 py-12 text-caption text-ink-soft">
          <span aria-live="polite">
            {rows.length === 0
              ? 'Chưa có dữ liệu đơn hàng'
              : `Hiển thị ${visible.length} trên tổng số ${rows.length} Order (${totalContainers} container)`}
          </span>
          <span>Dữ liệu cập nhật lúc {formatTime(loadedAt)}</span>
        </div>
      </Paper>
    </div>
  );
}

const cell = 'px-12 py-12 align-top text-body-sm transition-colors';

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

  const typeColorMap: Record<string, 'primary' | 'accent' | 'ok'> = {
    IMPORT: 'primary',
    EXPORT: 'accent',
    DOMESTIC: 'ok',
  };

  return (
    <Fragment>
      <tr className={cn('hover:bg-surface-2/50 transition-colors', isOpen && 'bg-surface-2/20')}>
        <td className={cn(cell, 'pl-20')}>
          <label className="flex min-h-hit min-w-hit cursor-pointer items-center justify-center">
            <span className="sr-only">Chọn {order.orderNo}</span>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="size-18 cursor-pointer accent-primary"
            />
          </label>
        </td>

        <td className={cell}>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="neutral"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={`${isOpen ? 'Thu gọn' : 'Xem'} container của ${order.orderNo}`}
            onClick={onToggleOpen}
          >
            <ChevronRight
              className={cn(
                'size-18 transition-transform duration-200',
                isOpen && 'rotate-90 text-primary',
              )}
              aria-hidden="true"
            />
          </ActionIcon>
        </td>

        <td className={cell}>
          <div className="flex items-center gap-6">
            <Link
              href={`/orders/${order.id}`}
              className="whitespace-nowrap font-mono font-bold text-primary hover:underline"
            >
              {order.orderNo}
            </Link>
          </div>
          <SubText>
            {order.orderType === 'IMPORT' ? 'B/L' : 'Booking'}{' '}
            <span className="font-mono font-medium text-ink">{order.bookingOrBlNo}</span>
          </SubText>
        </td>

        <td className={cell}>
          <span className="block font-semibold text-ink">{order.customerName}</span>
        </td>

        <td className={cell}>
          <span className="block font-medium text-ink">{order.shippingLineName ?? '—'}</span>
          {order.vesselVoyage ? <SubText>{order.vesselVoyage}</SubText> : null}
        </td>

        <td className={cell}>
          <MantineBadge
            color={typeColorMap[order.orderType] ?? 'neutral'}
            variant="light"
            size="xs"
          >
            {ORDER_TYPE_LABELS[order.orderType]}
          </MantineBadge>
        </td>

        <td className={cell}>
          {order.cutOffAt && OPEN_STATUSES.includes(order.status) ? (
            <DeadlineText at={order.cutOffAt} now={now} />
          ) : order.cutOffAt ? (
            <span className="whitespace-nowrap text-ink-soft">
              {formatShortDateTime(order.cutOffAt)}
            </span>
          ) : (
            <span className="text-ink-soft">—</span>
          )}
        </td>

        <td className={cell}>
          {active.length === 0 ? (
            <span className="block font-semibold text-ink-soft">{cancelled} cont đã hủy</span>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-8 text-caption">
                <span className="font-bold text-ink">
                  {delivered}/{active.length} đã giao
                </span>
                <span className="font-semibold text-ink-soft">{percent}%</span>
              </div>
              <div
                aria-hidden="true"
                className="mt-4 h-6 w-full max-w-form overflow-hidden rounded-pill bg-surface-2"
              >
                <div
                  className="h-full rounded-pill bg-primary transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {pending > 0 ? (
                <span className="mt-4 block whitespace-nowrap text-caption font-bold text-warn">
                  {pending} cont cần xử lý
                </span>
              ) : null}
            </div>
          )}
        </td>

        <td className={cn(cell, 'text-right')}>
          {order.status === 'CANCELLED' ? (
            <span className="text-ink-soft">Không thu</span>
          ) : priced === 0 ? (
            <MantineBadge
              color="crit"
              variant="light"
              size="xs"
              leftSection={<CircleAlert className="size-12" />}
            >
              Chưa có giá
            </MantineBadge>
          ) : (
            <div>
              <span className="block whitespace-nowrap font-bold text-ink">
                {formatMoney(orderFreight(order), order.currency)}
              </span>
              {isDraft ? (
                <span className="block text-caption text-ink-soft">Giá dự kiến</span>
              ) : null}
              {unpriced.length > 0 ? (
                <span className="flex items-center justify-end gap-4 text-caption font-bold text-crit">
                  <CircleAlert className="size-12" aria-hidden="true" />+ {unpriced.length} cont
                  chưa giá
                </span>
              ) : null}
            </div>
          )}
        </td>

        <td className={cn(cell, 'pr-20')}>
          <OrderStatusChip status={order.status} />
        </td>
      </tr>

      {/* Dòng mở rộng hiển thị Mantine Nested Container Table */}
      {isOpen ? (
        <tr id={panelId} className="bg-surface-2/20">
          <td colSpan={columnCount} className="px-20 py-12">
            <Paper withBorder radius="card-sm" shadow="xs" p="16" className="bg-surface">
              <div className="flex items-center justify-between border-b border-line pb-10">
                <div className="flex items-center gap-8">
                  <span className="text-small font-bold text-ink">
                    Danh sách Container ({order.containers.length} cont)
                  </span>
                  <MantineBadge color="primary" variant="light" size="xs">
                    {order.orderNo}
                  </MantineBadge>
                </div>

                <Link
                  href={`/orders/${order.id}`}
                  className="inline-flex items-center gap-4 text-small font-semibold text-primary hover:underline"
                >
                  <span>Mở trang chi tiết Order</span>
                  <ExternalLink className="size-14" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-8 overflow-x-auto">
                <ContainerMiniTable order={order} now={now} />
              </div>
            </Paper>
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
        <span className="inline-flex items-center gap-4 font-bold">
          <CircleAlert className="size-14" aria-hidden="true" />
          Chưa có giá
        </span>
        <span className="block text-caption">Cần nhập giá tay</span>
      </span>
    );
  }
  return (
    <div>
      <span className="block whitespace-nowrap font-bold text-ink">
        {formatMoney(container.priceAmount ?? '0')}
      </span>
      {container.priceState === 'preview' ? (
        <span className="block text-caption text-ink-soft">Giá dự kiến</span>
      ) : null}
      {container.isManualPrice ? (
        <span className="block text-caption font-semibold text-warn">Giá tay</span>
      ) : null}
      {container.repriceRequired ? (
        <span className="block text-caption font-bold text-warn">Cần tính lại</span>
      ) : null}
    </div>
  );
}

function ContainerMiniTable({ order, now }: { order: OrderListItemDto; now: number }) {
  const miniTh =
    'whitespace-nowrap border-b border-line bg-surface-2/40 px-8 py-6 text-left text-caption font-bold uppercase tracking-wider text-ink-soft';
  const miniTd = 'border-b border-line/60 px-8 py-8 align-top text-body-sm';

  if (order.containers.length === 0) {
    return <p className="py-12 text-ink-soft">Order này chưa có container nào.</p>;
  }

  return (
    <table className="w-full border-collapse" aria-label={`Container của ${order.orderNo}`}>
      <thead>
        <tr>
          <th scope="col" className={miniTh}>
            Số container
          </th>
          <th scope="col" className={miniTh}>
            Loại
          </th>
          <th scope="col" className={miniTh}>
            Trạng thái cont
          </th>
          <th scope="col" className={miniTh}>
            Cảng / bãi
          </th>
          <th scope="col" className={miniTh}>
            Hạn DEM
          </th>
          <th scope="col" className={miniTh}>
            Hạn DET
          </th>
          <th scope="col" className={cn(miniTh, 'text-right')}>
            Cước container
          </th>
          <th scope="col" className={miniTh}>
            Xe · tài xế
          </th>
          <th scope="col" className={miniTh}>
            ePOD
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line/40">
        {order.containers.map((c) => {
          const hold = c.portReadiness === 'HOLD_CUSTOMS' || c.portReadiness === 'HOLD_LINE';
          return (
            <tr key={c.id} className="hover:bg-surface-2/40 transition-colors">
              <td className={cn(miniTd, 'whitespace-nowrap font-mono font-bold text-ink')}>
                {c.containerNo ?? (
                  <span className="font-sans font-normal text-ink-soft italic">
                    Chưa có số cont
                  </span>
                )}
              </td>
              <td className={miniTd}>
                <MantineBadge color="neutral" variant="outline" size="xs" className="font-mono">
                  {c.containerType}
                </MantineBadge>
              </td>
              <td className={miniTd}>
                <ContainerStatusChip status={c.status} />
              </td>
              <td className={miniTd}>
                <PortReadinessCell value={c.portReadiness} />
              </td>
              <td className={miniTd}>
                <DeadlineText
                  at={c.demFreeUntil}
                  now={now}
                  hold={hold && Boolean(c.demFreeUntil)}
                />
              </td>
              <td className={miniTd}>
                <DeadlineText at={c.detFreeUntil} now={now} />
              </td>
              <td className={cn(miniTd, 'text-right')}>
                <ContainerPrice container={c} />
              </td>
              <td className={cn(miniTd, 'whitespace-nowrap text-ink-soft')}>Chưa gán xe</td>
              <td className={miniTd}>
                {c.isEpodVerified ? (
                  <MantineBadge color="ok" variant="light" size="xs">
                    Đã xác minh
                  </MantineBadge>
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
