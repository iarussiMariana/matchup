const { test, expect } = require('@playwright/test');
const { setup, profile, mentor, request, USER, PEER, REQUEST } = require('./mentorship-fixture.cjs');
const {chooseSubjects} = require('./catalog-fixture.cjs');
const nav = async (page, label) => { if (label === 'Solicitações') { await nav(page, 'Chat'); await page.getByRole('button', { name: 'Solicitações', exact: true }).click(); return; } await page.getByRole('navigation').getByRole('button', { name: ({ Explorar: 'Descobrir', Conversas: 'Chat' })[label] || label, exact: true }).click(); };
const loaded = async page => { await page.waitForFunction(() => ['home','explore'].includes(window.MentorApp?.view) && window.MentorApp?.profile); if (await page.evaluate(() => window.MentorApp.view === 'home')) await nav(page, 'Descobrir'); await expect(page.getByRole('heading', { name: 'Ana Oliveira', exact: true })).toBeVisible(); };
const fillProfile = async page => { await page.getByLabel('Instituição de ensino', { exact: true }).fill('Universidade de Teste'); await page.getByLabel('Cidade', { exact: true }).fill('São Paulo'); await page.getByLabel('Curso', { exact: true }).selectOption('engenharia'); await page.getByLabel('Semestre', { exact: true }).fill('4'); };
const fillGuidance = async page => { await page.getByLabel('Qual é sua dúvida?').fill('Como resolver os exercícios desta matéria?'); await page.getByLabel('O que você quer conseguir?').fill('Resolver exercícios com autonomia.'); };
const openChat = async page => { await nav(page, 'Conversas'); await page.getByRole('button', { name: /Conversar/ }).click(); await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeVisible(); };
let errors;
test.beforeEach(({ page }) => { errors = []; page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(() => expect(errors).toEqual([]));

test('MatchUp entry point is mentorship only, self-contained and zoom enabled', async ({ page }) => {
  const { external } = await setup(page); await loaded(page);
  const resources = await page.evaluate(() => ({ scripts: [...document.scripts].map(s => s.getAttribute('src')), styles: [...document.querySelectorAll('link[rel=stylesheet]')].map(s => s.getAttribute('href')), viewport: document.querySelector('meta[name=viewport]').content }));
  expect(resources.scripts).toEqual(['startup.js', 'vendor/supabase.js', 'mentorship-catalog.js', 'mentorship-product.js', 'mentorship.js', 'mentorship-calendar.js', 'mentorship-academic.js', 'pwa.js']); expect(resources.styles).toEqual(['mentorship.css', 'mentorship-academic.css', 'mentorship-catalog.css', 'pwa.css', 'startup.css']);
  expect(resources.viewport).not.toMatch(/user-scalable=no|maximum-scale/);
  expect(await page.evaluate(() => { const style = getComputedStyle(document.documentElement); return ['primary', 'primary-light', 'text', 'text-2', 'border'].map(name => style.getPropertyValue(`--color-${name}`).trim()); })).toEqual(['#087e8b', '#eaf8f6', '#242138', '#716d80', '#dceae7']);
  expect(await page.locator('body').innerText()).not.toMatch(/namor|românt|carona|relacionamento|trocar modo|gênero|interesses românticos/i);
  expect(external).toEqual([]); await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
});

test('MatchUp identity uses local supplied artwork and Safari installation metadata', async ({ page }) => {
  const { external } = await setup(page, { loggedIn: false });
  await expect(page.getByRole('button', { name: 'Entrar no MatchUp' })).toBeVisible();
  await expect(page).toHaveTitle('MatchUp — Conexões acadêmicas que funcionam');
  await expect(page.locator('.brand')).toHaveText('MatchUp — Conexões acadêmicas que funcionam');
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', 'assets/brand/matchup-symbol.png');
  await expect(page.getByRole('img', { name: 'MatchUp — Conexões acadêmicas que funcionam' })).toHaveAttribute('src', 'assets/brand/matchup-logo.png');
  await expect(page.locator('.eyebrow')).toHaveText('Conexões acadêmicas que funcionam');
  await expect.poll(() => page.locator('.brand-mark,.auth-logo').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  for (const [name, content] of Object.entries({ 'theme-color': '#087e8b', 'apple-mobile-web-app-capable': 'yes', 'apple-mobile-web-app-status-bar-style': 'default', 'apple-mobile-web-app-title': 'MatchUp', 'mobile-web-app-capable': 'yes' })) {
    await expect(page.locator(`meta[name="${name}"]`)).toHaveAttribute('content', content);
  }
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'assets/brand/apple-touch-icon.png');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'assets/brand/favicon-32.png');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('MatchUp branding persists through home, settings and logout', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  await expect(page.locator('.brand')).toContainText('MatchUp');
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', 'assets/brand/matchup-symbol.png');
  await nav(page, 'Perfil');
  await expect(page.locator('.account-footer')).toContainText('MatchUp · Conexões acadêmicas que funcionam');
  await expect(page.getByLabel('Estou disponível para oferecer monitoria')).toBeVisible();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no MatchUp' })).toBeVisible();
});

test('MatchUp narrow mobile forms avoid focus zoom and retain readable layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setup(page, { loggedIn: false, requests: [request({ status: 'accepted' })] });
  const readable = async () => {
    const sizes = await page.locator('input:visible:not([type=checkbox]),select:visible,textarea:visible').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
    expect(sizes.length).toBeGreaterThan(0); expect(sizes.every(size => size >= 16)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  };
  await expect(page.locator('.auth-logo')).toBeVisible(); await readable();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click(); await readable();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('aluno@example.test'); await page.getByLabel('Senha', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Entrar no MatchUp' }).click(); await loaded(page); await readable();
  await nav(page, 'Perfil'); await expect(page.getByLabel('Curso', { exact: true })).toBeVisible(); await readable(); await openChat(page); await readable();
  await page.setViewportSize({ width: 568, height: 320 }); await readable();
  await page.getByRole('button', { name: 'Bloquear estudante', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await readable();
  const dialogHeight = await page.getByRole('dialog').evaluate(node => node.getBoundingClientRect().height);
  expect(dialogHeight).toBeLessThanOrEqual(320);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
  for (const fontSize of [16, 32]) {
    test(`fixed bottom navigation and long-text clearance at ${viewport.width}px with ${fontSize}px text`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const longName = 'NomeAcadêmico'.repeat(6).slice(0, 80), longSubject = 'Disciplina'.repeat(8);
      const peer = mentor({ name: longName, subjects: [longSubject], course: 'Engenharia'.repeat(8), bio: 'Aprendizado'.repeat(80), availability: 'Disponibilidade'.repeat(10) });
      await setup(page, { own: profile({ name: longName, subjects: [longSubject], learning_subjects: [longSubject], bio: 'Conhecimento'.repeat(70) }), mentors: [peer], requests: [request({ status: 'accepted', subject: longSubject, peer })] });
      await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
      await page.evaluate(size => document.documentElement.style.fontSize = `${size}px`, fontSize);
      for (const label of ['Início', 'Descobrir', 'Chat', 'Agenda', 'Perfil']) {
        await nav(page, label);
        await expect(page.locator('main .loading')).toHaveCount(0);
        const navigation = page.getByRole('navigation');
        await expect(navigation.getByRole('button')).toHaveCount(5);
        expect(await navigation.evaluate(node => getComputedStyle(node).position)).toBe('fixed');
        const before = await navigation.boundingBox();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const after = await navigation.boundingBox();
        expect(after.y, label).toBeCloseTo(before.y, 1);
        expect(after.y + after.height, label).toBeCloseTo(viewport.height, 1);
        const horizontalLayout = await page.evaluate(() => ({
          fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          overflow: [...document.querySelectorAll('body,body *')].filter(node => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1 || node.scrollWidth > node.clientWidth + 1).map(node => ({ tag: node.tagName, id: node.id, className: node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, children: [...node.children].map(child => child.id || child.tagName) }))
        }));
        expect(horizontalLayout.fits, `${label}: ${JSON.stringify(horizontalLayout.overflow)}`).toBe(true);
        const clipped = await page.locator('main button:visible,main input:visible,main select:visible,main textarea:visible').evaluateAll(nodes => nodes.filter(node => {
          const box = node.getBoundingClientRect();
          return box.left < 0 || box.right > innerWidth + 1 || (node.tagName === 'BUTTON' && node.scrollWidth > node.clientWidth + 1);
        }).map(node => node.getAttribute('aria-label') || node.textContent));
        expect(clipped, `${label} controls fit without clipping`).toEqual([]);
        const lastControl = page.locator('main button:visible,main input:visible,main select:visible,main textarea:visible,main a:visible').last();
        const rect = await lastControl.boundingBox();
        expect(rect.x, label).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width, label).toBeLessThanOrEqual(viewport.width);
        expect(rect.y + rect.height, label).toBeLessThanOrEqual(after.y);
        await lastControl.scrollIntoViewIfNeeded();
        const hit = await lastControl.evaluate(node => { const box = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); });
        expect(hit, `${label} final action is not obscured`).toBe(true);
        for (const button of await navigation.getByRole('button').all()) {
          const box = await button.boundingBox();
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        }
      }
      await openChat(page);
      await page.getByLabel('Sua mensagem', { exact: true }).fill('TextoSemEspaços'.repeat(30));
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const send = await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).boundingBox();
      const navigation = await page.getByRole('navigation').boundingBox();
      expect(send.x + send.width).toBeLessThanOrEqual(viewport.width);
      expect(send.y + send.height).toBeLessThanOrEqual(navigation.y);
    });
  }
}

test('fresh login preserves account identity and requires academic opt-in', async ({ page }) => {
  const { db } = await setup(page, { loggedIn: false, own: null });
  await page.getByLabel('E-mail', { exact: true }).fill('aluno@example.test'); await page.getByLabel('Senha', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Entrar no MatchUp' }).click();
  await expect(page.getByLabel('Nome no perfil')).toHaveValue('Estudante legado');
  await expect(page.getByRole('heading', { name: 'Um perfil feito para o MatchUp' })).toBeVisible();
  expect(db.calls.filter(c => c.name === 'mentor_discover_product')).toHaveLength(0);
  await expect(page.getByRole('group', { name: 'Posso ajudar com', exact: true }).locator('.catalog-chip')).toHaveCount(0); await expect(page.locator('.photo-preview')).toHaveCount(0);
  await fillProfile(page); await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await chooseSubjects(page, 'Quero aprender', ['Cálculo', 'Física']);
  await page.getByRole('button', { name: 'Salvar e começar' }).click(); await loaded(page);
  expect(db.own.learning_subjects).toEqual(['Cálculo', 'Física']); expect(db.own.active).toBe(false); expect(db.own.photo_url).toBe('');
  expect(Object.keys(db.own).sort()).toEqual(['id','catalog_course_id','name','course','semester','bio','subjects','learning_subjects','availability','format','photo_url','active','institution','city','current_subjects','topics','study_preference','methodology','experience','availability_slots'].sort());
});

test('legacy session does not browse until explicit academic profile creation', async ({ page }) => {
  const { db } = await setup(page, { own: null }); await expect(page.getByRole('heading', { name: /O que vamos/ })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0); expect(db.calls.some(c => c.name === 'mentor_discover_product')).toBe(false);
  await fillProfile(page); await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await page.getByLabel('Estou disponível para oferecer monitoria').check();
  await page.getByRole('button', { name: 'Salvar e começar' }).click(); await expect(page.getByRole('alert')).toContainText('ao menos uma disciplina');
  await chooseSubjects(page, 'Posso ajudar com', ['Cálculo', 'Programação']); await page.getByRole('button', { name: 'Salvar e começar' }).click(); await loaded(page);
  expect(db.own.subjects).toEqual(['Cálculo', 'Programação']); expect(db.own.active).toBe(true);
});

test('lean onboarding permits optional institution and city with no premature publication', async ({ page }) => {
  const { db } = await setup(page, { own: null });
  await expect(page.getByLabel('Instituição de ensino', { exact: true })).toHaveValue('FACENS');
  await page.getByLabel('Curso', { exact: true }).selectOption('engenharia');
  await page.getByLabel('Instituição de ensino', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Etapa 2 de 2', { exact: false })).toBeVisible();
  expect(db.calls.some(call => call.name === 'mentor_save_product')).toBe(false);
  await page.getByRole('button', { name: 'Salvar e começar' }).click(); await loaded(page);
  expect(db.own).toMatchObject({institution:'',city:'',active:false,subjects:[]});
});

test('signup validates adulthood and writes compatible auth metadata', async ({ page }) => {
  const { db } = await setup(page, { loggedIn: false }); await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Seu nome', { exact: true }).fill('Novo Estudante'); await page.getByLabel('E-mail', { exact: true }).fill('novo@example.test'); await page.getByLabel('Senha', { exact: true }).fill('strong-password');
  await page.getByLabel('Data de nascimento').fill('2020-01-01'); await page.getByRole('button', { name: 'Criar minha conta' }).click(); expect(db.signups).toHaveLength(0);
  await page.getByLabel('Data de nascimento').fill('2000-03-21'); await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('status')).toContainText('Confirme seu e-mail'); expect(db.signups[0].data).toEqual({ name: 'Novo Estudante', birth_date: '2000-03-21' });
});

test('auth errors retain input and password recovery is available', async ({ page }) => {
  const { db } = await setup(page, { loggedIn: false, errors: { 'auth:token': { code: 'invalid_credentials', message: 'Invalid login credentials' } } });
  await page.getByLabel('E-mail', { exact: true }).fill('aluno@example.test'); await page.getByLabel('Senha', { exact: true }).fill('incorrect'); await page.getByRole('button', { name: 'Entrar no MatchUp' }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos'); await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('aluno@example.test');
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click(); await page.getByLabel('E-mail', { exact: true }).fill('aluno@example.test'); await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(page.getByRole('status')).toContainText('Se houver uma conta'); expect(db.calls.some(c => c.name === 'auth:recover')).toBe(true);
});

test('discovery search, local skip, refresh and real pointer gestures', async ({ page }) => {
  const { db } = await setup(page); await loaded(page);
  await page.getByLabel('Buscar disciplina', { exact: true }).fill('Física'); await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bruno Santos' })).toBeVisible(); expect(db.calls.findLast(c => c.name === 'mentor_discover_product').body).toMatchObject({ p_subject: 'Física' });
  await page.getByLabel('Buscar disciplina', { exact: true }).fill(''); await page.getByRole('button', { name: 'Buscar', exact: true }).click(); await loaded(page);
  const card = page.locator('.mentor-card'), rect = await card.boundingBox();
  await page.mouse.move(rect.x + rect.width * .7, rect.y + 110); await page.mouse.down(); await page.mouse.move(rect.x + 15, rect.y + 112, { steps: 12 }); await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Bruno Santos' })).toBeVisible(); await page.getByRole('button', { name: 'Atualizar monitores' }).click(); await loaded(page);
  const next = await card.boundingBox(); await page.mouse.move(next.x + 30, next.y + 110); await page.mouse.down(); await page.mouse.move(next.x + next.width - 20, next.y + 111, { steps: 12 }); await page.mouse.up();
  await expect(page.getByRole('dialog')).toContainText('Vamos aprender juntos?'); expect(db.requests).toHaveLength(0);
});

test('request requires a mentor subject and creates pending request without chat', async ({ page }) => {
  const { db } = await setup(page); await loaded(page); await page.getByRole('button', { name: 'Solicitar monitoria', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar solicitação' }).click(); expect(db.requests).toHaveLength(0);
  await fillGuidance(page); await page.getByLabel('Em qual disciplina?').selectOption('Álgebra'); await page.getByRole('button', { name: 'Confirmar solicitação' }).dblclick();
  await expect(page.getByText('Aguardando resposta', { exact: true })).toBeVisible(); expect(db.calls.filter(c => c.name === 'mentor_request_product')).toHaveLength(1);
  expect(db.requests[0].status).toBe('pending'); await expect(page.getByRole('button', { name: /Conversar/ })).toHaveCount(0);
  await nav(page, 'Conversas'); await expect(page.getByRole('heading', { name: 'A conversa vem depois do sim.' })).toBeVisible();
});

test('mentor receives requests, accepts one and declines another with computed counts', async ({ page }) => {
  const { db } = await setup(page, { requests: [request({ direction: 'incoming', learner_id: PEER, mentor_id: USER }), request({ id: '55555555-5555-4555-8555-555555555555', direction: 'incoming', learner_id: PEER, mentor_id: USER, subject: 'Álgebra' })] }); await loaded(page); await nav(page, 'Solicitações');
  await expect(page.getByRole('button', { name: 'Recebidas (2)' })).toBeVisible(); await page.getByRole('button', { name: 'Aceitar', exact: true }).first().click(); await expect(page.getByText('Aceita', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Deu match!' })).toBeVisible(); await page.getByRole('button', { name: 'Fechar janela' }).click(); await page.getByRole('button', { name: 'Recusar', exact: true }).click(); await expect(page.getByText('Recusada', { exact: true })).toBeVisible();
  expect(db.requests.map(r => r.status)).toEqual(['accepted', 'declined']); await nav(page, 'Conversas'); await expect(page.getByRole('button', { name: /Conversar/ })).toHaveCount(1);
});

test('chat preserves draft across navigation and retries failed send with same UUID', async ({ page }) => {
  const { db } = await setup(page, { requests: [request({ status: 'accepted' })], sendFailures: 1, messages: [{ id: 'm1', sender_id: PEER, body: 'Olá, qual é sua dúvida?', created_at: '2026-10-01T15:00:00Z', client_id: 'peer-id' }] }); await loaded(page); await openChat(page);
  await expect(page.getByRole('log')).toContainText('Ana Oliveira'); await expect(page.getByRole('log')).toContainText('01/10');
  await page.getByLabel('Sua mensagem', { exact: true }).fill('Podemos revisar limites?'); await nav(page, 'Explorar'); await loaded(page); await openChat(page); await expect(page.getByLabel('Sua mensagem', { exact: true })).toHaveValue('Podemos revisar limites?');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click(); await expect(page.getByRole('alert')).toContainText('Não foi possível concluir'); await expect(page.getByLabel('Sua mensagem', { exact: true })).toHaveValue('Podemos revisar limites?');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click(); await expect(page.locator('.bubble.own')).toContainText('Podemos revisar limites?'); await expect(page.getByLabel('Sua mensagem', { exact: true })).toHaveValue('');
  const sends = db.calls.filter(c => c.name === 'mentor_send'); expect(sends).toHaveLength(2); expect(sends[0].body.p_client_id).toBe(sends[1].body.p_client_id); expect(db.messages).toHaveLength(2);
});

test('profile edits validate subjects, persist inactive publication and reject unsafe photos', async ({ page }) => {
  const { db } = await setup(page, { own: profile({ photo_url: 'https://untrusted.test/private.jpg' }) }); await loaded(page); await nav(page, 'Perfil');
  await expect(page.locator('.photo-preview')).toHaveCount(0); await chooseSubjects(page, 'Posso ajudar com', [...'ABCDEFGH']); await expect(page.getByRole('group', { name: 'Posso ajudar com', exact: true }).getByRole('checkbox', {name:'I',exact:true})).toBeDisabled();
  await chooseSubjects(page, 'Posso ajudar com', ['Programação']); await page.getByLabel('Sobre seu aprendizado').fill('Gosto de exemplos práticos.'); await page.getByLabel('Formato de preferência').selectOption('online'); await page.getByRole('button', { name: 'Salvar perfil' }).click(); await loaded(page);
  expect(db.own.bio).toBe('Gosto de exemplos práticos.'); expect(db.own.subjects).toEqual(['Programação']); expect(db.own.active).toBe(false); expect(db.own.format).toBe('online'); expect(db.own.photo_url).toBe('');
});

test('profile native selects fit at 200% text and preserve every study preference', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { db } = await setup(page); await loaded(page); await nav(page, 'Perfil');
  await page.evaluate(() => document.documentElement.style.fontSize = '32px');
  const preference = page.getByRole('combobox', { name: 'Prefiro estudar', exact: true });
  await expect(preference.locator('option')).toHaveText(['Individualmente', 'Em grupo', 'Individualmente ou em grupo']);
  for (const value of ['individual', 'grupo', 'ambos']) {
    await preference.selectOption(value); await expect(preference).toHaveValue(value);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await preference.scrollIntoViewIfNeeded(); await preference.focus(); await expect(preference).toBeFocused();
  }
  await page.getByRole('combobox', { name: 'Formato de preferência', exact: true }).selectOption('online');
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click(); await loaded(page);
  expect(db.own.study_preference).toBe('ambos'); expect(db.own.format).toBe('online');
  await nav(page, 'Perfil'); await expect(preference).toHaveValue('ambos');
});

test('optional photo validates format and uploads only to the own UUID folder', async ({ page }) => {
  const { db } = await setup(page); await loaded(page); await nav(page, 'Perfil');
  await page.getByLabel('Foto de perfil (opcional)').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') }); await page.getByRole('button', { name: 'Salvar perfil' }).click(); await expect(page.getByRole('alert')).toContainText('não corresponde'); expect(db.uploads).toHaveLength(0);
  await page.getByLabel('Foto de perfil (opcional)').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64') }); await page.getByRole('button', { name: 'Salvar perfil' }).click(); await loaded(page);
  expect(db.uploads[0].path).toMatch(new RegExp(`/storage/v1/object/photos/${USER}/[0-9a-f-]{36}\\.jpg$`)); expect(db.own.photo_url).toContain(`/storage/v1/object/public/photos/${USER}/`);
});

test('profile and message user content remain escaped text', async ({ page }) => {
  const xss = '<img src=x onerror="window.injected=1">';
  await setup(page, { mentors: [mentor({ name: xss, bio: xss, subjects: [xss] })], requests: [request({ status: 'accepted', peer: mentor({ name: xss }) })], messages: [{ id: 'xss', sender_id: PEER, body: xss, created_at: '2026-10-01T15:00:00Z' }] });
  await nav(page, 'Descobrir'); await expect(page.getByRole('heading', { name: xss })).toBeVisible(); await expect(page.locator('.mentor-card img')).toHaveCount(0); await page.getByRole('button', { name: /Ver perfil/, exact: false }).click(); await expect(page.getByRole('dialog')).toContainText(xss); await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar janela' }).click(); await openChat(page); await expect(page.getByRole('log')).toContainText(xss); expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('empty and filtered states remain actionable without fabricated students', async ({ page }) => {
  const { db } = await setup(page, { mentors: [] }); await nav(page, 'Descobrir'); await expect(page.getByRole('heading', { name: 'Novos aprendizados vêm aí.' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Oferecer monitoria' })).toBeVisible();
  await page.getByLabel('Buscar disciplina', { exact: true }).fill('Química'); await page.getByRole('button', { name: 'Buscar', exact: true }).click(); await expect(page.getByText(/Nenhum monitor disponível para/)).toContainText('Química');
  await page.getByRole('button', { name: 'Limpar busca e filtros' }).click(); await expect(page.getByLabel('Buscar disciplina', { exact: true })).toHaveValue(''); expect(db.calls.findLast(c => c.name === 'mentor_discover_product').body.p_subject).toBe('');
});

test('missing migration is actionable and retry recovers without fake data', async ({ page }) => {
  const { db } = await setup(page, { errors: { mentor_me: { code: 'PGRST202', message: 'missing function' } } });
  await expect(page.getByRole('alert')).toContainText('aplicar a migração de monitoria'); expect(db.calls.some(c => c.name === 'mentor_discover_product')).toBe(false);
  delete db.errors.mentor_me; await page.getByRole('button', { name: 'Tentar novamente' }).click(); await loaded(page);
  db.errors.mentor_discover_product = { message: 'network down' }; await page.getByRole('button', { name: 'Atualizar monitores' }).click(); await expect(page.getByRole('alert')).toContainText('Confira sua conexão');
  delete db.errors.mentor_discover_product; await page.getByRole('button', { name: 'Tentar novamente' }).click(); await loaded(page);
});

test('loading responses cannot overwrite a different view or signed-out screen', async ({ page }) => {
  const { db } = await setup(page); await loaded(page); db.delays.mentor_requests = 600;
  await nav(page, 'Solicitações'); await expect(page.getByRole('status').filter({ hasText: 'Buscando solicitações' })).toBeVisible(); await nav(page, 'Perfil'); await expect(page.getByLabel('Nome no perfil')).toBeVisible();
  await page.waitForTimeout(750); await expect(page.getByLabel('Nome no perfil')).toBeVisible();
  db.delays.mentor_discover_product = 600; await nav(page, 'Explorar'); await nav(page, 'Perfil'); await page.getByRole('button', { name: 'Sair da conta' }).click(); await expect(page.getByRole('button', { name: 'Entrar no MatchUp' })).toBeVisible();
  await page.waitForTimeout(750); await expect(page.getByRole('button', { name: 'Entrar no MatchUp' })).toBeVisible(); await expect(page.getByRole('navigation')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sb-drvqiiddgcgvmbbnwdky-auth-token'))).toBeNull();
});

test('permission loss hides old messages and disables sending without success notice', async ({ page }) => {
  const { db } = await setup(page, { requests: [request({ status: 'accepted' })], messages: [{ id: 'old', sender_id: PEER, body: 'Mensagem privada', created_at: '2026-10-01T15:00:00Z' }] }); await loaded(page); await openChat(page); await expect(page.getByRole('log')).toContainText('Mensagem privada');
  db.errors.mentor_send = { code: '42501', message: 'permission denied' }; await page.getByLabel('Sua mensagem', { exact: true }).fill('Rascunho'); await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.getByRole('alert')).toContainText('não está mais disponível'); await expect(page.getByRole('log')).not.toContainText('Mensagem privada'); await expect(page.getByLabel('Sua mensagem', { exact: true })).toHaveCount(0); await expect(page.locator('#toast')).not.toContainText('enviada');
});

test('block confirmation only claims success after server confirmation', async ({ page }) => {
  const { db } = await setup(page, { requests: [request({ status: 'accepted' })] }); await loaded(page); await openChat(page);
  await page.getByRole('button', { name: 'Bloquear estudante', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('não envia uma denúncia');
  db.blockFalse = true; await page.getByLabel('Motivo (opcional)').fill('Contato indesejado'); await page.getByRole('button', { name: 'Confirmar bloqueio' }).click(); await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  db.blockFalse = false; await page.getByRole('button', { name: 'Confirmar bloqueio' }).click(); await expect(page.getByRole('heading', { name: 'A conversa vem depois do sim.' })).toBeVisible(); expect(db.requests).toHaveLength(0); expect(db.calls.findLast(c => c.name === 'mentor_block').body).toEqual({ p_user: PEER, p_reason: 'Contato indesejado' });
});

test('320px short viewport, focus indicators and 200% text remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await setup(page); await loaded(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press('Tab'); await page.getByRole('button', { name: /Pular monitor/ }).focus(); await expect(page.getByRole('button', { name: /Pular monitor/ })).toBeFocused();
  const outline = await page.getByRole('button', { name: /Pular monitor/ }).evaluate(el => getComputedStyle(el).outlineStyle); expect(outline).not.toBe('none');
  await page.evaluate(() => document.documentElement.style.fontSize = '32px'); await nav(page, 'Perfil');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); await expect(page.getByLabel('Nome no perfil')).toBeVisible(); await page.getByRole('button', { name: 'Salvar perfil' }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: 'Salvar perfil' })).toBeVisible();
  await page.screenshot({path:test.info().outputPath('mentorship-zoom.png')});
  await nav(page, 'Explorar'); await loaded(page); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('dialogs are labelled, keyboard close works and drafts survive profile navigation', async ({ page }) => {
  await setup(page); await loaded(page); await page.getByRole('button', { name: /Ver perfil/ }).click(); await expect(page.getByRole('dialog', { name: 'Ana Oliveira' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await nav(page, 'Perfil'); await page.getByLabel('Curso', { exact: true }).selectOption('matematica');
  await nav(page, 'Explorar'); await loaded(page); await nav(page, 'Perfil'); await expect(page.getByLabel('Curso', { exact: true })).toHaveValue('matematica');
});



test('SDK recovery link opens a labelled new password flow, rejects mismatch and updates account', async ({ page }) => {
  const { db } = await setup(page, { loggedIn: false, location: '/#access_token=test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery' });
  await expect(page.getByRole('heading', { name: 'Um novo acesso.' })).toBeVisible();
  await page.getByLabel('Nova senha', { exact: true }).fill('new-password123'); await page.getByLabel('Confirmar nova senha', { exact: true }).fill('different-password'); await page.getByRole('button', { name: 'Salvar nova senha' }).click(); await expect(page.getByRole('alert')).toContainText('precisam ser iguais');
  await page.getByLabel('Confirmar nova senha', { exact: true }).fill('new-password123'); await page.getByRole('button', { name: 'Salvar nova senha' }).click(); await loaded(page);
  expect(db.calls.findLast(c => c.name === 'auth:user' && c.body)?.body.password).toBe('new-password123'); expect(new URL(page.url()).hash).toBe('');
});

test('expired recovery link offers a safe actionable explanation', async ({ page }) => {
  await setup(page, { loggedIn: false, location: '/#error=access_denied&error_code=otp_expired&error_description=Internal-detail-not-for-display' });
  await expect(page.getByRole('alert')).toContainText('expirou'); await expect(page.locator('body')).not.toContainText('Internal-detail-not-for-display'); await expect(page.getByRole('button', { name: 'Esqueci minha senha' })).toBeVisible();
});

test('in-flight send navigation cannot duplicate a message or leave composer locked', async ({ page }) => {
  const { db } = await setup(page, { requests: [request({ status: 'accepted' })], delays: { mentor_send: 900 } }); await loaded(page); await openChat(page);
  await page.getByLabel('Sua mensagem', { exact: true }).fill('Mensagem com retorno tardio'); await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await nav(page, 'Explorar'); await loaded(page); await openChat(page); await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeEnabled(); await expect(page.getByLabel('Sua mensagem', { exact: true })).toHaveValue('Mensagem com retorno tardio');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click(); await expect(page.locator('.bubble.own')).toContainText('Mensagem com retorno tardio');
  const calls = db.calls.filter(c => c.name === 'mentor_send'); expect(calls).toHaveLength(2); expect(calls[0].body.p_client_id).toBe(calls[1].body.p_client_id); expect(db.messages).toHaveLength(1);
});

test('foreground polling refreshes only the active list and stops when hidden or navigating', async ({ page }) => {
  await page.clock.install(); const { db } = await setup(page); await loaded(page);
  await nav(page, 'Solicitações'); await expect(page.getByRole('heading', { name: 'Seu conhecimento pode ajudar.' })).toBeVisible();
  let count = db.calls.filter(c => c.name === 'mentor_requests').length;
  await page.clock.fastForward(12050); await expect.poll(() => db.calls.filter(c => c.name === 'mentor_requests').length).toBe(count + 1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  count = db.calls.filter(c => c.name === 'mentor_requests').length; await page.clock.fastForward(36000); expect(db.calls.filter(c => c.name === 'mentor_requests')).toHaveLength(count);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => db.calls.filter(c => c.name === 'mentor_requests').length).toBe(count + 1);
  await nav(page, 'Perfil'); count = db.calls.filter(c => c.name === 'mentor_requests').length; await page.clock.fastForward(36000); expect(db.calls.filter(c => c.name === 'mentor_requests')).toHaveLength(count);
});

test('profile network failure retains edited fields and selected photo retry URL', async ({ page }) => {
  const { db } = await setup(page, { errors: { mentor_save_product: { message: 'Network failure' } } }); await loaded(page); await nav(page, 'Perfil');
  await page.getByLabel('Curso', { exact: true }).selectOption('matematica'); await page.getByRole('button', { name: 'Salvar perfil' }).click(); await expect(page.getByRole('alert')).toContainText('Confira sua conexão'); await expect(page.getByLabel('Curso', { exact: true })).toHaveValue('matematica');
  delete db.errors.mentor_save_product; await page.getByRole('button', { name: 'Salvar perfil' }).click(); await loaded(page); expect(db.own.course).toBe('Matemática');
});

test('request and list errors retain selection and have a working retry', async ({ page }) => {
  const { db } = await setup(page, { errors: { mentor_request_product: { message: 'Network failure' } } }); await loaded(page); await page.getByRole('button', { name: 'Solicitar monitoria', exact: true }).click();
  await fillGuidance(page); await page.getByLabel('Em qual disciplina?').selectOption('Cálculo'); await page.getByRole('button', { name: 'Confirmar solicitação' }).click(); await expect(page.getByRole('alert')).toContainText('Confira sua conexão'); await expect(page.getByLabel('Em qual disciplina?')).toHaveValue('Cálculo');
  delete db.errors.mentor_request_product; db.errors.mentor_requests = { message: 'Network failure' }; await page.getByRole('button', { name: 'Confirmar solicitação' }).click(); await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  delete db.errors.mentor_requests; await page.getByRole('button', { name: 'Tentar novamente' }).click(); await expect(page.getByText('Aguardando resposta', { exact: true })).toBeVisible();
});

test('home presents actual dual-role subjects and exactly five academic destinations', async ({ page }) => {
  const own = profile({ name: 'Luiza Lima', institution: 'Universidade Teste', subjects: ['Cálculo'], learning_subjects: ['Cálculo', 'Física'], current_subjects: ['Algoritmos'], topics: ['Derivadas'], active: true });
  await setup(page, { own });
  await expect(page.getByText('Olá, Luiza!', { exact: false })).toBeVisible();
  expect(await page.getByRole('navigation').getByRole('button').allTextContents()).toEqual(['Início', 'Descobrir', 'Chat', 'Agenda', 'Perfil']);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta', exact: true })).toBeVisible();
  await expect(page.locator('.subject-card.teach')).toContainText('Cálculo'); await expect(page.locator('.subject-card.help').first()).toContainText('Cálculo');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).toBe('#087e8b');
  await page.getByRole('button', { name: 'Ver todas as minhas matérias para aprender', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estou cursando', exact: true })).toBeVisible(); await expect(page.locator('.subject-grid')).toContainText(['Cálculo', 'Cálculo', 'Algoritmos']);
  await page.getByRole('button', { name: /Ver assuntos de interesse/ }).first().click(); await expect(page.getByRole('dialog')).toContainText('Derivadas'); await expect(page.getByRole('dialog')).toContainText('interesses gerais');
  await page.getByRole('dialog').getByRole('button', { name: 'Encontrar estudantes' }).click(); await expect(page.getByLabel('Buscar disciplina')).toHaveValue('Cálculo');
});

test('staged opt-in validates expanded subject limits and preserves independent roles', async ({ page }) => {
  const { db } = await setup(page, { own: null });
  await fillProfile(page); await page.getByLabel('Nome no perfil').fill('Luiza Lima'); await page.getByLabel('Instituição de ensino').fill('Universidade Teste'); await page.getByLabel('Cidade', { exact: true }).fill('Recife');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); await expect(page.getByText('Etapa 2 de 2', { exact: false })).toBeVisible();
  await chooseSubjects(page, 'Matérias que estou cursando', Array.from({ length: 12 }, (_, i) => `Disciplina ${i}`));
  await expect(page.getByRole('group', {name:'Matérias que estou cursando',exact:true}).getByRole('checkbox',{name:'Disciplina 12',exact:true})).toBeDisabled();
  await chooseSubjects(page, 'Matérias que estou cursando', ['Cálculo', 'Algoritmos']); await chooseSubjects(page, 'Posso ajudar com', ['Cálculo']); await chooseSubjects(page, 'Quero aprender', ['Cálculo', 'Física']);
  await page.getByLabel('Assuntos que quero aprender').fill(Array.from({ length: 21 }, (_, i) => `Assunto ${i}`).join(', ')); await page.getByRole('button', { name: 'Salvar e começar' }).click(); await expect(page.getByRole('alert')).toContainText('20 assuntos');
  await page.getByLabel('Assuntos que quero aprender').fill('Derivadas, derivadas, Funções');
  await page.getByLabel('Prefiro estudar').selectOption('grupo'); await page.getByLabel('Estou disponível para oferecer monitoria').check();
  expect(db.calls.filter(c => c.name === 'mentor_discover_product' || c.name === 'mentor_save_product')).toHaveLength(0);
  await page.getByRole('button', { name: 'Salvar e começar' }).click(); await expect(page.getByText('Olá, Luiza!', { exact: false })).toBeVisible();
  expect(db.own).toMatchObject({ institution: 'Universidade Teste', city: 'Recife', subjects: ['Cálculo'], learning_subjects: ['Cálculo', 'Física'], current_subjects: ['Cálculo', 'Algoritmos'], topics: ['Derivadas', 'Funções'], study_preference: 'grupo', active: true });
});

test('home suggestions open academic details and can request mutual study', async ({ page }) => {
  const xss = '<img src=x onerror="window.injected=1">';
  const { db } = await setup(page, { mentors: [mentor({ institution: 'Universidade Teste', city: 'Recife', topics: [xss], study_preference: 'individual' })] });
  await page.getByRole('button', { name: 'Conhecer Ana Oliveira' }).click();
  await expect(page.getByRole('dialog')).toContainText('Universidade Teste'); await expect(page.getByRole('dialog')).toContainText('Recife'); await expect(page.getByRole('dialog')).toContainText('Individualmente'); await expect(page.getByRole('dialog')).toContainText(xss); await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Solicitar monitoria', exact: true }).click(); await fillGuidance(page); await page.getByLabel('Em qual disciplina?').selectOption('Cálculo'); await page.getByRole('button', { name: 'Confirmar solicitação' }).click();
  await expect(page.getByText('Aguardando resposta', { exact: true })).toBeVisible(); expect(db.requests[0].status).toBe('pending'); expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('mutual acceptance celebrates the academic match and opens accepted chat', async ({ page }) => {
  await setup(page, { requests: [request({ direction: 'incoming', learner_id: PEER, mentor_id: USER })] });
  await page.getByRole('button', { name: 'Solicitações', exact: true }).click(); await page.getByRole('button', { name: 'Aceitar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Deu match!' })).toContainText('Vocês podem estudar juntos.'); await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page.getByLabel('Sua mensagem')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Ana Oliveira', exact: true })).toBeVisible();
});

test('academic bridge mounts delegated views and fetches uncached accepted chat', async ({ page }) => {
  await setup(page, { requests: [request({ status: 'accepted' })] }); await expect(page.getByText('Olá, Estudante!', { exact: false })).toBeVisible();
  await page.evaluate(() => {
    window.moduleEvents = [];
    window.MentorAcademic = {
      renderReviews(node, userId) { node.textContent = `Feedback delegado: ${userId}`; }, cleanup() { window.moduleEvents.push('cleanup'); }, reset() { window.moduleEvents.push('reset'); },
      async nextSession() { return { title: 'Próximo encontro delegado', subject: 'Próximo encontro delegado', starts_at: '2030-10-03T18:00:00Z' }; }, renderAgenda(node) { node.textContent = 'Agenda delegada'; }, renderGroups(node) { node.textContent = 'Grupos delegados'; }, renderGroup(node, id) { node.textContent = `Grupo delegado: ${id}`; }, renderNotifications(node) { node.textContent = 'Notificações delegadas'; },
      mountChatTools(node, data) { window.moduleEvents.push(data.requestId); node.textContent = `Materiais com ${data.peer.name}: ${data.subject}`; }
    };
    window.MentorApp.refreshHome();
  });
  await expect(page.locator('#academicHome')).toContainText('Próximo encontro delegado'); await expect(page.locator('header').getByRole('button', { name: 'Notificações', exact: true })).toBeVisible();
  await nav(page, 'Perfil'); await expect(page.locator('#academicProfileReviews')).toHaveText(`Feedback delegado: ${USER}`);
  await nav(page, 'Agenda'); await expect(page.locator('main')).toHaveText('Agenda delegada');
  await page.evaluate(id => window.MentorApp.openGroup(id), REQUEST); await expect(page.locator('main')).toHaveText(`Grupo delegado: ${REQUEST}`); await expect(page.getByRole('navigation').getByRole('button', { name: 'Início', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav(page, 'Início'); await page.getByRole('button', { name: 'Grupos de estudo', exact: true }).click(); await expect(page.locator('main')).toHaveText('Grupos delegados');
  await nav(page, 'Início'); await page.getByRole('button', { name: 'Notificações', exact: true }).click(); await expect(page.locator('main')).toHaveText('Notificações delegadas');
  await page.evaluate(id => window.MentorApp.openRequestChat(id), REQUEST); await expect(page.getByLabel('Sua mensagem')).toBeVisible(); await expect(page.locator('#academicChatTools')).toHaveText('Materiais com Ana Oliveira: Cálculo');
  expect(await page.evaluate(() => window.moduleEvents.filter(event => event === 'cleanup').length)).toBeGreaterThan(3);
});

test('home retry, stale reads and 200 percent text preserve functional navigation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { db } = await setup(page, { errors: { mentor_discover_product: { message: 'Network failure' } } }); await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  delete db.errors.mentor_discover_product; await page.getByRole('button', { name: 'Tentar novamente' }).click(); await expect(page.getByRole('button', { name: 'Conhecer Ana Oliveira' })).toBeVisible();
  await page.evaluate(() => document.documentElement.style.fontSize = '32px'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  db.delays.mentor_discover_product = 500; await page.evaluate(() => window.MentorApp.refreshHome()); await nav(page, 'Perfil'); await page.waitForTimeout(600); await expect(page.getByLabel('Nome no perfil')).toBeVisible(); await expect(page.locator('#homeSuggestions')).toHaveCount(0);
});

test('profile settings explain privacy and provide account password recovery', async ({ page }) => {
  const { db } = await setup(page); await nav(page, 'Perfil'); await page.getByRole('button', { name: 'Privacidade', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Desmarque sua disponibilidade'); await page.getByRole('button', { name: 'Fechar janela' }).click();
  await page.getByRole('button', { name: 'Segurança da conta', exact: true }).click(); await page.getByRole('button', { name: 'Receber link para alterar senha' }).click(); await expect(page.getByRole('dialog').getByRole('status')).toContainText('o link chegará'); expect(db.calls.filter(c => c.name === 'auth:recover')).toHaveLength(1);
});

test('reference Home uses two-column subjects and never invents ratings or progress', async ({ page }) => {
  const own = profile({ name: 'Luiza Lima', subjects: ['Programação', 'Álgebra'], learning_subjects: ['Cálculo', 'Física'], current_subjects: ['Cálculo'], active: true });
  await setup(page, { own, stubAcademic: true }); await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  await expect(page.locator('#homeSessionCount')).toHaveText('—'); await expect(page.locator('#homeRating')).toHaveText('—'); await expect(page.locator('.stat-subjects strong')).toHaveText('4'); await expect(page.locator('.notification-dot')).toBeHidden();
  await expect(page.getByRole('progressbar')).toHaveCount(0); await expect(page.locator('main')).not.toContainText(/\d+%/);
  const cards = await page.locator('.home .subject-card.help').evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
  expect(cards).toHaveLength(2); expect(cards[0].y).toBe(cards[1].y); expect(cards[1].x).toBeGreaterThan(cards[0].x);
  await page.evaluate(({ peer, requestId }) => {
    window.MentorAcademic = { async nextSession() { window.MentorApp.updateHomeMetrics({ completedSessions: 3, averageRating: 4.5, reviewCount: 2, unreadNotifications: 1 }); return { starts_at: '2030-10-03T18:00:00Z', subject: 'Cálculo', topic: 'Derivadas', participants: [window.MentorApp.profile, { user_id: peer.id, profile: peer }], request_id: requestId }; } };
    window.MentorApp.refreshHome();
  }, { peer: mentor(), requestId: REQUEST });
  await expect(page.locator('#academicHome')).toContainText('Cálculo — Derivadas'); await expect(page.locator('#academicHome')).toContainText('Ana Oliveira'); await expect(page.locator('#academicHome')).toContainText('Individual');
  await expect(page.locator('#homeSessionCount')).toHaveText('3'); await expect(page.locator('#homeRating')).toHaveText('4,5'); await expect(page.locator('.notification-dot')).toBeVisible();
  expect(await page.locator('.home-next').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(8, 126, 139)');
  await page.screenshot({ path: test.info().outputPath('mentorship-home-reference.png'), fullPage: true });
  const previousEpoch = await page.evaluate(() => window.MentorApp.epoch); await nav(page, 'Perfil'); await page.evaluate(epoch => window.MentorApp.updateHomeMetrics({ unreadNotifications: 0 }, epoch), previousEpoch); await expect(page.locator('.notification-dot')).toBeVisible();
  await page.evaluate(() => { window.MentorAcademic.nextSession = async () => { throw new Error('Network failure'); }; window.MentorApp.refreshHome(); });
  await expect(page.locator('#academicHome').getByRole('alert')).toBeVisible(); await expect(page.locator('#homeSessionCount')).toHaveText('—'); await expect(page.locator('#homeRating')).toHaveText('—'); await expect(page.locator('.notification-dot')).toBeHidden();
});

test('mobile screenshots capture original visual states with isolated fixture data', async ({ page }) => {
  await setup(page); await expect(page.getByRole('button', { name: 'Conhecer Ana Oliveira' })).toBeVisible(); await page.screenshot({ path: test.info().outputPath('mentorship-home.png'), fullPage: true }); await loaded(page); await page.screenshot({ path: test.info().outputPath('mentorship-explore.png'), fullPage: true });
  await page.getByRole('button', { name: 'Solicitar monitoria', exact: true }).click(); await page.screenshot({ path: test.info().outputPath('mentorship-request.png'), fullPage: true });
});
