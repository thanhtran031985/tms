import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

async function fillAndSubmit(page: Page, identifier: string, password: string) {
  await page.getByLabel('Email hoặc số điện thoại').fill(identifier);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

test.describe('đăng nhập và chọn công ty', () => {
  test('người một công ty vào thẳng trang chủ', async ({ page }) => {
    await page.goto('/login');
    await fillAndSubmit(page, 'owner@phucan.vn', PASSWORD);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
  });

  test('người nhiều công ty thấy TenantPicker, chọn xong vào trang chủ', async ({ page }) => {
    await page.goto('/login');
    await fillAndSubmit(page, 'hung.dv@phucan.vn', PASSWORD);

    await expect(page).toHaveURL(/\/select-tenant/);
    await expect(page.getByRole('heading', { name: 'Chọn công ty để làm việc' })).toBeVisible();
    const phucAn = page.getByRole('button', { name: /Vận tải Phúc An/ });
    const saoViet = page.getByRole('button', { name: /Logistics Sao Việt/ });
    await expect(phucAn).toBeVisible();
    await expect(saoViet).toBeVisible();
    await expect(phucAn).toContainText('Điều vận');

    await saoViet.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
  });

  test('đăng nhập được bằng số điện thoại có khoảng trắng', async ({ page }) => {
    await page.goto('/login');
    await fillAndSubmit(page, '0903 000 111', PASSWORD);

    await expect(page).toHaveURL(/\/select-tenant/);
  });

  test('sai mật khẩu báo ngay dưới ô kèm số lần còn lại', async ({ page }) => {
    await page.goto('/login');
    await fillAndSubmit(page, 'xem@phucan.vn', 'sai-mat-khau');

    const password = page.getByLabel('Mật khẩu', { exact: true });
    await expect(page.getByText(/Mật khẩu chưa đúng\. Còn \d lần thử/)).toBeVisible();
    await expect(password).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await password.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toContainText('Còn');
  });

  test('sai 5 lần thì khóa 15 phút và nút ghi "Thử lại sau HH:MM"', async ({ page }) => {
    await page.goto('/login');
    for (let attempt = 1; attempt <= 4; attempt++) {
      await fillAndSubmit(page, 'khoa.test@phucan.vn', `sai-lan-${attempt}`);
      await expect(page.getByText(`Còn ${5 - attempt} lần thử`)).toBeVisible();
    }
    await fillAndSubmit(page, 'khoa.test@phucan.vn', 'sai-lan-5');

    await expect(page.getByText(/Tài khoản tạm khóa đến \d{2}:\d{2}/)).toBeVisible();
    const locked = page.getByRole('button', { name: /Thử lại sau \d{2}:\d{2}/ });
    await expect(locked).toBeVisible();
    await expect(locked).toBeDisabled();

    // Đang khóa thì mật khẩu đúng cũng không vào được.
    await page.reload();
    await fillAndSubmit(page, 'khoa.test@phucan.vn', PASSWORD);
    await expect(page.getByText(/Tài khoản tạm khóa đến \d{2}:\d{2}/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('tài khoản chưa có công ty thấy trạng thái Trống với hành động liên hệ quản trị', async ({
    page,
  }) => {
    await page.goto('/login');
    await fillAndSubmit(page, 'chua.co.congty@example.vn', PASSWORD);

    await expect(page).toHaveURL(/\/select-tenant/);
    await expect(page.getByText('Tài khoản chưa được gán vào công ty nào')).toBeVisible();
    await expect(page.getByRole('link', { name: /Liên hệ quản trị/ })).toBeVisible();
  });

  test('chưa đăng nhập vào trang khác bị chuyển về /login rồi quay lại sau khi đăng nhập', async ({
    page,
  }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login\?next=%2Forders/);

    await fillAndSubmit(page, 'owner@phucan.vn', PASSWORD);
    await expect(page).toHaveURL(/\/orders/);
  });

  test('"Đổi tài khoản" đăng xuất và về màn đăng nhập', async ({ page }) => {
    await page.goto('/login');
    await fillAndSubmit(page, 'hung.dv@phucan.vn', PASSWORD);
    await expect(page).toHaveURL(/\/select-tenant/);

    await page.getByRole('button', { name: 'Đổi tài khoản' }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto('/select-tenant');
    await expect(page).toHaveURL(/\/login/);
  });

  test('nút mắt hiện/ẩn mật khẩu đổi aria-pressed và kiểu ô', async ({ page }) => {
    await page.goto('/login');
    const password = page.getByLabel('Mật khẩu', { exact: true });
    const toggle = page.getByRole('button', { name: 'Hiện mật khẩu' });

    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('chế độ tối được nhớ qua cookie sau khi tải lại', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Chế độ tối' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expect
      .poll(async () => (await page.context().cookies()).some((c) => c.name === 'tms-theme'))
      .toBe(true);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('vùng bấm của ô nhập, nút và nút mắt tối thiểu 44px', async ({ page }) => {
    await page.goto('/login');
    for (const locator of [
      page.getByLabel('Email hoặc số điện thoại'),
      page.getByRole('button', { name: 'Đăng nhập', exact: true }),
      page.getByRole('button', { name: 'Hiện mật khẩu' }),
    ]) {
      const box = await locator.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
