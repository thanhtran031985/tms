import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc số điện thoại').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
}

async function openTariffs(page: Page, email: string, path: string, heading: string) {
  await loginAs(page, email);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
  // Đợi hydrate xong để các nút mở ngăn kéo phản hồi.
  await page.waitForLoadState('networkidle');
}

const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const drawer = (page: Page) => page.getByRole('dialog').first();

// Loại cont ít dùng trong seed, mỗi test lấy một loại riêng để dữ liệu e2e không chồng nhau giữa các lần chạy.
const FREE_TYPES = ['45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR', '20TK'];
const pickType = (n: number) => FREE_TYPES[n % FREE_TYPES.length]!;

async function fillFreight(
  page: Page,
  o: { route?: string; type: string; price: string; from: string; to?: string; customer?: string },
) {
  // Chỉ thao tác trong ngăn kéo: ô lọc của bảng cũng có nhãn "Tuyến", "Loại cont"...
  const form = page.getByRole('dialog').first();
  await form
    .getByLabel('Tuyến', { exact: true })
    .selectOption({ label: o.route ?? 'Cát Lái – Sóng Thần' });
  await form.getByLabel('Loại cont').selectOption(o.type);
  if (o.customer) await form.getByLabel('Khách hàng').selectOption({ label: o.customer });
  await form.getByLabel('Giá cước (VND)').fill(o.price);
  await form.getByLabel('Thuế VAT (%)').fill('8');
  await form.getByLabel('Hiệu lực từ').fill(o.from);
  if (o.to) await form.getByLabel('Hiệu lực đến').fill(o.to);
}

