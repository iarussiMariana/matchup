const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const sdk = fs.readFileSync(require('node:path').join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'), 'utf8');
test('Criar conta opens the registration form on a mobile screen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/cdn.jsdelivr.net/**', route => route.fulfill({contentType:'text/javascript', body:sdk}));
  await page.goto('/');
  await page.locator('[data-tab="register"]').tap();
  await expect(page.locator('#registerForm')).toBeVisible();
  await expect(page.locator('#loginForm')).toBeHidden();
  expect(errors).toEqual([]);
});
