import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TERMS_STORAGE_KEY, TERMS_VERSION } from '../../src/lib/legal';

async function acceptTerms(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน', exact: true }).click();
}

test('terms require explicit acceptance, persist and can be read again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'เงื่อนไขการใช้งาน', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'ปิดหน้าต่าง' })).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'เงื่อนไขการใช้งาน', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), TERMS_STORAGE_KEY)).toBeNull();
  await page.screenshot({ path: test.info().outputPath('terms.png'), fullPage: true });
  await page.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), TERMS_STORAGE_KEY)).toBe(TERMS_VERSION);
  await page.reload();
  await expect(page.getByLabel('ชื่อบิล', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Terms of Service', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'อ่านเรียบร้อยแล้ว', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('outdated acceptance and cleared storage ask again', async ({ page }) => {
  await acceptTerms(page);
  await page.evaluate(key => localStorage.setItem(key, 'older-version'), TERMS_STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'เงื่อนไขการใช้งาน', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน', exact: true }).click();
  await page.evaluate(key => localStorage.removeItem(key), TERMS_STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'เงื่อนไขการใช้งาน', exact: true })).toBeVisible();
});

test('policy is readable before acceptance, with working contents and return link', async ({ page }) => {
  await page.goto('/policy');
  await expect(page.getByRole('heading', { name: 'นโยบายความเป็นส่วนตัว', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'การแชร์และผู้ที่มองเห็นข้อมูล', exact: true }).click();
  await expect(page).toHaveURL(/#sharing$/);
  await expect(page.getByRole('heading', { name: 'การแชร์และผู้ที่มองเห็นข้อมูล', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('policy.png'), fullPage: true });
  await page.getByRole('link', { name: 'กลับไปหารบิล', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'เงื่อนไขการใช้งาน', exact: true })).toBeVisible();
});

test('login has separate consent, policy link, terms review and resets on reopen', async ({ page, context }) => {
  await acceptTerms(page);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  const login = page.getByRole('dialog', { name: 'หารกันได้มากกว่าเดิม', exact: true });
  const checkbox = login.getByRole('checkbox', { name: 'ฉันยอมรับเงื่อนไขการใช้งานและรับทราบนโยบายความเป็นส่วนตัว', exact: true });
  await expect(checkbox).not.toBeChecked();
  await expect(login.getByRole('button', { name: 'ดำเนินการต่อด้วย Google', exact: true })).toBeDisabled();
  await expect(login.getByRole('button', { name: 'ส่งลิงก์เข้าสู่ระบบ', exact: true })).toBeDisabled();
  await login.getByLabel('อีเมลเข้าสู่ระบบ').fill('consent@example.com');
  // A forced form submission must also be stopped by the handler, not only the disabled button.
  await login.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('.toast')).toContainText('กรุณาติ๊กยอมรับเงื่อนไข');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await login.getByRole('button', { name: 'Terms of Service', exact: true }).click();
  const terms = page.getByRole('dialog', { name: 'เงื่อนไขการใช้งาน', exact: true });
  await expect(terms).toBeVisible();
  await terms.getByRole('button', { name: 'อ่านเรียบร้อยแล้ว', exact: true }).click();
  await expect(login).toBeVisible();
  await expect(checkbox).toBeChecked();
  const popupPromise = context.waitForEvent('page');
  await login.getByRole('link', { name: 'Privacy Policy (เปิดแท็บใหม่)', exact: true }).click();
  const policy = await popupPromise;
  await expect(policy.getByRole('heading', { name: 'นโยบายความเป็นส่วนตัว', exact: true })).toBeVisible();
  await expect(policy.getByRole('dialog')).toHaveCount(0);
  await policy.close();
  await page.screenshot({ path: test.info().outputPath('login-consent.png'), fullPage: true });
  await login.getByRole('button', { name: 'ปิดหน้าต่าง', exact: true }).click();
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
});

test('terms still work when storage is blocked and fit a narrow screen', async ({ page }) => {
  await page.addInitScript(key => {
    // Keep the original receivers with .call(this, ...) in the replacements below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const getItem = Storage.prototype.getItem;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name: string) { if (name === key) throw new DOMException('Blocked', 'SecurityError'); return getItem.call(this, name); };
    Storage.prototype.setItem = function (name: string, value: string) { if (name === key) throw new DOMException('Blocked', 'SecurityError'); setItem.call(this, name, value); };
  }, TERMS_STORAGE_KEY);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'เงื่อนไขการใช้งาน', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const acceptButton = dialog.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน', exact: true });
  const acceptBounds = await acceptButton.boundingBox();
  const dialogBounds = await dialog.boundingBox();
  expect(acceptBounds).not.toBeNull();
  expect(dialogBounds).not.toBeNull();
  expect(acceptBounds!.y + acceptBounds!.height).toBeLessThanOrEqual(dialogBounds!.y + dialogBounds!.height);
  await page.screenshot({ path: test.info().outputPath('terms-narrow.png'), fullPage: true });
  await page.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('ครั้งถัดไปจะแสดงให้ยอมรับอีกครั้ง');
  await page.getByLabel('ชื่อบิล', { exact: true }).fill('ยังใช้งานได้');
  await page.reload();
  await expect(dialog).toBeVisible();
});

test('policy is available offline without falling back to the bill editor', async ({ page, context }) => {
  await acceptTerms(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.getByRole('link', { name: 'Privacy Policy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'นโยบายความเป็นส่วนตัว', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'นโยบายความเป็นส่วนตัว', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await context.setOffline(false);
});
