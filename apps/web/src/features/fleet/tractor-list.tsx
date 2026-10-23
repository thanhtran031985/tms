'use client';

import {
  CheckCircle,
  CircleAlert,
  Clock,
  Plus,
  RefreshCw,
  SearchX,
  Trash2,
  Truck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { TextField } from '@/components/ui/field';
import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { DataTable, WorkTableCard, type Column } from '@/components/ui/work-table';
import { createTractor, listTractors, softDeleteTractor, updateTractor } from './actions';
import { ExpiryCell } from './date-helpers';
import { isSystemStatus, SYSTEM_STATUS_LABELS, type FleetAccess, type TractorDto } from './types';

const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone; icon: typeof CheckCircle }> =
  {
    AVAILABLE: { label: 'Sẵn sàng', tone: 'ok', icon: CheckCircle },
    IN_USE: { label: 'Đang chạy', tone: 'info', icon: Clock },
    MAINTENANCE: { label: 'Bảo dưỡng', tone: 'crit', icon: Wrench },
    INACTIVE: { label: 'Tạm ngưng', tone: 'off', icon: XCircle },
  };

function TractorForm({
  formId,
  row,
  readOnly,
  onSaving,
  onSaved,
}: {
  formId: string;
  row: TractorDto | null;
  readOnly: boolean;
  onSaving: (saving: boolean) => void;
  onSaved: (msg: string) => void;
}) {
  const [plateNumber, setPlateNumber] = useState(row?.plateNumber ?? '');
  const [model, setModel] = useState(row?.model ?? '');
  const [ownership, setOwnership] = useState<'OWNED' | 'LEASED'>(row?.ownership ?? 'OWNED');
  const [fuelNorm, setFuelNorm] = useState(row?.fuelNormLitersPer100km ?? '35.00');
  const [odometer, setOdometer] = useState(String(row?.currentOdometer ?? 0));
  const [regExpiry, setRegExpiry] = useState(row?.registrationExpiry ?? '');
  const [insExpiry, setInsExpiry] = useState(row?.insuranceExpiry ?? '');
  const [badgeExpiry, setBadgeExpiry] = useState(row?.transportBadgeExpiry ?? '');
  const [permittedWeight, setPermittedWeight] = useState(
    row?.permittedGrossWeightTons ? String(Number(row.permittedGrossWeightTons)) : '',
  );
  const [status, setStatus] = useState(row?.status ?? 'AVAILABLE');
  const systemStatus = isSystemStatus(row?.status);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSaving(true);
    setErrors({});
    setBanner(null);

    const payload = {
      plateNumber: plateNumber.trim().toUpperCase(),
      model: model.trim() || null,
      ownership,
      fuelNormLitersPer100km: fuelNorm.trim(),
      currentOdometer: Number(odometer) || 0,
      registrationExpiry: regExpiry || null,
      insuranceExpiry: insExpiry || null,
      transportBadgeExpiry: badgeExpiry || null,
      permittedGrossWeightTons: permittedWeight.trim() || null,
      // Trạng thái hệ thống (đang chạy) không gửi lên để khỏi ghi đè.
      ...(systemStatus ? {} : { status: status as 'AVAILABLE' | 'MAINTENANCE' | 'INACTIVE' }),
    };

    try {
      if (row) {
        const res = await updateTractor({ id: row.id, ...payload });
        if (res.ok) {
          onSaved(`Đã cập nhật đầu kéo ${payload.plateNumber}.`);
        } else {
          setBanner(res.message);
        }
      } else {
        const res = await createTractor(payload);
        if (res.ok) {
          onSaved(`Đã tạo đầu kéo ${payload.plateNumber}.`);
        } else {
          if (res.code === 'DUPLICATE_CODE') {
            setErrors({ plateNumber: res.message });
          } else {
            setBanner(res.message);
          }
        }
      }
    } catch {
      setBanner('Lỗi kết nối mạng. Vui lòng thử lại.');
    } finally {
      onSaving(false);
    }
  }

  return (
    <form id={formId} noValidate className="flex flex-col gap-16" onSubmit={handleSubmit}>
      {banner ? (
        <Alert tone="crit" icon={<CircleAlert className="size-16" />}>
          {banner}
        </Alert>
      ) : null}

      <TextField
        label="Biển số xe"
        required
        value={plateNumber}
        disabled={readOnly}
        placeholder="vd: 51C-482.17"
        className="font-mono uppercase"
        error={errors.plateNumber}
        onChange={(e) => setPlateNumber(e.target.value)}
      />

      <TextField
        label="Model xe"
        value={model}
        disabled={readOnly}
        placeholder="vd: Hino 700, Hyundai Xcient"
        onChange={(e) => setModel(e.target.value)}
      />

      <div className="flex flex-col gap-6">
        <label className="text-small font-semibold text-ink">Hình thức sở hữu</label>
        <div className="flex gap-12">
          <label className="flex items-center gap-6 text-body-sm">
            <input
              type="radio"
              name="ownership"
              value="OWNED"
              checked={ownership === 'OWNED'}
              disabled={readOnly}
              onChange={() => setOwnership('OWNED')}
            />
            Xe sở hữu
          </label>
          <label className="flex items-center gap-6 text-body-sm">
            <input
              type="radio"
              name="ownership"
              value="LEASED"
              checked={ownership === 'LEASED'}
              disabled={readOnly}
              onChange={() => setOwnership('LEASED')}
            />
            Xe thuê ngoài
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-12">
        <TextField
          label="Định mức dầu (L/100km)"
          required
          type="number"
          step="0.1"
          value={fuelNorm}
          disabled={readOnly}
          onChange={(e) => setFuelNorm(e.target.value)}
        />
        <TextField
          label="Km hiện tại (Odometer)"
          type="number"
          value={odometer}
          disabled={readOnly}
          onChange={(e) => setOdometer(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-12">
        <TextField
          label="Hạn đăng kiểm"
          type="date"
          value={regExpiry}
          disabled={readOnly}
          onChange={(e) => setRegExpiry(e.target.value)}
        />
        <TextField
          label="Hạn bảo hiểm TNDS"
          type="date"
          value={insExpiry}
          disabled={readOnly}
          onChange={(e) => setInsExpiry(e.target.value)}
        />
        <TextField
          label="Hạn phù hiệu xe"
          type="date"
          value={badgeExpiry}
          disabled={readOnly}
          onChange={(e) => setBadgeExpiry(e.target.value)}
        />
      </div>

      <TextField
        label="Khối lượng kéo theo cho phép (tấn)"
        type="number"
        step="0.01"
        value={permittedWeight}
        disabled={readOnly}
        placeholder="vd: 40.00"
        onChange={(e) => setPermittedWeight(e.target.value)}
      />

      <div className="flex flex-col gap-6">
        <label className="text-small font-semibold text-ink">Trạng thái xe</label>
        <select
          value={status}
          disabled={readOnly || systemStatus}
          className="h-control rounded-control border border-line bg-surface px-12 text-body-sm"
          onChange={(e) => setStatus(e.target.value as TractorDto['status'])}
        >
          {systemStatus ? (
            <option value={status}>{SYSTEM_STATUS_LABELS[status]} (hệ thống tự cập nhật)</option>
          ) : null}
          <option value="AVAILABLE">Sẵn sàng</option>
          <option value="MAINTENANCE">Bảo dưỡng</option>
          <option value="INACTIVE">Tạm ngưng hoạt động</option>
        </select>
      </div>
    </form>
  );
}

export function TractorList({
  initialRows,
  access,
}: {
  initialRows: TractorDto[];
  access: FleetAccess;
}) {
  const formId = useId();
  const [rows, setRows] = useState(initialRows);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [drawer, setDrawer] = useState<{ row: TractorDto | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TractorDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canWrite = access === 'write';

  async function reload() {
    setReloading(true);
    try {
      const res = await listTractors({});
      if (res.ok) {
        setRows(res.data);
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

  const counts = useMemo(() => {
    return {
      all: rows.length,
      AVAILABLE: rows.filter((r) => r.status === 'AVAILABLE').length,
      MAINTENANCE: rows.filter((r) => r.status === 'MAINTENANCE').length,
      IN_USE: rows.filter((r) => r.status === 'IN_USE').length,
      INACTIVE: rows.filter((r) => r.status === 'INACTIVE').length,
    };
  }, [rows]);

  const tabs: FilterTab[] = [
    { id: 'all', label: 'Tất cả', count: counts.all },
    { id: 'AVAILABLE', label: 'Sẵn sàng', count: counts.AVAILABLE },
    { id: 'MAINTENANCE', label: 'Bảo dưỡng', count: counts.MAINTENANCE },
    { id: 'IN_USE', label: 'Đang chạy', count: counts.IN_USE },
    { id: 'INACTIVE', label: 'Tạm ngưng', count: counts.INACTIVE },
  ];

  const filtered = useMemo(() => {
    let list = rows;
    if (tab !== 'all') {
      list = list.filter((r) => r.status === tab);
    }
    const q = query.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.plateNumber.toUpperCase().includes(q) || (r.model && r.model.toUpperCase().includes(q)),
      );
    }
    return list;
  }, [rows, tab, query]);

  const columns: Column<TractorDto>[] = [
    {
      id: 'status',
      header: 'Trạng thái',
      cell: (row) => {
        const cfg = STATUS_CONFIG[row.status] ?? {
          label: row.status,
          tone: 'neutral' as StatusTone,
          icon: Truck,
        };
        return (
          <StatusChip tone={cfg.tone} icon={cfg.icon} size="sm">
            {cfg.label}
          </StatusChip>
        );
      },
    },
    {
      id: 'plate',
      header: 'Biển số xe',
      cell: (row) => (
        <span className="font-mono text-body font-bold text-ink tracking-wide">
          {row.plateNumber}
        </span>
      ),
    },
    {
      id: 'model',
      header: 'Model xe',
      cell: (row) => <span className="text-body-sm text-ink">{row.model || '—'}</span>,
    },
    {
      id: 'ownership',
      header: 'Hình thức',
      cell: (row) => (
        <span className="text-body-sm text-ink-soft">
          {row.ownership === 'OWNED' ? 'Sở hữu' : 'Thuê ngoài'}
        </span>
      ),
    },
    {
      id: 'fuelNorm',
      header: 'Định mức dầu',
      cell: (row) => (
        <span className="font-mono text-body-sm text-ink">
          {row.fuelNormLitersPer100km} L/100km
        </span>
      ),
    },
    {
      id: 'odometer',
      header: 'Km Odometer',
      cell: (row) => (
        <span className="font-mono text-body-sm text-ink">
          {row.currentOdometer.toLocaleString()} km
        </span>
      ),
    },
    {
      id: 'regExpiry',
      header: 'Hạn đăng kiểm',
      cell: (row) => <ExpiryCell date={row.registrationExpiry} />,
    },
    {
      id: 'insExpiry',
      header: 'Hạn bảo hiểm',
      cell: (row) => <ExpiryCell date={row.insuranceExpiry} />,
    },
    {
      id: 'badgeExpiry',
      header: 'Hạn phù hiệu',
      cell: (row) => <ExpiryCell date={row.transportBadgeExpiry} />,
    },
    {
      id: 'actions',
      header: 'Thao tác',
      srOnlyHeader: true,
      cell: (row) => (
        <div className="flex justify-end gap-6">
          <Button size="sm" variant="ghost" onClick={() => setDrawer({ row })}>
            {canWrite ? 'Sửa' : 'Xem'}
          </Button>
          {canWrite ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-crit hover:bg-crit-soft hover:text-crit"
              onClick={() => setConfirmDelete(row)}
            >
              <Trash2 className="size-14" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-12">
      <FilterTabs label="Lọc theo trạng thái" tabs={tabs} value={tab} onChange={setTab} />

      <div className="flex items-center gap-8">
        <input
          type="search"
          value={query}
          placeholder="Tìm biển số, model..."
          className="h-control w-200 rounded-control border border-line bg-surface px-12 text-body-sm text-ink placeholder:text-ink-subtle md:w-260"
          onChange={(e) => setQuery(e.target.value)}
        />

        <Button variant="secondary" size="sm" disabled={reloading} onClick={reload}>
          <RefreshCw className={reloading ? 'size-14 animate-spin' : 'size-14'} />
        </Button>

        {canWrite ? (
          <Button variant="primary" size="sm" onClick={() => setDrawer({ row: null })}>
            <Plus className="size-14 mr-4" />
            Thêm đầu kéo
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-16">
      {statusMessage ? (
        <Alert tone="info" icon={<CheckCircle className="size-16" />}>
          {statusMessage}
        </Alert>
      ) : null}

      {reloadError ? (
        <Alert
          tone="crit"
          icon={<CircleAlert className="size-16" />}
          action={
            <Button size="sm" variant="ghost" onClick={reload}>
              Thử lại
            </Button>
          }
        >
          Không tải được dữ liệu mới nhất.
        </Alert>
      ) : null}

      <WorkTableCard
        title="Danh sách đầu kéo"
        meta={`Tổng cộng ${rows.length} xe`}
        toolbar={toolbar}
        footer={`Hiển thị ${filtered.length} / ${rows.length} xe`}
      >
        {filtered.length === 0 ? (
          <div className="p-32">
            <EmptyState
              icon={<SearchX className="size-20" />}
              title={query ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có đầu kéo'}
              description={
                query
                  ? `Không có đầu kéo nào khớp với từ khóa "${query}".`
                  : 'Bấm nút "Thêm đầu kéo" để khai báo xe mới.'
              }
              action={
                canWrite && !query ? (
                  <Button variant="primary" size="sm" onClick={() => setDrawer({ row: null })}>
                    <Plus className="size-14 mr-4" />
                    Thêm đầu kéo
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              caption="Bảng danh sách xe đầu kéo"
              columns={columns}
              rows={filtered}
              rowKey={(r) => r.id}
            />
          </div>
        )}
      </WorkTableCard>

      {/* Ngăn kéo Form */}
      {drawer ? (
        <Drawer
          title={drawer.row ? `Đầu kéo ${drawer.row.plateNumber}` : 'Thêm đầu kéo mới'}
          open={Boolean(drawer)}
          onClose={() => setDrawer(null)}
          footer={
            <div className="flex justify-end gap-8">
              <Button variant="secondary" onClick={() => setDrawer(null)}>
                Hủy
              </Button>
              {canWrite ? (
                <Button variant="primary" type="submit" form={formId} disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </Button>
              ) : null}
            </div>
          }
        >
          <TractorForm
            formId={formId}
            row={drawer.row}
            readOnly={!canWrite}
            onSaving={setSaving}
            onSaved={(msg) => {
              setDrawer(null);
              setStatusMessage(msg);
              void reload();
            }}
          />
        </Drawer>
      ) : null}

      {/* Xác nhận xóa mềm */}
      {confirmDelete ? (
        <ConfirmDialog
          title="Xác nhận xóa đầu kéo"
          open={Boolean(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
          footer={
            <div className="flex justify-end gap-8">
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                className="bg-crit hover:bg-crit/90 text-white"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await softDeleteTractor({ id: confirmDelete.id });
                    if (res.ok) {
                      setStatusMessage(`Đã xóa đầu kéo ${confirmDelete.plateNumber}.`);
                      setConfirmDelete(null);
                      void reload();
                    }
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? 'Đang xóa...' : 'Xóa đầu kéo'}
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-ink">
            Bạn có chắc muốn xóa đầu kéo{' '}
            <strong className="font-mono text-ink">{confirmDelete.plateNumber}</strong> khỏi danh
            sách? Xe này sẽ không còn hiển thị khi lập lịch và phân công tài xế.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
