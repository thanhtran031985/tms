import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc số điện thoại').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
}

async function openCatalog(page: Page, email: string, slug: string, heading: string) {
  await loginAs(page, email);
  await page.goto(`/master-data/${slug}`);
  await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
  // Đợi hydrate xong để các nút mở ngăn kéo phản hồi.
  await page.waitForLoadState('networkidle');
}

const uniqueCode = (prefix: string) => `${prefix}${Date.now().toString(36).toUpperCase()}`;
const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const drawer = (page: Page) => page.getByRole('dialog').first();

test.describe('danh mục: danh sách', () => {
  test('khách hàng của công ty hiện đủ cột, không lộ dữ liệu công ty khác', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'customers', 'Khách hàng');

    await expect(rowOf(page, 'THEPNL')).toContainText('Công ty TNHH Thép Nam Long');
    await expect(rowOf(page, 'PHUCTHINH')).toContainText('45 ngày');
    await expect(page.getByText('Minh Khang')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Mã số thuế' })).toBeVisible();
  });

  test('công ty khác thấy khách của mình, cùng mã THEPNL nhưng là khách khác', async ({ page }) => {
    await openCatalog(page, 'dieuvan@saoviet.vn', 'customers', 'Khách hàng');

    await expect(rowOf(page, 'THEPNL')).toContainText('Thép Việt Nhật');
    await expect(page.getByText('Thép Nam Long')).toHaveCount(0);
    await expect(rowOf(page, 'DETMK')).toBeVisible();
  });

  test('địa điểm: tab loại có số đếm, lọc và tìm không dấu', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'locations', 'Địa điểm');

    const tabs = page.getByRole('tablist', { name: 'Lọc địa điểm theo loại' });
    await expect(tabs.getByRole('tab', { name: /Tất cả/ })).toContainText('9');
    await expect(tabs.getByRole('tab', { name: /Kho khách/ })).toContainText('3');
    await expect(tabs.getByRole('tab', { name: /Cảng/ })).toContainText('1');

    await tabs.getByRole('tab', { name: /Kho khách/ }).click();
    await expect(page.getByRole('tab', { name: /Kho khách/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(rowOf(page, 'Kho Phúc Thịnh')).toBeVisible();
    await expect(rowOf(page, 'Cảng Cát Lái')).toHaveCount(0);

    await tabs.getByRole('tab', { name: /Tất cả/ }).click();
    await page.getByRole('searchbox', { name: /Tìm địa điểm/ }).fill('cat lai');
    await expect(rowOf(page, 'Cảng Cát Lái')).toBeVisible();
    await expect(rowOf(page, 'Depot Phước Long')).toHaveCount(0);
  });

  test('không có kết quả: giải thích lý do và có nút bỏ bộ lọc', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'vendors', 'Nhà cung cấp');

    await page.getByRole('tab', { name: /Lốp/ }).click();
    await expect(page.getByText('Không có kết quả phù hợp')).toBeVisible();
    await page.getByRole('button', { name: 'Bỏ bộ lọc' }).click();
    await expect(rowOf(page, 'Cây xăng Thủ Đức 1')).toBeVisible();
  });

  for (const size of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
  ]) {
    test(`${size.width}×${size.height}: trang không cuộn ngang, bảng cuộn trong khối`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openCatalog(page, 'admin@phucan.vn', 'locations', 'Địa điểm');

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const wrap = page.locator('div.overflow-x-auto').first();
      const box = await wrap.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(800);
    });
  }

  test('màn hẹp 600px: bảng cuộn ngang trong khối, trang không tràn', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await openCatalog(page, 'admin@phucan.vn', 'locations', 'Địa điểm');

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const scrolls = await page
      .locator('div.overflow-x-auto')
      .first()
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);
  });

  test('chuyển giữa các danh mục bằng tab, tab hiện tại có aria-current', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'customers', 'Khách hàng');

    const nav = page.getByRole('navigation', { name: 'Loại danh mục' });
    await expect(nav.getByRole('link', { name: 'Khách hàng' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await nav.getByRole('link', { name: 'Tuyến' }).click();
    await expect(page.getByRole('heading', { name: 'Tuyến', level: 2 })).toBeVisible();
    await expect(rowOf(page, 'CL-ST')).toContainText('Cát Lái – Sóng Thần');
    await expect(rowOf(page, 'CL-ST')).toContainText('28');
    // Mục "Danh mục" trên thanh bên sáng lên khi ở bất kỳ trang con nào.
    await expect(
      page
        .getByRole('navigation', { name: 'Điều hướng chính' })
        .getByRole('link', { name: 'Danh mục' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('đường dẫn danh mục không có thì báo không tìm thấy', async ({ page }) => {
    await loginAs(page, 'admin@phucan.vn');
    await page.goto('/master-data/khong-co');
    await expect(page.getByText('Không có danh mục này')).toBeVisible();
  });
});

test.describe('danh mục: form tạo, sửa, xóa mềm', () => {
  test('tạo khách mới thấy trong danh sách', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'customers', 'Khách hàng');
    const code = uniqueCode('KH');

    await page.getByRole('button', { name: 'Thêm khách hàng' }).first().click();
    await expect(drawer(page).getByRole('heading', { name: 'Thêm khách hàng' })).toBeVisible();
    await page.getByLabel('Mã khách hàng').fill(code.toLowerCase());
    await page.getByLabel('Tên khách hàng').fill('Khách thử nghiệm e2e');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();

    await expect(drawer(page)).toBeHidden();
    await expect(rowOf(page, code)).toContainText('Khách thử nghiệm e2e');
    await expect(page.getByText(`Đã lưu khách hàng ${code}.`)).toBeVisible();
  });

  test('thiếu tên: lỗi dưới ô tên, ngăn kéo vẫn mở', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'customers', 'Khách hàng');

    await page.getByRole('button', { name: 'Thêm khách hàng' }).first().click();
    await page.getByLabel('Mã khách hàng').fill('CHUATEN');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();

    const name = page.getByLabel('Tên khách hàng');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Nhập tên khách hàng.')).toBeVisible();
    await expect(drawer(page)).toBeVisible();
  });

  test('trùng mã: lỗi hiện ngay dưới ô mã và nói rõ mã nào', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'customers', 'Khách hàng');

    await page.getByRole('button', { name: 'Thêm khách hàng' }).first().click();
    await page.getByLabel('Mã khách hàng').fill('thepnl');
    await page.getByLabel('Tên khách hàng').fill('Trùng mã');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();

    const code = page.getByLabel('Mã khách hàng');
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: 'THEPNL' })).toContainText(
      'đã có trong danh mục khách hàng',
    );
    await expect(drawer(page)).toBeVisible();
  });

  test('sửa khách: đổi tên được lưu', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'customers', 'Khách hàng');
    const code = uniqueCode('SUA');
    await page.getByRole('button', { name: 'Thêm khách hàng' }).first().click();
    await page.getByLabel('Mã khách hàng').fill(code);
    await page.getByLabel('Tên khách hàng').fill('Tên cũ');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();
    await expect(rowOf(page, code)).toBeVisible();

    await page.getByRole('button', { name: `Sửa khách hàng ${code}` }).click();
    await page.getByLabel('Tên khách hàng').fill('Tên mới');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();

    await expect(rowOf(page, code)).toContainText('Tên mới');
  });

  test('xóa mềm rồi không thấy; tạo lại mã đó được đề xuất khôi phục', async ({ page }) => {
    await openCatalog(page, 'admin@phucan.vn', 'customers', 'Khách hàng');
    const code = uniqueCode('XOA');
    await page.getByRole('button', { name: 'Thêm khách hàng' }).first().click();
    await page.getByLabel('Mã khách hàng').fill(code);
    await page.getByLabel('Tên khách hàng').fill('Khách sẽ xóa');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();
    await expect(rowOf(page, code)).toBeVisible();

    await page.getByRole('button', { name: `Sửa khách hàng ${code}` }).click();
    await drawer(page).getByRole('button', { name: 'Xóa khách hàng' }).click();
    const confirm = page.getByRole('dialog', { name: 'Xóa khách hàng?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Xóa khách hàng' }).click();

    await expect(rowOf(page, code)).toHaveCount(0);

    await page.getByRole('button', { name: 'Thêm khách hàng' }).first().click();
    await page.getByLabel('Mã khách hàng').fill(code);
    await page.getByLabel('Tên khách hàng').fill('Tạo lại');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();

    await expect(page.getByText('đã dùng cho một khách hàng đã xóa')).toBeVisible();
    await page.getByRole('button', { name: 'Khôi phục bản ghi đã xóa' }).click();
    await expect(rowOf(page, code)).toContainText('Khách sẽ xóa');
  });

  test('địa điểm: tọa độ ngoài khoảng bị báo; nhập đúng thì lưu, có chủ sở hữu', async ({
    page,
  }) => {
    await openCatalog(page, 'owner@phucan.vn', 'locations', 'Địa điểm');
    const code = uniqueCode('DD');

    await page.getByRole('button', { name: 'Thêm địa điểm' }).first().click();
    await page.getByLabel('Mã địa điểm').fill(code);
    await page.getByLabel('Loại địa điểm').selectOption('WAREHOUSE');
    await page.getByLabel('Tên địa điểm').fill('Kho thử nghiệm');
    await page.getByLabel('Vĩ độ').fill('95');
    await page.getByLabel('Kinh độ').fill('106.7');
    await page.getByRole('button', { name: 'Lưu địa điểm' }).click();
    await expect(page.getByText('Vĩ độ phải trong khoảng -90 đến 90.')).toBeVisible();

    await page.getByLabel('Vĩ độ').fill('10.8');
    await page.getByLabel('Khách hàng sở hữu').selectOption({ label: 'Công ty CP Phúc Thịnh' });
    await page.getByRole('button', { name: 'Lưu địa điểm' }).click();

    await expect(drawer(page)).toBeHidden();
    const row = rowOf(page, code);
    await expect(row).toContainText('Kho khách');
    await expect(row).toContainText('300 m');
    await expect(row).toContainText('Công ty CP Phúc Thịnh');

    // Dọn bản ghi thử để số đếm của các test khác ổn định khi chạy lặp.
    await page.getByRole('button', { name: `Sửa địa điểm ${code}` }).click();
    await drawer(page).getByRole('button', { name: 'Xóa địa điểm' }).click();
    await page
      .getByRole('dialog', { name: 'Xóa địa điểm?' })
      .getByRole('button', { name: 'Xóa địa điểm' })
      .click();
    await expect(rowOf(page, code)).toHaveCount(0);
  });

  test('bàn phím: mở ngăn kéo bằng Enter, Tab trong ngăn kéo, Esc đóng và trả focus', async ({
    page,
  }) => {
    await openCatalog(page, 'admin@phucan.vn', 'customers', 'Khách hàng');

    const add = page.getByRole('button', { name: 'Thêm khách hàng' }).first();
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(drawer(page)).toBeVisible();

    // Ngăn kéo thêm khách có 9 điểm dừng Tab; hết vòng thì focus ra khỏi trang (thanh trình duyệt).
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'));
      expect(inside).toBe(true);
    }

    await page.getByLabel('Mã khách hàng').focus();
    const outline = await page.getByLabel('Mã khách hàng').evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline).toEqual({ width: '3px', style: 'solid' });

    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(add).toBeFocused();
  });
});

