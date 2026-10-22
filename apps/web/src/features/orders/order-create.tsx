'use client';

import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ORDER_TYPES, type OrderType } from '@shared/enums';
import { ORDER_TYPE_LABELS } from '@shared/labels';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { vnLocalToIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { createOrder } from './actions';
import {
  ContainerEntry,
  emptyRow,
  rowIssues,
  rowsToPayload,
  type RowState,
} from './container-rows';

// Màn tạo Order (Screen04): thông tin chung, địa điểm của các Stop, ô dán danh sách số cont và bảng dòng container.
// Check digit ISO 6346 báo ngay dưới ô khi gõ; lỗi từ server hiện dưới đúng ô. Tạo xong chuyển sang chi tiết Order.
type Option = { id: string; name: string };
type LocationOption = Option & {
  type: 'PORT' | 'DEPOT' | 'WAREHOUSE' | 'FUEL_STATION' | 'GARAGE' | 'PARKING';
};

type Props = {
  customers: Option[];
  shippingLines: Option[];
  routes: Option[];
  locations: LocationOption[];
  /** Tuyến đã cấu hình chuỗi Stop nội địa (mẫu có ít nhất một Stop). */
  domesticRouteIds: string[];
};

const PICKUP_TYPES = ['PORT', 'DEPOT', 'PARKING'];
const CARGO_TYPES = ['WAREHOUSE', 'DEPOT', 'PORT'];

export function OrderCreate({
  customers,
  shippingLines,
  routes,
  locations,
  domesticRouteIds,
}: Props) {
  const router = useRouter();
  const [orderType, setOrderType] = useState<OrderType>('IMPORT');
  const [customerId, setCustomerId] = useState('');
  const [bookingOrBlNo, setBookingOrBlNo] = useState('');
  const [shippingLineId, setShippingLineId] = useState('');
  const [vesselVoyage, setVesselVoyage] = useState('');
  const [eta, setEta] = useState('');
  const [cutOffAt, setCutOffAt] = useState('');
  const [customerRef, setCustomerRef] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [routeId, setRouteId] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [cargoLocationId, setCargoLocationId] = useState('');
  const [dropLocationId, setDropLocationId] = useState('');
  const [firstStopAt, setFirstStopAt] = useState('');
  const [rows, setRows] = useState<RowState[]>(() => [emptyRow()]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const err = (field: string) => errors[field]?.[0];
  const clear = (field: string) =>
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  const optionsOf = (types: string[]) =>
    locations.filter((l) => types.includes(l.type)).map((l) => ({ value: l.id, label: l.name }));
  const domesticMissing =
    orderType === 'DOMESTIC' && routeId !== '' && !domesticRouteIds.includes(routeId);

  async function submit() {
    setBanner(null);
    const local = rowIssues(rows, orderType);
    if (Object.keys(local).length > 0) {
      setBanner('Sửa các dòng container báo lỗi rồi tạo Order.');
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const result = await createOrder({
        customerId,
        orderType,
        bookingOrBlNo,
        shippingLineId: shippingLineId || null,
        vesselVoyage,
        eta: vnLocalToIso(eta),
        cutOffAt: vnLocalToIso(cutOffAt),
        customerRef,
        routeId,
        cargoDescription,
        pickupLocationId: pickupLocationId || null,
        cargoLocationId: cargoLocationId || null,
        dropLocationId: dropLocationId || null,
        firstStopAt: vnLocalToIso(firstStopAt),
        containers: rowsToPayload(rows),
      });
      if (!result.ok) {
        const fields = { ...(result.fieldErrors ?? {}) };
        // Lỗi nghiệp vụ gắn với một ô (vd. tuyến chưa có mẫu Stop nội địa): hiện dưới ô đó.
        const field = result.details?.field;
        if (typeof field === 'string' && !fields[field]) fields[field] = [result.message];
        setErrors(fields);
        setBanner(
          Object.keys(fields).length > 0 ? 'Sửa các ô báo lỗi rồi tạo Order.' : result.message,
        );
        return;
      }
      router.push(`/orders/${result.data.id}?created=1`);
    } catch {
      setBanner('Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-24"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div>
        <Link
          href="/orders"
          className="inline-flex min-h-hit items-center text-ink-soft no-underline hover:text-ink"
        >
          Đơn hàng
        </Link>
        <h1 className="text-screen-title text-ink">Tạo Order</h1>
        <p className="mt-4 text-ink-soft">
          Mỗi Order ứng với một Booking hoặc B/L và gồm nhiều container. Hệ thống tự sinh chuỗi Stop
          cho từng container; giá chốt khi xác nhận Order.
        </p>
      </div>

      {banner ? (
        <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
          {banner}
        </Alert>
      ) : null}

      <section
        aria-labelledby="general-title"
        className="rounded-card border border-line bg-surface p-20"
      >
        <h2 id="general-title" className="mb-16 text-section-title text-ink">
          Thông tin chung
        </h2>
        <div className="grid grid-cols-1 gap-16 md:grid-cols-2 lg:grid-cols-3">
          <fieldset className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
            <legend className="mb-6 text-label text-ink">Chiều</legend>
            <div className="flex gap-6">
              {ORDER_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={orderType === value}
                  onClick={() => {
                    setOrderType(value);
                    clear('routeId');
                  }}
                  className={cn(
                    'inline-flex h-button flex-1 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-surface px-14 text-button text-ink transition-colors duration-150 hover:bg-surface-2',
                    orderType === value && 'border-ink bg-ink text-surface hover:bg-ink',
                  )}
                >
                  {ORDER_TYPE_LABELS[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <SelectField
            label="Khách hàng"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              clear('customerId');
            }}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Chọn khách hàng"
            error={err('customerId')}
          />
          <TextField
            label={orderType === 'IMPORT' ? 'Số B/L' : 'Số Booking'}
            value={bookingOrBlNo}
            onChange={(e) => {
              setBookingOrBlNo(e.target.value);
              clear('bookingOrBlNo');
            }}
            error={err('bookingOrBlNo')}
            autoComplete="off"
            className="font-mono"
            maxLength={50}
          />
          <SelectField
            label="Hãng tàu"
            value={shippingLineId}
            onChange={(e) => setShippingLineId(e.target.value)}
            options={shippingLines.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="Chưa chọn hãng tàu"
            error={err('shippingLineId')}
          />
          <TextField
            label="Tàu / chuyến"
            value={vesselVoyage}
            onChange={(e) => setVesselVoyage(e.target.value)}
            error={err('vesselVoyage')}
            maxLength={100}
          />
          {orderType === 'EXPORT' ? (
            <TextField
              label="Cut-off"
              type="datetime-local"
              value={cutOffAt}
              onChange={(e) => setCutOffAt(e.target.value)}
              error={err('cutOffAt')}
              hint="Hạn hạ container tại cảng, theo giờ Việt Nam."
            />
          ) : (
            <TextField
              label="ETA"
              type="datetime-local"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              error={err('eta')}
              hint="Giờ tàu dự kiến cập, theo giờ Việt Nam."
            />
          )}
          <SelectField
            label="Tuyến mặc định"
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value);
              clear('routeId');
            }}
            options={routes.map((r) => ({ value: r.id, label: r.name }))}
            placeholder="Chọn tuyến"
            error={
              err('routeId') ??
              (domesticMissing
                ? 'Tuyến này chưa cấu hình chuỗi Stop nội địa. Cấu hình ở Danh mục, mục Tuyến.'
                : undefined)
            }
          />
          <TextField
            label="Số tham chiếu của khách"
            value={customerRef}
            onChange={(e) => setCustomerRef(e.target.value)}
            error={err('customerRef')}
            maxLength={100}
          />
          <TextField
            label="Mô tả hàng"
            value={cargoDescription}
            onChange={(e) => setCargoDescription(e.target.value)}
            error={err('cargoDescription')}
            maxLength={255}
          />
        </div>
        {domesticMissing ? (
          <p className="mt-12 text-small text-ink-soft">
            Đơn Nội địa sinh Stop theo mẫu của tuyến.{' '}
            <Link href="/master-data/routes" className="text-ink underline">
              Mở danh mục Tuyến để cấu hình
            </Link>
            .
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="stops-title"
        className="rounded-card border border-line bg-surface p-20"
      >
        <h2 id="stops-title" className="text-section-title text-ink">
          Địa điểm và giờ hẹn của các Stop
        </h2>
        <p className="mb-16 mt-4 text-small text-ink-soft">
          Không bắt buộc. Bỏ trống thì Stop lấy tên khu vực của tuyến, Điều vận chọn địa điểm sau.
          Giờ hẹn Stop đầu dùng để chọn bảng giá theo ngày thực hiện.
        </p>
        <div className="grid grid-cols-1 gap-16 md:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Điểm lấy"
            value={pickupLocationId}
            onChange={(e) => setPickupLocationId(e.target.value)}
            options={optionsOf(PICKUP_TYPES)}
            placeholder="Theo khu vực của tuyến"
            error={err('pickupLocationId')}
          />
          <SelectField
            label="Điểm đóng hoặc dỡ hàng"
            value={cargoLocationId}
            onChange={(e) => setCargoLocationId(e.target.value)}
            options={optionsOf(CARGO_TYPES)}
            placeholder="Theo khu vực của tuyến"
            error={err('cargoLocationId')}
          />
          <SelectField
            label="Điểm hạ hoặc trả"
            value={dropLocationId}
            onChange={(e) => setDropLocationId(e.target.value)}
            options={optionsOf(PICKUP_TYPES)}
            placeholder="Theo khu vực của tuyến"
            error={err('dropLocationId')}
          />
          <TextField
            label="Hẹn Stop đầu"
            type="datetime-local"
            value={firstStopAt}
            onChange={(e) => setFirstStopAt(e.target.value)}
            error={err('firstStopAt')}
          />
        </div>
      </section>

      <section
        aria-labelledby="containers-title"
        className="rounded-card border border-line bg-surface p-20"
      >
        <h2 id="containers-title" className="text-section-title text-ink">
          Container
        </h2>
        <p className="mb-16 mt-4 text-small text-ink-soft">
          {orderType === 'IMPORT'
            ? 'Hàng Nhập phải có số container.'
            : 'Hàng Xuất và Nội địa có thể để trống số container, cập nhật khi lấy rỗng.'}
        </p>
        <ContainerEntry
          orderType={orderType}
          rows={rows}
          onChange={setRows}
          routes={routes}
          serverErrors={errors}
          onEdited={(index) =>
            setErrors((prev) => {
              const next = { ...prev };
              for (const key of Object.keys(next)) {
                if (key.startsWith(`containers.${index}.`)) delete next[key];
              }
              return next;
            })
          }
        />
        {err('containers') ? (
          <p role="alert" className="mt-12 text-body-sm text-crit">
            {err('containers')}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-12">
        <Link href="/orders" className={buttonClass({ variant: 'secondary' })}>
          Hủy
        </Link>
        <Button type="submit" loading={busy}>
          Tạo Order
        </Button>
      </div>
    </form>
  );
}
