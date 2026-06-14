import { createClient } from '@supabase/supabase-js';
import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const TEST_EMAIL = process.env['E2E_USER_EMAIL']!;
const TEST_PASSWORD = process.env['E2E_USER_PASSWORD']!;

test.afterEach(async () => {
  // S-04 (car deletion UI) not yet implemented — clean up via service client
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: users } = await client.auth.admin.listUsers();
  const user = users?.users.find((u) => u.email === TEST_EMAIL);
  if (user) await client.from('vehicles').delete().eq('user_id', user.id);
});

test('north star: sign in → add car manually → AI schedule with sources', async ({ page }) => {
  // 1. Unauthenticated visitor is redirected to login
  await page.goto('/dashboard');
  await page.waitForURL(/\/login/);

  // 2. Sign in
  await page.getByRole('textbox', { name: /email/i }).fill(TEST_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in|zaloguj/i }).click();
  await page.waitForURL(/\/dashboard/);

  // 3. Open add-car form
  await page.getByRole('link', { name: /add car|dodaj auto/i }).click();
  await page.waitForURL(/\/dashboard\/vehicles\/new/);

  await page.getByRole('textbox', { name: /make|marka/i }).fill('Toyota');
  await page.getByRole('textbox', { name: /model/i }).fill('Corolla');
  await page.getByRole('spinbutton', { name: /year|rok/i }).fill('2020');
  await page.getByRole('spinbutton', { name: /engine|pojemność/i }).fill('2.0');
  await page.getByRole('combobox', { name: /fuel|paliwo/i }).selectOption('gasoline');

  // 4. Wait for AI proxy response BEFORE clicking — Promise must exist before the request fires
  const aiResponse = page.waitForResponse((r) => r.url().includes('/api/ai') && r.ok());

  await page.getByRole('button', { name: /save|generate|zapisz|utwórz/i }).click();

  // Wait for navigation to vehicle detail, then for the AI response to resolve
  await page.waitForURL(/\/dashboard\/vehicles\/.+/);
  await aiResponse;

  // 5. Schedule is visible — no explicit timeout, AI response already settled
  const scheduleItems = page.locator('[data-testid="schedule-item"]');
  await expect(scheduleItems.first()).toBeVisible();
  expect(await scheduleItems.count()).toBeGreaterThanOrEqual(1);

  // 6. Guardrail: every visible item must carry a non-empty source
  const sources = page.locator('[data-testid="schedule-item-source"]');
  const count = await sources.count();
  expect(count).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < count; i++) {
    const text = await sources.nth(i).textContent();
    expect(text?.trim()).not.toBe('');
  }
});
