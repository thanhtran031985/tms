import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';
// Đặt E2E_SHOTS=<thư mục> để lưu ảnh chụp màn hình đối chiếu với designs/components/Screen03-Dispatch.
const SHOTS = process.env.E2E_SHOTS;

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

const DISPATCHER = 'hung.dv@phucan.vn';
const TENANT = 'Vận tải Phúc An';
// Dữ liệu seed: chuyến mẫu 25/10 (MAEU2388417 đã lên kế hoạch, xe 51C-482.17), MAEU2388422 chờ điều có EDO và DEM/DET.
const DAY = '2026-10-25';

const column = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true });
const card = (page: Page, containerNo: string) =>
  page.getByRole('button', { name: new RegExp(containerNo) });

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test.describe('bảng điều vận Kanban', () => {
  test('mở /dispatch thấy 6 cột, thẻ đúng cột, nhãn cảng, DEM/DET và lịch xe', async ({ page }) => {
    await loginAs(page, DISPATCHER, TENANT);
    await page.goto(`/dispatch?date=${DAY}`);

    await expect(page.getByRole('heading', { name: 'Điều vận', level: 1 })).toBeVisible();
    for (const name of [
      'Chờ điều',
      'Đã lên kế hoạch',
      'Đã điều',
      'Đang chạy',
      'Chờ móc rơ moóc',
      'Hoàn thành chờ chứng từ',
    ]) {
      await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
    }

    const waiting = column(page, 'Chờ điều');
    await expect(waiting.getByRole('button', { name: /MAEU2388422/ })).toBeVisible();
    await expect(waiting.getByText('Có EDO')).toBeVisible();
    await expect(waiting.getByText(/^DEM còn/)).toBeVisible();
    await expect(waiting.getByText(/^DET còn|^DET quá/)).toBeVisible();

    const planned = column(page, 'Đã lên kế hoạch');
    await expect(planned.getByRole('button', { name: /MAEU2388417/ })).toBeVisible();
    await expect(planned.getByText('51C-482.17')).toBeVisible();
    await expect(column(page, 'Chờ móc rơ moóc')).toContainText('Drop & Hook');

    // Lịch xe: khối chuyến nằm ở làn 51C-482.17.
    const lane = page.locator('[data-lane="51C-482.17"]');
    await expect(lane.locator('[data-block-kind="TRIP"]')).toContainText('MAEU2388417');
    await shot(page, 'dispatch-1440');
  });

  test('1366×768: không tràn ngang trang, bảng cuộn ngang trong khung', async ({ page }) => {
    await loginAs(page, DISPATCHER, TENANT);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/dispatch?date=${DAY}`);
    await expect(page.getByRole('heading', { name: 'Chờ điều', level: 2 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, 'dispatch-1366');
  });

  test('chiều hàng và ô tìm lọc thẻ, cập nhật số đếm và URL; cột trống ghi không khớp bộ lọc', async ({
    page,
  }) => {
    await loginAs(page, DISPATCHER, TENANT);
    await page.goto(`/dispatch?date=${DAY}`);
    const tabs = page.getByRole('tablist', { name: 'Lọc theo chiều hàng' });
    await expect(tabs.getByRole('tab', { name: /^Nhập/ })).toContainText('2');
    await expect(tabs.getByRole('tab', { name: /^Xuất/ })).toContainText('0');

    await tabs.getByRole('tab', { name: /^Xuất/ }).click();
    await expect(page).toHaveURL(/dir=EXPORT/);
    await expect(column(page, 'Chờ điều')).toContainText('Không có container nào khớp bộ lọc.');
    await expect(card(page, 'MAEU2388422')).toHaveCount(0);

    await tabs.getByRole('tab', { name: /^Tất cả/ }).click();
    await expect(page).not.toHaveURL(/dir=/);
    await page.getByLabel('Lọc theo số container, Order hoặc khách hàng').fill('maeu2388422');
    await expect(page).toHaveURL(/q=maeu2388422/);
    await expect(card(page, 'MAEU2388422')).toBeVisible();
    await expect(card(page, 'MAEU2388417')).toHaveCount(0);
  });

  test('chưa đăng nhập: API realtime trả 401 JSON, trang điều vận chuyển về đăng nhập', async ({
    request,
    page,
  }) => {
    const response = await request.get('/api/v1/stream/dispatch', { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });

    await page.goto('/dispatch');
    await expect(page).toHaveURL(/\/login/);
  });

  test('menu Điều vận dẫn tới /dispatch', async ({ page }) => {
    await loginAs(page, DISPATCHER, TENANT);
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Điều vận' }).click();
    await expect(page).toHaveURL(/\/dispatch/);
    await expect(page.getByRole('heading', { name: 'Điều vận', level: 1 })).toBeVisible();
  });
});
