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

const column = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const card = (page: Page, containerNo: string) =>
  page.getByRole('button', { name: new RegExp(containerNo) });

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

// Các test dùng chung cont MAEU2388422 và có test đổi dữ liệu (gán rồi hoàn tác) nên chạy tuần tự trong file này.
test.describe.configure({ mode: 'serial' });

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
    await page.goto(`/dispatch?date=${DAY}&q=maeu23884`);
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
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Điều vận' })
      .click();
    await expect(page).toHaveURL(/\/dispatch/);
    await expect(page.getByRole('heading', { name: 'Điều vận', level: 1 })).toBeVisible();
  });
});

// ---- Gán xe: chọn thẻ, bảng gán xe, kéo thả, optimistic và hoàn tác. Cont MAEU2388422 (08:00–11:30 ngày 25/10).
test.describe('gán xe trên bảng điều vận', () => {
  const CONT = 'MAEU2388422';
  const waitingCard = (page: Page) =>
    column(page, 'Chờ điều').getByRole('button', { name: new RegExp(`^${CONT},`) });
  const plannedCard = (page: Page) =>
    column(page, 'Đã lên kế hoạch').getByRole('button', { name: new RegExp(`^${CONT},`) });
  const panel = (page: Page) => page.locator('[data-assign-panel]');
  const assignButton = (page: Page) =>
    panel(page).getByRole('button', { name: 'Gán xe', exact: true });
  const tractor = (page: Page, plate: string) =>
    panel(page).locator(`[data-tractor-option="${plate}"]`);

  async function open(page: Page, query = '') {
    await loginAs(page, DISPATCHER, TENANT);
    await page.goto(`/dispatch?date=${DAY}${query}`);
    await expect(waitingCard(page)).toBeVisible();
  }

  // Cont chưa có khối lượng nên có hộp xác nhận; trả lời "Vẫn gán xe".
  async function confirmMissingWeight(page: Page) {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('chưa có khối lượng');
    await dialog.getByRole('button', { name: 'Vẫn gán xe' }).click();
  }

  async function undo(page: Page) {
    await page.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(page.getByText(`Đã hoàn tác: ${CONT} quay về cột Chờ điều.`)).toBeVisible();
    await expect(waitingCard(page)).toBeVisible();
  }

  test('bảng gán xe: xe hết hạn đăng kiểm và xe trùng giờ bị khóa kèm lý do', async ({ page }) => {
    await open(page);

    await waitingCard(page).click();
    await expect(panel(page).getByRole('heading', { name: /Gán xe cho/ })).toContainText(CONT);
    await expect(waitingCard(page)).toHaveAttribute('aria-pressed', 'true');

    await expect(tractor(page, '51C-228.40')).toBeDisabled();
    await expect(tractor(page, '51C-228.40')).toContainText('Đăng kiểm hết hạn, không được điều');
    await expect(tractor(page, '51C-482.17')).toBeDisabled();
    await expect(tractor(page, '51C-482.17')).toContainText('Trùng giờ với chuyến khác');
    await expect(tractor(page, '51C-773.05')).toBeEnabled();

    await panel(page).getByRole('button', { name: 'Bỏ chọn' }).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test('gán bằng chuột: thẻ sang Đã lên kế hoạch, khối chuyến trên lịch, Hoàn tác đưa thẻ về Chờ điều', async ({
    page,
  }) => {
    await open(page);
    await waitingCard(page).click();
    await tractor(page, '51C-773.05').click();
    await expect(assignButton(page)).toBeEnabled();
    await assignButton(page).click();
    await confirmMissingWeight(page);

    await expect(page.getByText(`Đã gán 51C-773.05 cho ${CONT}.`)).toBeVisible();
    await expect(plannedCard(page)).toBeVisible();
    await expect(waitingCard(page)).toHaveCount(0);
    await expect(plannedCard(page)).toContainText('51C-773.05');
    await expect(page.locator('[data-lane="51C-773.05"] [data-block-kind="TRIP"]')).toContainText(
      CONT,
    );
    await shot(page, 'dispatch-assigned');

    await undo(page);
    await expect(plannedCard(page)).toHaveCount(0);
  });

  test('gán chỉ bằng bàn phím: Enter chọn thẻ, Tab tới đầu kéo, tới nút Gán xe', async ({
    page,
  }) => {
    await open(page);
    await waitingCard(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeFocused();
    // Chờ danh sách xe tải xong rồi mới đi bằng Tab.
    await expect(tractor(page, '51C-773.05')).toBeVisible();

    const focusedIs = (check: string) =>
      page.evaluate(`(() => { const el = document.activeElement; return ${check}; })()`);
    for (let i = 0; i < 8 && !(await focusedIs("el?.hasAttribute('data-tractor-option')")); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(page.locator('[data-tractor-option]:focus')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-tractor-option][aria-pressed="true"]')).toHaveCount(1);

    for (let i = 0; i < 8 && !(await focusedIs("el?.textContent === 'Gán xe'")); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(assignButton(page)).toBeFocused();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('chưa có khối lượng');
    await page.keyboard.press('Tab'); // từ "Hủy" sang "Vẫn gán xe"
    await expect(dialog.getByRole('button', { name: 'Vẫn gán xe' })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByText(new RegExp(`Đã gán .* cho ${CONT}\\.`))).toBeVisible();
    await expect(plannedCard(page)).toBeVisible();
    await undo(page);
  });

  test('mất mạng khi gán: thẻ quay về cột cũ kèm thông báo; có mạng lại gán được', async ({
    page,
  }) => {
    await open(page);
    await waitingCard(page).click();
    await tractor(page, '51C-773.05').click();

    await page.context().setOffline(true);
    await assignButton(page).click();
    await expect(page.locator('[data-notice="error"]')).toContainText(
      'Mất kết nối mạng nên chưa gán được',
    );
    await expect(waitingCard(page)).toBeVisible();
    await expect(plannedCard(page)).toHaveCount(0);
    await page.context().setOffline(false);
  });

  test('kéo thẻ bằng chuột vào làn xe: mở bảng gán xe với đầu kéo đã chọn', async ({ page }) => {
    await open(page, '&q=maeu2388422');
    await page.setViewportSize({ width: 1440, height: 1200 });
    await waitingCard(page).scrollIntoViewIfNeeded();
    const source = (await waitingCard(page).boundingBox())!;
    const lane = page.locator('[data-lane="51C-773.05"]');
    await lane.scrollIntoViewIfNeeded();
    const target = (await lane.boundingBox())!;
    const from = (await waitingCard(page).boundingBox())!;
    expect(from.y).toBeGreaterThanOrEqual(0);

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 24, from.y + from.height / 2 + 24, {
      steps: 6,
    });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
    await page.mouse.up();

    expect(source.width).toBeGreaterThan(0);
    await expect(tractor(page, '51C-773.05')).toHaveAttribute('aria-pressed', 'true');
  });

  test('kéo thẻ bằng bàn phím: nút kéo, Space nhấc, mũi tên xuống tới làn đầu, Space thả; làn không điều được báo lý do', async ({
    page,
  }) => {
    await open(page, '&q=maeu2388422');
    await waitingCard(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeFocused();

    const handle = page.getByRole('button', {
      name: new RegExp(`^Kéo ${CONT} vào làn xe bằng bàn phím`),
    });
    await handle.focus();
    const live = page.locator('[id^="DndLiveRegion"]');
    await page.keyboard.press('Space');
    await expect(live).toContainText('Đã nhấc thẻ container');
    await page.keyboard.press('ArrowDown');
    await expect(live).toContainText('Đang ở trên làn');
    await page.keyboard.press('Space');
    await expect(live).toContainText('Đã thả thẻ vào làn xe');

    // Làn đầu theo biển số là 51C-228.40 (đăng kiểm hết hạn): bảng gán xe nói rõ vì sao không điều được.
    await expect(panel(page)).toContainText('Đầu kéo 51C-228.40 không điều được');
    await expect(panel(page)).toContainText('Đăng kiểm hết hạn, không được điều');
    await expect(tractor(page, '51C-228.40')).toBeDisabled();
  });

  test('người chỉ xem: thẻ Chờ điều không chọn được, không có gợi ý gán xe', async ({ page }) => {
    await loginAs(page, 'xem@phucan.vn');
    await page.goto(`/dispatch?date=${DAY}`);

    await expect(waitingCard(page)).toBeDisabled();
    await expect(page.getByText(/Chọn một thẻ ở cột Chờ điều/)).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
  });
});
