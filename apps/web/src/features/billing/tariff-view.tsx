'use client';

import {
  CircleAlert,
  CircleCheck,
  CircleOff,
  Clock,
  Info,
  Plus,
  RefreshCw,
  SearchX,
  Tags,
  Trash2,
  Lock,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { CONTAINER_TYPES, TRIP_MODES } from '@shared/enums';
import { CALC_BASIS_LABELS, FEE_CATEGORY_LABELS, TRIP_MODE_LABELS } from '@shared/labels';
import type { Result } from '@shared/result';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectField, TextField } from '@/components/ui/field';
import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import { StatusChip } from '@/components/ui/pill';
import {
  DataTable,
  MainCell,
  SubText,
  WorkTableCard,
  type Column,
} from '@/components/ui/work-table';
import { formatDate, formatMoney } from '@/lib/format';
import {
  closeTariff,
  deactivateTariff,
  listFeeTariffs,
  listFreightTariffs,
} from './tariff-actions';
import { TariffForm, type FormMode } from './tariff-form';
import {
  statusOf,
  type FeeDto,
  type FreightDto,
  type RefOption,
  type TariffAccess,
  type TariffDto,
  type TariffStatus,
} from './tariff-types';

// Màn danh sách giá cước / bảng phí + ngăn kéo form (task 03). Dữ liệu đầu do trang (server) nạp; lọc ở client;
// sau mỗi thay đổi nạp lại bằng Server Action list*. Nạp lại lỗi thì GIỮ dòng cũ + "Thử lại".
type Kind = 'freight' | 'fee';
type TabId = 'active' | 'upcoming' | 'ended' | 'all';

const ALL = '';
const COMMON = '__common__';

const COPY = {
  freight: {
    title: 'Giá cước',
    singular: 'giá cước',
    add: 'Thêm giá cước',
    save: 'Lưu giá cước',
    revise: 'Điều chỉnh giá',
    emptyReason:
      'Giá cước là số tiền thu khách theo tuyến, loại cont, chế độ chạy và khách. Thêm giá đầu tiên hoặc nhập từ Excel để tính cước khi tạo Order.',
  },
  fee: {
    title: 'Bảng phí',
    singular: 'phí',
    add: 'Thêm phí',
    save: 'Lưu phí',
    revise: 'Điều chỉnh phí',
    emptyReason:
      'Bảng phí gồm định mức chi phí, phụ phí và chi hộ theo tuyến, loại cont, chế độ chạy và khách. Thêm phí đầu tiên hoặc nhập từ Excel.',
  },
} as const;

const STATUS_VIEW: Record<
  TariffStatus,
  { tone: 'ok' | 'info' | 'off'; label: string; icon: React.ReactNode }
> = {
  active: { tone: 'ok', label: 'Đang hiệu lực', icon: <CircleCheck className="size-14" /> },
  upcoming: { tone: 'info', label: 'Sắp hiệu lực', icon: <Clock className="size-14" /> },
  expired: { tone: 'off', label: 'Hết hạn', icon: <CircleOff className="size-14" /> },
  inactive: { tone: 'off', label: 'Đã ngừng', icon: <CircleOff className="size-14" /> },
};

type Props = {
  kind: Kind;
  rows: TariffDto[];
  routes: RefOption[];
  customers: RefOption[];
  access: TariffAccess;
  /** Ngày hôm nay theo múi giờ công ty (YYYY-MM-DD), tính ở server. */
  today: string;
};

