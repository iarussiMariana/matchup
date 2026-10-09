const { test, expect } = require('@playwright/test');
const { setup, profile, mentor, request } = require('./mentorship-fixture.cjs');
const nav = (page, label) => page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
const ready = page => expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
const fits = async page => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const clipped = await page.locator('main button:visible,main input:visible,main textarea:visible,main summary:visible').evaluateAll(nodes => nodes.filter(node => {
    const box = node.getBoundingClientRect();
    return box.left < 0 || box.right > innerWidth + 1 || (node.tagName === 'BUTTON' && node.scrollWidth > node.clientWidth + 1);
  }).map(node => node.id || node.textContent));
  expect(clipped).toEqual([]);
};

test('tablet and desktop expand workspace, retain compact discovery and readable account forms', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page, { own: profile({ subjects: ['Álgebra', 'Física'], learning_subjects: ['Cálculo', 'Algoritmos'] }) });
  await ready(page);
  const app = await page.locator('#app').boundingBox();
  expect(app.width).toBe(1120);
  const learning = await page.getByRole('region', { name: 'Preciso de ajuda', exact: true }).boundingBox();
  const teaching = await page.getByRole('region', { name: 'Posso ajudar', exact: true }).boundingBox();
  expect(learning.y).toBeCloseTo(teaching.y, 1);
  expect(teaching.x).toBeGreaterThan(learning.x + learning.width);
  await expect(page.locator('#homeSuggestions .loading')).toHaveCount(0);
  await fits(page);
  await page.screenshot({ path: test.info().outputPath('home-desktop.png'), fullPage: true });
  await nav(page, 'Descobrir');
  await expect(page.locator('.mentor-card')).toBeVisible();
  const card = await page.locator('.mentor-card').boundingBox();
  expect(card.width).toBeLessThanOrEqual(452);
  expect(card.height).toBeLessThanOrEqual(460);
  const actions = await page.locator('.card-actions').boundingBox();
  const navigation = await page.getByRole('navigation').boundingBox();
  expect(actions.y + actions.height).toBeLessThanOrEqual(navigation.y);
  await page.screenshot({ path: test.info().outputPath('discovery-desktop.png'), fullPage: true });
  await nav(page, 'Perfil');
  await expect(page.getByLabel('Nome no perfil')).toBeVisible();
  expect((await page.locator('main').boundingBox()).width).toBeLessThanOrEqual(800);
  await page.setViewportSize({ width: 768, height: 1024 });
  await nav(page, 'Início');
  await ready(page);
  expect((await page.locator('#app').boundingBox()).width).toBeGreaterThan(500);
  const tabletLearning = await page.getByRole('region', { name: 'Preciso de ajuda', exact: true }).boundingBox();
  const tabletTeaching = await page.getByRole('region', { name: 'Posso ajudar', exact: true }).boundingBox();
  expect(tabletTeaching.y).toBeGreaterThan(tabletLearning.y);
  await fits(page);
  await page.screenshot({ path: test.info().outputPath('home-tablet.png'), fullPage: true });
  await nav(page, 'Perfil');
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar no MatchUp' })).toBeVisible();
  await expect(page.locator('#app')).not.toHaveClass(/signed-in/);
  expect((await page.locator('#app').boundingBox()).width).toBeLessThanOrEqual(500);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
  test(`responsive destinations preserve complete content at ${viewport.width}px and 200% text`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const long = 'Disciplina acadêmica com nome extenso '.repeat(3);
    await setup(page, { own: profile({ name: 'NomeAcadêmico'.repeat(6), subjects: [long], learning_subjects: [long] }), mentors: [mentor({ name: 'EstudanteComNomeExtenso'.repeat(3), subjects: [long] })] });
    await ready(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    for (const label of ['Início', 'Descobrir', 'Chat', 'Agenda', 'Perfil']) {
      await nav(page, label);
      await expect(page.locator('main .loading')).toHaveCount(0);
      await fits(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const navigation = await page.getByRole('navigation').boundingBox();
      expect(navigation.y + navigation.height).toBeCloseTo(viewport.height, 0);
      const last = page.locator('main button:visible,main input:visible,main textarea:visible,main a:visible').last();
      const box = await last.boundingBox();
      expect(box.y + box.height, `${label}: last control remains above navigation`).toBeLessThanOrEqual(navigation.y);
    }
    await page.screenshot({ path: test.info().outputPath(`profile-${viewport.width}-large-text.png`), fullPage: true });
  });
}

test('skeletons expose one status, respect reduced motion, and yield to errors and retry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { db } = await setup(page, { delays: { mentor_discover_product: 1200 } });
  await ready(page);
  const home = page.locator('#homeSuggestions .loading');
  await expect(home).toHaveAttribute('role', 'status');
  await expect(home).toContainText('Buscando estudantes…');
  await expect(home.locator('.skeleton')).toHaveAttribute('aria-hidden', 'true');
  await expect(home.locator('.skeleton-item')).toHaveCount(3);
  expect(await home.locator('.skeleton-lines>span').first().evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await expect(home).toHaveCount(0);
  db.errors.mentor_discover_product = { message: 'Network unavailable' };
  await nav(page, 'Descobrir');
  const loading = page.locator('#discoverContent .loading');
  await expect(loading.locator('.skeleton-card')).toBeVisible();
  await expect(loading.getByRole('button')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('discovery-loading.png'), fullPage: true });
  await expect(page.locator('#discoverContent [role=alert]')).toBeVisible();
  await expect(loading).toHaveCount(0);
  delete db.errors.mentor_discover_product;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.mentor-card')).toBeVisible();
});

test('list and message skeletons disappear on completion without losing draft or profile detail', async ({ page }) => {
  const { db } = await setup(page, { requests: [request({ status: 'accepted' })], delays: { mentor_requests: 900, mentor_messages: 900, mentor_profile: 900 } });
  await ready(page);
  await nav(page, 'Chat');
  await expect(page.locator('#requestList .skeleton-list')).toBeVisible();
  await page.getByRole('button', { name: /Conversar/ }).click();
  await expect(page.locator('#messages .skeleton-messages')).toBeVisible();
  await expect(page.locator('#messages .loading')).toHaveCount(0);
  await page.getByLabel('Sua mensagem', { exact: true }).fill('Rascunho de estudo');
  await nav(page, 'Início');
  await nav(page, 'Chat');
  await page.getByRole('button', { name: /Conversar/ }).click();
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toHaveValue('Rascunho de estudo');
  await nav(page, 'Descobrir');
  await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.loading')).toBeVisible();
  await expect(page.getByRole('dialog').locator('.loading')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('Ana Oliveira');
  expect(db.calls.some(call => call.name === 'mentor_profile')).toBe(true);
});