test.describe('bảng giá: danh sách', () => {
  test('giá cước của công ty hiện đủ cột, có tiền vi-VN và "Vô thời hạn", không lộ giá công ty khác', async ({
    page,
  }) => {
    await openTariffs(page, 'admin@phucan.vn', '/billing/tariffs', 'Giá cước');

    const row = rowOf(page, '1.800.000 ₫').first();
    await expect(row).toContainText('Cát Lái – Sóng Thần');
    await expect(row).toContainText('20DC');
    await expect(row).toContainText('Chạy đơn');
    await expect(row).toContainText('Giá chung');
    await expect(row).toContainText('Vô thời hạn');
    await expect(row).toContainText('Đang hiệu lực');
    // Giá riêng của khách Thép Nam Long hiện tên khách; giá 1.700.000 là của Sao Việt.
    await expect(rowOf(page, '2.400.000 ₫')).toContainText('Công ty TNHH Thép Nam Long');
    await expect(page.getByText('1.700.000 ₫')).toHaveCount(0);
  });

  test('tab hiệu lực có số đếm và bộ lọc 4 chiều thu hẹp danh sách', async ({ page }) => {
    await openTariffs(page, 'admin@phucan.vn', '/billing/tariffs', 'Giá cước');

    const tabs = page.getByRole('tablist', { name: 'Lọc giá cước theo hiệu lực' });
    await expect(tabs.getByRole('tab', { name: /Đang hiệu lực/ })).toContainText(/\d+/);
    await expect(tabs.getByRole('tab', { name: /Tất cả/ })).toBeVisible();

    await page.getByLabel('Chế độ chạy').selectOption('TWIN_20');
    await expect(rowOf(page, '3.000.000 ₫')).toBeVisible();
    await expect(rowOf(page, '1.800.000 ₫')).toHaveCount(0);

    await page.getByLabel('Chế độ chạy').selectOption('');
    await page.getByLabel('Khách hàng').selectOption({ label: 'Giá chung' });
    await expect(rowOf(page, '2.400.000 ₫')).toHaveCount(0);
    await expect(rowOf(page, '2.600.000 ₫')).toBeVisible();
  });

  test('bảng phí: phí miễn hiện chip "Miễn phí", phí mọi tuyến ghi rõ', async ({ page }) => {
    await openTariffs(page, 'admin@phucan.vn', '/billing/fees', 'Bảng phí');

    await expect(rowOf(page, 'LIFT_FEE').first()).toContainText('Mọi tuyến');
    await expect(rowOf(page, 'Công ty CP Phúc Thịnh')).toContainText('Miễn phí');
    await expect(rowOf(page, 'DRIVER_SALARY').first()).toContainText('Định mức chi phí');
  });

  test('trống theo bộ lọc: giải thích lý do và có nút bỏ bộ lọc', async ({ page }) => {
    await openTariffs(page, 'admin@phucan.vn', '/billing/tariffs', 'Giá cước');

    await page.getByLabel('Loại cont').selectOption('20TK');
    await expect(page.getByText('Không có kết quả phù hợp')).toBeVisible();
    await page.getByRole('button', { name: /Bỏ bộ lọc/ }).click();
    await expect(rowOf(page, '1.800.000 ₫').first()).toBeVisible();
  });

  test('1366×768: trang không cuộn ngang, bảng cuộn trong khối', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openTariffs(page, 'admin@phucan.vn', '/billing/fees', 'Bảng phí');

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

test.describe('bảng giá: tạo, chặn chồng, điều chỉnh', () => {
  test('tạo giá cước mới (Kế toán) thấy trong danh sách', async ({ page }) => {
    await openTariffs(page, 'ketoan@phucan.vn', '/billing/tariffs', 'Giá cước');
    const type = pickType(Date.now());
    // Hiệu lực xa trong tương lai để không đụng giá khác; xóa cuối test để chạy lặp được.
    const from = `${2070 + (Date.now() % 20)}-01-01`;

    await page.getByRole('button', { name: 'Thêm giá cước' }).first().click();
    const price = 2_000_000 + (Date.now() % 900_000);
    const shown = price.toLocaleString('de-DE'); // 2.513.844, cùng kiểu dấu chấm nghìn với giao diện
    await fillFreight(page, { type, price: String(price), from });
    await page.getByRole('button', { name: 'Lưu giá cước' }).click();

    await expect(drawer(page)).toBeHidden();
    await page.getByRole('tab', { name: /Tất cả/ }).click();
    const row = rowOf(page, `${shown} ₫`).filter({ hasText: type });
    await expect(row).toContainText('Sắp hiệu lực');

    // Dọn: giá chưa hiệu lực xóa được.
    await row.getByRole('button', { name: /^Sửa/ }).click();
    await drawer(page).getByRole('button', { name: 'Xóa giá cước' }).click();
    await page
      .getByRole('dialog', { name: 'Xóa giá cước?' })
      .getByRole('button', { name: 'Xóa giá cước' })
      .click();
    // Giá đã xóa chỉ chuyển sang "Đã ngừng" (vẫn lưu để truy vết), không còn tính khi tra giá.
    await expect(row).toContainText('Đã ngừng');
  });

  test('tạo giá chồng hiệu lực: lỗi dưới ô ngày nêu khoảng của giá đang có, ngăn kéo vẫn mở', async ({
    page,
  }) => {
    await openTariffs(page, 'admin@phucan.vn', '/billing/tariffs', 'Giá cước');

    await page.getByRole('button', { name: 'Thêm giá cước' }).first().click();
    // Trùng khóa với giá chung SINGLE 20DC đang vô thời hạn từ 01/01/2026.
    await fillFreight(page, { type: '20DC', price: '1900000', from: '2027-05-01' });
    await page.getByRole('button', { name: 'Lưu giá cước' }).click();

    const from = drawer(page).getByLabel('Hiệu lực từ');
    await expect(from).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByRole('alert').filter({ hasText: 'chồng lên khoảng bạn nhập' }),
    ).toContainText('từ 01/01/2026 đến vô thời hạn');
    await expect(drawer(page)).toBeVisible();
  });

  test('thiếu giá: lỗi dưới ô giá, không bao giờ lưu giá 0', async ({ page }) => {
    await openTariffs(page, 'admin@phucan.vn', '/billing/tariffs', 'Giá cước');

    await page.getByRole('button', { name: 'Thêm giá cước' }).first().click();
    await fillFreight(page, { type: '20TK', price: '0', from: '2080-01-01' });
    await page.getByRole('button', { name: 'Lưu giá cước' }).click();

    await expect(page.getByText('Giá cước phải lớn hơn 0.')).toBeVisible();
    await expect(drawer(page)).toBeVisible();
  });

  test('Quản trị điều chỉnh giá đang hiệu lực: giá cũ đóng, giá mới sắp hiệu lực, có Alert giải thích', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    // Khách riêng cho test này để giá tạo ra không đụng các giá khác khi chạy lặp.
    const customer = `Khách giá e2e ${Date.now().toString(36)}`;
    await page.goto('/master-data/customers');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Thêm khách hàng' }).first().click();
    await drawer(page)
      .getByLabel('Mã khách hàng')
      .fill(`GE${Date.now().toString(36).toUpperCase()}`);
    await drawer(page).getByLabel('Tên khách hàng').fill(customer);
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();
    await expect(page.getByRole('row').filter({ hasText: customer })).toBeVisible();

    await page.goto('/billing/tariffs');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Thêm giá cước' }).first().click();
    await fillFreight(page, { type: '45HC', price: '3000000', from: '2026-01-01', customer });
    await page.getByRole('button', { name: 'Lưu giá cước' }).click();
    await expect(drawer(page)).toBeHidden();
    const live = rowOf(page, customer);
    await expect(live).toContainText('Đang hiệu lực');

    await live.getByRole('button', { name: /^Điều chỉnh/ }).click();
    await expect(drawer(page).getByRole('heading', { name: 'Điều chỉnh giá' })).toBeVisible();
    await expect(page.getByText('Sửa giá đang hiệu lực sẽ đóng giá cũ')).toBeVisible();
    // Khóa 4D không đổi được khi điều chỉnh.
    await expect(drawer(page).getByLabel('Loại cont')).toBeDisabled();
    await expect(drawer(page).getByLabel('Tuyến', { exact: true })).toBeDisabled();
    await drawer(page).getByLabel('Giá cước (VND)').fill('3300000');
    await drawer(page).getByLabel('Hiệu lực mới từ').fill(tomorrow());
    await drawer(page).getByRole('button', { name: 'Điều chỉnh giá' }).click();
    await expect(drawer(page)).toBeHidden();

    await page.getByRole('tab', { name: /Tất cả/ }).click();
    const rows = rowOf(page, customer);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: '3.000.000 ₫' })).toContainText(`đến ${vnDate(today())}`);
    await expect(rows.filter({ hasText: '3.300.000 ₫' })).toContainText('Sắp hiệu lực');
  });

  test('bắt nhập ngày hiệu lực mới không trong quá khứ khi điều chỉnh', async ({ page }) => {
    await openTariffs(page, 'admin@phucan.vn', '/billing/tariffs', 'Giá cước');

    await rowOf(page, '1.800.000 ₫')
      .first()
      .getByRole('button', { name: /^Điều chỉnh/ })
      .click();
    await drawer(page).getByLabel('Hiệu lực mới từ').fill('2026-02-01');
    await drawer(page).getByRole('button', { name: 'Điều chỉnh giá' }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: 'không được nằm trong quá khứ' }),
    ).toBeVisible();
    await expect(drawer(page)).toBeVisible();
  });
});

