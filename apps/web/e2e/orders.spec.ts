import { expect, test, type Page } from '@playwright/test';
import { computeCheckDigit } from '../../../packages/shared/iso6346';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc số điện thoại').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
}

// Số container hợp lệ theo ISO 6346, khác nhau giữa các lần chạy và giữa các worker.
let serial = Math.floor(Math.random() * 800_000) + 100_000;
function containerNo(wrongDigit = false) {
  serial += 1;
  const body = `ZZZU${String(serial % 1_000_000).padStart(6, '0')}`;
  const digit = computeCheckDigit(body);
  return `${body}${wrongDigit ? (digit + 1) % 10 : digit}`;
}

const rowOf = (page: Page, text: string | RegExp) =>
  page.getByRole('row').filter({ hasText: text });
const dialog = (page: Page) => page.getByRole('dialog');

type NewOrder = {
  customer?: string;
  /** Loại cont của từng dòng, theo thứ tự. */
  types: string[];
  route?: string;
  type?: 'Nhập' | 'Xuất' | 'Nội địa';
};

// Tạo Order qua giao diện: dán số cont, chỉnh loại từng dòng, bấm Tạo Order, đợi sang trang chi tiết.
async function createOrderViaUi(page: Page, order: NewOrder) {
  await page.goto('/orders/new');
  await expect(page.getByRole('heading', { name: 'Tạo Order', level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  if (order.type && order.type !== 'Nhập') {
    await page.getByRole('button', { name: order.type, exact: true }).click();
  }
  await page
    .getByLabel('Khách hàng')
    .selectOption({ label: order.customer ?? 'Công ty TNHH Thép Nam Long' });
  await page.getByLabel(/^Số (B\/L|Booking)$/).fill(`BK${Date.now().toString(36).toUpperCase()}`);
  await page
    .getByLabel('Tuyến mặc định')
    .selectOption({ label: order.route ?? 'Cát Lái – Sóng Thần' });
  await page
    .getByLabel('Dán danh sách số container')
    .fill(order.types.map(() => containerNo()).join('\n'));
  await page.getByRole('button', { name: /^Thêm \d+ số vào bảng$/ }).click();
  for (const [index, type] of order.types.entries()) {
    await page.getByLabel(`Loại container dòng ${index + 1}`).selectOption(type);
  }
  await page.getByRole('button', { name: 'Tạo Order', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?created=1/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/(IMP|EXP|DOM)-\d{4}-\d{3}/);
  await page.waitForLoadState('networkidle');
  return page.url().split('/orders/')[1]!.split('?')[0]!;
}

test.describe('Đơn hàng: danh sách', () => {
  test('H1 nói việc cần xử lý, tab có số đếm, dòng mở rộng hiện container và "Chưa có giá" thay cho 0 ₫', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    await page.goto('/orders');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /\d+ Order có \d+ container cần xử lý/,
    );
    await page.waitForLoadState('networkidle');

    const tabs = page.getByRole('tablist', { name: 'Lọc theo trạng thái Order' });
    for (const name of ['Tất cả', 'Đang thực hiện', 'Nháp', 'Đã giao', 'Đã hủy']) {
      await expect(tabs.getByRole('tab', { name: new RegExp(name) })).toBeVisible();
    }
    await expect(tabs.getByRole('tab', { name: /Đã hủy/ })).toContainText(/[1-9]/);

    const draft = rowOf(page, 'EXP-2610-044');
    await expect(draft).toContainText('ONEYSGNG04412');
    await expect(draft).toContainText('Nháp');
    await expect(draft).toContainText('+ 1 cont chưa có giá');
    await expect(draft).toContainText('8.800.000 ₫');
    await page.getByRole('button', { name: 'Xem container của EXP-2610-044' }).click();

    const inner = page.getByRole('table', { name: 'Container của EXP-2610-044' });
    await expect(inner.getByRole('row')).toHaveCount(6);
    await expect(inner.getByRole('row').filter({ hasText: 'ONEU5001562' })).toContainText(
      'Chưa có giá',
    );
    await expect(inner.getByRole('row').filter({ hasText: 'ONEU5001562' })).toContainText(
      'Cần nhập giá tay',
    );
    // Giá chưa chốt không bao giờ hiện thành 0 ₫.
    const text = await page.getByRole('main').innerText();
    expect(text).not.toMatch(/(^|[^\d.,])0 ₫/);
  });

  test('tìm, lọc theo chiều và "Xóa bộ lọc" khi không có kết quả', async ({ page }) => {
    await loginAs(page, 'admin@phucan.vn');
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await page.getByRole('searchbox', { name: 'Tìm trong danh sách' }).fill('MAEU2388422');
    await expect(rowOf(page, 'IMP-2610-031')).toBeVisible();
    await expect(rowOf(page, 'EXP-2610-044')).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Tìm trong danh sách' }).fill('khong-co-order-nay');
    await expect(page.getByText('Không có Order phù hợp')).toBeVisible();
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await expect(rowOf(page, 'EXP-2610-044')).toBeVisible();

    await page.getByLabel('Chiều').selectOption({ label: 'Nội địa' });
    await expect(rowOf(page, 'DOM-2610-001')).toBeVisible();
    await expect(rowOf(page, 'EXP-2610-044')).toHaveCount(0);
  });

  test('công ty khác chỉ thấy Order của mình', async ({ page }) => {
    await loginAs(page, 'dieuvan@saoviet.vn');
    await page.goto('/orders');
    await expect(rowOf(page, 'IMP-2610-001')).toBeVisible();
    await expect(page.getByText('EXP-2610-044')).toHaveCount(0);
    await expect(page.getByText('Thép Nam Long')).toHaveCount(0);
  });

  test('Chỉ xem đọc được nhưng không có nút tạo; vào màn tạo thì 404', async ({ page }) => {
    await loginAs(page, 'xem@phucan.vn');
    await page.goto('/orders');
    await expect(rowOf(page, 'EXP-2610-044')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tạo Order' })).toHaveCount(0);

    await page.goto('/orders/new');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tạo Order' })).toHaveCount(0);
  });
});

test.describe('Đơn hàng: tạo Order', () => {
  test('dán 5 số cont (1 sai check digit): lỗi hiện đúng dòng, sửa xong tạo được Order', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    await page.goto('/orders/new');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Khách hàng').selectOption({ label: 'Công ty TNHH Thép Nam Long' });
    await page.getByLabel('Số B/L').fill(`BL${Date.now().toString(36).toUpperCase()}`);
    await page.getByLabel('Tuyến mặc định').selectOption({ label: 'Cát Lái – Sóng Thần' });

    const good = [containerNo(), containerNo(), containerNo(), containerNo()];
    const bad = containerNo(true);
    const pasted = [good[0], good[1], bad, good[2], good[3]].join('\n');
    const paste = page.getByLabel('Dán danh sách số container');
    await paste.fill(pasted);
    await expect(page.getByText('Tìm thấy 5 số container, 1 số cần sửa')).toBeVisible();
    await page.getByRole('button', { name: 'Thêm 5 số vào bảng' }).click();

    // Lỗi chỉ ở dòng 3.
    const third = page.getByLabel('Số container dòng 3');
    await expect(third).toHaveValue(bad);
    await expect(third).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(/Sai số kiểm tra: số cuối phải là \d/)).toHaveCount(1);
    for (const n of [1, 2, 4, 5]) {
      await expect(page.getByLabel(`Số container dòng ${n}`)).not.toHaveAttribute(
        'aria-invalid',
        'true',
      );
    }

    // Còn lỗi thì không tạo.
    await page.getByRole('button', { name: 'Tạo Order', exact: true }).click();
    await expect(page.getByText('Sửa các dòng container báo lỗi rồi tạo Order.')).toBeVisible();
    await expect(page).toHaveURL(/\/orders\/new$/);

    // Sửa số cuối thì lỗi biến mất ngay khi gõ.
    await third.fill(bad.slice(0, 10) + String(computeCheckDigit(bad.slice(0, 10))));
    await expect(third).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(/Sai số kiểm tra/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Tạo Order', exact: true }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?created=1/);
    await expect(page.getByText(/Đã tạo Order IMP-\d{4}-\d{3} với 5 container/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Container trong Order \(5\)/ })).toBeVisible();
    // Mỗi container có chuỗi Stop chuẩn của hàng Nhập.
    await expect(page.getByText('PICK_FULL')).toBeVisible();
    await expect(page.getByText('UNSTUFFING')).toBeVisible();
  });

  test('trùng số trong danh sách hiện lỗi ở dòng sau; thiếu khách và tuyến hiện lỗi dưới ô', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    await page.goto('/orders/new');
    await page.waitForLoadState('networkidle');
    const no = containerNo();
    await page.getByLabel('Dán danh sách số container').fill(`${no}\n${no.toLowerCase()}`);
    await page.getByRole('button', { name: 'Thêm 2 số vào bảng' }).click();
    await expect(page.getByText('Trùng với dòng 1 trong danh sách.')).toBeVisible();

    await page.getByLabel('Số container dòng 2').fill(containerNo());
    await page.getByRole('button', { name: 'Tạo Order', exact: true }).click();
    await expect(page.getByText('Chọn khách hàng.')).toBeVisible();
    await expect(page.getByText('Chọn tuyến.')).toBeVisible();
    await expect(page.getByText('Nhập số Booking hoặc B/L.')).toBeVisible();
  });

  test('toàn bộ form tạo Order dùng được bằng bàn phím', async ({ page }) => {
    await loginAs(page, 'admin@phucan.vn');
    await page.goto('/orders/new');
    await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: 'Tạo Order', level: 1 }).click();

    const visited = new Set<string>();
    for (let i = 0; i < 90; i += 1) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return '';
        return (
          el.getAttribute('aria-label') ??
          (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null) ??
          el.textContent ??
          ''
        ).trim();
      });
      visited.add(label);
      if (label === 'Tạo Order') break;
    }
    for (const expected of [
      'Khách hàng',
      'Số B/L',
      'Tuyến mặc định',
      'Điểm lấy',
      'Dán danh sách số container',
      'Số container dòng 1',
      'Loại container dòng 1',
      'Tạo Order',
    ]) {
      expect(visited, `Tab phải tới "${expected}"`).toContain(expected);
    }
  });

  test('đơn Nội địa: tuyến chưa có mẫu Stop bị chặn; cấu hình chuỗi Stop ở Danh mục rồi tạo được', async ({
    page,
  }) => {
    const code = `NDX${Date.now().toString(36).toUpperCase()}`;
    const name = `Tuyến nội địa ${code}`;
    await loginAs(page, 'admin@phucan.vn');

    // Tạo một tuyến mới (chưa có mẫu Stop) ở Danh mục.
    await page.goto('/master-data/routes');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Thêm tuyến' }).first().click();
    const drawer = dialog(page);
    await drawer.getByLabel('Mã tuyến').fill(code);
    await drawer.getByLabel('Tên tuyến').fill(name);
    await drawer.getByLabel('Khu vực đi').fill('Cát Lái');
    await drawer.getByLabel('Khu vực đến').fill('Long An');
    await drawer.getByLabel('Km chuẩn').fill('70');
    await drawer.getByRole('button', { name: 'Lưu tuyến' }).click();
    await expect(rowOf(page, code)).toBeVisible();

    // Chưa có mẫu: màn tạo Order báo ngay dưới ô tuyến.
    await page.goto('/orders/new');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Nội địa', exact: true }).click();
    await page.getByLabel('Tuyến mặc định').selectOption({ label: name });
    await expect(
      page.getByText('Tuyến này chưa cấu hình chuỗi Stop nội địa. Cấu hình ở Danh mục, mục Tuyến.'),
    ).toBeVisible();

    // Cấu hình chuỗi Stop cho tuyến trong ngăn kéo sửa tuyến.
    await page.goto('/master-data/routes');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: `Sửa tuyến ${code}` }).click();
    const editor = dialog(page).getByRole('group', { name: 'Chuỗi Stop nội địa' });
    await expect(editor).toContainText('Chưa cấu hình');
    await editor.getByRole('button', { name: 'Thêm Stop' }).click();
    await editor.getByRole('button', { name: 'Thêm Stop' }).click();
    await editor.getByLabel('Stop thứ 2 của chuỗi nội địa').selectOption('UNSTUFFING');
    await editor.getByRole('button', { name: 'Lưu chuỗi Stop' }).click();
    await expect(editor.getByText('Đã lưu chuỗi Stop')).toBeVisible();

    // Giờ tạo được đơn Nội địa trên tuyến đó và Stop sinh theo mẫu.
    await page.goto('/orders/new');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Nội địa', exact: true }).click();
    await page.getByLabel('Khách hàng').selectOption({ label: 'Công ty TNHH Kho vận VSIP' });
    await page.getByLabel('Số Booking').fill(`ND${Date.now().toString(36).toUpperCase()}`);
    await page.getByLabel('Tuyến mặc định').selectOption({ label: name });
    await page.getByRole('button', { name: 'Tạo Order', exact: true }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?created=1/);
    await expect(page.getByText('PICK_EMPTY')).toBeVisible();
    await expect(page.getByText('UNSTUFFING')).toBeVisible();
  });
});

