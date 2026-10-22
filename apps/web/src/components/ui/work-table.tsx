import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// WorkTable theo designs/components/WorkTable: khối trắng gồm đầu (H2 + ghi chú + tab), bảng cuộn ngang trong khối,
// chân khối (aria-live). 4 trạng thái: đang tải (dòng xương), trống (EmptyState thay bảng), lỗi (Alert trên bảng,
// giữ dữ liệu cũ), có dữ liệu. Trang gọi component này chọn nội dung cho từng trạng thái.
type WorkTableCardProps = {
  title: string;
  meta?: ReactNode;
  /** FilterTabs, ô tìm, nút thêm... đặt trong đầu khối. */
  toolbar?: ReactNode;
  alert?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function WorkTableCard({
  title,
  meta,
  toolbar,
  alert,
  footer,
  children,
}: WorkTableCardProps) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-col gap-12 px-20 pb-12 pt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-8">
          <h2 className="text-section-title text-ink">{title}</h2>
          {meta ? <span className="text-small text-ink-soft">{meta}</span> : null}
        </div>
        {toolbar}
        {alert}
      </div>
      {children}
      <p
        aria-live="polite"
        className="m-0 border-t border-line px-20 py-12 text-small text-ink-soft"
      >
        {footer}
      </p>
    </section>
  );
}

export type Column<Row> = {
  id: string;
  header: string;
  /** Tiêu đề chỉ cho trình đọc màn hình (cột nút cuối). */
  srOnlyHeader?: boolean;
  cell: (row: Row) => ReactNode;
};

type DataTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  caption: string;
  /** Đang tải: hiện dòng xương thay dữ liệu. */
  loading?: boolean;
};

const SKELETON_ROWS = 5;

export function DataTable<Row>({ columns, rows, rowKey, caption, loading }: DataTableProps<Row>) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-table border-collapse" aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="whitespace-nowrap border-b border-line bg-surface-2 px-12 py-10 text-left text-caption text-ink-soft first:pl-20 last:pr-20"
              >
                {column.srOnlyHeader ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={index} aria-hidden="true">
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className="border-b border-line px-12 py-10 first:pl-20 last:pr-20"
                    >
                      <span className="block h-14 w-full max-w-form rounded-chip-sm bg-surface-2" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-surface-2">
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className="border-b border-line px-12 py-10 align-top text-body-sm first:pl-20 last:pr-20"
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ô chính (đậm); mã định danh thêm `mono`. */
export function MainCell({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className={cn('block whitespace-nowrap font-semibold', mono && 'font-mono font-medium')}>
      {children}
    </span>
  );
}

/** Dòng phụ dưới ô chính. */
export function SubText({ children }: { children: ReactNode }) {
  return <span className="block text-small text-ink-soft">{children}</span>;
}
