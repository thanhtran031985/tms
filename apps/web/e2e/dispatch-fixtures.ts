import { expect, type Page } from '@playwright/test';
import { createDb } from '@core/lib/db/client';
import { SEED_ORDER_CONTAINERS, SEED_ORDERS } from '@core/lib/db/seeds/orders.test-data';

// Đưa các container mẫu dùng trong e2e điều vận về "chưa điều": hủy mọi chuyến và assignment của chúng rồi đặt lại
// PENDING. Cần khi lần chạy trước dừng giữa chừng (db:seed không xóa chuyến do e2e tạo ra) để test không phụ thuộc lần trước.
// Dùng SQL trực tiếp vì web không phụ thuộc drizzle-orm; chỉ chạy trong e2e trên DB thử nghiệm.
export async function resetDispatchContainers(containerIds: string[]): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('E2E cần DATABASE_URL (xem .env.example).');
  const { pool } = createDb(url);
  try {
    const [links] = await pool.query(
      'SELECT DISTINCT trip_id AS tripId FROM trip_containers WHERE order_container_id IN (?)',
      [containerIds],
    );
    const tripIds = (links as { tripId: string }[]).map((row) => row.tripId);
    if (tripIds.length > 0) {
      await pool.query(
        "UPDATE dispatch_assignments SET status = 'CANCELLED' WHERE consolidated_trip_id IN (?)",
        [tripIds],
      );
      await pool.query("UPDATE consolidated_trips SET status = 'CANCELLED' WHERE id IN (?)", [
        tripIds,
      ]);
    }
    await pool.query("UPDATE order_containers SET status = 'PENDING' WHERE id IN (?)", [
      containerIds,
    ]);
  } finally {
    await pool.end();
  }
}

const idOfOrder = (orderNo: string) => SEED_ORDERS.find((o) => o.orderNo === orderNo)!.id;

/** Hai cont 40HC của Order EXP-2610-046 (cùng khung 08:00 ngày 28/10) cho test hai trình duyệt. */
export const CONCURRENCY_CONTAINER_IDS = SEED_ORDER_CONTAINERS.filter(
  (c) => c.orderId === idOfOrder('EXP-2610-046'),
).map((c) => c.id!);

/** Cont MAEU2388422 (Order IMP-2610-031, 08:00–11:30 ngày 25/10) cho test gán xe một người. */
export const ASSIGN_CONTAINER_IDS = SEED_ORDER_CONTAINERS.filter(
  (c) => c.containerNo === 'MAEU2388422',
).map((c) => c.id!);

/**
 * Đăng nhập cho e2e điều vận. Chờ form đăng nhập hydrate xong rồi mới bấm: dưới tải của cả bộ e2e (next dev biên dịch
 * từng route) bấm sớm làm trình duyệt gửi form kiểu GET thuần nên đăng nhập không chạy.
 */
export async function loginAs(page: Page, email: string, tenantName?: string): Promise<void> {
  await page.goto('/login');
  await page.waitForFunction(() => {
    const form = document.querySelector('form');
    return !!form && Object.keys(form).some((key) => key.startsWith('__reactProps'));
  });
  await page.getByLabel('Email hoặc số điện thoại').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.SEED_DEV_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  if (tenantName) {
    await expect(page).toHaveURL(/\/select-tenant/);
    await page.getByRole('button', { name: new RegExp(tenantName) }).click();
  }
  await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}
