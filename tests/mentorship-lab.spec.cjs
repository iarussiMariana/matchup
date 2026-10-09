const { test, expect } = require('@playwright/test');
const { setup, request, profile } = require('./mentorship-fixture.cjs');
async function open(page) {
  await page.getByRole('button', { name: 'Perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Laboratório', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function confirm(page) {
  await page.getByLabel('Digite RESETAR para confirmar').fill('RESETAR');
  await page.getByRole('button', { name: 'Resetar meus matches', exact: true }).click();
}
const calls = db => db.calls.filter(c => c.name === 'mentor_reset_connections');
let errors;
test.beforeEach(({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => expect(errors).toEqual([]));

test('laboratory reset requires exact confirmation and cancellation never mutates', async ({ page }) => {
  const { db } = await setup(page, { requests: [request({ status: 'accepted' })] });
  await open(page);
  await expect(page.getByText(/afeta os dois participantes/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resetar meus matches', exact: true })).toBeDisabled();
  await page.getByLabel('Digite RESETAR para confirmar').fill('resetar');
  await expect(page.getByRole('button', { name: 'Resetar meus matches', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(calls(db)).toHaveLength(0); expect(db.requests).toHaveLength(1);
});
test('confirmed reset clears connections and permits new requests while preserving the profile', async ({ page }) => {
  const own = profile(); const { db } = await setup(page, { own, requests: [request({ status: 'accepted' })], messages: [{ id: 'old', body: 'Histórico' }] });
  await open(page); await confirm(page);
  await expect(page.getByText('Matches resetados. Você já pode enviar novos pedidos.', { exact: true })).toBeVisible();
  expect(calls(db)).toHaveLength(1); expect(calls(db)[0].body).toEqual({ p_confirmation: 'RESETAR' });
  expect(db.requests).toEqual([]); expect(db.messages).toEqual([]); expect(db.own).toEqual(own);
  await page.getByRole('button', { name: 'Descobrir', exact: true }).click();
  await page.getByRole('button', { name: /Solicitar monitoria/ }).click();
  await page.getByLabel('Em qual disciplina?').selectOption({ label: 'Cálculo' });
  await page.getByLabel('Qual é sua dúvida?').fill('Repetir o fluxo de laboratório com uma nova conversa');
  await page.getByLabel('O que você quer conseguir?').fill('Validar uma nova conexão e estudar cálculo');
  await page.getByRole('button', { name: 'Confirmar solicitação', exact: true }).click();
  await expect.poll(() => db.requests.length).toBe(1);
  expect(db.requests[0].status).toBe('pending');
});
test('failure keeps confirmation and old data; manual retry handles an empty reset', async ({ page }) => {
  const { db } = await setup(page, { requests: [request()], errors: { mentor_reset_connections: { code: 'network' } } });
  await open(page); await confirm(page);
  await expect(page.locator('#labNotice')).toContainText('Atualize suas conexões antes de repetir');
  await expect(page.getByLabel('Digite RESETAR para confirmar')).toHaveValue('RESETAR');
  expect(db.requests).toHaveLength(1);
  delete db.errors.mentor_reset_connections; db.requests = [];
  await page.getByRole('button', { name: 'Resetar meus matches', exact: true }).click();
  await expect(page.getByText('Nenhum match para resetar. Sua conta foi preservada.', { exact: true })).toBeVisible();
});
test('pending reset prevents duplicates and refreshes state after the dialog is closed', async ({ page }) => {
  const { db } = await setup(page, { requests: [request()], delays: { mentor_reset_connections: 700 } });
  await open(page); await confirm(page);
  await expect(page.getByRole('button', { name: 'Resetar meus matches', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByText('Matches resetados. Você já pode enviar novos pedidos.', { exact: true })).toBeVisible();
  expect(calls(db)).toHaveLength(1); expect(db.requests).toEqual([]);
  await expect(page.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute('aria-current', 'page');
});
test('missing migration is explained without falsely reporting success', async ({ page }) => {
  const { db } = await setup(page, { requests: [request()], errors: { mentor_reset_connections: { code: 'PGRST202' } } });
  await open(page); await confirm(page);
  await expect(page.locator('#labNotice')).toContainText('reset de laboratório ainda não foi habilitado');
  expect(db.requests).toHaveLength(1); await expect(page.getByRole('dialog')).toBeVisible();
});
test('reset controls wrap at 320px and 200% text with reachable confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await setup(page); await open(page);
  await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await page.getByLabel('Digite RESETAR para confirmar').fill('RESETAR');
  const button = page.getByRole('button', { name: 'Resetar meus matches', exact: true });
  await button.scrollIntoViewIfNeeded(); await expect(button).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await button.click(); await expect(page.getByText('Nenhum match para resetar. Sua conta foi preservada.', { exact: true })).toBeVisible();
});

test('malformed success payload never clears local history or claims completion', async ({ page }) => {
  const { db } = await setup(page, { requests: [request()], db: { resetResponse: [] } });
  await open(page); await confirm(page);
  await expect(page.locator('#labNotice')).toContainText('O servidor não confirmou o reset');
  await expect(page.getByRole('dialog')).toBeVisible(); expect(db.requests).toHaveLength(1);
});
test('timeout warns of an uncertain outcome and never retries automatically', async ({ page }) => {
  const { db } = await setup(page, { requests: [request()], delays: { mentor_reset_connections: 25000 } });
  await page.clock.install(); await open(page); await confirm(page);
  await expect.poll(() => calls(db).length).toBe(1);
  await page.clock.fastForward(21000);
  await expect(page.locator('#labNotice')).toContainText('Atualize suas conexões antes de repetir');
  expect(calls(db)).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Resetar meus matches', exact: true })).toBeEnabled();
});
test('reset preserves unsaved profile changes', async ({ page }) => {
  await setup(page, { requests: [request()] });
  await page.getByRole('button', { name: 'Perfil', exact: true }).click();
  await page.getByLabel('Nome no perfil').fill('Meu nome em edição');
  await page.getByRole('button', { name: 'Laboratório', exact: true }).click(); await confirm(page);
  await expect(page.getByText('Matches resetados. Você já pode enviar novos pedidos.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome no perfil')).toHaveValue('Meu nome em edição');
});
test('late completion after logout does not restore private UI or display success', async ({ page }) => {
  const { db } = await setup(page, { requests: [request()], delays: { mentor_reset_connections: 1200 } });
  await open(page); await confirm(page); await page.getByRole('button', { name: 'Fechar janela' }).click();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect.poll(() => db.requests.length).toBe(0);
  await expect(page.getByRole('button', { name: 'Entrar', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Matches resetados. Você já pode enviar novos pedidos.', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Perfil', exact: true })).toHaveCount(0);
});
