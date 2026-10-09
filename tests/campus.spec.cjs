const { test, expect } = require('@playwright/test');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const STUDY = '33333333-3333-4333-8333-333333333333';
const RIDE = '44444444-4444-4444-8444-444444444444';
const CREATED = '55555555-5555-4555-8555-555555555555';
const future = () => new Date(Date.now() + 86400000).toISOString();
const post = (mode, overrides = {}) => ({ id: mode === 'study' ? STUDY : RIDE, mode, owner_id: OTHER, owner_name: 'Organizador', title: mode === 'study' ? 'Revisão de Cálculo' : 'Volta ao campus', description: 'Combinados públicos', subject: mode === 'study' ? 'Cálculo' : '', origin: mode === 'ride' ? 'Centro' : '', destination: mode === 'ride' ? 'FACENS' : '', meeting_point: 'Portaria principal', starts_at: future(), capacity: mode === 'study' ? 6 : 3, member_count: mode === 'study' ? 1 : 0, is_owner: false, is_member: false, status: 'open', members: [{ user_id: OTHER, name: 'Organizador' }], messages: [], ...overrides });
let pageErrors;
test.beforeEach(({ page }) => { pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message)); });
test.afterEach(() => expect(pageErrors).toEqual([]));
async function setup(page, options = {}) {
  const db = options.posts || [post('study'), post('ride')];
  const calls = [];
  await page.route('**/drvqiiddgcgvmbbnwdky.supabase.co/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    const name = pathname.split('/').pop(), body = request.postDataJSON();
    if (!name.startsWith('campus_')) { await route.fulfill({ contentType: 'application/json', body: '[]' }); return; }
    calls.push({ name, body });
    if (options.delay?.[name]) await new Promise(resolve => setTimeout(resolve, options.delay[name]));
    if (options.errors?.[name]) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: options.errors[name] }) }); return; }
    let data = null;
    const item = db.find(p => p.id === body?.p_post_id);
    if (name === 'campus_list') data = db.filter(p => p.mode === body.p_mode).map(p => ({ ...p }));
    if (name === 'campus_detail') data = item && { ...item, members: item.is_member || item.is_owner ? item.members : [], messages: (item.is_member || item.is_owner) && item.status !== 'cancelled' ? item.messages : [] };
    if (name === 'campus_create') {
      const p = post(body.p_mode, { ...body.p_data, id: db.some(p => p.id === CREATED) ? crypto.randomUUID() : CREATED, owner_id: USER, owner_name: 'Aluno', is_owner: true, is_member: body.p_mode === 'study', member_count: body.p_mode === 'study' ? 1 : 0, members: [{ user_id: USER, name: 'Aluno' }] });
      db.push(p); data = p.id;
    }
    if (name === 'campus_join') { item.is_member = true; item.member_count++; item.members.push({ user_id: USER, name: 'Aluno' }); data = { ok: true }; }
    if (name === 'campus_leave') { item.is_member = false; item.member_count--; item.members = item.members.filter(m => m.user_id !== USER); data = { ok: true }; }
    if (name === 'campus_cancel') { item.status = 'cancelled'; data = { ok: true }; }
    if (name === 'campus_send') { item.messages.push({ id: String(item.messages.length + 1), sender_id: USER, sender_name: 'Aluno', content: body.p_content, created_at: new Date().toISOString() }); data = { ok: true }; }
    if (options.override) data = options.override(name, body, data);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.CampusModes && !!sparkClient);
  await page.evaluate(user => { state.userId = user; state.user.nome = 'Aluno'; state.user.onboardingComplete = false; window.CampusModes.init(); }, USER);
  await openMode(page, options.mode || 'study');
  return { calls, db };
}
async function openMode(page, mode) {
  await page.evaluate(value => { state.mode = value; navigate('campus'); window.CampusModes.open(value); }, mode);
}
async function fillCreate(page, mode = 'study') {
  await page.getByRole('button', { name: mode === 'study' ? '+ Criar grupo' : '+ Oferecer carona', exact: true }).click();
  await page.getByLabel(mode === 'study' ? 'Nome do grupo' : 'Título da viagem', { exact: true }).fill(mode === 'study' ? 'Álgebra em equipe' : 'Viagem compartilhada');
  if (mode === 'study') await page.getByLabel('Matéria ou assunto', { exact: true }).fill('Álgebra');
  else { await page.getByLabel('Origem (região ou local público)', { exact: true }).fill('Terminal'); await page.getByLabel('Destino (região ou local público)', { exact: true }).fill('Biblioteca'); }
  await page.getByLabel(mode === 'study' ? 'Data e hora do encontro' : 'Data e hora da saída', { exact: true }).fill('2099-09-30T18:00');
}
const openStudy = page => page.getByRole('button', { name: /Abrir grupo Revisão/ }).click();
const openRide = page => page.getByRole('button', { name: /Ver trajeto Volta/ }).click();

