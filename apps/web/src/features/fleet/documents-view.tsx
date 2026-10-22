'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CircleAlert,
  RefreshCw,
  SearchX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import { Pill } from '@/components/ui/pill';
import { StatusChip } from '@/components/ui/status-chip';
import { DataTable, WorkTableCard, type Column } from '@/components/ui/work-table';
import { listExpiringDocuments } from './actions';
import type { ExpiringDocDto } from './types';

const TARGET_TYPE_LABELS: Record<string, string> = {
  TRACTOR: 'Đầu kéo',
  TRAILER: 'Rơ moóc',
  DRIVER: 'Tài xế',
};

export function DocumentsView({
  initialRows,
}: {
  initialRows: ExpiringDocDto[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');

  async function reload() {
    setReloading(true);
    try {
      const res = await listExpiringDocuments({ withinDays: 15 });
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

  const expiredCount = useMemo(() => rows.filter((r) => r.isExpired).length, [rows]);
  const expiringSoonCount = useMemo(() => rows.filter((r) => r.isExpiringSoon).length, [rows]);

  const tabs: FilterTab[] = [
    { id: 'all', label: 'Tất cả', count: rows.length },
    { id: 'EXPIRED', label: 'Đã hết hạn', count: expiredCount },
    { id: 'EXPIRING_SOON', label: 'Sắp hết hạn 15 ngày', count: expiringSoonCount },
  ];

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === 'EXPIRED') {
      list = list.filter((r) => r.isExpired);
    } else if (tab === 'EXPIRING_SOON') {
      list = list.filter((r) => r.isExpiringSoon);
    }

    const q = query.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.targetLabel.toUpperCase().includes(q) ||
          r.documentLabel.toUpperCase().includes(q) ||
          (r.documentNo && r.documentNo.toUpperCase().includes(q)),
      );
    }
    return list;
  }, [rows, tab, query]);

  const columns: Column<ExpiringDocDto>[] = [
    {
      id: 'severity',
      header: 'Mức cảnh báo',
      cell: (row) => {
        if (row.isExpired) {
          return (
            <StatusChip tone="crit" icon={AlertCircle} size="sm">
              Đã hết hạn
            </StatusChip>
          );
        }
        return (
          <StatusChip tone="warn" icon={AlertTriangle} size="sm">
            Sắp hết hạn
          </StatusChip>
        );
      },
    },
    {
      id: 'targetType',
      header: 'Đối tượng',
      cell: (row) => (
        <Pill className="text-caption font-semibold bg-surface-2 text-ink">
          {TARGET_TYPE_LABELS[row.targetType] ?? row.targetType}
        </Pill>
      ),
    },
    {
      id: 'targetLabel',
      header: 'Biển số / Tài xế',
      cell: (row) => {
        const isVehicle = row.targetType === 'TRACTOR' || row.targetType === 'TRAILER';
        return (
          <span
            className={
              isVehicle
                ? 'font-mono text-body font-bold text-ink tracking-wide'
                : 'text-body font-semibold text-ink'
            }
          >
            {row.targetLabel}
          </span>
        );
      },
    },
    {
      id: 'documentLabel',
      header: 'Loại giấy tờ',
      cell: (row) => (
        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink">{row.documentLabel}</span>
          {row.documentNo ? (
            <span className="font-mono text-caption text-ink-subtle">
              Số: {row.documentNo}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'expiryDate',
      header: 'Ngày hết hạn',
      cell: (row) => (
        <span className="font-mono text-body-sm font-semibold text-ink">
          {row.expiryDate}
        </span>
      ),
    },
    {
      id: 'timeRemaining',
      header: 'Thời gian còn lại',
      cell: (row) => {
        if (row.daysRemaining < 0) {
          return (
            <span className="font-semibold text-crit text-body-sm">
              Quá hạn {Math.abs(row.daysRemaining)} ngày
            </span>
          );
        }
        if (row.daysRemaining === 0) {
          return (
            <span className="font-semibold text-crit text-body-sm">
              Hết hạn hôm nay
            </span>
          );
        }
        return (
          <span className="font-semibold text-warn text-body-sm">
            Còn {row.daysRemaining} ngày
          </span>
        );
      },
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-12">
      <FilterTabs
        label="Lọc theo hạn giấy tờ"
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />

      <div className="flex items-center gap-8">
        <input
          type="search"
          value={query}
          placeholder="Tìm biển số, tài xế, giấy tờ..."
          className="h-control w-240 rounded-control border border-line bg-surface px-12 text-body-sm text-ink placeholder:text-ink-subtle md:w-300"
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
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-16">
      {/* Alert cảnh báo tổng hợp */}
      {expiredCount > 0 ? (
        <Alert tone="crit" icon={<AlertCircle className="size-16" />}>
          Có <strong>{expiredCount}</strong> giấy tờ <strong>đã hết hạn</strong>. Cần gia hạn ngay
          để tránh bị lực lượng chức năng xử phạt và hệ thống chặn điều xe.
        </Alert>
      ) : expiringSoonCount > 0 ? (
        <Alert tone="warn" icon={<AlertTriangle className="size-16" />}>
          Có <strong>{expiringSoonCount}</strong> giấy tờ <strong>sắp hết hạn trong 15 ngày tới</strong>.
          Vui lòng chuẩn bị thủ tục gia hạn kịp thời.
        </Alert>
      ) : (
        <Alert tone="ok" icon={<CheckCircle className="size-16" />}>
          Tất cả giấy tờ của đội xe và tài xế đều hợp lệ. Không có giấy tờ nào hết hạn trong 15 ngày
          tới.
        </Alert>
      )}

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
        title="Danh sách giấy tờ cần lưu ý"
        meta={`Tổng cộng ${rows.length} giấy tờ cảnh báo`}
        toolbar={toolbar}
        footer={`Hiển thị ${filtered.length} / ${rows.length} giấy tờ`}
      >
        {filtered.length === 0 ? (
          <div className="p-32">
            <EmptyState
              icon={
                tab === 'all' && !query ? (
                  <CheckCircle className="size-20" />
                ) : (
                  <SearchX className="size-20" />
                )
              }
              title={
                query
                  ? 'Không tìm thấy giấy tờ phù hợp'
                  : tab === 'EXPIRED'
                    ? 'Không có giấy tờ nào quá hạn'
                    : tab === 'EXPIRING_SOON'
                      ? 'Không có giấy tờ nào sắp hết hạn trong 15 ngày'
                      : 'Hồ sơ giấy tờ hợp lệ'
              }
              description={
                query
                  ? `Không có kết quả nào khớp với "${query}".`
                  : 'Hệ thống tự động theo dõi hạn đăng kiểm, bảo hiểm, phù hiệu xe, kiểm định rơ moóc và GPLX tài xế mỗi ngày.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              caption="Bảng theo dõi hạn giấy tờ đội xe và tài xế"
              columns={columns}
              rows={filtered}
              rowKey={(r) => r.id}
            />
          </div>
        )}
      </WorkTableCard>
    </div>
  );
}
