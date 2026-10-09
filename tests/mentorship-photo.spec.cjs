const { test, expect } = require('@playwright/test');
const { setup, profile, USER } = require('./mentorship-fixture.cjs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const photo = name => ({ name: name || 'minha-foto.png', mimeType: 'image/png', buffer: png });
const savedPhoto = `https://drvqiiddgcgvmbbnwdky.supabase.co/storage/v1/object/public/photos/${USER}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const nav = (page, name) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
async function openProfile(page, options) {
  const fixture = await setup(page, options);
  await page.route('**/storage/v1/object/public/photos/**', route => route.fulfill({ contentType: 'image/png', body: png, headers: { 'access-control-allow-origin': '*' } }));
  await nav(page, 'Perfil');
  await expect(page.getByRole('heading', { name: 'Sua foto de perfil' })).toBeVisible();
  return fixture;
}
async function selectPhoto(page, file = photo()) {
  await page.getByLabel('Foto de perfil (opcional)').setInputFiles(file);
  await expect(page.locator('#profilePhotoStatus')).toContainText('Selecionada:');
  await expect.poll(() => page.locator('.photo-preview').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
}
async function reloadSavedProfile(page) {
  // The fixture writes before its RPC response is consumed; reload only after the UI confirms saving.
  await expect(page.getByText('Perfil acadêmico salvo.', { exact: true })).toBeVisible();
  await expect(page.locator('#homeSuggestions .suggestion-card').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.reload(); await nav(page, 'Perfil');
}
let errors;
test.beforeEach(({ page }) => { errors = []; page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(() => expect(errors).toEqual([]));

test('photo picker is prominent, previews locally and keeps draft across navigation', async ({ page }) => {
  await page.addInitScript(() => {
    window.revokedPhotoUrls = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = value => { window.revokedPhotoUrls.push(value); revoke(value); };
  });
  const { db } = await openProfile(page);
  expect(await page.locator('.profile-photo').evaluate(el => el.compareDocumentPosition(document.querySelector('#profileName')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Adicionar foto', exact: true }).click();
  await (await chooser).setFiles(photo());
  await expect(page.locator('#profilePhotoStatus')).toContainText('Selecionada:');
  await expect(page.locator('.photo-preview')).toHaveAttribute('src', /^blob:/);
  const blob = await page.locator('.photo-preview').getAttribute('src');
  expect(db.uploads).toHaveLength(0); expect(db.own.photo_url).toBe('');
  await page.getByLabel('Nome no perfil').fill('Meu nome atualizado');
  await nav(page, 'Início');
  expect(await page.evaluate(value => window.revokedPhotoUrls.includes(value), blob)).toBe(true);
  await nav(page, 'Perfil');
  await expect(page.locator('.photo-preview')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByLabel('Nome no perfil')).toHaveValue('Meu nome atualizado');
  await expect(page.getByRole('button', { name: 'Trocar foto', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('profile-photo-preview.png') });
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect.poll(() => db.own.name).toBe('Meu nome atualizado');
  expect(db.uploads).toHaveLength(1); expect(db.uploads[0].method).toBe('POST');
  expect(db.own.photo_url).toMatch(new RegExp(`/photos/${USER}/[a-f0-9-]+\\.jpg$`));
  await reloadSavedProfile(page);
  await expect(page.locator('.photo-preview')).toHaveAttribute('src', db.own.photo_url);
});

test('removing a saved photo preserves other edits and persists only on save', async ({ page }) => {
  const { db } = await openProfile(page, { own: profile({ photo_url: savedPhoto }) });
  await expect(page.locator('.photo-preview')).toBeVisible();
  await page.getByLabel('Sobre seu aprendizado').fill('Aprendo melhor em grupo.');
  await page.getByRole('button', { name: 'Remover foto do perfil' }).click();
  await expect(page.locator('.photo-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Adicionar foto', exact: true })).toBeFocused();
  await expect(page.locator('#profilePhotoStatus')).toContainText('pendente');
  expect(db.own.photo_url).toBe(savedPhoto);
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect.poll(() => db.own.photo_url).toBe('');
  expect(db.own.bio).toBe('Aprendo melhor em grupo.'); expect(db.uploads).toHaveLength(0);
  await reloadSavedProfile(page);
  await expect(page.locator('.photo-preview')).toHaveCount(0);
});

test('invalid selection has immediate feedback and cannot upload or save', async ({ page }) => {
  const { db } = await openProfile(page);
  await page.getByLabel('Foto de perfil (opcional)').setInputFiles({ name: 'arquivo.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('#profilePhotoStatus')).toContainText('não corresponde');
  await expect(page.locator('.photo-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('não corresponde');
  expect(db.uploads).toHaveLength(0); expect(db.calls.filter(call => call.name === 'mentor_save_product')).toHaveLength(0);
  await page.getByRole('button', { name: 'Remover foto do perfil' }).click();
  await selectPhoto(page);
});

test('profile save retry reuses uploaded photo instead of uploading twice', async ({ page }) => {
  const { db } = await openProfile(page, { errors: { mentor_save_product: { message: 'Teste: tente novamente.' } } });
  await selectPhoto(page);
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Seus dados digitados foram mantidos.');
  expect(db.uploads).toHaveLength(1); expect(db.own.photo_url).toBe('');
  await expect(page.getByRole('button', { name: 'Trocar foto', exact: true })).toBeEnabled();
  delete db.errors.mentor_save_product;
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect.poll(() => db.own.photo_url).not.toBe('');
  expect(db.uploads).toHaveLength(1);
});

test('failed upload retains local preview for retry and locks photo changes while saving', async ({ page }) => {
  const { db } = await openProfile(page, { errors: { upload: { message: 'Envio temporariamente indisponível.' } } });
  await selectPhoto(page);
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Seus dados digitados foram mantidos.');
  await expect(page.locator('.photo-preview')).toHaveAttribute('src', /^blob:/);
  delete db.errors.upload; db.delays.mentor_save_product = 900;
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Trocar foto', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remover foto do perfil' })).toBeDisabled();
  await expect.poll(() => db.own.photo_url).not.toBe('');
  expect(db.uploads).toHaveLength(2);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
  test(`photo controls fit ${viewport.width}px with 200% text and long filename`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openProfile(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await selectPhoto(page, photo(`${'fotografiadoperfil'.repeat(12)}.png`));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const id of ['choosePhoto', 'removePhoto']) {
      const button = page.locator(`#${id}`); await button.scrollIntoViewIfNeeded();
      const bounds = await button.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.getByRole('button', { name: 'Remover foto do perfil' }).click();
    await expect(page.locator('.photo-preview')).toHaveCount(0);
  });
}
