// Giữ chỗ: nội dung trang chủ (KPI, mốc hạn, bảng việc) làm ở task 22. Khung AppShell do (tenant)/layout.tsx cung cấp.
export default function TenantHomePage() {
  return (
    <div className="flex flex-col gap-24">
      <div>
        <h1 className="text-screen-title text-ink">Trang chủ</h1>
        <p className="mt-4 text-ink-soft">Các chỉ số và mốc hạn sẽ hiện ở đây khi có dữ liệu.</p>
      </div>
    </div>
  );
}
