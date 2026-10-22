import { expect, test, type Page } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';

const PASSWORD = process.env.SEED_DEV_PASSWORD ?? '';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email hoặc số điện thoại').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
}

async function openImport(page: Page, email = 'ketoan@phucan.vn') {
  await loginAs(page, email);
  await page.goto('/billing/import');
  await expect(page.getByRole('heading', { name: 'Chọn file Excel' })).toBeVisible();
  // Đợi hydrate xong để ô chọn file phản hồi.
  await page.waitForLoadState('networkidle');
}

const FREIGHT_HEADER = [
  'Mã tuyến',
  'Loại cont',
  'Chế độ chạy',
  'Mã khách',
  'Giá cước',
  'VAT (%)',
  'Hiệu lực từ',
  'Hiệu lực đến',
];

async function workbook(rows: unknown[][]): Promise<Buffer> {
  const data = rows.map((row) => row.map((cell) => ({ value: cell === '' ? null : cell })));
  return writeXlsxFile(data as never).toBuffer();
}

async function chooseFile(page: Page, name: string, buffer: Buffer, mimeType = XLSX) {
  await page.getByLabel('File Excel (.xlsx)').setInputFiles({ name, mimeType, buffer });
}

const rowOf = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });

test.describe('import bảng giá từ Excel', () => {
  test('file có lỗi: thấy đúng số dòng lỗi và lý do theo dòng, nút nhập bị khóa', async ({
    page,
  }) => {
    await openImport(page);
    const buffer = await workbook([
      FREIGHT_HEADER,
      ['CL-ST', '20TK', 'COMBINED', '', 1_234_567, 8, '01/01/2090', '31/12/2090'], // hợp lệ
      ['CL-ST', '30XX', 'SINGLE', '', 1_000_000, 8, '01/01/2090', ''], // sai loại cont
      ['CL-ST', '40OT', 'SINGLE', '', '', 8, '01/01/2090', ''], // thiếu giá
      ['KHONG-CO', '40OT', 'SINGLE', '', 1_000_000, 8, '01/01/2090', ''], // tuyến không có
    ]);

    await chooseFile(page, 'gia-loi.xlsx', buffer);

    const tabs = page.getByRole('tablist', { name: 'Lọc dòng theo kết quả' });
    await expect(tabs.getByRole('tab', { name: /Tất cả/ })).toContainText('4');
    await expect(tabs.getByRole('tab', { name: /Hợp lệ/ })).toContainText('1');
    await expect(tabs.getByRole('tab', { name: /Có lỗi/ })).toContainText('3');
    // Có lỗi thì mở sẵn tab "Có lỗi".
    await expect(rowOf(page, '30XX')).toContainText('Loại cont');
    await expect(rowOf(page, 'Giá cước:')).toContainText('Giá cước');
    await expect(rowOf(page, 'không có tuyến "KHONG-CO"')).toBeVisible();
    await expect(page.getByText('Còn 3 dòng lỗi nên chưa nhập được')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Nhập \d+ dòng/ })).toBeDisabled();

    await tabs.getByRole('tab', { name: /Hợp lệ/ }).click();
    await expect(rowOf(page, '1.234.567 ₫')).toContainText('Hợp lệ');
  });

  test('file sạch: xem trước đủ dòng, xác nhận rồi thấy giá mới trong danh sách', async ({
    page,
  }) => {
    await openImport(page);
    // Khóa 4D riêng cho test (CL-ST, 20DC, COMBINED, giá chung) và năm hiệu lực xa, riêng mỗi lần chạy.
    const year = 2100 + (Date.now() % 5000);
    const price = 1_000_000 + (Date.now() % 900_000);
    const shown = price.toLocaleString('de-DE');
    const buffer = await workbook([
      FREIGHT_HEADER,
      ['cl-st', '20dc', 'combined', '', `${shown} đ`, 8, `01/01/${year}`, `31/12/${year}`],
    ]);

    await chooseFile(page, 'gia-sach.xlsx', buffer);

    await expect(rowOf(page, `${shown} ₫`)).toContainText('Hợp lệ');
    await expect(page.getByText('Sẵn sàng nhập 1 dòng')).toBeVisible();
    await page.getByRole('button', { name: 'Nhập 1 dòng' }).click();

    await expect(page.getByText('Đã nhập 1 dòng giá cước')).toBeVisible();
    await page.getByRole('link', { name: 'Xem giá cước' }).click();
    await expect(page.getByRole('heading', { name: 'Giá cước', level: 2 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /Tất cả/ }).click();
    const row = rowOf(page, `${shown} ₫`);
    await expect(row).toContainText('Kết hợp');
    await expect(row).toContainText(`31/12/${year}`);
    await expect(row).toContainText('Sắp hiệu lực');
  });

  test('tải file mẫu và chọn lại nguyên vẹn: ví dụ chồng giá đang có nên bị báo, không nhập được', async ({
    page,
  }) => {
    await openImport(page);
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Tải file mẫu giá cước' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('mau-gia-cuoc.xlsx');
    const path = await file.path();
    expect(path).toBeTruthy();

    // File tải về nằm ở đường dẫn tạm không có đuôi .xlsx nên đọc ra và chọn lại bằng đúng tên file.
    const { readFile } = await import('node:fs/promises');
    await chooseFile(page, file.suggestedFilename(), await readFile(path!));

    // Cả hai dòng ví dụ (giá chung 20DC và giá riêng THEPNL 40HC) trùng khóa với giá mẫu của seed.
    await expect(page.getByRole('tab', { name: /Có lỗi/ })).toContainText('2');
    const clashing = rowOf(page, 'chồng với giá đang có');
    await expect(clashing).toHaveCount(2);
    await expect(clashing.first()).toContainText('01/01/2026');
    await expect(page.getByRole('button', { name: /^Nhập \d+ dòng/ })).toBeDisabled();
  });

  test('bảng phí: file mẫu phí tải được và đọc được', async ({ page }) => {
    await openImport(page);
    await page.getByRole('combobox', { name: 'Loại bảng giá' }).selectOption('fee');
    const response = await page.request.get('/api/billing/tariff-template?kind=fee');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('spreadsheetml');
    const body = await response.body();
    expect(body.subarray(0, 2).toString()).toBe('PK'); // xlsx là file zip

    await page
      .getByLabel('File Excel (.xlsx)')
      .setInputFiles({ name: 'mau-bang-phi.xlsx', mimeType: XLSX, buffer: body });
    await expect(page.getByRole('tablist', { name: 'Lọc dòng theo kết quả' })).toBeVisible();
    await expect(rowOf(page, 'DRIVER_SALARY').first()).toBeVisible();
  });

  test('file không phải .xlsx hoặc thiếu cột: báo lỗi rõ, không ghi gì', async ({ page }) => {
    await openImport(page);

    await chooseFile(page, 'gia.csv', Buffer.from('a,b,c'), 'text/csv');
    await expect(page.getByText('Chỉ nhận file Excel định dạng .xlsx')).toBeVisible();

    await page.getByRole('button', { name: 'Chọn file khác' }).click();
    await chooseFile(
      page,
      'thieu-cot.xlsx',
      await workbook([
        ['Mã tuyến', 'Loại cont'],
        ['CL-ST', '20DC'],
      ]),
    );
    await expect(page.getByText('Thiếu cột bắt buộc')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Nhập \d+ dòng/ })).toHaveCount(0);
  });

  test('file chỉ có dòng tiêu đề: trạng thái Trống giải thích cần điền gì', async ({ page }) => {
    await openImport(page);

    await chooseFile(page, 'rong.xlsx', await workbook([FREIGHT_HEADER]));

    await expect(page.getByText('File không có dòng dữ liệu')).toBeVisible();
  });

  test('Chỉ xem không vào được màn import', async ({ page }) => {
    await loginAs(page, 'xem@phucan.vn');
    await page.goto('/billing/import');

    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chọn file Excel' })).toHaveCount(0);
  });
});
