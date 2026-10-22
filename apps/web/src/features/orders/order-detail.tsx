'use client';

import { ChevronLeft, CircleAlert, CircleCheck, Plus, Trash2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ORDER_TYPE_LABELS, STOP_STATUS_LABELS, STOP_TYPE_LABELS } from '@shared/labels';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { TextField } from '@/components/ui/field';
import { formatDateTime, formatMoney, formatShortDateTime } from '@/lib/format';
import { formatRemaining } from '@/lib/deadline';
import { cn } from '@/lib/utils';
import {
  addContainers,
  cancelContainer,
  cancelOrder,
  confirmOrder,
  removeContainer,
  setManualPrice,
} from './actions';
import {
  ContainerEntry,
  emptyRow,
  rowIssues,
  rowsToPayload,
  type RowState,
} from './container-rows';
import {
  ContainerStatusChip,
  DeadlineText,
  OrderStatusChip,
  PortReadinessCell,
} from './order-chips';
import { ContainerPrice } from './order-list';
import {
  OPEN_STATUSES,
  hasAmount,
  orderFreight,
  isActiveContainer,
  isDeliveredContainer,
  needsAction,
  unpricedContainers,
  type ContainerDto,
  type FeeDto,
  type OrderAccess,
  type OrderDetailDto,
  type StopDto,
} from './order-types';

// Màn chi tiết Order (Screen04): thông tin chung, tổng hợp tiền, bảng container, chi tiết container đang chọn
// (chuỗi Stop, giá hoặc "Chưa có giá" + nhập giá tay, chi hộ, hủy cont) và lịch sử thay đổi. Sau mỗi thao tác nạp lại dữ liệu của trang.
type Props = {
  detail: OrderDetailDto;
  /** Vừa tạo xong (từ màn tạo Order). */
  justCreated?: boolean;
  access: OrderAccess;
  routes: { id: string; name: string }[];
  serverNow: number;
};

const sumMoney = (values: string[]) => values.reduce((total, v) => total + Number(v), 0).toFixed(2);

