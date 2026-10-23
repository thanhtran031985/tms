'use client';

import {
  CheckCircle,
  CircleAlert,
  Clock,
  Container,
  Plus,
  RefreshCw,
  SearchX,
  Trash2,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { TextField } from '@/components/ui/field';
import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import { Pill } from '@/components/ui/pill';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { DataTable, WorkTableCard, type Column } from '@/components/ui/work-table';
import { createTrailer, listTrailers, softDeleteTrailer, updateTrailer } from './actions';
import { ExpiryCell } from './date-helpers';
import { isSystemStatus, SYSTEM_STATUS_LABELS, type FleetAccess, type TrailerDto } from './types';

const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone; icon: typeof CheckCircle }> =
  {
    AVAILABLE: { label: 'Sẵn sàng', tone: 'ok', icon: CheckCircle },
    IN_USE: { label: 'Đang chạy', tone: 'info', icon: Clock },
    DROPPED: { label: 'Đang hạ bãi', tone: 'neutral', icon: Container },
    MAINTENANCE: { label: 'Bảo dưỡng', tone: 'crit', icon: Wrench },
    INACTIVE: { label: 'Tạm ngưng', tone: 'off', icon: XCircle },
  };

function TrailerForm({
  formId,
  row,
  readOnly,
  onSaving,
  onSaved,
}: {
  formId: string;
  row: TrailerDto | null;
  readOnly: boolean;
  onSaving: (saving: boolean) => void;
  onSaved: (msg: string) => void;
}) {
  const [plateNumber, setPlateNumber] = useState(row?.plateNumber ?? '');
  const [trailerType, setTrailerType] = useState<TrailerDto['trailerType']>(
    row?.trailerType ?? '40FT',
  );
  const [canCarryTwin20, setCanCarryTwin20] = useState(row?.canCarryTwin20 ?? false);
  const [hasGensetPower, setHasGensetPower] = useState(row?.hasGensetPower ?? false);
  const [tareWeight, setTareWeight] = useState(
    row?.tareWeightTons ? String(Number(row.tareWeightTons)) : '',
  );
  const [maxPayload, setMaxPayload] = useState(
    row?.maxPayloadTons ? String(Number(row.maxPayloadTons)) : '32.00',
  );
  const [inspectionExpiry, setInspectionExpiry] = useState(row?.inspectionExpiry ?? '');
  const [locationNote, setLocationNote] = useState(row?.currentLocationNote ?? '');
  const [status, setStatus] = useState(row?.status ?? 'AVAILABLE');
  const systemStatus = isSystemStatus(row?.status);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  // Rule 1: Rơ moóc 20FT không được chở Twin 20
  const is20FT = trailerType === '20FT';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSaving(true);
    setErrors({});
    setBanner(null);

    const payload = {
      plateNumber: plateNumber.trim().toUpperCase(),
      trailerType,
      canCarryTwin20: is20FT ? false : canCarryTwin20,
      hasGensetPower,
      tareWeightTons: tareWeight.trim() || null,
      maxPayloadTons: maxPayload.trim(),
      inspectionExpiry: inspectionExpiry || null,
      currentLocationNote: locationNote.trim() || null,
      ...(systemStatus ? {} : { status: status as 'AVAILABLE' | 'MAINTENANCE' | 'INACTIVE' }),
    };

    try {
      if (row) {
        const res = await updateTrailer({ id: row.id, ...payload });
        if (res.ok) {
          onSaved(`Đã cập nhật rơ moóc ${payload.plateNumber}.`);
        } else {
          setBanner(res.message);
        }
      } else {
        const res = await createTrailer(payload);
        if (res.ok) {
          onSaved(`Đã tạo rơ moóc ${payload.plateNumber}.`);
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
        label="Biển số rơ moóc"
        required
        value={plateNumber}
        disabled={readOnly}
        placeholder="vd: 51R-112.23"
        className="font-mono uppercase"
        error={errors.plateNumber}
        onChange={(e) => setPlateNumber(e.target.value)}
      />

      <div className="flex flex-col gap-6">
        <label className="text-small font-semibold text-ink">Loại rơ moóc</label>
        <select
          value={trailerType}
          disabled={readOnly}
          className="h-control rounded-control border border-line bg-surface px-12 text-body-sm"
          onChange={(e) => {
            const nextType = e.target.value as TrailerDto['trailerType'];
            setTrailerType(nextType);
            if (nextType === '20FT') {
              setCanCarryTwin20(false);
            }
          }}
        >
          <option value="20FT">20FT (Tiêu chuẩn)</option>
          <option value="40FT">40FT (Tiêu chuẩn)</option>
          <option value="40FT_COMBO">40FT Combo (Có chốt chở Twin 20)</option>
          <option value="45FT">45FT (Dài)</option>
        </select>
      </div>

      <div className="flex flex-col gap-8 rounded-control border border-line p-12">
        <span className="text-small font-semibold text-ink">Tính năng chuyên dụng</span>
        <label className="flex items-center gap-8 text-body-sm">
          <input
            type="checkbox"
            checked={canCarryTwin20}
            disabled={readOnly || is20FT}
            onChange={(e) => setCanCarryTwin20(e.target.checked)}
          />
          <span>
            Chở được 2 container 20FT (Twin 20)
            {is20FT ? (
              <span className="ml-6 text-caption text-ink-subtle">
                (Rơ moóc 20FT không hỗ trợ chở Twin 20)
              </span>
            ) : null}
          </span>
        </label>

        <label className="flex items-center gap-8 text-body-sm">
          <input
            type="checkbox"
            checked={hasGensetPower}
            disabled={readOnly}
            onChange={(e) => setHasGensetPower(e.target.checked)}
          />
          <span>Trang bị máy phát điện / cắm cont lạnh (Genset)</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-12">
        <TextField
          label="Tự trọng rơ moóc (tấn)"
          type="number"
          step="0.01"
          value={tareWeight}
          disabled={readOnly}
          placeholder="vd: 4.50"
          onChange={(e) => setTareWeight(e.target.value)}
        />
        <TextField
          label="Tải trọng cho phép (tấn)"
          required
          type="number"
          step="0.01"
          value={maxPayload}
          disabled={readOnly}
          placeholder="vd: 32.00"
          onChange={(e) => setMaxPayload(e.target.value)}
        />
      </div>

      <TextField
        label="Hạn kiểm định"
        type="date"
        value={inspectionExpiry}
        disabled={readOnly}
        onChange={(e) => setInspectionExpiry(e.target.value)}
      />

      <TextField
        label="Ghi chú vị trí hiện tại"
        value={locationNote}
        disabled={readOnly}
        placeholder="vd: Bãi xe depot Cát Lái, ô B-12"
        onChange={(e) => setLocationNote(e.target.value)}
      />

      <div className="flex flex-col gap-6">
        <label className="text-small font-semibold text-ink">Trạng thái rơ moóc</label>
        <select
          value={status}
          disabled={readOnly || systemStatus}
          className="h-control rounded-control border border-line bg-surface px-12 text-body-sm"
          onChange={(e) => setStatus(e.target.value as TrailerDto['status'])}
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

export function TrailerList({
  initialRows,
  access,
}: {
  initialRows: TrailerDto[];
  access: FleetAccess;
}) {
  const formId = useId();
  const [rows, setRows] = useState(initialRows);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [drawer, setDrawer] = useState<{ row: TrailerDto | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TrailerDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canWrite = access === 'write';

  async function reload() {
    setReloading(true);
    try {
      const res = await listTrailers({});
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
      '20FT': rows.filter((r) => r.trailerType === '20FT').length,
      '40FT': rows.filter((r) => r.trailerType === '40FT').length,
      '40FT_COMBO': rows.filter((r) => r.trailerType === '40FT_COMBO').length,
      '45FT': rows.filter((r) => r.trailerType === '45FT').length,
    };
  }, [rows]);

  const tabs: FilterTab[] = [
    { id: 'all', label: 'Tất cả', count: counts.all },
    { id: '20FT', label: '20FT', count: counts['20FT'] },
    { id: '40FT', label: '40FT', count: counts['40FT'] },
    { id: '40FT_COMBO', label: '40FT Combo', count: counts['40FT_COMBO'] },
    { id: '45FT', label: '45FT', count: counts['45FT'] },
  ];

  const filtered = useMemo(() => {
    let list = rows;
    if (tab !== 'all') {
      list = list.filter((r) => r.trailerType === tab);
    }
    const q = query.trim().toUpperCase();
    if (q) {
      list = list.filter((r) => r.plateNumber.toUpperCase().includes(q));
    }
    return list;
  }, [rows, tab, query]);

  const columns: Column<TrailerDto>[] = [
    {
      id: 'status',
      header: 'Trạng thái',
      cell: (row) => {
        const cfg = STATUS_CONFIG[row.status] ?? {
          label: row.status,
          tone: 'neutral' as StatusTone,
          icon: Container,
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
      header: 'Biển số rơ moóc',
      cell: (row) => (
        <span className="font-mono text-body font-bold text-ink tracking-wide">
          {row.plateNumber}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Loại moóc',
      cell: (row) => (
        <span className="font-mono text-body-sm font-semibold text-ink">{row.trailerType}</span>
      ),
    },
    {
      id: 'features',
      header: 'Tính năng',
      cell: (row) => (
        <div className="flex flex-wrap gap-4">
          {row.canCarryTwin20 ? (
            <Pill className="bg-info-soft text-info text-caption">Twin 20</Pill>
          ) : null}
          {row.hasGensetPower ? (
            <Pill className="bg-ok-soft text-ok text-caption flex items-center gap-2">
              <Zap className="size-10 inline" />
              Genset
            </Pill>
          ) : null}
          {!row.canCarryTwin20 && !row.hasGensetPower ? (
            <span className="text-ink-subtle">—</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'tareWeight',
      header: 'Tự trọng',
      cell: (row) => (
        <span className="font-mono text-body-sm text-ink-soft">
          {row.tareWeightTons ? `${row.tareWeightTons} t` : '—'}
        </span>
      ),
    },
    {
      id: 'payload',
      header: 'Tải trọng',
      cell: (row) => (
        <span className="font-mono text-body-sm font-semibold text-ink">
          {row.maxPayloadTons} tấn
        </span>
      ),
    },
    {
      id: 'inspection',
      header: 'Hạn kiểm định',
      cell: (row) => <ExpiryCell date={row.inspectionExpiry} />,
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
      <FilterTabs label="Lọc theo loại rơ moóc" tabs={tabs} value={tab} onChange={setTab} />

      <div className="flex items-center gap-8">
        <input
          type="search"
          value={query}
          placeholder="Tìm biển số rơ moóc..."
          className="h-control w-200 rounded-control border border-line bg-surface px-12 text-body-sm text-ink placeholder:text-ink-subtle md:w-260"
          onChange={(e) => setQuery(e.target.value)}
        />

        <Button variant="secondary" size="sm" disabled={reloading} onClick={reload}>
          <RefreshCw className={reloading ? 'size-14 animate-spin' : 'size-14'} />
        </Button>

        {canWrite ? (
          <Button variant="primary" size="sm" onClick={() => setDrawer({ row: null })}>
            <Plus className="size-14 mr-4" />
            Thêm rơ moóc
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
        title="Danh sách rơ moóc"
        meta={`Tổng cộng ${rows.length} rơ moóc`}
        toolbar={toolbar}
        footer={`Hiển thị ${filtered.length} / ${rows.length} rơ moóc`}
      >
        {filtered.length === 0 ? (
          <div className="p-32">
            <EmptyState
              icon={<SearchX className="size-20" />}
              title={query ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có rơ moóc'}
              description={
                query
                  ? `Không có rơ moóc nào khớp với từ khóa "${query}".`
                  : 'Bấm nút "Thêm rơ moóc" để khai báo rơ moóc mới.'
              }
              action={
                canWrite && !query ? (
                  <Button variant="primary" size="sm" onClick={() => setDrawer({ row: null })}>
                    <Plus className="size-14 mr-4" />
                    Thêm rơ moóc
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              caption="Bảng danh sách rơ moóc"
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
          title={drawer.row ? `Rơ moóc ${drawer.row.plateNumber}` : 'Thêm rơ moóc mới'}
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
          <TrailerForm
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
          title="Xác nhận xóa rơ moóc"
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
                    const res = await softDeleteTrailer({ id: confirmDelete.id });
                    if (res.ok) {
                      setStatusMessage(`Đã xóa rơ moóc ${confirmDelete.plateNumber}.`);
                      setConfirmDelete(null);
                      void reload();
                    }
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? 'Đang xóa...' : 'Xóa rơ moóc'}
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-ink">
            Bạn có chắc muốn xóa rơ moóc{' '}
            <strong className="font-mono text-ink">{confirmDelete.plateNumber}</strong> khỏi danh
            sách?
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
