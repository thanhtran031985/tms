'use client';

import {
  CheckCircle,
  CircleAlert,
  Clock,
  Plus,
  RefreshCw,
  SearchX,
  ShieldAlert,
  Trash2,
  User,
  UserCheck,
  UserX,
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
import {
  createDriver,
  listDrivers,
  softDeleteDriver,
  updateDriver,
} from './actions';
import { ExpiryCell } from './date-helpers';
import type { DriverDto, FleetAccess } from './types';

const STATUS_CONFIG: Record<
  string,
  { label: string; tone: StatusTone; icon: typeof CheckCircle }
> = {
  AVAILABLE: { label: 'Sẵn sàng', tone: 'ok', icon: CheckCircle },
  ON_DUTY: { label: 'Đang chạy', tone: 'info', icon: Clock },
  OFF_DUTY: { label: 'Nghỉ phép', tone: 'off', icon: UserCheck },
  INACTIVE: { label: 'Tạm ngưng', tone: 'off', icon: UserX },
};

function DriverForm({
  formId,
  row,
  readOnly,
  onSaving,
  onSaved,
}: {
  formId: string;
  row: DriverDto | null;
  readOnly: boolean;
  onSaving: (saving: boolean) => void;
  onSaved: (msg: string) => void;
}) {
  const [fullName, setFullName] = useState(row?.fullName ?? '');
  const [phone, setPhone] = useState(row?.phone ?? '');
  const [nationalIdNo, setNationalIdNo] = useState(row?.nationalIdNo ?? '');
  const [licenseNo, setLicenseNo] = useState(row?.licenseNo ?? '');
  const [licenseClass, setLicenseClass] = useState(row?.licenseClass ?? 'FC');
  const [licenseExpiry, setLicenseExpiry] = useState(row?.licenseExpiry ?? '');
  const [dgCertNo, setDgCertNo] = useState(row?.dgCertificateNo ?? '');
  const [dgCertExpiry, setDgCertExpiry] = useState(row?.dgCertificateExpiry ?? '');
  const [employmentType, setEmploymentType] = useState<DriverDto['employmentType']>(
    row?.employmentType ?? 'FULL_TIME',
  );
  const [status, setStatus] = useState<DriverDto['status']>(row?.status ?? 'AVAILABLE');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSaving(true);
    setErrors({});
    setBanner(null);

    const payload = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      nationalIdNo: nationalIdNo.trim() || null,
      licenseNo: licenseNo.trim() || null,
      licenseClass: licenseClass.trim() || null,
      licenseExpiry: licenseExpiry || null,
      dgCertificateNo: dgCertNo.trim() || null,
      dgCertificateExpiry: dgCertExpiry || null,
      employmentType,
      status,
    };

    try {
      if (row) {
        const res = await updateDriver({ id: row.id, ...payload });
        if (res.ok) {
          onSaved(`Đã cập nhật thông tin tài xế ${payload.fullName}.`);
        } else {
          setBanner(res.message);
        }
      } else {
        const res = await createDriver(payload);
        if (res.ok) {
          onSaved(`Đã thêm tài xế ${payload.fullName}.`);
        } else {
          setBanner(res.message);
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
        label="Họ và tên tài xế"
        required
        value={fullName}
        disabled={readOnly}
        placeholder="vd: Trần Văn Lộc"
        error={errors.fullName}
        onChange={(e) => setFullName(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-12">
        <TextField
          label="Số điện thoại"
          required
          value={phone}
          disabled={readOnly}
          placeholder="vd: 0903123456"
          error={errors.phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <TextField
          label="Số CCCD / Hộ chiếu"
          value={nationalIdNo}
          disabled={readOnly}
          placeholder="vd: 079085001234"
          onChange={(e) => setNationalIdNo(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-12">
        <TextField
          label="Số Giấy phép lái xe (GPLX)"
          value={licenseNo}
          disabled={readOnly}
          placeholder="vd: 790123456"
          onChange={(e) => setLicenseNo(e.target.value)}
        />
        <TextField
          label="Hạng GPLX"
          value={licenseClass}
          disabled={readOnly}
          placeholder="vd: FC"
          onChange={(e) => setLicenseClass(e.target.value)}
        />
        <TextField
          label="Hạn GPLX"
          type="date"
          value={licenseExpiry}
          disabled={readOnly}
          onChange={(e) => setLicenseExpiry(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-12 rounded-control border border-line p-12">
        <TextField
          label="Số chứng chỉ hàng nguy hiểm (DG)"
          value={dgCertNo}
          disabled={readOnly}
          placeholder="vd: DG-79-001"
          onChange={(e) => setDgCertNo(e.target.value)}
        />
        <TextField
          label="Hạn chứng chỉ hàng nguy hiểm"
          type="date"
          value={dgCertExpiry}
          disabled={readOnly}
          onChange={(e) => setDgCertExpiry(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-12">
        <div className="flex flex-col gap-6">
          <label className="text-small font-semibold text-ink">Loại hợp đồng</label>
          <select
            value={employmentType}
            disabled={readOnly}
            className="h-control rounded-control border border-line bg-surface px-12 text-body-sm"
            onChange={(e) => setEmploymentType(e.target.value as DriverDto['employmentType'])}
          >
            <option value="FULL_TIME">Chính thức (Toàn thời gian)</option>
            <option value="CONTRACT">Hợp đồng (Thời vụ / Thuê ngoài)</option>
          </select>
        </div>

        <div className="flex flex-col gap-6">
          <label className="text-small font-semibold text-ink">Trạng thái công tác</label>
          <select
            value={status}
            disabled={readOnly}
            className="h-control rounded-control border border-line bg-surface px-12 text-body-sm"
            onChange={(e) => setStatus(e.target.value as DriverDto['status'])}
          >
            <option value="AVAILABLE">Sẵn sàng</option>
            <option value="OFF_DUTY">Nghỉ phép</option>
            <option value="INACTIVE">Tạm ngưng</option>
          </select>
        </div>
      </div>
    </form>
  );
}

export function DriverList({
  initialRows,
  access,
}: {
  initialRows: DriverDto[];
  access: FleetAccess;
}) {
  const formId = useId();
  const [rows, setRows] = useState(initialRows);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [drawer, setDrawer] = useState<{ row: DriverDto | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DriverDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canWrite = access === 'write';

  async function reload() {
    setReloading(true);
    try {
      const res = await listDrivers({});
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
      ON_DUTY: rows.filter((r) => r.status === 'ON_DUTY').length,
      OFF_DUTY: rows.filter((r) => r.status === 'OFF_DUTY').length,
      INACTIVE: rows.filter((r) => r.status === 'INACTIVE').length,
    };
  }, [rows]);

  const tabs: FilterTab[] = [
    { id: 'all', label: 'Tất cả', count: counts.all },
    { id: 'AVAILABLE', label: 'Sẵn sàng', count: counts.AVAILABLE },
    { id: 'ON_DUTY', label: 'Đang chạy', count: counts.ON_DUTY },
    { id: 'OFF_DUTY', label: 'Nghỉ phép', count: counts.OFF_DUTY },
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
          r.fullName.toUpperCase().includes(q) ||
          r.phone.includes(q) ||
          (r.licenseNo && r.licenseNo.toUpperCase().includes(q)),
      );
    }
    return list;
  }, [rows, tab, query]);

  const columns: Column<DriverDto>[] = [
    {
      id: 'status',
      header: 'Trạng thái',
      cell: (row) => {
        const cfg = STATUS_CONFIG[row.status] ?? {
          label: row.status,
          tone: 'neutral' as StatusTone,
          icon: User,
        };
        return (
          <StatusChip tone={cfg.tone} icon={cfg.icon} size="sm">
            {cfg.label}
          </StatusChip>
        );
      },
    },
    {
      id: 'fullName',
      header: 'Họ và tên',
      cell: (row) => (
        <span className="text-body font-semibold text-ink">{row.fullName}</span>
      ),
    },
    {
      id: 'phone',
      header: 'Số điện thoại',
      cell: (row) => (
        <span className="font-mono text-body-sm text-ink">{row.phone}</span>
      ),
    },
    {
      id: 'nationalId',
      header: 'Số CCCD',
      cell: (row) => (
        <span className="font-mono text-body-sm text-ink-soft">
          {row.nationalIdNo || '—'}
        </span>
      ),
    },
    {
      id: 'license',
      header: 'Số GPLX & Hạng',
      cell: (row) => (
        <div className="flex items-center gap-6">
          <span className="font-mono text-body-sm text-ink">{row.licenseNo || '—'}</span>
          {row.licenseClass ? (
            <Pill className="text-caption font-bold bg-surface-2 text-ink">
              {row.licenseClass}
            </Pill>
          ) : null}
        </div>
      ),
    },
    {
      id: 'licenseExpiry',
      header: 'Hạn GPLX',
      cell: (row) => <ExpiryCell date={row.licenseExpiry} />,
    },
    {
      id: 'dgCert',
      header: 'Chứng chỉ hàng nguy hiểm',
      cell: (row) => {
        if (!row.dgCertificateNo) return <span className="text-ink-subtle">—</span>;
        return (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-caption text-ink flex items-center gap-4">
              <ShieldAlert className="size-12 text-warn inline" />
              {row.dgCertificateNo}
            </span>
            <ExpiryCell date={row.dgCertificateExpiry} />
          </div>
        );
      },
    },
    {
      id: 'employment',
      header: 'Hình thức',
      cell: (row) => (
        <span className="text-body-sm text-ink-soft">
          {row.employmentType === 'FULL_TIME' ? 'Chính thức' : 'Hợp đồng'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Thao tác',
      srOnlyHeader: true,
      cell: (row) => (
        <div className="flex justify-end gap-6">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDrawer({ row })}
          >
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
      <FilterTabs
        label="Lọc theo trạng thái tài xế"
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />

      <div className="flex items-center gap-8">
        <input
          type="search"
          value={query}
          placeholder="Tìm tên, SĐT, GPLX..."
          className="h-control w-200 rounded-control border border-line bg-surface px-12 text-body-sm text-ink placeholder:text-ink-subtle md:w-260"
          onChange={(e) => setQuery(e.target.value)}
        />

        <Button
          variant="secondary"
          size="sm"
          disabled={reloading}
          onClick={reload}
        >
          <RefreshCw className={reloading ? 'size-14 animate-spin' : 'size-14'} />
        </Button>

        {canWrite ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setDrawer({ row: null })}
          >
            <Plus className="size-14 mr-4" />
            Thêm tài xế
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
        title="Danh sách tài xế"
        meta={`Tổng cộng ${rows.length} tài xế`}
        toolbar={toolbar}
        footer={`Hiển thị ${filtered.length} / ${rows.length} tài xế`}
      >
        {filtered.length === 0 ? (
          <div className="p-32">
            <EmptyState
              icon={<SearchX className="size-20" />}
              title={query ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có tài xế'}
              description={
                query
                  ? `Không có tài xế nào khớp với từ khóa "${query}".`
                  : 'Bấm nút "Thêm tài xế" để khai báo tài xế mới.'
              }
              action={
                canWrite && !query ? (
                  <Button variant="primary" size="sm" onClick={() => setDrawer({ row: null })}>
                    <Plus className="size-14 mr-4" />
                    Thêm tài xế
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              caption="Bảng danh sách tài xế"
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
          title={drawer.row ? `Tài xế ${drawer.row.fullName}` : 'Thêm tài xế mới'}
          open={Boolean(drawer)}
          onClose={() => setDrawer(null)}
          footer={
            <div className="flex justify-end gap-8">
              <Button variant="secondary" onClick={() => setDrawer(null)}>
                Hủy
              </Button>
              {canWrite ? (
                <Button
                  variant="primary"
                  type="submit"
                  form={formId}
                  disabled={saving}
                >
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </Button>
              ) : null}
            </div>
          }
        >
          <DriverForm
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
          title="Xác nhận xóa tài xế"
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
                    const res = await softDeleteDriver({ id: confirmDelete.id });
                    if (res.ok) {
                      setStatusMessage(`Đã xóa tài xế ${confirmDelete.fullName}.`);
                      setConfirmDelete(null);
                      void reload();
                    }
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? 'Đang xóa...' : 'Xóa tài xế'}
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-ink">
            Bạn có chắc muốn xóa tài xế{' '}
            <strong className="text-ink">{confirmDelete.fullName}</strong> khỏi danh sách?
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