test.describe('Đơn hàng: xác nhận, giá tay, hủy', () => {
  test('cont không có giá chặn xác nhận và hiện "Chưa có giá"; nhập giá tay có lý do rồi xác nhận được', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    // 20DC có giá 1.800.000 ₫; 45HC không có bảng giá nào.
    await createOrderViaUi(page, { types: ['20DC', '45HC'] });

    await page.getByRole('button', { name: 'Xác nhận Order', exact: true }).click();
    await expect(page.getByText(/Chưa xác nhận được: container dòng 2 chưa có giá/)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Chưa có giá' }).first()).toBeVisible();
    await expect(page.getByLabel('Cước nhập tay (₫)')).toBeVisible();

    // Giá 0 và thiếu lý do bị chặn.
    await page.getByLabel('Cước nhập tay (₫)').fill('0');
    await page.getByLabel('Lý do (bắt buộc)').fill('Khách báo giá qua email');
    await page.getByRole('button', { name: 'Lưu giá tay' }).click();
    await expect(page.getByText('Giá cước phải lớn hơn 0.')).toBeVisible();
    await page.getByLabel('Cước nhập tay (₫)').fill('3100000');
    await page.getByLabel('Lý do (bắt buộc)').fill('');
    await page.getByRole('button', { name: 'Lưu giá tay' }).click();
    await expect(page.getByText('Nhập lý do dùng giá tay')).toBeVisible();

    await page.getByLabel('Lý do (bắt buộc)').fill('Khách báo giá qua email');
    await page.getByRole('button', { name: 'Lưu giá tay' }).click();
    await expect(page.getByText(/Đã lưu giá tay cho /)).toBeVisible();
    await expect(page.getByLabel('Cước nhập tay (₫)')).toHaveCount(0);

    await page.getByRole('button', { name: 'Xác nhận Order', exact: true }).click();
    await expect(
      page.getByText('Đã xác nhận Order, giá từng container đã được chốt.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xác nhận Order', exact: true })).toHaveCount(0);
    // Doanh thu = 1.800.000 + 3.100.000; chi hộ nâng hạ 600.000 (20DC) + 800.000 (45HC không có phí) tách riêng.
    await expect(page.getByLabel('Tổng hợp tiền của Order')).toContainText('4.900.000 ₫');
    await expect(page.getByLabel('Tổng hợp tiền của Order')).toContainText(
      'Chi hộ thu lại của khách',
    );
    const history = page.getByRole('heading', { name: 'Lịch sử thay đổi' }).locator('..');
    await expect(history).toContainText('Nhập giá tay 3.100.000 ₫');
    await expect(history).toContainText('Xác nhận Order, chốt giá 2 container');
    await expect(history).toContainText('Tạo Order');
  });

  test('hủy 1 container: Order vẫn hoạt động, tổng tính lại; hủy cả Order thì Order thành Đã hủy', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    await createOrderViaUi(page, { types: ['20DC', '20DC'] });
    await page.getByRole('button', { name: 'Xác nhận Order', exact: true }).click();
    await expect(
      page.getByText('Đã xác nhận Order, giá từng container đã được chốt.'),
    ).toBeVisible();
    await expect(page.getByLabel('Tổng hợp tiền của Order')).toContainText('3.600.000 ₫');

    // Chọn container thứ hai trong bảng rồi hủy.
    const buttons = page.getByRole('button', { name: /^ZZZU\d{7}$/ });
    await buttons.nth(1).click();
    await page.getByRole('button', { name: 'Hủy container', exact: true }).click();
    const confirm = dialog(page);
    await confirm.getByRole('button', { name: 'Hủy container', exact: true }).click();
    await expect(confirm.getByText('Nhập lý do hủy')).toBeVisible();
    await confirm.getByLabel('Lý do hủy (bắt buộc)').fill('Khách đổi kế hoạch');
    await confirm.getByRole('button', { name: 'Hủy container', exact: true }).click();

    await expect(page.getByText(/Order vẫn hoạt động với các container còn lại/)).toBeVisible();
    await expect(page.getByLabel('Tổng hợp tiền của Order')).toContainText('1.800.000 ₫');
    await expect(page.getByRole('heading', { name: /Container trong Order \(1\)/ })).toBeVisible();
    await expect(page.getByText('Đã xác nhận', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Lịch sử thay đổi' }).locator('..'),
    ).toContainText('Lý do: Khách đổi kế hoạch');

    // Hủy cả Order.
    await page.getByRole('button', { name: 'Hủy Order', exact: true }).click();
    await dialog(page).getByLabel('Lý do hủy (bắt buộc)').fill('Khách hủy booking');
    await dialog(page).getByRole('button', { name: 'Hủy Order', exact: true }).click();
    await expect(page.getByText(/Đã hủy Order/)).toBeVisible();
    await expect(page.getByText('Đã hủy', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm container' })).toHaveCount(0);
  });

  test('thêm container vào Order đã xác nhận: cont không có giá bị chặn, có giá tay thì thêm được', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    await createOrderViaUi(page, { types: ['20DC'] });
    await page.getByRole('button', { name: 'Xác nhận Order', exact: true }).click();
    await expect(
      page.getByText('Đã xác nhận Order, giá từng container đã được chốt.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Thêm container' }).first().click();
    const drawer = dialog(page);
    await drawer.getByLabel('Dán danh sách số container').fill(containerNo());
    await drawer.getByLabel('Loại cont cho các số vừa dán').selectOption('45HC');
    await drawer.getByRole('button', { name: 'Thêm 1 số vào bảng' }).click();
    await drawer.getByRole('button', { name: 'Thêm vào Order' }).click();
    await expect(drawer.getByText(/Dòng 1 của bảng chưa có giá/)).toBeVisible();

    await drawer.getByLabel('Giá tay dòng 1', { exact: true }).fill('3.100.000');
    await drawer.getByLabel('Lý do giá tay dòng 1').fill('Giá thỏa thuận riêng');
    await drawer.getByRole('button', { name: 'Thêm vào Order' }).click();

    await expect(page.getByText(/Đã thêm 1 container/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Container trong Order \(2\)/ })).toBeVisible();
    await expect(page.getByLabel('Tổng hợp tiền của Order')).toContainText('4.900.000 ₫');
  });

  test('chọn nhiều Order nháp để xác nhận: Order đủ giá được xác nhận, Order thiếu giá được báo rõ', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    await createOrderViaUi(page, { types: ['20DC'] });
    const okId = page.url().split('/orders/')[1]!.split('?')[0]!;
    await createOrderViaUi(page, { types: ['45HC'] });
    const missingId = page.url().split('/orders/')[1]!.split('?')[0]!;

    await page.goto('/orders');
    await page.waitForLoadState('networkidle');
    for (const id of [okId, missingId]) {
      const link = page.locator(`a[href="/orders/${id}"]`);
      await link.locator('xpath=ancestor::tr[1]').getByRole('checkbox').check();
    }
    await expect(page.getByText('Đã chọn 2 Order')).toBeVisible();
    await page.getByRole('button', { name: 'Xác nhận Order nháp' }).click();

    await expect(page.getByText('Đã xác nhận 1 Order.')).toBeVisible();
    await expect(page.getByText('1 Order chưa xác nhận được:')).toBeVisible();
    await expect(page.getByText(/container dòng 1 chưa có giá, cần nhập giá tay/)).toBeVisible();
    await expect(
      page.locator(`a[href="/orders/${okId}"]`).locator('xpath=ancestor::tr[1]'),
    ).toContainText('Đã xác nhận');
    await expect(
      page.locator(`a[href="/orders/${missingId}"]`).locator('xpath=ancestor::tr[1]'),
    ).toContainText('Nháp');
  });

  test('Chỉ xem mở chi tiết Order nhưng không thấy nút thao tác; Order công ty khác trả 404', async ({
    page,
  }) => {
    await loginAs(page, 'admin@phucan.vn');
    const id = await createOrderViaUi(page, { types: ['20DC'] });

    await page.context().clearCookies();
    await loginAs(page, 'xem@phucan.vn');
    await page.goto(`/orders/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/(IMP|EXP|DOM)-/);
    for (const name of ['Xác nhận Order', 'Hủy Order', 'Thêm container']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }

    await page.context().clearCookies();
    await loginAs(page, 'dieuvan@saoviet.vn');
    await page.goto(`/orders/${id}`);
    await expect(page.getByText('Không tìm thấy Order này')).toBeVisible();
  });
});
