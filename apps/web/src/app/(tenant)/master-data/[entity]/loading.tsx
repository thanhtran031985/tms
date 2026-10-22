import { DataTable, WorkTableCard } from '@/components/ui/work-table';

// Trạng thái "Đang tải": giữ khung khối, dòng xương thay dữ liệu (designs/components/WorkTable).
const COLUMNS = ['Mã', 'Tên', 'Thông tin', 'Chi tiết'].map((header) => ({
  id: header,
  header,
  cell: () => null,
}));

export default function Loading() {
  return (
    <WorkTableCard title="Đang tải danh mục" footer="Đang tải dữ liệu">
      <DataTable columns={COLUMNS} rows={[]} rowKey={() => ''} caption="Đang tải" loading />
    </WorkTableCard>
  );
}