test.describe('bảng giá: quyền theo vai trò', () => {
  test('Kế toán tạo được giá mới nhưng với giá đang hiệu lực chỉ xem, không điều chỉnh', async ({
    page,
  }) => {
    await openTariffs(page, 'ketoan@phucan.vn', '/billing/tariffs', 'Giá cước');

    await expect(page.getByRole('button', { name: 'Thêm giá cước' }).first()).toBeVisible();
    await rowOf(page, '1.800.000 ₫').first().getByRole('button', { name: /^Xem/ }).click();
    await expect(page.getByText('chỉ Quản trị điều chỉnh được')).toBeVisible();
    await expect(drawer(page).getByLabel('Giá cước (VND)')).toBeDisabled();
    await expect(drawer(page).getByRole('button', { name: 'Điều chỉnh giá' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Đóng giá cước' })).toHaveCount(0);
  });

  test('Chỉ xem: không có nút thêm hay sửa, mọi ô khóa', async ({ page }) => {
    await openTariffs(page, 'xem@phucan.vn', '/billing/tariffs', 'Giá cước');

    await expect(page.getByRole('button', { name: /Thêm giá cước/ })).toHaveCount(0);
    await rowOf(page, '1.800.000 ₫').first().getByRole('button', { name: /^Xem/ }).click();
    await expect(drawer(page).getByLabel('Giá cước (VND)')).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Lưu giá cước/ })).toHaveCount(0);
  });

  test('menu thanh bên có mục Bảng giá và tab chuyển sang Bảng phí', async ({ page }) => {
    await openTariffs(page, 'admin@phucan.vn', '/billing/tariffs', 'Giá cước');

    await expect(
      page
        .getByRole('navigation', { name: 'Điều hướng chính' })
        .getByRole('link', { name: 'Bảng giá' }),
    ).toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('navigation', { name: 'Loại bảng giá' })
      .getByRole('link', { name: 'Bảng phí' })
      .click();
    await expect(page.getByRole('heading', { name: 'Bảng phí', level: 2 })).toBeVisible();
  });
});

const TZ = 'Asia/Ho_Chi_Minh';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const tomorrow = () =>
  new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: TZ });
const vnDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