test('study create validates inputs, persists chat and owner cancellation affects everyone', async ({ page }) => {
  const { calls } = await setup(page);
  await fillCreate(page);
  const capacity = page.getByLabel('Total de participantes (incluindo você, de 2 a 30)', { exact: true });
  await capacity.fill('1');
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmFormError')).toContainText('2 a 30');
  expect(calls.filter(c => c.name === 'campus_create')).toHaveLength(0);
  await capacity.fill('4');
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmDetailBody')).toContainText('Álgebra em equipe');
  expect(calls.find(c => c.name === 'campus_create').body.p_data.capacity).toBe(4);
  expect(calls.find(c => c.name === 'campus_create').body.p_data.starts_at).toMatch(/Z$/);
  await expect(page.locator('#cmDetailBody')).toContainText('1/4 participantes');
  await page.getByLabel('Mensagem', { exact: true }).fill('Vamos estudar matrizes');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.locator('#cmMessages')).toContainText('Vamos estudar matrizes');
  await page.getByRole('button', { name: 'Atualizar detalhes', exact: true }).click();
  await expect(page.locator('#cmMessages')).toContainText('Vamos estudar matrizes');
  await page.getByRole('button', { name: 'Cancelar grupo', exact: true }).click();
  await expect(page.locator('#campusRoot').getByRole('dialog')).toContainText('afeta todos os participantes');
  await page.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(page.locator('#cmDetailBody')).toContainText('Cancelado');
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '← Voltar ao mural', exact: true }).click();
  await page.getByRole('button', { name: 'Meus grupos', exact: true }).click();
  await expect(page.locator('#cmList')).toContainText('Álgebra em equipe');
});

test('study join and confirmed leave update roster and member-only chat', async ({ page }) => {
  const { calls } = await setup(page);
  await openStudy(page);
  await expect(page.locator('#cmChatForm')).toHaveCount(0);
  await page.getByRole('button', { name: 'Entrar no grupo', exact: true }).click();
  await expect(page.locator('#cmDetailBody')).toContainText('2/6 participantes');
  await expect(page.locator('.cm-roster')).toContainText('Aluno');
  await expect(page.locator('#cmChatForm')).toBeVisible();
  await page.getByRole('button', { name: 'Sair do grupo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manter como está' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Confirmar saída' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#campusRoot').getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sair do grupo', exact: true })).toBeFocused();
  expect(calls.filter(c => c.name === 'campus_leave')).toHaveLength(0);
  await page.getByRole('button', { name: 'Sair do grupo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída', exact: true }).click();
  await expect(page.locator('#cmChatForm')).toHaveCount(0);
  await expect(page.locator('#cmDetailBody')).toContainText('1/6 participantes');
});

test('ride seats exclude the driver; switching never mixes cards or conversations', async ({ page }) => {
  const study = post('study', { is_member: true, messages: [{ id: 's', sender_name: 'Aluno', content: 'Somente estudos', created_at: future() }] });
  const ride = post('ride', { capacity: 1 });
  await setup(page, { posts: [study, ride] });
  await openStudy(page);
  await expect(page.locator('#cmMessages')).toContainText('Somente estudos');
  await openMode(page, 'ride');
  await expect(page.locator('#cmList')).toContainText('1 de 1 assentos disponíveis');
  await expect(page.locator('#campusRoot')).not.toContainText('Somente estudos');
  await expect(page.locator('#cmList')).not.toContainText('Revisão de Cálculo');
  await openRide(page);
  await page.getByRole('button', { name: 'Reservar 1 assento', exact: true }).click();
  await expect(page.locator('#cmDetailBody')).toContainText('0 de 1 assentos disponíveis');
  await page.getByLabel('Mensagem', { exact: true }).fill('Somente carona');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.locator('#cmMessages')).toContainText('Somente carona');
  await openMode(page, 'study');
  await openStudy(page);
  await expect(page.locator('#cmMessages')).toContainText('Somente estudos');
  await expect(page.locator('#cmMessages')).not.toContainText('Somente carona');
});

