'use client';

import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { TRIP_MODE_LABELS } from '@shared/labels';
import type { Result } from '@shared/result';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectField } from '@/components/ui/field';
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
import { commitTariffImport } from './tariff-actions';
import type { ImportPreviewDto, ImportRowDto } from './tariff-types';

// Màn import bảng giá từ Excel: chọn loại + file → xem trước từng dòng (lỗi nêu rõ dòng và cột) → xác nhận ghi.
// Chỉ ghi khi không còn dòng lỗi; file không được lưu lại trên server.
type Kind = 'freight' | 'fee';
type Phase =
  | { name: 'idle' }
  | { name: 'loading'; fileName: string }
  | { name: 'ready'; fileName: string; preview: ImportPreviewDto }
  | { name: 'error'; message: string }
  | { name: 'done'; inserted: number; kind: Kind };

type TabId = 'all' | 'valid' | 'error';

const KIND_OPTIONS = [
  { value: 'freight', label: 'Giá cước' },
  { value: 'fee', label: 'Bảng phí' },
];

export function TariffImport() {
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('freight');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [tab, setTab] = useState<TabId>('all');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const kindLabel = kind === 'freight' ? 'giá cước' : 'phí';

  function reset() {
    setPhase({ name: 'idle' });
    setCommitError(null);
    setTab('all');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function upload(file: File) {
    setPhase({ name: 'loading', fileName: file.name });
    setCommitError(null);
    setTab('all');
    try {
      const body = new FormData();
      body.set('kind', kind);
      body.set('file', file);
      const response = await fetch('/api/billing/tariff-import', { method: 'POST', body });
      const result = (await response.json()) as Result<ImportPreviewDto>;
      if (!result.ok) {
        setPhase({ name: 'error', message: result.message });
        return;
      }
      setPhase({ name: 'ready', fileName: file.name, preview: result.data });
      // Có lỗi thì mở sẵn tab "Có lỗi" để người dùng thấy ngay chỗ cần sửa.
      if (result.data.counts.error > 0) setTab('error');
    } catch {
      setPhase({
        name: 'error',
        message: 'Không gửi được file. Kiểm tra kết nối mạng rồi chọn file lại.',
      });
    }
  }

  async function commit(preview: ImportPreviewDto) {
    setCommitting(true);
    setCommitError(null);
    try {
      const result = await commitTariffImport({
        kind: preview.kind,
        items: preview.rows.map((r) => ({ rowNumber: r.rowNumber, data: r.data })),
      });
      if (result.ok) {
        setPhase({ name: 'done', inserted: result.data.inserted, kind: preview.kind });
      } else {
        setCommitError(result.message);
      }
    } catch {
      setCommitError('Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi bấm Nhập lại.');
    } finally {
      setCommitting(false);
    }
  }

  const picker = (
    <section className="flex flex-col gap-16 rounded-card border border-line bg-surface p-20">
      <h2 className="text-section-title text-ink">Chọn file Excel</h2>
      <div className="grid grid-cols-1 gap-16 sm:grid-cols-2">
        <SelectField
          label="Loại bảng giá"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as Kind);
            reset();
          }}
          options={KIND_OPTIONS}
        />
        <div className="flex flex-col gap-6">
          <label htmlFor={fileInputId} className="text-label text-ink">
            File Excel (.xlsx)
          </label>
          <input
            ref={fileRef}
            id={fileInputId}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={phase.name === 'loading' || committing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            className="h-button w-full cursor-pointer rounded-control border border-line-strong bg-surface px-14 py-10 text-body-sm text-ink file:mr-12 file:cursor-pointer file:rounded-control file:border-0 file:bg-surface-2 file:px-12 file:py-6 file:text-body-sm file:font-semibold file:text-ink"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-12">
        <a
          href={`/api/billing/tariff-template?kind=${kind}`}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          <Download className="size-18" aria-hidden="true" />
          Tải file mẫu {kindLabel}
        </a>
        <p className="text-small text-ink-soft">
          Cột theo mã tuyến và mã khách trong Danh mục. Ngày dạng 22/10/2026 hoặc 2026-10-22; để
          trống &ldquo;Hiệu lực đến&rdquo; nếu vô thời hạn.
        </p>
      </div>
    </section>
  );

  if (phase.name === 'done') {
    return (
      <div className="flex flex-col gap-20">
        {picker}
        <Alert
          tone="ok"
          icon={<CircleCheck className="size-20" />}
          action={
            <Link
              href={phase.kind === 'freight' ? '/billing/tariffs' : '/billing/fees'}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Xem {phase.kind === 'freight' ? 'giá cước' : 'bảng phí'}
            </Link>
          }
        >
          Đã nhập {phase.inserted} dòng {phase.kind === 'freight' ? 'giá cước' : 'phí'}. Giá mới nằm
          trong danh sách theo ngày hiệu lực đã khai.
        </Alert>
      </div>
    );
  }

  if (phase.name === 'idle') {
    return (
      <div className="flex flex-col gap-20">
        {picker}
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={<FileSpreadsheet className="size-24" />}
            title="Chưa chọn file"
            description="Chọn file Excel để xem trước từng dòng. Hệ thống chỉ ghi giá khi file không còn dòng lỗi và bạn bấm xác nhận."
          />
        </div>
      </div>
    );
  }

  if (phase.name === 'error') {
    return (
      <div className="flex flex-col gap-20">
        {picker}
        <Alert
          tone="crit"
          icon={<CircleAlert className="size-20" />}
          action={
            <Button variant="secondary" size="sm" onClick={reset}>
              <RefreshCw className="size-18" aria-hidden="true" />
              Chọn file khác
            </Button>
          }
        >
          {phase.message}
        </Alert>
      </div>
    );
  }

  if (phase.name === 'loading') {
    return (
      <div className="flex flex-col gap-20">
        {picker}
        <WorkTableCard title="Xem trước" footer={`Đang đọc ${phase.fileName}`}>
          <DataTable
            columns={skeletonColumns}
            rows={[]}
            rowKey={() => ''}
            caption="Đang đọc file"
            loading
          />
        </WorkTableCard>
      </div>
    );
  }

  const { preview, fileName } = phase;
  const { counts } = preview;
  const tabs: FilterTab[] = [
    { id: 'all', label: 'Tất cả', count: counts.total },
    { id: 'valid', label: 'Hợp lệ', count: counts.valid },
    { id: 'error', label: 'Có lỗi', count: counts.error },
  ];
  const visible = preview.rows.filter(
    (r) => tab === 'all' || (tab === 'valid' ? r.errors.length === 0 : r.errors.length > 0),
  );
  const canCommit = counts.total > 0 && counts.error === 0 && preview.fileErrors.length === 0;

  const columns: Column<ImportRowDto>[] = [
    { id: 'row', header: 'Dòng', cell: (r) => <MainCell mono>{r.rowNumber}</MainCell> },
    {
      id: 'route',
      header: 'Tuyến',
      cell: (r) =>
        r.view.route || <SubText>{preview.kind === 'fee' ? 'Mọi tuyến' : 'Chưa nhập'}</SubText>,
    },
    {
      id: 'type',
      header: 'Loại cont',
      cell: (r) => <span className="font-mono">{r.view.containerType}</span>,
    },
    {
      id: 'mode',
      header: 'Chế độ chạy',
      cell: (r) => (TRIP_MODE_LABELS as Record<string, string>)[r.view.tripMode] ?? r.view.tripMode,
    },
    { id: 'customer', header: 'Khách', cell: (r) => r.view.customer || <SubText>Chung</SubText> },
    ...(preview.kind === 'fee'
      ? [
          {
            id: 'fee',
            header: 'Mã phí',
            cell: (r: ImportRowDto) => <span className="font-mono">{r.view.feeCode}</span>,
          } satisfies Column<ImportRowDto>,
        ]
      : []),
    {
      id: 'amount',
      header: preview.kind === 'freight' ? 'Giá cước' : 'Số tiền',
      cell: (r) =>
        /^\d+(\.\d+)?$/.test(r.view.amount)
          ? formatMoney(r.view.amount)
          : r.view.amount || <SubText>Chưa nhập</SubText>,
    },
    {
      id: 'validity',
      header: 'Hiệu lực',
      cell: (r) => (
        <>
          <span className="block whitespace-nowrap">
            {r.view.validFrom ? formatDate(r.view.validFrom) : '—'}
          </span>
          <SubText>{r.view.validTo ? `đến ${formatDate(r.view.validTo)}` : 'Vô thời hạn'}</SubText>
        </>
      ),
    },
    {
      id: 'result',
      header: 'Kết quả',
      cell: (r) =>
        r.errors.length === 0 ? (
          <StatusChip tone="ok" icon={<CircleCheck className="size-14" />}>
            Hợp lệ
          </StatusChip>
        ) : (
          <div className="flex min-w-form flex-col gap-4">
            <StatusChip tone="crit" icon={<TriangleAlert className="size-14" />}>
              {r.errors.length === 1 ? 'Có lỗi' : `${r.errors.length} lỗi`}
            </StatusChip>
            <ul className="m-0 list-none p-0">
              {r.errors.map((message) => (
                <li key={message} className="text-small text-crit">
                  {message}
                </li>
              ))}
            </ul>
          </div>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-20">
      {picker}

      {preview.fileErrors.length > 0 ? (
        <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
          {preview.fileErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </Alert>
      ) : null}

      {counts.total === 0 && preview.fileErrors.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={<FileSpreadsheet className="size-24" />}
            title="File không có dòng dữ liệu"
            description="File chỉ có dòng tiêu đề hoặc toàn dòng trống. Điền dữ liệu từ dòng 2 theo file mẫu rồi chọn lại."
            action={
              <Button variant="secondary" onClick={reset}>
                Chọn file khác
              </Button>
            }
          />
        </div>
      ) : counts.total > 0 ? (
        <WorkTableCard
          title="Xem trước"
          meta={`${fileName}: ${counts.total} dòng`}
          toolbar={
            <div className="flex flex-wrap items-center justify-between gap-12">
              <FilterTabs
                label="Lọc dòng theo kết quả"
                tabs={tabs}
                value={tab}
                onChange={(id) => setTab(id as TabId)}
              />
              <div className="flex flex-wrap items-center gap-12">
                <Button variant="secondary" size="sm" onClick={reset}>
                  <Upload className="size-18" aria-hidden="true" />
                  Chọn file khác
                </Button>
                <Button
                  size="sm"
                  disabled={!canCommit}
                  loading={committing}
                  onClick={() => commit(preview)}
                >
                  Nhập {counts.valid} dòng
                </Button>
              </div>
            </div>
          }
          alert={
            commitError ? (
              <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
                {commitError}
              </Alert>
            ) : counts.error > 0 ? (
              <Alert tone="warn" icon={<TriangleAlert className="size-20" />}>
                Còn {counts.error} dòng lỗi nên chưa nhập được. Sửa các dòng ghi ở cột Kết quả trong
                file Excel rồi chọn file lại; hệ thống không nhập một phần.
              </Alert>
            ) : null
          }
          footer={
            canCommit
              ? `Sẵn sàng nhập ${counts.valid} dòng`
              : `${counts.valid} dòng hợp lệ, ${counts.error} dòng lỗi`
          }
        >
          {visible.length === 0 ? (
            <EmptyState
              icon={<CircleCheck className="size-24" />}
              tone="ok"
              title={tab === 'error' ? 'Không có dòng lỗi' : 'Không có dòng hợp lệ'}
              description={
                tab === 'error'
                  ? 'Mọi dòng trong file đều hợp lệ.'
                  : 'Chưa có dòng nào hợp lệ. Xem tab "Có lỗi" để biết cần sửa gì.'
              }
            />
          ) : (
            <DataTable
              columns={columns}
              rows={visible}
              rowKey={(r) => String(r.rowNumber)}
              caption="Xem trước các dòng import"
            />
          )}
        </WorkTableCard>
      ) : null}
    </div>
  );
}

const skeletonColumns: Column<never>[] = [
  'Dòng',
  'Tuyến',
  'Loại cont',
  'Giá',
  'Hiệu lực',
  'Kết quả',
].map((header) => ({
  id: header,
  header,
  cell: () => null,
}));
