import { expect, test, type Page } from '@playwright/test';
import {
  CONSOLIDATE_DAY,
  cleanupConsolidateData,
  seedStreetTurnScenario,
  seedTwinScenario,
  type ConsolidateScenario,
} from './consolidate-fixtures';
import { loginAs } from './dispatch-fixtures';

const DISPATCHER = 'hung.dv@phucan.vn';
const TENANT = 'Vận tải Phúc An';

const column = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const pick = (page: Page, id: string) => page.locator(`[data-pick="${id}"]`);

async function openBoard(page: Page, scenario: ConsolidateScenario) {
  await loginAs(page, DISPATCHER, TENANT);
  await page.goto(`/dispatch?date=${CONSOLIDATE_DAY}&q=${scenario.token}`);
  await expect(page.locator('[data-container-id]').first()).toBeVisible();
}

// Các test dùng dữ liệu tạo riêng theo từng lần chạy nhưng chung danh sách Street Turn của tenant nên chạy tuần tự.
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanupConsolidateData();
});

// Dọn xe e2e sau khi chạy xong để không ảnh hưởng e2e điều vận (danh sách đầu kéo).
test.afterAll(async () => {
  await cleanupConsolidateData();
});

test.describe('ghép chuyến, tách chuyến và Street Turn trên /dispatch', () => {
  let twin: ConsolidateScenario;

  test('ghép 2 cont 20 cùng khách lên xe 2×20: rơ moóc 20FT bị khóa kèm lý do Rule 1, gán xe thành công', async ({
    page,
  }) => {
    twin = await seedTwinScenario();
    await openBoard(page, twin);
    const [first, second] = twin.containers;

    await pick(page, first!.id).click();
    await pick(page, second!.id).click();
    const bar = page.getByRole('region', { name: 'Ghép chuyến', exact: true });
    await expect(bar).toContainText('2/2');
    await bar.getByRole('button', { name: 'Ghép chuyến' }).click();

    const dialog = page.locator('[data-combine-dialog]');
    await expect(dialog.getByRole('radio', { name: /TWIN_20/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'Ghép chuyến' }).click();
    await expect(page.locator('[data-notice="info"]')).toContainText('Đã ghép TWIN_20');

    // Bảng gán xe mở cho cả chuyến: rơ moóc 20FT không điều được vì thiếu chốt khóa giữa, rơ moóc có chốt ghi "Ghép TWIN_20 được".
    const panel = page.locator('[data-assign-panel]');
    await expect(panel).toBeVisible();
    await panel.locator(`[data-tractor-option="${twin.resources.tractor}"]`).click();
    const trailers = panel.getByLabel('Rơ moóc');
    const short = trailers.locator(`option[value="${twin.resources.shortTrailerId}"]`);
    await expect(short).toBeDisabled();
    await expect(short).toContainText('chốt khóa giữa');
    await expect(trailers.locator(`option[value="${twin.resources.comboTrailerId}"]`)).toContainText(
      'Ghép TWIN_20 được',
    );

    await panel.getByLabel('Tài xế').selectOption(twin.resources.driverId);
    await trailers.selectOption(twin.resources.comboTrailerId);
    await panel.getByRole('button', { name: 'Gán xe' }).click();
    await expect(page.locator('[data-notice="ok"]')).toContainText('Đã gán');

    // Cả hai thẻ sang Đã lên kế hoạch, mang chip TWIN_20 và cờ cần tính lại giá (cùng khách).
    const planned = column(page, 'Đã lên kế hoạch');
    await expect(planned.locator('[data-container-id]')).toHaveCount(2);
    await expect(planned.getByText('TWIN_20', { exact: true })).toHaveCount(2);
    await expect(planned.getByText('Cần tính lại giá')).toHaveCount(2);
  });

  test('tách chuyến: cont quay về Chờ điều, cả hai thẻ giữ cờ "Cần tính lại giá"', async ({ page }) => {
    await openBoard(page, twin);
    const [first] = twin.containers;
    await expect(column(page, 'Đã lên kế hoạch').locator('[data-container-id]')).toHaveCount(2);

    await page.locator(`[data-split="${first!.id}"]`).click();
    await page.getByRole('dialog', { name: 'Tách chuyến' }).getByRole('button', { name: 'Tách chuyến' }).click();
    await expect(page.locator('[data-notice="info"]')).toContainText('Đã tách');

    await expect(column(page, 'Chờ điều').locator(`[data-container-id="${first!.id}"]`)).toBeVisible();
    await expect(column(page, 'Đã lên kế hoạch').locator('[data-container-id]')).toHaveCount(1);
    await expect(page.getByText('Cần tính lại giá')).toHaveCount(2);
    await expect(page.getByText('TWIN_20', { exact: true })).toHaveCount(0);
  });

  test('ghép chuyến làm được hoàn toàn bằng bàn phím', async ({ page }) => {
    const scenario = await seedTwinScenario();
    await openBoard(page, scenario);
    const [first, second] = scenario.containers;

    for (const id of [first!.id, second!.id]) {
      await pick(page, id).focus();
      await page.keyboard.press('Space');
      await expect(pick(page, id)).toHaveAttribute('aria-pressed', 'true');
    }
    const bar = page.getByRole('region', { name: 'Ghép chuyến', exact: true });
    await bar.getByRole('button', { name: 'Ghép chuyến' }).focus();
    await page.keyboard.press('Enter');

    const dialog = page.locator('[data-combine-dialog]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Ghép chuyến' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-notice="info"]')).toContainText('Đã ghép TWIN_20');
    await expect(page.locator('[data-assign-panel]')).toBeFocused();
  });

  test('Street Turn: ghép cont Nhập với cont Xuất, nhập số chấp thuận thì khỏi danh sách chờ', async ({
    page,
  }) => {
    const scenario = await seedStreetTurnScenario();
    await openBoard(page, scenario);
    const [imported, exported] = scenario.containers;

    await pick(page, imported!.id).click();
    await pick(page, exported!.id).click();
    await page
      .getByRole('region', { name: 'Ghép chuyến', exact: true })
      .getByRole('button', { name: 'Ghép chuyến' })
      .click();
    const dialog = page.locator('[data-combine-dialog]');
    await dialog.getByRole('radio', { name: /COMBINED/ }).check();
    await dialog.getByRole('checkbox', { name: /Đảo vỏ/ }).check();
    await dialog.getByRole('button', { name: 'Ghép chuyến' }).click();
    await expect(page.locator('[data-notice="info"]')).toContainText('Đã ghép COMBINED');

    // Cặp hiện ở danh sách chờ chấp thuận; thẻ mang chip nhắc.
    const panel = page.locator('[data-street-turn-panel]');
    const item = panel.locator(`[data-street-turn-item="${exported!.id}"]`);
    await expect(item).toBeVisible();
    await expect(page.locator('[data-column]').getByText('Street Turn chờ chấp thuận').first()).toBeVisible();

    await item.getByLabel('Số chấp thuận hãng tàu').fill('MSK-ST-E2E');
    await item.getByRole('button', { name: 'Lưu số chấp thuận' }).click();
    await expect(item).toHaveCount(0);
    await expect(page.locator('[data-column]').getByText('Street Turn chờ chấp thuận')).toHaveCount(0);
    await expect(page.locator('[data-column]').getByText('Street Turn', { exact: true }).first()).toBeVisible();
    // Danh sách trống thì giải thích bằng EmptyState (nếu tenant không còn cặp treo nào khác).
    if ((await panel.locator('[data-street-turn-item]').count()) === 0) {
      await expect(panel).toContainText('Không có Street Turn nào chờ chấp thuận');
    }
  });

  test('1366×768: trang không tràn ngang khi có thanh ghép chuyến', async ({ page }) => {
    const scenario = await seedTwinScenario();
    await loginAs(page, DISPATCHER, TENANT);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/dispatch?date=${CONSOLIDATE_DAY}&q=${scenario.token}`);
    await pick(page, scenario.containers[0]!.id).click();
    await expect(page.getByRole('region', { name: 'Ghép chuyến', exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    if (process.env.E2E_SHOTS) {
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/consolidate-1366.png`, fullPage: true });
    }
  });
});
