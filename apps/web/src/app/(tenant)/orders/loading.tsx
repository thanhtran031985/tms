import { DataTable, WorkTableCard } from '@/components/ui/work-table';

// Trạng thái "Đang tải": giữ khung khối, dòng xương thay dữ liệu (designs/components/Screen04-Orders).
const COLUMNS = [
  'Order · Booking/B/L',
  'Khách hàng',
  'Hãng tàu · tàu/chuyến',
  'Cut-off',
  'Container',
  'Tổng cước',
  'Trạng thái',
].map((header) => ({ id: header, header, cell: () => null }));

export default function Loading() {
  return (
    <div className="flex flex-col gap-24" aria-busy="true">
      <div>
        <h1 className="text-screen-title text-ink">Đang tải danh sách Order</h1>
        <p className="mt-4 text-ink-soft">Đang lấy Order và container mới nhất.</p>
      </div>
      <WorkTableCard title="Danh sách Order" footer="Đang tải dữ liệu">
        <DataTable columns={COLUMNS} rows={[]} rowKey={() => ''} caption="Đang tải" loading />
      </WorkTableCard>
    </div>
  );
}