test('errors are retryable and failed create/chat retain drafts', async ({ page }) => {
  const options = { errors: { campus_list: 'Sem conexão' } };
  const { calls } = await setup(page, options);
  await expect(page.locator('#cmList')).toContainText('Sem conexão');
  delete options.errors.campus_list;
  await page.locator('#cmList').getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('#cmList')).toContainText('Revisão de Cálculo');
  await fillCreate(page);
  options.errors.campus_create = 'Não foi possível criar';
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmFormError')).toContainText('Não foi possível criar');
  await expect(page.getByLabel('Nome do grupo', { exact: true })).toHaveValue('Álgebra em equipe');
  await page.evaluate(() => window.CampusModes.refresh());
  await expect(page.getByLabel('Nome do grupo', { exact: true })).toHaveValue('Álgebra em equipe');
  delete options.errors.campus_create;
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmChatForm')).toBeVisible();
  options.errors.campus_send = 'Mensagem não enviada';
  await page.getByLabel('Mensagem', { exact: true }).fill('Rascunho persistente');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.locator('#cmChatStatus')).toHaveText('Mensagem não enviada');
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue('Rascunho persistente');
  expect(calls.filter(c => c.name === 'campus_send')).toHaveLength(1);
  await expect(page.locator('#cmMessages')).not.toContainText('Rascunho persistente');
  delete options.errors.campus_send;
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.locator('#cmMessages')).toContainText('Rascunho persistente');
});

