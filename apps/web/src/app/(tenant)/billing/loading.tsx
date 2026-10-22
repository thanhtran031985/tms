import { DataTable, WorkTableCard } from '@/components/ui/work-table';

// Trạng thái "Đang tải": giữ khung khối, dòng xương thay dữ liệu (designs/components/WorkTable).
const COLUMNS = ['Tuyến', 'Loại cont', 'Chế độ chạy', 'Giá', 'Hiệu lực'].map((header) => ({
  id: header,
  header,
  cell: () => null,
}));

export default function Loading() {
  return (
    <WorkTableCard title="Đang tải bảng giá" footer="Đang tải dữ liệu">
      <DataTable columns={COLUMNS} rows={[]} rowKey={() => ''} caption="Đang tải" loading />
    </WorkTableCard>
  );
}
