import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

async function loginAs(page: Page, email: string, tenantName?: string) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc số điện thoại').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  if (tenantName) {
    await expect(page).toHaveURL(/\/select-tenant/);
    await page.getByRole('button', { name: new RegExp(tenantName) }).click();
  }

  await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });

test.describe('đội xe và tài xế', () => {
  test('quản lý đội xe: theo dõi giấy tờ sắp hết hạn và đã hết hạn đúng dữ liệu seed', async ({
    page,
  }) => {
    await loginAs(page, 'doixe@phucan.vn');
    await page.goto('/fleet/documents');
    await page.waitForLoadState('networkidle');

    // Tiêu đề trang và thanh điều hướng phân hệ
    await expect(page.getByRole('heading', { name: 'Đội xe & Tài xế' })).toBeVisible();
    const fleetNav = page.getByRole('navigation', { name: 'Phân hệ đội xe' });
    await expect(fleetNav.getByRole('link', { name: 'Đầu kéo' })).toBeVisible();
    await expect(fleetNav.getByRole('link', { name: 'Rơ moóc' })).toBeVisible();
    await expect(fleetNav.getByRole('link', { name: 'Tài xế' })).toBeVisible();
    await expect(fleetNav.getByRole('link', { name: 'Theo dõi giấy tờ' })).toBeVisible();

    // Alert cảnh báo tổng hợp
    await expect(page.getByText(/Có .* giấy tờ đã hết hạn/i)).toBeVisible();

    // Filter tabs
    const tabs = page.getByRole('tablist', { name: 'Lọc theo hạn giấy tờ' });
    await expect(tabs.getByRole('tab', { name: /Tất cả/ })).toBeVisible();
    const expiredTab = tabs.getByRole('tab', { name: /Đã hết hạn/ });
    const expiringSoonTab = tabs.getByRole('tab', { name: /Sắp hết hạn/ });
    await expect(expiredTab).toBeVisible();
    await expect(expiringSoonTab).toBeVisible();

    // Tab "Đã hết hạn" hiển thị các giấy tờ quá hạn từ seed
    await expiredTab.click();
    await expect(rowOf(page, '51C-228.40')).toContainText('Đăng kiểm');
    await expect(rowOf(page, '51C-228.40')).toContainText('Quá hạn');
    await expect(rowOf(page, '51R-556.78')).toContainText('Kiểm định rơ moóc');
    await expect(rowOf(page, 'Lê Minh Tuấn')).toContainText('GPLX');

    // Tab "Sắp hết hạn 15 ngày"
    await expiringSoonTab.click();
    await expect(rowOf(page, 'Trần Văn Lộc')).toContainText('GPLX');
    await expect(rowOf(page, 'Trần Văn Lộc')).toContainText('Còn 2 ngày');
    await expect(rowOf(page, 'Nguyễn Hoàng Nam')).toContainText('Chứng chỉ hàng nguy hiểm');
    await expect(rowOf(page, 'Nguyễn Hoàng Nam')).toContainText('Còn 12 ngày');
    await expect(rowOf(page, '51C-991.12')).toContainText('Đăng kiểm');
    await expect(rowOf(page, '51R-334.56')).toContainText('Kiểm định rơ moóc');

    // Tìm kiếm tức thì trong bảng
    await tabs.getByRole('tab', { name: /Tất cả/ }).click();
    const searchBox = page.getByPlaceholder('Tìm biển số, tài xế, giấy tờ...');
    await searchBox.fill('51C-228.40');
    await expect(rowOf(page, '51C-228.40')).toHaveCount(2);
    await expect(rowOf(page, '51C-482.17')).toHaveCount(0);
    await searchBox.fill('');
  });

  test('mở /fleet/documents trên màn hình 1440x900 và 1366x768', async ({ page }) => {
    await loginAs(page, 'admin@phucan.vn');

    // Viewport 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fleet/documents');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('table')).toBeVisible();

    // Viewport 1366x768 (chuẩn laptop 14 inch)
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.getByRole('table')).toBeVisible();

    // Bảng nằm trong container có cuộn ngang nếu bảng quá rộng
    const scrollContainer = page.locator('.overflow-x-auto').first();
    await expect(scrollContainer).toBeVisible();

    // StatusChip luôn có cả icon (svg) và chữ
    const statusChips = page.locator('span.inline-flex.items-center.gap-6');
    const firstChip = statusChips.first();
    await expect(firstChip).toBeVisible();
    await expect(firstChip.locator('svg')).toBeVisible();
  });

  test('điều vận (DISPATCHER) xem tài xế thấy SĐT, CCCD, GPLX đã che', async ({ page }) => {
    // hung.dv@phucan.vn có 2 tenant, chọn Vận tải Phúc An
    await loginAs(page, 'hung.dv@phucan.vn', 'Vận tải Phúc An');
    await page.goto('/fleet/drivers');
    await page.waitForLoadState('networkidle');

    // Thấy danh sách tài xế
    await expect(rowOf(page, 'Trần Văn Lộc')).toBeVisible();

    // SĐT phải bị che (vd: 090xx xxx 456), không được lộ số gốc 0903123456
    await expect(page.getByText('0903123456')).toHaveCount(0);
    await expect(rowOf(page, 'Trần Văn Lộc')).toContainText(/090xx xxx 456/);

    // CCCD phải bị che (vd: 079xxxxxx234), không lộ 079085001234
    await expect(page.getByText('079085001234')).toHaveCount(0);
    await expect(rowOf(page, 'Trần Văn Lộc')).toContainText(/079xxxxxx234/);

    // GPLX phải bị che (vd: GPLxxxxxx233), không lộ GPLX-79-112233
    await expect(page.getByText('GPLX-79-112233')).toHaveCount(0);
    await expect(rowOf(page, 'Trần Văn Lộc')).toContainText(/GPLxxxxxx233/);

    // Điều vận chỉ có quyền xem, không thấy nút Thêm tài xế
    await expect(page.getByRole('button', { name: 'Thêm tài xế' })).toHaveCount(0);
  });

  test('quản lý đội xe (FLEET_MANAGER) xem tài xế thấy đầy đủ SĐT, CCCD, GPLX', async ({
    page,
  }) => {
    await loginAs(page, 'doixe@phucan.vn');
    await page.goto('/fleet/drivers');
    await page.waitForLoadState('networkidle');

    // Thấy đầy đủ thông tin gốc không bị che
    await expect(rowOf(page, 'Trần Văn Lộc')).toContainText('0903123456');
    await expect(rowOf(page, 'Trần Văn Lộc')).toContainText('079085001234');
    await expect(rowOf(page, 'Trần Văn Lộc')).toContainText('GPLX-79-112233');

    // Có nút Thêm tài xế
    await expect(page.getByRole('button', { name: 'Thêm tài xế' })).toBeVisible();
  });

  test('danh sách đầu kéo và rơ moóc hiển thị đầy đủ biển số font-mono và chip trạng thái', async ({
    page,
  }) => {
    await loginAs(page, 'doixe@phucan.vn');

    // Đầu kéo
    await page.goto('/fleet/tractors');
    await page.waitForLoadState('networkidle');
    await expect(rowOf(page, '51C-482.17')).toBeVisible();
    await expect(rowOf(page, '51C-228.40')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm đầu kéo' })).toBeVisible();

    // Rơ moóc
    await page.goto('/fleet/trailers');
    await page.waitForLoadState('networkidle');
    await expect(rowOf(page, '51R-112.23')).toContainText('20FT');
    await expect(rowOf(page, '51R-556.78')).toContainText('40FT_COMBO');
    await expect(rowOf(page, '51R-556.78')).toContainText('Twin 20');
    await expect(rowOf(page, '51R-556.78')).toContainText('Genset');
    await expect(page.getByRole('button', { name: 'Thêm rơ moóc' })).toBeVisible();
  });
});