test.describe('danh mục: quyền theo vai trò', () => {
  test('Chỉ xem: không có nút thêm, mở chi tiết thì mọi ô khóa và không có nút Lưu', async ({
    page,
  }) => {
    await openCatalog(page, 'xem@phucan.vn', 'customers', 'Khách hàng');

    await expect(page.getByRole('button', { name: /Thêm khách hàng/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Xem khách hàng THEPNL' }).click();
    await expect(page.getByLabel('Tên khách hàng')).toBeDisabled();
    await expect(page.getByLabel('Mã số thuế')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Lưu khách hàng' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Xóa khách hàng' })).toHaveCount(0);
  });

  test('Kế toán: sửa được thanh toán của khách, tên và mã bị khóa; danh mục khác chỉ đọc', async ({
    page,
  }) => {
    await openCatalog(page, 'ketoan@phucan.vn', 'customers', 'Khách hàng');

    await expect(page.getByRole('button', { name: /Thêm khách hàng/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sửa khách hàng HOASEN' }).click();
    await expect(page.getByLabel('Mã khách hàng')).toBeDisabled();
    await expect(page.getByLabel('Tên khách hàng')).toBeDisabled();
    await expect(page.getByLabel('Hạn thanh toán (ngày)')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Xóa khách hàng' })).toHaveCount(0);

    await page.getByLabel('Hạn thanh toán (ngày)').fill('20');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();
    await expect(drawer(page)).toBeHidden();
    await expect(rowOf(page, 'HOASEN')).toContainText('20 ngày');

    // Trả về giá trị seed để chạy lại không lệch.
    await page.getByRole('button', { name: 'Sửa khách hàng HOASEN' }).click();
    await page.getByLabel('Hạn thanh toán (ngày)').fill('15');
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();
    await expect(rowOf(page, 'HOASEN')).toContainText('15 ngày');

    await page.goto('/master-data/vendors');
    await expect(page.getByRole('heading', { name: 'Nhà cung cấp', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Thêm nhà cung cấp/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Xem nhà cung cấp/ }).first()).toBeVisible();
  });
});
