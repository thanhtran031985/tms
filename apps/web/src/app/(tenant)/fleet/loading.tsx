import { DataTable, WorkTableCard } from '@/components/ui/work-table';

// Trạng thái "Đang tải": giữ khung khối, dòng xương thay dữ liệu. Tiêu đề và tab nằm ở layout nên không nhấp nháy.
const COLUMNS = ['Trạng thái', 'Biển số', 'Loại', 'Hạn giấy tờ gần nhất', 'Thao tác'].map(
  (header) => ({ id: header, header, cell: () => null }),
);

export default function Loading() {
  return (
    <div aria-busy="true">
      <WorkTableCard title="Đang tải" footer="Đang tải dữ liệu">
        <DataTable columns={COLUMNS} rows={[]} rowKey={() => ''} caption="Đang tải" loading />
      </WorkTableCard>
    </div>
  );
}
