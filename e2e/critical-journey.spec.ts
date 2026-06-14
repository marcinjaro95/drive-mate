// Risk coverage: test-plan.md Risk #3 (redirect), Risk #1 (AI generation), Risk #2 (source attribution)
// Seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const TEST_EMAIL = process.env['E2E_USER_EMAIL']!;
const TEST_PASSWORD = process.env['E2E_USER_PASSWORD']!;

// Mirror cleanup pattern from tests/integration/rls.spec.ts:130-143
test.afterEach(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !TEST_EMAIL) return;
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: users, error } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.warn('[e2e cleanup] listUsers failed:', error.message);
    return;
  }
  const user = users?.users.find((u) => u.email === TEST_EMAIL);
  if (user) await client.from('vehicles').delete().eq('user_id', user.id);
});

test.describe('Critical user journey', () => {
  test('unauthenticated visitor navigating to /dashboard is redirected to /login', async ({
    page,
  }) => {
    // Risk #3: auth guard must redirect unauthenticated navigation to sign-in
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
  });

  test('sign-in → add vehicle → AI schedule renders with source attribution', async ({ page }) => {
    // Step 1: Sign in using label-based locators (mat-label associates via aria-labelledby)
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_EMAIL);
    // type="password" has no textbox ARIA role — use formControlName attribute selector
    await page.locator('[formControlName="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);

    // Step 2: Navigate directly to add-vehicle form
    await page.goto('/dashboard/vehicles/new');

    // Step 3: Fill required fields via accessible label locators
    await page.getByLabel('Make').fill('Toyota');
    await page.getByLabel('Model').fill('Corolla');
    await page.getByLabel('Year').fill('2020');
    await page.getByLabel('Engine capacity (L)').fill('2.0');

    // Step 4: Open the mat-select fuel type overlay
    // mat-option elements are appended to <body>, not scoped to the form
    await page.locator('mat-select[formControlName="fuel_type"]').click();
    await page.waitForSelector('mat-option', { state: 'visible' });
    await page.locator('mat-option:has-text("Gasoline")').click();
    await page.waitForSelector('mat-option', { state: 'hidden' });

    // Step 5: Submit the form; wait for navigation to the vehicle detail / schedule-view page
    await page.getByRole('button', { name: /save car/i }).click();
    await page.waitForURL(/\/dashboard\/vehicles\/.+/);

    // Risk #1: at least one schedule card rendered (AI generation did not crash or return empty)
    // 90 s budget covers the full cycle: Worker AI call (free-tier model, up to ~60 s) +
    // Supabase updateVehicle write + Angular signal propagation + DOM render.
    // We wait directly for the visual outcome rather than intercepting the HTTP response,
    // because waitForResponse can match a preflight or redirect before the real body arrives.
    await expect(page.locator('[data-testid="schedule-item"]').first()).toBeVisible({
      timeout: 90_000,
    });

    // Risk #2: every visible source attribution is non-empty (guardrail enforced end-to-end)
    const sources = page.locator('[data-testid="schedule-item-source"]');
    const count = await sources.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      const text = await sources.nth(i).textContent();
      expect(text?.trim()).not.toBe('');
    }
  });
});
