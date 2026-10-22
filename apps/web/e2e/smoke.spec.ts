import { expect, test } from '@playwright/test';

test('trang chủ nạp token và font của Design System', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();

  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(bodyFont).toContain('Fira Sans');

  // Font thật sự được nạp (chữ trên trang dùng đậm 700), không rơi về font hệ thống.
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('700 28px "Fira Sans"', 'TMS Container');
  });
  expect(loaded).toBe(true);

  // Nền body bằng giá trị token --bg.
  const { bodyBg, tokenBg } = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--bg)';
    document.body.appendChild(probe);
    const tokenBg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { bodyBg: getComputedStyle(document.body).backgroundColor, tokenBg };
  });
  expect(bodyBg).toBe(tokenBg);
});

test('chế độ Tối đổi màu nền theo token', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle'); // đợi hydrate xong rồi mới đổi data-theme bằng tay
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(dark).not.toBe(light);
});
