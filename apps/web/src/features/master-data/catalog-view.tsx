'use client';

import { CircleAlert, Plus, RefreshCw, SearchX, Trash2, type LucideIcon } from 'lucide-react';
import { useId, useMemo, useState, type ComponentType } from 'react';
import type { Result } from '@shared/result';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import { DataTable, WorkTableCard, type Column } from '@/components/ui/work-table';
import type { FormProps } from './form-utils';

// Màn danh sách + ngăn kéo form dùng chung cho 5 danh mục (task 02). Dữ liệu đầu do trang (server) nạp;
// lọc, tìm ở client; sau mỗi thay đổi nạp lại bằng Server Action list*. Nạp lại lỗi thì GIỮ dòng cũ + "Thử lại".
export type CatalogAccess = 'write' | 'billing' | 'read';

type CatalogViewProps<Row extends { id: string; name: string }> = {
  title: string;
  /** "khách hàng": dùng trong nút, tiêu đề ngăn kéo, thông báo. */
  singular: string;
  icon: LucideIcon;
  emptyReason: string;
  initialRows: Row[];
  access: CatalogAccess;
  columns: Column<Row>[];
  searchText: (row: Row) => string;
  rowCode: (row: Row) => string;
  filter?: { label: string; tabs: { id: string; label: string }[]; pick: (row: Row) => string };
  list: () => Promise<Result<Row[]>>;
  softDelete: (id: string) => Promise<Result<unknown>>;
  restore: (id: string) => Promise<Result<unknown>>;
  Form: ComponentType<FormProps<Row>>;
};

// Bỏ dấu và hoa thường để tìm "cat lai" ra "Cát Lái".
function fold(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function CatalogView<R extends { id: string; name: string }>({
  title,
  singular,
  icon: Icon,
  emptyReason,
  initialRows,
  access,
  columns,
  searchText,
  rowCode,
  filter,
  list,
  softDelete,
  restore,
  Form,
}: CatalogViewProps<R>) {
  const formId = useId();
  const [rows, setRows] = useState(initialRows);
  const [reloadError, setReloadError] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [drawer, setDrawer] = useState<{ row: R | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<R | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const canWrite = access === 'write';
  const canEdit = access !== 'read';

  async function reload() {
    setReloading(true);
    try {
      const result = await list();
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

  const tabs: FilterTab[] = useMemo(() => {
    if (!filter) return [];
    return [
      { id: 'all', label: 'Tất cả', count: rows.length },
      ...filter.tabs.map((t) => ({
        ...t,
        count: rows.filter((r) => filter.pick(r) === t.id).length,
      })),
    ];
  }, [filter, rows]);

  const visible = useMemo(() => {
    const needle = fold(query.trim());
    return rows.filter((row) => {
      if (filter && tab !== 'all' && filter.pick(row) !== tab) return false;
      return needle === '' || fold(searchText(row)).includes(needle);
    });
  }, [rows, query, tab, filter, searchText]);

  const hasFilter = query.trim() !== '' || tab !== 'all';

  function closeDrawer() {
    setDrawer(null);
  }

  async function afterSaved(message: string) {
    closeDrawer();
    setStatus(message);
    await reload();
  }

  async function handleRestore(id: string) {
    const result = await restore(id);
    if (result.ok) await afterSaved(`Đã khôi phục ${singular}.`);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await softDelete(confirmDelete.id);
      if (!result.ok) {
        setDeleteError(result.message);
        return;
      }
      const name = confirmDelete.name;
      setConfirmDelete(null);
      closeDrawer();
      setStatus(`Đã xóa ${singular} ${name}.`);
      await reload();
    } catch {
      setDeleteError('Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.');
    } finally {
      setDeleting(false);
    }
  }

  const allColumns: Column<R>[] = [
    ...columns,
    {
      id: 'action',
      header: 'Thao tác',
      srOnlyHeader: true,
      cell: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDrawer({ row })}
          aria-label={`${canEdit ? 'Sửa' : 'Xem'} ${singular} ${rowCode(row)}`}
        >
          {canEdit ? 'Sửa' : 'Xem'}
        </Button>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-12">
      {filter ? (
        <FilterTabs label={filter.label} tabs={tabs} value={tab} onChange={setTab} />
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-12">
        <input
          type="search"
          aria-label={`Tìm ${singular} theo mã hoặc tên`}
          placeholder="Tìm theo mã hoặc tên"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-ctl w-full min-w-0 rounded-control border border-line-strong bg-surface px-14 text-body-sm text-ink placeholder:text-ink-soft hover:border-ink-soft sm:w-form"
        />
        {canWrite ? (
          <Button size="sm" onClick={() => setDrawer({ row: null })}>
            <Plus className="size-18" aria-hidden="true" />
            Thêm {singular}
          </Button>
        ) : null}
      </div>
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
      ? `Chưa có ${singular} nào`
      : `Hiện ${visible.length} trên ${rows.length} ${singular}`);

  return (
    <>
      <WorkTableCard
        title={title}
        meta={`${rows.length} ${singular}`}
        toolbar={toolbar}
        alert={alert}
        footer={footer}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon className="size-24" />}
            title={`Chưa có ${singular} nào`}
            description={emptyReason}
            action={
              canWrite ? (
                <Button onClick={() => setDrawer({ row: null })}>
                  <Plus className="size-20" aria-hidden="true" />
                  Thêm {singular}
                </Button>
              ) : undefined
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-24" />}
            title="Không có kết quả phù hợp"
            description={`Không có ${singular} nào khớp với tìm kiếm hoặc bộ lọc hiện tại. Bỏ bộ lọc để xem toàn bộ.`}
            action={
              hasFilter ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setTab('all');
                  }}
                >
                  Bỏ bộ lọc
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={allColumns}
            rows={visible}
            rowKey={(row) => row.id}
            caption={`Danh sách ${singular}`}
          />
        )}
      </WorkTableCard>

      <Drawer
        open={drawer !== null}
        onClose={closeDrawer}
        title={drawer?.row ? `${canEdit ? 'Sửa' : 'Chi tiết'} ${singular}` : `Thêm ${singular}`}
        description={
          access === 'billing' && drawer?.row
            ? 'Vai trò của bạn chỉ sửa được thông tin thanh toán.'
            : undefined
        }
        footer={
          <>
            {canWrite && drawer?.row ? (
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDelete(drawer.row);
                }}
              >
                <Trash2 className="size-18" aria-hidden="true" />
                Xóa {singular}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={closeDrawer}>
              {canEdit ? 'Hủy' : 'Đóng'}
            </Button>
            {canEdit ? (
              <Button type="submit" form={formId} loading={saving}>
                Lưu {singular}
              </Button>
            ) : null}
          </>
        }
      >
        {drawer ? (
          <Form
            formId={formId}
            row={drawer.row}
            readOnly={!canEdit}
            billingOnly={access === 'billing'}
            onSaving={setSaving}
            onSaved={afterSaved}
            onRestore={handleRestore}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Xóa ${singular}?`}
        description={
          confirmDelete
            ? `${confirmDelete.name} sẽ ẩn khỏi danh sách và các ô chọn. Dữ liệu cũ vẫn giữ để đơn hàng đã tạo hiển thị đúng, và có thể khôi phục sau.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Giữ lại
            </Button>
            <Button onClick={handleDelete} loading={deleting}>
              Xóa {singular}
            </Button>
          </>
        }
      >
        {deleteError ? (
          <Alert tone="crit" icon={<CircleAlert className="size-20" />}>
            {deleteError}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
