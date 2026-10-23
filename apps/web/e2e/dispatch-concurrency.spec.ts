import { expect, test, type Browser, type Page } from '@playwright/test';

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

// Order EXP-2610-046 có 2 cont 40HC cùng khung giờ 08:00 ngày 28/10 (seed): hai cont khác nhau, dùng chung tài xế.
const URL = '/dispatch?date=2026-10-28&q=EXP-2610-046';
const column = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const cardOf = (page: Page, column_: string, id: string) =>
  column(page, column_).locator(`[data-container-id="${id}"]`);

async function openBoard(browser: Browser, email: string, tenantName?: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  await loginAs(page, email, tenantName);
  await page.goto(URL);
  await expect(column(page, 'Chờ điều').locator('[data-container-id]').first()).toBeVisible();
  return { context, page };
}

test('hai Điều vận cùng gán một tài xế cho hai cont trùng giờ: một người thắng, người kia thấy thẻ quay lại và lỗi đúng mã', async ({
  browser,
}) => {
  const a = await openBoard(browser, 'hung.dv@phucan.vn', 'Vận tải Phúc An');
  const b = await openBoard(browser, 'admin@phucan.vn');

  const ids = await column(a.page, 'Chờ điều')
    .locator('[data-container-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-container-id') as string));
  expect(ids).toHaveLength(2);
  const [idA, idB] = ids as [string, string];

  // Mỗi người chọn thẻ của mình và đầu kéo rảnh đầu tiên; tài xế và rơ moóc là mặc định (cùng phương án rảnh đầu tiên).
  for (const [side, id] of [
    [a, idA],
    [b, idB],
  ] as const) {
    await cardOf(side.page, 'Chờ điều', id).click();
    const panel = side.page.locator('[data-assign-panel]');
    const firstTractor = panel.locator('[data-tractor-option]:enabled').first();
    await expect(firstTractor).toBeVisible();
    await firstTractor.click();
    await expect(panel.getByRole('button', { name: 'Gán xe', exact: true })).toBeEnabled();
  }
  const driverA = await a.page.getByLabel('Tài xế', { exact: true }).inputValue();
  const driverB = await b.page.getByLabel('Tài xế', { exact: true }).inputValue();
  expect(driverA).toBe(driverB);

  // Bấm gán gần như đồng thời; cont thiếu khối lượng nên có hộp xác nhận, trả lời cũng đồng thời để tranh nhau ở máy chủ.
  await Promise.all(
    [a, b].map((side) =>
      side.page
        .locator('[data-assign-panel]')
        .getByRole('button', { name: 'Gán xe', exact: true })
        .click(),
    ),
  );
  for (const side of [a, b]) {
    await expect(side.page.getByRole('dialog')).toContainText('chưa có khối lượng');
  }
  await Promise.all(
    [a, b].map((side) =>
      side.page.getByRole('dialog').getByRole('button', { name: 'Vẫn gán xe' }).click(),
    ),
  );

  // Đúng một bên có thông báo thành công, bên kia có lỗi trùng giờ.
  const okA = a.page.locator('[data-notice="ok"]');
  const okB = b.page.locator('[data-notice="ok"]');
  const errA = a.page.locator('[data-notice="error"]');
  const errB = b.page.locator('[data-notice="error"]');
  await expect(okA.or(errA)).toBeVisible();
  await expect(okB.or(errB)).toBeVisible();
  const aWon = await okA.isVisible();
  const winner = aWon ? { ...a, id: idA } : { ...b, id: idB };
  const loser = aWon ? { ...b, id: idB } : { ...a, id: idA };

  await expect(winner.page.locator('[data-notice="ok"]')).toContainText('Đã gán');
  await expect(loser.page.locator('[data-notice="error"]')).toContainText(/đã có chuyến trùng giờ/);
  // Bên thua: thẻ quay lại cột Chờ điều, không nằm ở Đã lên kế hoạch.
  await expect(cardOf(loser.page, 'Chờ điều', loser.id)).toBeVisible();
  await expect(cardOf(loser.page, 'Đã lên kế hoạch', loser.id)).toHaveCount(0);
  // Bên thắng: thẻ ở Đã lên kế hoạch.
  await expect(cardOf(winner.page, 'Đã lên kế hoạch', winner.id)).toBeVisible();
  await expect(cardOf(winner.page, 'Chờ điều', winner.id)).toHaveCount(0);

  // Nhờ SSE, cả hai trình duyệt sau vài giây thấy cùng trạng thái: cont của người thắng đã lên kế hoạch ở cả hai.
  await expect(cardOf(loser.page, 'Đã lên kế hoạch', winner.id)).toBeVisible({ timeout: 10_000 });
  await expect(cardOf(loser.page, 'Chờ điều', winner.id)).toHaveCount(0);
  await expect(cardOf(winner.page, 'Chờ điều', loser.id)).toBeVisible();

  // Dọn dữ liệu: người thắng hoàn tác, cả hai bên thấy cont quay về Chờ điều (cũng là SSE).
  await winner.page.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(cardOf(winner.page, 'Chờ điều', winner.id)).toBeVisible();
  await expect(cardOf(loser.page, 'Chờ điều', winner.id)).toBeVisible({ timeout: 10_000 });

  await a.context.close();
  await b.context.close();
});