export function OrderDetail({ detail, justCreated = false, access, routes, serverNow }: Props) {
  const router = useRouter();
  // Sau mỗi thao tác nạp lại dữ liệu trang; trong lúc nạp khóa các nút ghi để không gửi version cũ (STALE_DATA).
  const [refreshing, startRefresh] = useTransition();
  const refresh = () => startRefresh(() => router.refresh());
  const { order, stops, fees, history } = detail;
  const [now, setNow] = useState(serverNow);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    justCreated
      ? `Đã tạo Order ${detail.order.orderNo} với ${detail.order.containers.length} container.`
      : null,
  );
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<ContainerDto | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ContainerDto | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const isOpen = OPEN_STATUSES.includes(order.status);
  const active = order.containers.filter(isActiveContainer);
  const unpriced = unpricedContainers(order.containers);
  const pending = isOpen ? active.filter(needsAction).length : 0;
  const delivered = active.filter(isDeliveredContainer).length;
  const selected =
    order.containers.find((c) => c.id === selectedId) ?? unpriced[0] ?? order.containers[0] ?? null;

  const revenue = Number(orderFreight(order)) + Number(order.totalSurchargeAmount);
  const hasPrice = active.some(hasAmount);

  async function onConfirm() {
    setConfirming(true);
    setConfirmError(null);
    setStatus(null);
    try {
      const result = await confirmOrder({ id: order.id, version: order.version });
      if (result.ok) {
        setStatus('Đã xác nhận Order, giá từng container đã được chốt.');
        refresh();
      } else if (result.code === 'PRICE_MISSING') {
        setConfirmError(
          `Chưa xác nhận được: container dòng ${result.details?.lines ?? ''} chưa có giá. Nhập giá tay kèm lý do cho các container đó rồi xác nhận lại.`,
        );
        // Chọn đúng container server báo thiếu giá (details.lines là số dòng, cách nhau bằng dấu phẩy).
        const lines = String(result.details?.lines ?? '')
          .split(',')
          .map(Number);
        const first = order.containers.find((c) => lines.includes(c.lineNo));
        if (first) setSelectedId(first.id);
      } else {
        setConfirmError(result.message);
      }
    } catch {
      setConfirmError('Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.');
    } finally {
      setConfirming(false);
    }
  }

  const headline = (() => {
    if (order.status === 'CANCELLED') return 'đã hủy';
    if (!isOpen) return `${delivered}/${active.length} container đã giao`;
    const parts = [`${pending} container cần xử lý`];
    if (order.cutOffAt) {
      parts.push(
        `cut-off ${formatShortDateTime(order.cutOffAt).slice(-5)} ${formatRemaining(new Date(order.cutOffAt).getTime() - now).toLowerCase()}`,
      );
    }
    return parts.join(', ');
  })();

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-wrap items-start justify-between gap-12">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Link
            href="/orders"
            className="inline-flex min-h-hit items-center gap-4 self-start text-ink-soft no-underline hover:text-ink"
          >
            <ChevronLeft className="size-20" aria-hidden="true" />
            Đơn hàng
          </Link>
          <h1 className="text-screen-title text-ink">
            <span className="font-mono">{order.orderNo}</span>: {headline}
          </h1>
          <p className="flex flex-wrap items-center gap-8 text-ink-soft">
            <OrderStatusChip status={order.status} />
            <span>
              {order.orderType === 'IMPORT' ? 'B/L' : 'Booking'}{' '}
              <span className="font-mono">{order.bookingOrBlNo}</span> · {order.customerName} ·{' '}
              {ORDER_TYPE_LABELS[order.orderType]}
            </span>
          </p>
        </div>
        {access.write ? (
          <div className="flex flex-wrap gap-8">
            {isOpen ? (
              <Button variant="secondary" onClick={() => setCancelOpen(true)} disabled={refreshing}>
                Hủy Order
              </Button>
            ) : null}
            {isOpen ? (
              <Button variant="secondary" onClick={() => setAddOpen(true)} disabled={refreshing}>
                <Plus className="size-20" aria-hidden="true" />
                Thêm container
              </Button>
            ) : null}
            {order.status === 'DRAFT' ? (
              <Button onClick={onConfirm} loading={confirming} disabled={refreshing}>
                Xác nhận Order
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {confirmError ? (
        <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
          {confirmError}
        </Alert>
      ) : null}
      {detail.warnings.length > 0 ? (
        <Alert tone="warn" icon={<CircleAlert className="size-20" />}>
          <p className="font-semibold">Số container đang có ở Order khác</p>
          <ul className="mt-4 list-disc pl-20">
            {detail.warnings.map((w) => (
              <li key={`${w.orderId}-${w.containerNo}`}>
                <span className="font-mono">{w.containerNo}</span> đang hoạt động ở Order{' '}
                <Link href={`/orders/${w.orderId}`} className="font-mono text-ink underline">
                  {w.orderNo}
                </Link>
                . Kiểm tra trước khi điều xe để không chạy trùng.
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {status ? (
        <Alert tone="ok" icon={<CircleCheck className="size-20" />}>
          {status}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-16 lg:grid-cols-5">
        <section
          aria-label="Thông tin chung"
          className="rounded-card border border-line bg-surface p-20 lg:col-span-3"
        >
          <dl className="grid grid-cols-1 gap-x-24 gap-y-12 sm:grid-cols-2">
            <Fact label="Khách hàng">{order.customerName}</Fact>
            <Fact label="Hãng tàu">{order.shippingLineName ?? '—'}</Fact>
            <Fact label="Tàu / chuyến">{order.vesselVoyage ?? '—'}</Fact>
            <Fact label="Cut-off">
              {order.cutOffAt ? (
                <DeadlineText at={order.cutOffAt} now={now} />
              ) : (
                <span className="text-ink-soft">—</span>
              )}
            </Fact>
            {order.eta ? <Fact label="ETA">{formatShortDateTime(order.eta)}</Fact> : null}
            <Fact label="Tuyến mặc định">{order.routeName}</Fact>
            <Fact label="Tiến độ">
              {delivered}/{active.length} container đã giao
            </Fact>
            <Fact label="Tạo lúc">{formatDateTime(order.createdAt)}</Fact>
            {order.customerRef ? (
              <Fact label="Số tham chiếu của khách">{order.customerRef}</Fact>
            ) : null}
            {order.cargoDescription ? <Fact label="Hàng hóa">{order.cargoDescription}</Fact> : null}
            {order.cancelReason ? <Fact label="Lý do hủy">{order.cancelReason}</Fact> : null}
          </dl>
        </section>

        <section
          aria-label="Tổng hợp tiền của Order"
          className="flex flex-col gap-12 rounded-card border border-line bg-surface p-20 lg:col-span-2"
        >
          <dl className="grid grid-cols-3 gap-12">
            <Money label="Doanh thu">
              {hasPrice ? (
                formatMoney(revenue.toFixed(2), order.currency)
              ) : (
                <span className="text-crit">Chưa có giá</span>
              )}
            </Money>
            <Money label="Chi phí">
              <span className="text-ink-soft">Chưa có chi phí</span>
            </Money>
            <Money label="Lãi lỗ">
              <span className="text-ink-soft">Chưa tính được</span>
            </Money>
          </dl>
          {Number(order.totalPassThroughAmount) > 0 ? (
            <p className="text-body-sm">
              Chi hộ thu lại của khách:{' '}
              <b className="font-semibold">
                {formatMoney(order.totalPassThroughAmount, order.currency)}
              </b>
            </p>
          ) : null}
          <p className="text-small text-ink-soft">
            Tổng của các container. Chi hộ không tính vào doanh thu. Chi phí và lãi lỗ có sau khi
            chuyến hoàn tất và phân bổ chi phí.
          </p>
          {unpriced.length > 0 ? (
            <p className="flex items-start gap-6 text-body-sm font-semibold text-warn">
              <CircleAlert className="mt-2 size-16 flex-none" aria-hidden="true" />
              Chưa gồm {unpriced.length} container chưa có giá:{' '}
              {unpriced.map((c) => c.containerNo ?? `dòng ${c.lineNo}`).join(', ')}
            </p>
          ) : null}
        </section>
      </div>

      <section
        aria-labelledby="containers-title"
        className="overflow-hidden rounded-card border border-line bg-surface"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-8 px-20 pb-12 pt-16">
          <h2 id="containers-title" className="text-section-title text-ink">
            Container trong Order ({active.length})
          </h2>
          <span className="text-small text-ink-soft">
            Container là đơn vị điều xe, tính giá, DEM/DET và ePOD. Chọn một dòng để xem chi tiết.
          </span>
        </div>
        {order.containers.length === 0 ? (
          <EmptyState
            icon={<CircleAlert className="size-24" />}
            title="Order này chưa có container"
            description="Hàng Xuất có thể để trống số cont, tài xế cập nhật khi lấy rỗng. Thêm ít nhất một dòng để điều xe."
            action={
              access.write && isOpen ? (
                <Button onClick={() => setAddOpen(true)}>Thêm container</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-table border-collapse">
              <caption className="sr-only">Container trong Order {order.orderNo}</caption>
              <thead>
                <tr>
                  {[
                    'Số cont',
                    'Loại',
                    'Trạng thái cont',
                    'Cảng / bãi',
                    'Hạn DEM',
                    'Hạn DET',
                    'Cước theo bảng giá',
                    'Xe · tài xế',
                    'ePOD',
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="whitespace-nowrap border-b border-line bg-surface-2 px-12 py-10 text-left text-caption text-ink-soft first:pl-20 last:pr-20"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.containers.map((c) => (
                  <tr
                    key={c.id}
                    className={cn('hover:bg-surface-2', selected?.id === c.id && 'bg-info-soft')}
                  >
                    <td className="border-b border-line px-12 py-10 align-top first:pl-20">
                      <button
                        type="button"
                        aria-pressed={selected?.id === c.id}
                        onClick={() => setSelectedId(c.id)}
                        className="min-h-hit cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 font-mono text-body-sm font-semibold text-ink underline"
                      >
                        {c.containerNo ?? `Dòng ${c.lineNo} (chưa có số)`}
                      </button>
                    </td>
                    <Td mono>{c.containerType}</Td>
                    <Td>
                      <ContainerStatusChip status={c.status} />
                    </Td>
                    <Td>
                      <PortReadinessCell value={c.portReadiness} />
                    </Td>
                    <Td>
                      <DeadlineText at={c.demFreeUntil} now={now} />
                    </Td>
                    <Td>
                      <DeadlineText at={c.detFreeUntil} now={now} />
                    </Td>
                    <Td>
                      <ContainerPrice container={c} />
                    </Td>
                    <Td>
                      <span className="whitespace-nowrap text-ink-soft">Chưa có xe</span>
                    </Td>
                    <Td last>
                      {c.isEpodVerified ? (
                        <span className="text-ok">Đã xác minh</span>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <ContainerPanel
          key={selected.id}
          order={detail.order}
          container={selected}
          stops={stops.filter((s) => s.orderContainerId === selected.id)}
          fees={fees.filter((f) => f.orderContainerId === selected.id)}
          access={access}
          busy={refreshing}
          onDone={(message) => {
            setStatus(message);
            refresh();
          }}
          onCancel={() => setDropTarget(selected)}
          onRemove={() => setRemoveTarget(selected)}
        />
      ) : null}

      <section
        aria-labelledby="history-title"
        className="rounded-card border border-line bg-surface p-20"
      >
        <h2 id="history-title" className="mb-8 text-section-title text-ink">
          Lịch sử thay đổi
        </h2>
        {history.length === 0 ? (
          <p className="text-ink-soft">Chưa có thay đổi nào được ghi.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {history.map((h) => (
              <li
                key={h.id}
                className="grid grid-cols-1 gap-4 border-b border-line py-10 last:border-0 sm:grid-cols-[auto_auto_1fr] sm:gap-16"
              >
                <span className="whitespace-nowrap font-mono text-small text-ink-soft">
                  {formatShortDateTime(h.at)}
                </span>
                <span className="whitespace-nowrap font-semibold">{h.who}</span>
                <span>{h.what}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AddContainersDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        detail={detail}
        routes={routes}
        onAdded={(message) => {
          setAddOpen(false);
          setStatus(message);
          refresh();
        }}
      />
      <CancelOrderDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        detail={detail}
        onCancelled={(message) => {
          setCancelOpen(false);
          setStatus(message);
          refresh();
        }}
      />
      <CancelContainerDialog
        container={dropTarget}
        detail={detail}
        onClose={() => setDropTarget(null)}
        onCancelled={(message) => {
          setDropTarget(null);
          setStatus(message);
          refresh();
        }}
      />
      <RemoveContainerDialog
        container={removeTarget}
        detail={detail}
        onClose={() => setRemoveTarget(null)}
        onRemoved={(message) => {
          setRemoveTarget(null);
          setSelectedId(null);
          setStatus(message);
          refresh();
        }}
      />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-small text-ink-soft">{label}</dt>
      <dd className="m-0 font-medium">{children}</dd>
    </div>
  );
}

function Money({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-small text-ink-soft">{label}</dt>
      <dd className="m-0 text-body-sm font-bold">{children}</dd>
    </div>
  );
}

function Td({
  children,
  mono,
  last,
}: {
  children: React.ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <td
      className={cn(
        'border-b border-line px-12 py-10 align-top text-body-sm',
        mono && 'font-mono',
        last && 'pr-20',
      )}
    >
      {children}
    </td>
  );
}

// ---------- Container đang chọn

function ContainerPanel({
  order,
  container,
  stops,
  fees,
  access,
  busy,
  onDone,
  onCancel,
  onRemove,
}: {
  order: OrderDetailDto['order'];
  container: ContainerDto;
  stops: StopDto[];
  fees: FeeDto[];
  access: OrderAccess;
  busy: boolean;
  onDone: (message: string) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ price?: string; reason?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const opened = OPEN_STATUSES.includes(order.status);
  const editable =
    opened &&
    ['PENDING', 'PLANNED', 'IN_PROGRESS'].includes(container.status) &&
    container.status !== 'CANCELLED';
  const surcharges = fees.filter((f) => f.feeCategory === 'REVENUE_SURCHARGE');
  const passThrough = fees.filter((f) => f.feeCategory === 'PASS_THROUGH');
  const hasAmountNow = container.priceState === 'set' || container.priceState === 'preview';
  const revenue = hasAmountNow
    ? sumMoney([container.priceAmount ?? '0', ...surcharges.map((f) => f.amount)])
    : null;
  const label = container.containerNo ?? `dòng ${container.lineNo}`;

  async function savePrice() {
    setErrors({});
    setSaving(true);
    try {
      const result = await setManualPrice({
        orderId: order.id,
        containerId: container.id,
        version: order.version,
        price,
        reason,
      });
      if (!result.ok) {
        setErrors({
          price: result.fieldErrors?.price?.[0],
          reason: result.fieldErrors?.reason?.[0],
          form: result.fieldErrors ? undefined : result.message,
        });
        return;
      }
      setPrice('');
      setReason('');
      onDone(`Đã lưu giá tay cho ${label}.`);
    } catch {
      setErrors({ form: 'Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="container-title"
      className="flex flex-col gap-20 rounded-card border border-line bg-surface p-20"
    >
      <div className="flex flex-wrap items-baseline gap-x-16 gap-y-4">
        <h2 id="container-title" className="text-section-title text-ink">
          Container{' '}
          <span className="font-mono">{container.containerNo ?? `dòng ${container.lineNo}`}</span>
        </h2>
        <span className="font-mono">{container.containerType}</span>
        <span className="text-small text-ink-soft">Seal {container.sealNo ?? '—'}</span>
        <span className="text-small text-ink-soft">Xe — Chưa có xe</span>
        <ContainerStatusChip status={container.status} />
        {access.write && editable ? (
          <span className="ml-auto flex flex-wrap gap-8">
            {order.status === 'DRAFT' &&
            container.status === 'PENDING' &&
            order.containers.length > 1 ? (
              <Button variant="secondary" size="sm" onClick={onRemove} disabled={busy}>
                <Trash2 className="size-18" aria-hidden="true" />
                Bớt container
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
              <XCircle className="size-18" aria-hidden="true" />
              Hủy container
            </Button>
          </span>
        ) : null}
      </div>

      {container.status === 'CANCELLED' ? (
        <Alert tone="warn" icon={<CircleAlert className="size-20" />}>
          Container đã hủy{container.cancelReason ? `. Lý do: ${container.cancelReason}` : ''}.
        </Alert>
      ) : null}

      {container.priceState === 'missing' ? (
        <div
          role="alert"
          className="flex flex-col gap-12 rounded-control bg-crit-soft p-16 text-crit"
        >
          <p className="flex items-start gap-8 font-semibold">
            <CircleAlert className="mt-2 size-20 flex-none" aria-hidden="true" />
            <span>
              Chưa có giá. Chưa tìm được bảng giá cho {container.containerType} và tuyến của
              container này vào ngày thực hiện. Nhập giá tay thì mới xác nhận Order và điều xe cho
              cont này được.
            </span>
          </p>
          {access.manualPrice && editable ? (
            <div className="flex flex-wrap items-start gap-12 text-ink">
              <div className="w-full max-w-form sm:w-auto sm:min-w-cell">
                <TextField
                  label="Cước nhập tay (₫)"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  error={errors.price}
                  hint="Ví dụ 3100000"
                />
              </div>
              <div className="w-full max-w-form flex-1 sm:min-w-cell-lg">
                <TextField
                  label="Lý do (bắt buộc)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  error={errors.reason}
                  placeholder="Ví dụ: giá báo khách qua email ngày 15/10"
                />
              </div>
              <Button onClick={savePrice} loading={saving} disabled={busy} className="mt-28">
                Lưu giá tay
              </Button>
            </div>
          ) : (
            <p className="text-body-sm text-ink">
              Vai trò của bạn không nhập được giá tay. Nhờ Điều vận, Kế toán hoặc Quản trị nhập giá.
            </p>
          )}
          {errors.form ? <p className="text-body-sm text-crit">{errors.form}</p> : null}
          <span className="text-small text-ink">
            Giá tay được ghi vào lịch sử kèm lý do. Không chấp nhận giá 0 ₫.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-32 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-12 lg:col-span-3">
          <h3 className="text-label text-ink">
            Chuỗi Stop{' '}
            <span className="font-normal text-ink-soft">
              · tự sinh theo chiều {ORDER_TYPE_LABELS[order.orderType]}
            </span>
          </h3>
          <ol className="m-0 flex list-none flex-col gap-12 p-0">
            {stops.map((s) => (
              <li key={s.id} className="flex gap-12">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-4 size-14 flex-none rounded-pill border-2 border-line-strong',
                    s.status === 'COMPLETED' && 'border-ok bg-ok',
                    s.status === 'SKIPPED' && 'bg-surface-2',
                  )}
                />
                <div className="min-w-0">
                  <div>
                    <span className="font-mono text-small">{s.stopType}</span>{' '}
                    <b className="font-semibold">{STOP_TYPE_LABELS[s.stopType]}</b>{' '}
                    <span className="text-ink-soft">{s.locationName}</span>
                  </div>
                  <div className="text-small text-ink-soft">
                    {s.windowStart
                      ? `Kế hoạch ${formatShortDateTime(s.windowStart)}`
                      : 'Chưa hẹn giờ'}{' '}
                    · {STOP_STATUS_LABELS[s.status]}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex min-w-0 flex-col gap-12 lg:col-span-2">
          <h3 className="text-label text-ink">Giá của container</h3>
          <dl className="m-0 flex flex-col">
            <PriceRow label={container.priceState === 'preview' ? 'Cước dự kiến' : 'Cước snapshot'}>
              {hasAmountNow ? (
                <>
                  {formatMoney(container.priceAmount ?? '0')}
                  <span className="block text-small font-normal text-ink-soft">
                    {container.priceState === 'preview'
                      ? 'Theo bảng giá, chốt khi xác nhận Order'
                      : container.isManualPrice
                        ? 'Giá tay'
                        : 'Theo bảng giá'}
                  </span>
                </>
              ) : (
                <span className="text-crit">Chưa có giá</span>
              )}
            </PriceRow>
            {surcharges.map((f) => (
              <PriceRow
                key={f.id}
                label={f.feeCode === 'CANCELLATION_FEE' ? 'Phí hủy' : `Phụ phí ${f.feeCode}`}
              >
                {formatMoney(f.amount)}
              </PriceRow>
            ))}
            <PriceRow label="Doanh thu cont" strong>
              {revenue ? formatMoney(revenue) : <span className="text-crit">Chưa tính được</span>}
            </PriceRow>
            <PriceRow label="Chi phí phân bổ">
              <span className="text-ink-soft">Chưa có chi phí</span>
            </PriceRow>
            <PriceRow label="Lãi lỗ cont" strong last>
              <span className="text-ink-soft">Chưa tính được</span>
            </PriceRow>
          </dl>
          <div className="rounded-control bg-surface-2 p-12 text-body-sm">
            <b className="font-semibold">Chi hộ</b>{' '}
            <span className="text-ink-soft">· thu lại của khách, không phải doanh thu</span>
            {passThrough.length === 0 ? (
              <p className="text-ink-soft">Chưa phát sinh</p>
            ) : (
              <ul className="m-0 mt-4 list-none p-0">
                {passThrough.map((f) => (
                  <li key={f.id} className="flex justify-between gap-12">
                    <span className="font-mono">{f.feeCode}</span>
                    <span>{formatMoney(f.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PriceRow({
  label,
  children,
  strong,
  last,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-12 py-8',
        !last && 'border-b border-line',
        strong && 'border-line-strong',
      )}
    >
      <dt className={cn('text-body-sm', strong && 'font-bold')}>{label}</dt>
      <dd className="m-0 text-right text-body-sm font-semibold">{children}</dd>
    </div>
  );
}

// ---------- Hộp thoại và ngăn kéo thao tác

function startedContainerIds(stops: StopDto[]) {
  return new Set(stops.filter((s) => s.status === 'COMPLETED').map((s) => s.orderContainerId));
}

function CancelContainerDialog({
  container,
  detail,
  onClose,
  onCancelled,
}: {
  container: ContainerDto | null;
  detail: OrderDetailDto;
  onClose: () => void;
  onCancelled: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [fee, setFee] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; fee?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const started = container ? startedContainerIds(detail.stops).has(container.id) : false;
  const label = container?.containerNo ?? `dòng ${container?.lineNo ?? ''}`;

  function reset() {
    setReason('');
    setFee('');
    setErrors({});
  }

  async function submit() {
    if (!container) return;
    setBusy(true);
    setErrors({});
    try {
      const result = await cancelContainer({
        orderId: detail.order.id,
        containerId: container.id,
        version: detail.order.version,
        reason,
        cancellationFee: fee.trim() || null,
      });
      if (!result.ok) {
        setErrors({
          reason: result.fieldErrors?.reason?.[0],
          fee: result.fieldErrors?.cancellationFee?.[0],
          form: result.fieldErrors ? undefined : result.message,
        });
        return;
      }
      reset();
      onCancelled(
        result.data.orderCancelled
          ? `Đã hủy ${label}. Order không còn container hoạt động nên đã chuyển sang Đã hủy.`
          : `Đã hủy ${label}. Order vẫn hoạt động với các container còn lại.`,
      );
    } catch {
      setErrors({ form: 'Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={container !== null}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Hủy container ${label}`}
      description={
        started
          ? 'Container đã lấy rỗng hoặc đã chạy một phần nên phải nhập phí hủy lớn hơn 0 và lý do.'
          : 'Chỉ hủy container này, Order và các container khác vẫn giữ nguyên. Chưa chạy nên không cần phí hủy.'
      }
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Không hủy
          </Button>
          <Button onClick={submit} loading={busy}>
            Hủy container
          </Button>
        </>
      }
    >
      <TextField
        label="Lý do hủy (bắt buộc)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={errors.reason}
      />
      {started ? (
        <TextField
          label="Phí hủy (₫, lớn hơn 0)"
          inputMode="numeric"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          error={errors.fee}
        />
      ) : null}
      {errors.form ? (
        <p role="alert" className="text-body-sm text-crit">
          {errors.form}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

function RemoveContainerDialog({
  container,
  detail,
  onClose,
  onRemoved,
}: {
  container: ContainerDto | null;
  detail: OrderDetailDto;
  onClose: () => void;
  onRemoved: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = container?.containerNo ?? `dòng ${container?.lineNo ?? ''}`;

  async function submit() {
    if (!container) return;
    setBusy(true);
    setError(null);
    try {
      const result = await removeContainer({
        orderId: detail.order.id,
        containerId: container.id,
        version: detail.order.version,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onRemoved(`Đã bớt ${label} khỏi Order.`);
    } catch {
      setError('Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={container !== null}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title={`Bớt container ${label}`}
      description="Xóa container này và các Stop của nó khỏi Order nháp. Container đã vào chuyến hoặc Order đã xác nhận thì hủy container thay vì bớt."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Giữ lại
          </Button>
          <Button onClick={submit} loading={busy}>
            Bớt container
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-body-sm text-crit">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

function CancelOrderDialog({
  open,
  onClose,
  detail,
  onCancelled,
}: {
  open: boolean;
  onClose: () => void;
  detail: OrderDetailDto;
  onCancelled: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [fees, setFees] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ reason?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const started = startedContainerIds(detail.stops);
  const startedContainers = detail.order.containers.filter(
    (c) => started.has(c.id) && ['PENDING', 'PLANNED', 'IN_PROGRESS'].includes(c.status),
  );

  async function submit() {
    setBusy(true);
    setError({});
    try {
      const result = await cancelOrder({
        id: detail.order.id,
        version: detail.order.version,
        reason,
        fees: startedContainers
          .filter((c) => fees[c.id]?.trim())
          .map((c) => ({ containerId: c.id, amount: fees[c.id]! })),
      });
      if (!result.ok) {
        setError({
          reason: result.fieldErrors?.reason?.[0],
          form:
            result.code === 'CANCEL_FEE_REQUIRED'
              ? `Container dòng ${result.details?.lines ?? ''} đã chạy một phần nên phải nhập phí hủy lớn hơn 0.`
              : result.fieldErrors
                ? undefined
                : result.message,
        });
        return;
      }
      setReason('');
      setFees({});
      onCancelled(
        result.data.orderCancelled
          ? `Đã hủy Order, ${result.data.cancelledCount} container đã hủy.`
          : `Đã hủy ${result.data.cancelledCount} container chưa giao. Order còn container đã giao nên giữ nguyên trạng thái.`,
      );
    } catch {
      setError({ form: 'Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Hủy Order ${detail.order.orderNo}`}
      description="Hủy mọi container chưa hoàn thành. Container đã giao không hủy được; Order chỉ chuyển sang Đã hủy khi không còn container nào hoạt động."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Không hủy
          </Button>
          <Button onClick={submit} loading={busy}>
            Hủy Order
          </Button>
        </>
      }
    >
      <TextField
        label="Lý do hủy (bắt buộc)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error.reason}
      />
      {startedContainers.map((c) => (
        <TextField
          key={c.id}
          label={`Phí hủy ${c.containerNo ?? `dòng ${c.lineNo}`} (₫, lớn hơn 0)`}
          inputMode="numeric"
          value={fees[c.id] ?? ''}
          onChange={(e) => setFees((prev) => ({ ...prev, [c.id]: e.target.value }))}
          hint="Container đã chạy một phần nên bắt buộc có phí hủy."
        />
      ))}
      {error.form ? (
        <p role="alert" className="text-body-sm text-crit">
          {error.form}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

function AddContainersDrawer({
  open,
  onClose,
  detail,
  routes,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  detail: OrderDetailDto;
  routes: { id: string; name: string }[];
  onAdded: (message: string) => void;
}) {
  const { order } = detail;
  const [rows, setRows] = useState<RowState[]>(() => [emptyRow()]);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existingNumbers = order.containers
    .filter((c) => isActiveContainer(c) && c.containerNo)
    .map((c) => c.containerNo!);
  const lastLine = order.containers.reduce((max, c) => Math.max(max, c.lineNo), 0);
  const withPrice = order.status !== 'DRAFT';

  function close() {
    setRows([emptyRow()]);
    setServerErrors({});
    setFormError(null);
    onClose();
  }

  async function submit() {
    const local = rowIssues(rows, order.orderType, existingNumbers);
    if (Object.keys(local).length > 0) {
      setFormError('Sửa các dòng báo lỗi rồi thêm lại.');
      return;
    }
    setBusy(true);
    setFormError(null);
    setServerErrors({});
    try {
      const result = await addContainers({
        id: order.id,
        version: order.version,
        containers: rowsToPayload(rows, { manualPrice: withPrice }),
      });
      if (!result.ok) {
        setServerErrors(result.fieldErrors ?? {});
        if (result.code === 'PRICE_MISSING') {
          const lines = String(result.details?.lines ?? '')
            .split(',')
            .map((n) => Number(n) - lastLine)
            .filter((n) => n > 0);
          setFormError(
            `Dòng ${lines.join(', ')} của bảng chưa có giá. Nhập giá tay kèm lý do ở cột Giá tay rồi thêm lại.`,
          );
        } else {
          setFormError(result.fieldErrors ? 'Sửa các ô báo lỗi rồi thêm lại.' : result.message);
        }
        return;
      }
      const warnings = result.data.warnings;
      setRows([emptyRow()]);
      onAdded(
        `Đã thêm ${result.data.addedCount} container.${
          warnings.length > 0
            ? ` Lưu ý: ${warnings.map((w) => `${w.containerNo} đang ở Order ${w.orderNo}`).join('; ')}.`
            : ''
        }`,
      );
    } catch {
      setFormError('Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Thêm container"
      description={
        withPrice
          ? 'Order đã xác nhận nên container mới được tra giá ngay. Chưa có bảng giá thì nhập giá tay.'
          : 'Order còn nháp: giá của container chốt khi xác nhận Order.'
      }
      className="max-w-none"
      footer={
        <>
          {formError ? (
            <p role="alert" className="mr-auto text-body-sm text-crit">
              {formError}
            </p>
          ) : null}
          <Button variant="secondary" onClick={close}>
            Đóng
          </Button>
          <Button onClick={submit} loading={busy}>
            Thêm vào Order
          </Button>
        </>
      }
    >
      <ContainerEntry
        orderType={order.orderType}
        rows={rows}
        onChange={setRows}
        routes={routes}
        serverErrors={serverErrors}
        existingNumbers={existingNumbers}
        allowManualPrice={withPrice}
        onEdited={() => setServerErrors({})}
      />
    </Drawer>
  );
}