test('pending guards prevent duplicate join and send; edits during send survive', async ({ page }) => {
  const { calls } = await setup(page, { delay: { campus_join: 700, campus_send: 700 } });
  await openStudy(page);
  await page.getByRole('button', { name: 'Entrar no grupo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar no grupo', exact: true })).toBeDisabled();
  await page.evaluate(() => document.querySelector('[data-action=join]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(page.locator('#cmChatForm')).toBeVisible();
  expect(calls.filter(c => c.name === 'campus_join')).toHaveLength(1);
  await page.getByLabel('Mensagem', { exact: true }).fill('Primeira');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled();
  await page.evaluate(() => document.querySelector('#cmChatForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await page.getByLabel('Mensagem', { exact: true }).fill('Próximo rascunho');
  await expect(page.locator('#cmMessages')).toContainText('Primeira');
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue('Próximo rascunho');
  expect(calls.filter(c => c.name === 'campus_send')).toHaveLength(1);
});

test('user content is escaped, search works, and 320x640 has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const unsafe = '<img src=x onerror="window.campusXss=true">';
  const s = post('study', { title: unsafe, subject: 'Física', owner_name: unsafe, is_member: true, members: [{ user_id: OTHER, name: unsafe }], messages: [{ id: 'm', sender_name: unsafe, content: unsafe, created_at: future() }] });
  await setup(page, { posts: [s, post('ride')] });
  await page.getByLabel('Buscar matéria, grupo ou local', { exact: true }).fill('Física');
  await expect(page.locator('.cm-card')).toHaveCount(1);
  await page.locator('.cm-card button').click();
  await expect(page.locator('#cmMessages')).toContainText(unsafe);
  await expect(page.locator('#campusRoot img')).toHaveCount(0);
  expect(await page.evaluate(() => !!window.campusXss)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '← Voltar ao mural', exact: true }).click();
  await fillCreate(page);
  expect(await page.evaluate(() => document.querySelector('#campusRoot').scrollWidth <= document.querySelector('#campusRoot').clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Agora não', exact: true }).click();
  await expect(page.locator('#campusRoot')).toHaveClass(/cm-study/);
});

test('late list and detail responses after switching or closing cannot render old mode', async ({ page }) => {
  const options = { delay: { campus_list: 600, campus_detail: 600 } };
  const { calls } = await setup(page, options);
  await expect.poll(() => calls.filter(c => c.name === 'campus_list').length).toBe(1);
  await openMode(page, 'ride');
  await expect(page.locator('#cmList')).toContainText('Volta ao campus');
  await expect(page.locator('#cmList')).not.toContainText('Revisão de Cálculo');
  await openRide(page);
  await expect.poll(() => calls.filter(c => c.name === 'campus_detail').length).toBe(1);
  await openMode(page, 'study');
  await expect(page.locator('#cmList')).toContainText('Revisão de Cálculo');
  await expect(page.locator('#campusRoot')).not.toContainText('Volta ao campus');
  await openStudy(page);
  await page.evaluate(() => window.CampusModes.close());
  await page.waitForTimeout(750);
  await expect(page.locator('#campusRoot')).toBeEmpty();
});

test('mode-mismatched or null results fail closed and can be retried', async ({ page }) => {
  const options = { override: (name, body, data) => name === 'campus_list' ? [post('ride')] : data };
  await setup(page, options);
  await expect(page.locator('#cmList')).toContainText('Resposta inválida');
  await expect(page.locator('.cm-card')).toHaveCount(0);
  options.override = (name, body, data) => name === 'campus_detail' ? null : data;
  await page.locator('#cmList').getByRole('button', { name: 'Tentar novamente' }).click();
  await openStudy(page);
  await expect(page.locator('#cmDetailError')).toContainText('Resposta inválida');
  await expect(page.locator('#cmChatForm')).toHaveCount(0);
  delete options.override;
  await page.locator('#cmDetailError').getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no grupo', exact: true })).toBeEnabled();
});

test('past/cancelled memberships remain in My trips, but cannot join or send', async ({ page }) => {
  const p = post('ride', { is_member: true, starts_at: new Date(Date.now() - 3600000).toISOString() });
  await setup(page, { mode: 'ride', posts: [p] });
  await expect(page.locator('.cm-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Minhas viagens', exact: true }).click();
  await expect(page.locator('#cmList')).toContainText('Encerrado');
  await openRide(page);
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled();
  p.is_member = false; p.status = 'cancelled';
  await page.evaluate(() => window.CampusModes.refresh());
  await expect(page.getByRole('button', { name: 'Reservar 1 assento', exact: true })).toBeDisabled();
  await expect(page.locator('#cmChatForm')).toHaveCount(0);
});

test('detail refresh and polling preserve focused chat draft without polling forms', async ({ page }) => {
  await page.clock.install();
  const { calls } = await setup(page, { posts: [post('study', { is_member: true })] });
  await openStudy(page);
  await page.getByLabel('Mensagem', { exact: true }).fill('Ainda escrevendo');
  await page.getByLabel('Mensagem', { exact: true }).focus();
  await page.evaluate(() => window.CampusModes.refresh());
  await expect(page.getByLabel('Mensagem', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue('Ainda escrevendo');
  await page.getByLabel('Mensagem', { exact: true }).fill('Rascunho no polling');
  await page.getByLabel('Mensagem', { exact: true }).focus();
  const before = calls.filter(c => c.name === 'campus_detail').length;
  await page.clock.fastForward(15001);
  await expect.poll(() => calls.filter(c => c.name === 'campus_detail').length).toBeGreaterThan(before);
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue('Rascunho no polling');
  await expect(page.getByLabel('Mensagem', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: '← Voltar ao mural', exact: true }).click();
  await fillCreate(page);
  const count = calls.length;
  await page.clock.fastForward(30001);
  expect(calls.length).toBe(count);
  await expect(page.getByLabel('Nome do grupo', { exact: true })).toHaveValue('Álgebra em equipe');
});

test('ride creation validates future departure and passenger capacity with one pending write', async ({ page }) => {
  const { calls } = await setup(page, { mode: 'ride', delay: { campus_create: 650 } });
  await fillCreate(page, 'ride');
  const departure = page.getByLabel('Data e hora da saída', { exact: true });
  const capacity = page.getByLabel('Assentos para passageiros (sem motorista, de 1 a 8)', { exact: true });
  await departure.fill('2000-01-01T09:00');
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmFormError')).toContainText('futuro');
  await departure.fill('2099-09-30T18:00');
  await capacity.fill('9');
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmFormError')).toContainText('1 a 8');
  expect(calls.filter(c => c.name === 'campus_create')).toHaveLength(0);
  await capacity.fill('2');
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmCreateForm [type=submit]')).toBeDisabled();
  await page.evaluate(() => document.querySelector('#cmCreateForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(page.locator('#cmDetailBody')).toContainText('2 de 2 assentos disponíveis');
  await expect(page.locator('#cmDetailBody')).toContainText('Terminal');
  await expect(page.locator('#cmDetailBody')).toContainText('Biblioteca');
  await expect(page.getByRole('button', { name: 'Cancelar viagem', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Liberar meu assento', exact: true })).toHaveCount(0);
  expect(calls.filter(c => c.name === 'campus_create')).toHaveLength(1);
  expect(calls.find(c => c.name === 'campus_create').body.p_data.capacity).toBe(2);
});

test('failed cancellation remains open and retryable; full ride refuses new reservations', async ({ page }) => {
  const options = { posts: [post('study', { is_owner: true, is_member: true, owner_id: USER }), post('ride', { capacity: 1, member_count: 1 })], errors: { campus_cancel: 'Cancelamento não realizado' } };
  const { calls } = await setup(page, options);
  await openStudy(page);
  await page.getByRole('button', { name: 'Cancelar grupo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(page.locator('#cmDialogError')).toHaveText('Cancelamento não realizado');
  await expect(page.locator('#cmDetailBody .cm-status')).toHaveText('Aberto');
  await expect(page.getByRole('button', { name: 'Confirmar cancelamento', exact: true })).toBeEnabled();
  delete options.errors.campus_cancel;
  await page.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(page.locator('#cmDetailBody .cm-status')).toHaveText('Cancelado');
  await openMode(page, 'ride');
  await openRide(page);
  await expect(page.getByRole('button', { name: 'Reservar 1 assento', exact: true })).toBeDisabled();
  expect(calls.filter(c => c.name === 'campus_join')).toHaveLength(0);
});

test('create text limits match deployed RPC contract and allow one-character subject and route', async ({ page }) => {
  const { calls } = await setup(page);
  await fillCreate(page);
  await expect(page.getByLabel('Nome do grupo', { exact: true })).toHaveAttribute('maxlength', '80');
  await expect(page.getByLabel('Objetivo e combinados (opcional)', { exact: true })).toHaveAttribute('maxlength', '1000');
  await page.evaluate(() => { document.querySelector('[name=title]').value = 'x'.repeat(81); });
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmFormError')).toContainText('3 a 80');
  expect(calls.filter(c => c.name === 'campus_create')).toHaveLength(0);
  await page.getByLabel('Nome do grupo', { exact: true }).fill('Grupo de R');
  await page.getByLabel('Matéria ou assunto', { exact: true }).fill('R');
  await page.evaluate(() => { document.querySelector('[name=description]').value = 'x'.repeat(1001); });
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmFormError')).toContainText('1000');
  await page.getByLabel('Objetivo e combinados (opcional)', { exact: true }).fill('');
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmDetailBody')).toContainText('Grupo de R');
  await openMode(page, 'ride');
  await fillCreate(page, 'ride');
  await expect(page.getByLabel('Origem (região ou local público)', { exact: true })).toHaveAttribute('maxlength', '100');
  await expect(page.getByLabel('Destino (região ou local público)', { exact: true })).toHaveAttribute('maxlength', '100');
  await page.getByLabel('Origem (região ou local público)', { exact: true }).fill('A');
  await page.getByLabel('Destino (região ou local público)', { exact: true }).fill('B');
  await page.locator('#cmCreateForm [type=submit]').click();
  await expect(page.locator('#cmDetailBody')).toContainText('Viagem compartilhada');
  await expect(page.locator('#cmChatForm')).toBeVisible();
  expect(calls.filter(c => c.name === 'campus_create')).toHaveLength(2);
  expect(calls.filter(c => c.name === 'campus_create')[1].body.p_data).toMatchObject({ origin: 'A', destination: 'B' });
});

test('campus uses one contextual heading and list-only bottom navigation; back preserves creation draft', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#activeModeLabel')).toHaveText('Estudos');
  await expect(page.locator('.cm-heading, .cm-tabs')).toHaveCount(0);
  const nav = page.locator('#campusRoot .bottom-nav');
  await expect(nav).toBeVisible();
  await expect(nav.locator('button')).toHaveCount(2);
  await expect(nav.locator('[data-action=discover]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Meus grupos', exact: true }).click();
  await expect(nav.locator('[data-action=mine]')).toHaveAttribute('aria-pressed', 'true');
  expect(await nav.evaluate(node => getComputedStyle(node).position)).toBe('static');
  expect(await nav.evaluate(node => !!node.closest('#app'))).toBe(true);
  await fillCreate(page);
  await expect(page.locator('#activeModeLabel')).toHaveText('Criar grupo');
  await expect(page.getByLabel('Nome do grupo', { exact: true })).toHaveCSS('border-color', 'rgb(133, 141, 156)');
  expect(await page.locator('#campusRoot button, #campusRoot input, #campusRoot textarea').evaluateAll(nodes => nodes.every(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.width >= 44 && bounds.height >= 44;
  }))).toBe(true);
  await expect(nav).toHaveCount(0);
  await page.getByRole('button', { name: '← Voltar ao mural', exact: true }).click();
  await page.getByRole('button', { name: '+ Criar grupo', exact: true }).click();
  await expect(page.getByLabel('Nome do grupo', { exact: true })).toHaveValue('Álgebra em equipe');
  await openMode(page, 'ride');
  await expect(page.locator('#activeModeLabel')).toHaveText('Caronas');
});

test('campus chat distinguishes senders, keeps one detail scroll and wraps enlarged text at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await setup(page, { posts: [post('study', { is_member: true, messages: [
    { id: 'own', sender_id: USER, sender_name: 'Aluno', content: 'Minha mensagem', created_at: future() },
    { id: 'other', sender_id: OTHER, sender_name: 'Organizador', content: 'Texto muito longo '.repeat(25), created_at: future() }
  ] })] });
  await openStudy(page);
  await expect(page.locator('#activeModeLabel')).toHaveText('Grupo de estudos');
  await expect(page.locator('#campusRoot .bottom-nav')).toHaveCount(0);
  await expect(page.locator('#cmMessages .bubble.sent')).toContainText('Minha mensagem');
  await expect(page.locator('#cmMessages .bubble.received')).toContainText('Organizador');
  await expect(page.locator('#cmMessages time')).toHaveCount(2);
  expect(await page.locator('#cmMessages').evaluate(node => getComputedStyle(node).maxHeight)).toBe('none');
  expect(await page.locator('#cmMessages .sent').evaluate(node => getComputedStyle(node).alignSelf)).toBe('flex-end');
  expect(await page.locator('#cmMessages .received').evaluate(node => getComputedStyle(node).alignSelf)).toBe('flex-start');
  await page.evaluate(() => { document.documentElement.style.fontSize = '30px'; });
  await page.getByLabel('Mensagem', { exact: true }).fill('Rascunho ampliado');
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeInViewport();
  expect(await page.locator('.cm-content').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sair do grupo', exact: true }).click();
  expect(await page.locator('#modeBar').evaluate(node => node.inert)).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.locator('#modeBar').evaluate(node => node.inert)).toBe(false);
  await expect(page.getByRole('button', { name: 'Sair do grupo', exact: true })).toBeFocused();
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue('Rascunho ampliado');
});
