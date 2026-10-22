import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc số điện thoại').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const topbar = (page: Page) => page.getByRole('banner');

test.describe('khung AppShell', () => {
  test('thanh bên 240px, thanh trên và vùng nội dung có đủ thành phần', async ({ page }) => {
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();

    const box = await nav(page).boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(240);

    await expect(topbar(page)).toContainText('Vận tải Phúc An');
    await expect(topbar(page)).toContainText('Trực tiếp');
    await expect(
      page.getByRole('button', { name: 'Tài khoản Trần Minh Quân, Chủ công ty' }),
    ).toBeVisible();
    await expect(
      page.getByRole('searchbox', { name: 'Tìm container, Order, biển số' }),
    ).toBeVisible();

    const home = nav(page).getByRole('link', { name: 'Trang chủ' });
    await expect(home).toHaveAttribute('aria-current', 'page');
    // "Trang chủ", "Danh mục" và "Bảng giá" là liên kết thật; các phân hệ chưa làm hiện ở trạng thái chưa có trang.
    await expect(nav(page).getByRole('link')).toHaveCount(10);
    await expect(nav(page).locator('a')).toHaveCount(3);
    const pending = nav(page).locator('[aria-disabled="true"]');
    await expect(pending).toHaveCount(7);
    await expect(pending.first()).toHaveAttribute('title', 'Chưa có trang');
  });

  test('đổi công ty trên thanh trên làm tên công ty và vai trò đổi theo', async ({ page }) => {
    await loginAs(page, 'hien.dt@phucan.vn');
    await expect(page).toHaveURL(/\/select-tenant/);
    await page.getByRole('button', { name: /Vận tải Phúc An/ }).click();

    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    await expect(topbar(page)).toContainText('Vận tải Phúc An');
    await expect(topbar(page)).toContainText('Kế toán');

    await page.getByRole('link', { name: /Đổi công ty, đang ở Vận tải Phúc An/ }).click();
    await expect(page).toHaveURL(/\/select-tenant/);
    await page.getByRole('button', { name: /Logistics Sao Việt/ }).click();

    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    await expect(topbar(page)).toContainText('Logistics Sao Việt');
    await expect(topbar(page)).toContainText('Quản trị');
    await expect(topbar(page)).not.toContainText('Vận tải Phúc An');
  });

  test('người chỉ thuộc một công ty không có nút đổi công ty', async ({ page }) => {
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Đổi công ty/ })).toHaveCount(0);
  });

  test('thứ tự Tab: thanh bên trước, thanh trên sau, không quay lại thanh bên', async ({
    page,
  }) => {
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    // Tải lại để điểm bắt đầu điều hướng bằng bàn phím về đầu tài liệu (nút Đăng nhập vừa bị gỡ).
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const regions: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      regions.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (el?.closest('nav')) return 'nav';
          if (el?.closest('header')) return 'header';
          if (el?.closest('main')) return 'main';
          return 'khác';
        }),
      );
    }
    expect(regions[0]).toBe('nav');
    const firstHeader = regions.indexOf('header');
    expect(firstHeader).toBeGreaterThan(0);
    expect(regions.slice(firstHeader)).not.toContain('nav');
    // Thứ tự trong DOM: thanh bên, thanh trên, rồi H1.
    const order = await page.evaluate(() => {
      const before = (a: Element | null, b: Element | null) =>
        !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const n = document.querySelector('nav');
      const h = document.querySelector('header');
      const h1 = document.querySelector('h1');
      return before(n, h) && before(h, h1);
    });
    expect(order).toBe(true);
  });

  test('phím / đưa con trỏ vào ô tìm, không chen vào khi đang gõ', async ({ page }) => {
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('/');
    const search = page.getByRole('searchbox', { name: 'Tìm container, Order, biển số' });
    await expect(search).toBeFocused();
    await page.keyboard.type('a/b');
    await expect(search).toHaveValue('a/b');
  });

  test('nút đổi giao diện trên thanh trên áp dụng ngay và nhớ qua tải lại', async ({ page }) => {
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    await topbar(page).getByRole('button', { name: 'Chế độ tối' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect
      .poll(async () => (await page.context().cookies()).some((c) => c.name === 'tms-theme'))
      .toBe(true);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('menu người dùng có Đăng xuất, đăng xuất rồi vào / bị chuyển về /login', async ({
    page,
  }) => {
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Tài khoản Trần Minh Quân/ }).click();
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('tài khoản tài xế không dùng web: thấy hướng dẫn dùng app điện thoại', async ({ page }) => {
    await loginAs(page, 'taixe@phucan.vn');

    await expect(page.getByText('Tài khoản này dùng app điện thoại')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  });

  test('viền focus 3px thấy rõ ở cả giao diện sáng và tối', async ({ page }) => {
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const measure = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        const probe = document.createElement('i');
        probe.style.color = 'var(--focus)';
        document.body.appendChild(probe);
        const focusColor = getComputedStyle(probe).color;
        probe.remove();
        return {
          width: style.outlineWidth,
          style: style.outlineStyle,
          color: style.outlineColor,
          focusColor,
        };
      });

    await page.keyboard.press('Tab');
    // Đợi hết hiệu ứng chuyển màu 150ms của liên kết trước khi đọc màu viền.
    await expect.poll(async () => (await measure()).color).toBe((await measure()).focusColor);
    const light = await measure();
    expect(light.width).toBe('3px');
    expect(light.style).toBe('solid');

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await measure()).color).toBe((await measure()).focusColor);
    const dark = await measure();
    expect(dark.width).toBe('3px');
    expect(dark.style).toBe('solid');
    expect(dark.focusColor).not.toBe(light.focusColor);
  });

  test('màn hẹp 600px: thanh bên thành dải trên cùng, thanh trên nằm dưới nó', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();

    const navBox = await nav(page).boundingBox();
    const headerBox = await topbar(page).boundingBox();
    expect(Math.round(navBox?.width ?? 0)).toBe(600);
    expect(navBox?.y).toBe(0);
    expect((headerBox?.y ?? 0) >= (navBox?.y ?? 0) + (navBox?.height ?? 0) - 1).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('1366×768 không tràn ngang và vùng nội dung dùng được', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await loginAs(page, 'owner@phucan.vn');
    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const main = await page.locator('main').boundingBox();
    expect(main?.width ?? 0).toBeGreaterThan(900);
  });
});