export function TariffView({ kind, rows: initialRows, routes, customers, access, today }: Props) {
  const copy = COPY[kind];
  const formId = useId();
  const [rows, setRows] = useState<TariffDto[]>(initialRows);
  const [reloadError, setReloadError] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [tab, setTab] = useState<TabId>('active');
  const [route, setRoute] = useState(ALL);
  const [containerType, setContainerType] = useState(ALL);
  const [tripMode, setTripMode] = useState(ALL);
  const [customer, setCustomer] = useState(ALL);
  const [drawer, setDrawer] = useState<{ row: TariffDto | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null);
  const [closeDate, setCloseDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const routeName = (id: string | null) => routes.find((r) => r.id === id)?.name ?? null;
  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? null;

  async function reload() {
    setReloading(true);
    try {
      const result: Result<TariffDto[]> = await (kind === 'freight'
        ? listFreightTariffs({})
        : listFeeTariffs({}));
      if (result.ok) {
        setRows(result.data);
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

  // Bộ lọc 4 chiều (không gồm tab trạng thái): đếm tab theo cùng bộ lọc.
  const byDimension = useMemo(
    () =>
      rows.filter((r) => {
        if (route === COMMON ? r.routeId !== null : route !== ALL && r.routeId !== route)
          return false;
        if (containerType !== ALL && r.containerType !== containerType) return false;
        if (tripMode !== ALL && r.tripMode !== tripMode) return false;
        if (customer === COMMON) return r.customerId === null;
        return customer === ALL || r.customerId === customer;
      }),
    [rows, route, containerType, tripMode, customer],
  );

  const tabOf = (r: TariffDto): Exclude<TabId, 'all'> => {
    const s = statusOf(r, today);
    return s === 'active' ? 'active' : s === 'upcoming' ? 'upcoming' : 'ended';
  };
  const tabs: FilterTab[] = [
    {
      id: 'active',
      label: 'Đang hiệu lực',
      count: byDimension.filter((r) => tabOf(r) === 'active').length,
    },
    {
      id: 'upcoming',
      label: 'Sắp hiệu lực',
      count: byDimension.filter((r) => tabOf(r) === 'upcoming').length,
    },
    {
      id: 'ended',
      label: 'Hết hiệu lực',
      count: byDimension.filter((r) => tabOf(r) === 'ended').length,
    },
    { id: 'all', label: 'Tất cả', count: byDimension.length },
  ];
  const visible = byDimension.filter((r) => tab === 'all' || tabOf(r) === tab);
  const hasFilter = route !== ALL || containerType !== ALL || tripMode !== ALL || customer !== ALL;

  // Chế độ của ngăn kéo theo trạng thái bản ghi và quyền người dùng.
  function modeOf(row: TariffDto | null): FormMode {
    if (!row) return 'create';
    const s = statusOf(row, today);
    if (s === 'upcoming' && access.write) return 'edit';
    if (s === 'active' && access.editActive) return 'revise';
    return 'view';
  }
  const mode = drawer ? modeOf(drawer.row) : 'view';
  const row = drawer?.row ?? null;

  function closeDrawer() {
    setDrawer(null);
  }

  async function afterSaved(message: string) {
    closeDrawer();
    setStatus(message);
    await reload();
  }

  async function runConfirm() {
    if (!row || !confirm) return;
    setBusy(true);
    setConfirmError(null);
    try {
      const result =
        confirm === 'close'
          ? await closeTariff({ kind, id: row.id, validTo: closeDate })
          : await deactivateTariff({ kind, id: row.id });
      if (!result.ok) {
        setConfirmError(result.message);
        return;
      }
      setConfirm(null);
      closeDrawer();
      setStatus(
        confirm === 'close'
          ? `Đã đóng ${copy.singular} đến hết ngày ${formatDate(closeDate)}.`
          : `Đã xóa ${copy.singular} chưa hiệu lực.`,
      );
      await reload();
    } catch {
      setConfirmError('Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const validity = (r: TariffDto) => (
    <>
      <span className="block whitespace-nowrap">{formatDate(r.validFrom)}</span>
      <SubText>{r.validTo ? `đến ${formatDate(r.validTo)}` : 'Vô thời hạn'}</SubText>
    </>
  );
  const statusCell = (r: TariffDto) => {
    const view = STATUS_VIEW[statusOf(r, today)];
    return (
      <StatusChip tone={view.tone} icon={view.icon}>
        {view.label}
      </StatusChip>
    );
  };
  const customerCell = (r: TariffDto) => {
    const name = customerName(r.customerId);
    return r.customerId === null ? (
      <SubText>{kind === 'freight' ? 'Giá chung' : 'Phí chung'}</SubText>
    ) : (
      (name ?? <SubText>Khách không còn</SubText>)
    );
  };

  const lead: Column<TariffDto>[] =
    kind === 'freight'
      ? [
          {
            id: 'route',
            header: 'Tuyến',
            cell: (r) => <MainCell>{routeName(r.routeId) ?? 'Tuyến không còn'}</MainCell>,
          },
          {
            id: 'type',
            header: 'Loại cont',
            cell: (r) => <span className="font-mono">{r.containerType}</span>,
          },
          { id: 'mode', header: 'Chế độ chạy', cell: (r) => TRIP_MODE_LABELS[r.tripMode] },
          { id: 'customer', header: 'Khách', cell: customerCell },
          {
            id: 'price',
            header: 'Giá cước',
            cell: (r) => (
              <>
                <MainCell>{formatMoney((r as FreightDto).basePrice, r.currency)}</MainCell>
                <SubText>VAT {Number(r.vatRatePercent ?? 0)}%</SubText>
              </>
            ),
          },
        ]
      : [
          {
            id: 'fee',
            header: 'Mã phí',
            cell: (r) => (
              <>
                <MainCell mono>{(r as FeeDto).feeCode}</MainCell>
                <SubText>{(r as FeeDto).feeName}</SubText>
              </>
            ),
          },
          {
            id: 'route',
            header: 'Tuyến',
            cell: (r) =>
              r.routeId === null ? (
                <SubText>Mọi tuyến</SubText>
              ) : (
                (routeName(r.routeId) ?? <SubText>Tuyến không còn</SubText>)
              ),
          },
          {
            id: 'type',
            header: 'Loại cont',
            cell: (r) => <span className="font-mono">{r.containerType}</span>,
          },
          { id: 'mode', header: 'Chế độ chạy', cell: (r) => TRIP_MODE_LABELS[r.tripMode] },
          { id: 'customer', header: 'Khách', cell: customerCell },
          {
            id: 'amount',
            header: 'Số tiền',
            cell: (r) => {
              const f = r as FeeDto;
              return f.isExcluded ? (
                <StatusChip tone="info" icon={<Info className="size-14" />}>
                  Miễn phí
                </StatusChip>
              ) : (
                <>
                  <MainCell>{formatMoney(f.amount, f.currency)}</MainCell>
                  <SubText>
                    {FEE_CATEGORY_LABELS[f.feeCategory]} · {CALC_BASIS_LABELS[f.calcBasis]}
                  </SubText>
                </>
              );
            },
          },
        ];

  const columns: Column<TariffDto>[] = [
    ...lead,
    { id: 'validity', header: 'Hiệu lực', cell: validity },
    { id: 'status', header: 'Trạng thái', cell: statusCell },
    {
      id: 'action',
      header: 'Thao tác',
      srOnlyHeader: true,
      cell: (r) => {
        const m = modeOf(r);
        const label = m === 'edit' ? 'Sửa' : m === 'revise' ? 'Điều chỉnh' : 'Xem';
        const code = kind === 'fee' ? (r as FeeDto).feeCode : r.containerType;
        return (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDrawer({ row: r })}
            aria-label={`${label} ${copy.singular} ${code} ${routeName(r.routeId) ?? ''} hiệu lực từ ${formatDate(r.validFrom)}`}
          >
            {label}
          </Button>
        );
      },
    },
  ];

  const dimensionFilters = (
    <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
      <SelectField
        label="Tuyến"
        value={route}
        onChange={(e) => setRoute(e.target.value)}
        options={[
          ...(kind === 'fee' ? [{ value: COMMON, label: 'Phí mọi tuyến' }] : []),
          ...routes.map((r) => ({ value: r.id, label: r.name })),
        ]}
        placeholder="Tất cả tuyến"
      />
      <SelectField
        label="Loại cont"
        value={containerType}
        onChange={(e) => setContainerType(e.target.value)}
        options={CONTAINER_TYPES.map((v) => ({ value: v, label: v }))}
        placeholder="Tất cả loại cont"
      />
      <SelectField
        label="Chế độ chạy"
        value={tripMode}
        onChange={(e) => setTripMode(e.target.value)}
        options={TRIP_MODES.map((v) => ({ value: v, label: TRIP_MODE_LABELS[v] }))}
        placeholder="Tất cả chế độ"
      />
      <SelectField
        label="Khách hàng"
        value={customer}
        onChange={(e) => setCustomer(e.target.value)}
        options={[
          { value: COMMON, label: kind === 'freight' ? 'Giá chung' : 'Phí chung' },
          ...customers.map((c) => ({ value: c.id, label: c.name })),
        ]}
        placeholder="Tất cả khách"
      />
    </div>
  );

  const toolbar = (
    <div className="flex flex-col gap-12">
      <div className="flex flex-wrap items-center justify-between gap-12">
        <FilterTabs
          label={`Lọc ${copy.singular} theo hiệu lực`}
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
        />
        {access.write ? (
          <Button size="sm" onClick={() => setDrawer({ row: null })}>
            <Plus className="size-18" aria-hidden="true" />
            {copy.add}
          </Button>
        ) : null}
      </div>
      {dimensionFilters}
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
      Không tải lại được danh sách. Đang hiện dữ liệu đã tải trước đó, có thể chưa mới nhất.
    </Alert>
  ) : null;

  const footer =
    status ??
    (rows.length === 0
      ? `Chưa có ${copy.singular} nào`
      : `Hiện ${visible.length} trên ${rows.length} ${copy.singular}`);
  const drawerTitle =
    mode === 'create'
      ? copy.add
      : mode === 'edit'
        ? `Sửa ${copy.singular}`
        : mode === 'revise'
          ? copy.revise
          : `Chi tiết ${copy.singular}`;

  return (
    <>
      <WorkTableCard
        title={copy.title}
        meta={`${rows.length} ${copy.singular}`}
        toolbar={toolbar}
        alert={alert}
        footer={footer}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Tags className="size-24" />}
            title={`Chưa có ${copy.singular} nào`}
            description={copy.emptyReason}
            action={
              access.write ? (
                <Button onClick={() => setDrawer({ row: null })}>
                  <Plus className="size-20" aria-hidden="true" />
                  {copy.add}
                </Button>
              ) : undefined
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-24" />}
            title="Không có kết quả phù hợp"
            description={`Không có ${copy.singular} nào khớp bộ lọc hoặc nhóm hiệu lực đang chọn. Chọn "Tất cả" hoặc bỏ bộ lọc để xem thêm.`}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setTab('all');
                  setRoute(ALL);
                  setContainerType(ALL);
                  setTripMode(ALL);
                  setCustomer(ALL);
                }}
              >
                {hasFilter ? 'Bỏ bộ lọc và xem tất cả' : 'Xem tất cả'}
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(r) => r.id}
            caption={`Danh sách ${copy.singular}`}
          />
        )}
      </WorkTableCard>

      <Drawer
        open={drawer !== null}
        onClose={closeDrawer}
        title={drawerTitle}
        description={
          mode === 'view' && row && statusOf(row, today) === 'active'
            ? 'Giá đang hiệu lực: chỉ Quản trị điều chỉnh được.'
            : undefined
        }
        footer={
          <>
            {mode === 'edit' ? (
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  setConfirmError(null);
                  setConfirm('delete');
                }}
              >
                <Trash2 className="size-18" aria-hidden="true" />
                Xóa {copy.singular}
              </Button>
            ) : null}
            {mode === 'revise' ? (
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  setConfirmError(null);
                  setCloseDate(today);
                  setConfirm('close');
                }}
              >
                <Lock className="size-18" aria-hidden="true" />
                Đóng {copy.singular}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={closeDrawer}>
              {mode === 'view' ? 'Đóng' : 'Hủy'}
            </Button>
            {mode !== 'view' ? (
              <Button type="submit" form={formId} loading={saving}>
                {mode === 'revise' ? copy.revise : copy.save}
              </Button>
            ) : null}
          </>
        }
      >
        {drawer ? (
          <TariffForm
            kind={kind}
            formId={formId}
            mode={mode}
            row={drawer.row}
            routes={routes}
            customers={customers}
            today={today}
            onSaving={setSaving}
            onSaved={afterSaved}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'close' ? `Đóng ${copy.singular}?` : `Xóa ${copy.singular}?`}
        description={
          confirm === 'close'
            ? `${copy.title} sẽ hết hiệu lực sau ngày bạn chọn. Dữ liệu vẫn giữ để các đơn đã tính truy vết được.`
            : `${copy.title} chưa có hiệu lực sẽ bị ngừng dùng và không còn xuất hiện khi tra giá.`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Giữ lại
            </Button>
            <Button onClick={runConfirm} loading={busy}>
              {confirm === 'close' ? `Đóng ${copy.singular}` : `Xóa ${copy.singular}`}
            </Button>
          </>
        }
      >
        {confirm === 'close' ? (
          <TextField
            label="Hiệu lực đến hết ngày"
            type="date"
            value={closeDate}
            min={today}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        ) : null}
        {confirmError ? (
          <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
            {confirmError}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
