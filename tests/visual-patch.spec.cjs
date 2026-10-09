const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const BEFORE = process.env.SPARK_VISUAL_PHASE === 'before';
const OUT = path.join(__dirname, '..', 'docs', 'visual-patch', BEFORE ? 'before' : 'after');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MATCH = '33333333-3333-4333-8333-333333333333';
const LONG = 'Planejamento colaborativo para a semana de provas e atividades no campus';
const profile = { id: USER, name: 'Ana Carolina', age: 25, birth_date: '2000-06-15', gender: 'Mulher', looking_for: 'Todos', city: 'Sorocaba', interests: ['Música', 'Games', 'Café'], photos: ['🦄'], bio: LONG, onboarding_complete: true };
const other = { ...profile, id: OTHER, name: 'Mariana Albuquerque', photos: ['🌻'] };
const post = mode => ({ id: mode === 'study' ? '44444444-4444-4444-8444-444444444444' : '55555555-5555-4555-8555-555555555555', mode, owner_id: OTHER, owner_name: other.name, title: mode === 'study' ? 'Revisão de Cálculo e Álgebra Linear' : 'Campus até Terminal Santo Antônio', description: LONG, subject: 'Cálculo e Álgebra Linear', origin: 'Campus FACENS, portaria principal', destination: 'Terminal Santo Antônio, Sorocaba', meeting_point: 'Portaria principal ao lado da biblioteca', starts_at: '2099-10-02T18:00:00.000Z', capacity: 6, member_count: 2, is_owner: false, is_member: true, status: 'open', members: [{ user_id: OTHER, name: other.name }, { user_id: USER, name: profile.name }], messages: [{ id: 'm1', sender_id: OTHER, sender_name: other.name, content: LONG, created_at: '2026-09-30T18:00:00Z' }, { id: 'm2', sender_id: USER, sender_name: profile.name, content: 'Confirmado! Vou levar minhas anotações.\nAté amanhã.', created_at: '2026-09-30T18:01:00Z' }] });
function session() {
  const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  return { access_token: `${enc({ alg: 'HS256' })}.${enc({ sub: USER, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`, refresh_token: 'fixture', expires_in: 3600, token_type: 'bearer', user: { id: USER, email: 'visual@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {} } };
}
async function fixture(page, mode, options = {}) {
  const db = [post('study'), post('ride')];
  const calls = [], remoteFonts = [];
  await page.addInitScript(({ user, mode }) => localStorage.setItem(`spark_mode_${user}`, mode), { user: USER, mode });
  // A catch-all prevents real data, remote images/fonts, and unknown Supabase hosts from escaping.
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
      remoteFonts.push(req.url());
      if (options.fonts) return route.continue();
    }
    if (!url.hostname.endsWith('.supabase.co') && !url.hostname.endsWith('.supabase.in')) return route.abort();
    const name = url.pathname.split('/').pop(), body = req.postDataJSON(), method = req.method();
    calls.push({ name, body, method });
    if (options.delay?.[name]) await new Promise(resolve => setTimeout(resolve, options.delay[name]));
    if (options.errors?.[name]) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: options.errors[name] }) });
    let data = [];
    const item = db.find(p => p.id === body?.p_post_id);
    if (name === 'token') data = session();
    else if (name === 'user') data = session().user;
    else if (name === 'profiles') data = req.headers().accept?.includes('vnd.pgrst.object') ? profile : [other];
    else if (name === 'matches') data = [{ id: MATCH, user1_id: USER, user2_id: OTHER, user1: profile, user2: other }];
    else if (name === 'messages') data = method === 'POST' ? { id: 'sent', ...body, created_at: '2026-09-30T18:02:00Z' } : post('study').messages.map(m => ({ ...m, match_id: MATCH }));
    else if (name === 'campus_list') data = options.empty ? [] : db.filter(p => p.mode === body.p_mode);
    else if (name === 'campus_detail') data = { ...item, members: item.is_member || item.is_owner ? item.members : [], messages: item.is_member || item.is_owner ? item.messages : [] };
    else if (name === 'campus_send') { item.messages.push({ id: 'sent', sender_id: USER, sender_name: profile.name, content: body.p_content, created_at: '2026-09-30T18:02:00Z' }); data = { ok: true }; }
    else if (name === 'campus_leave') { item.is_member = false; data = { ok: true }; }
    else if (name === 'campus_join') { item.is_member = true; data = { ok: true }; }
    else if (name === 'campus_cancel') { item.status = 'cancelled'; data = { ok: true }; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  // Browser websocket routing closes realtime channels before network access.
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.goto('/');
  await page.locator('#loginEmail').fill('visual@example.invalid');
  await page.locator('#loginPass').fill('password123');
  await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator(mode === 'dating' ? '#screen-discover' : '#campusRoot')).toBeVisible();
  await expect(page.locator(mode === 'dating' ? '.profile-card' : '#cmList article')).not.toHaveCount(0);
  return { db, calls, options, remoteFonts };
}
async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
}
for (const viewport of [{ width: 320, height: 640 }, { width: 360, height: 800 }, { width: 412, height: 915 }, { width: 1280, height: 960 }]) {
  for (const mode of ['dating', 'study', 'ride']) {
    test(`visual home ${mode} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await fixture(page, mode);
      if (!BEFORE) {
        await checkShell(page, mode);
        await checkBounds(page);
        await checkPalette(page);
        const buttons = page.locator(mode === 'dating' ? '#modeBar button, #datingNav button, .actions-bar button' : '#modeBar button, .cm-toolbar button, .cm-bottom-nav button');
        for (const button of await buttons.all()) {
          if (!await button.isVisible()) continue;
          const box = await button.boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
      await shot(page, `${mode}-home-${viewport.width === 1280 ? 'wide-app500' : `${viewport.width}x${viewport.height}`}`);
    });
  }
}
for (const mode of ['study', 'ride']) {
  test(`visual secondary ${mode}`, async ({page}) => {
    await fixture(page, mode);
    await page.locator('[data-action="detail"]').first().click();
    await expect(page.locator('#cmDetailBody')).toContainText('Portaria');
    await shot(page, `${mode}-detail`);
    await page.locator('#cmChatForm').scrollIntoViewIfNeeded();
    await shot(page, `${mode}-chat`);
    await page.getByRole('button', {name: mode === 'study' ? 'Sair do grupo' : 'Liberar meu assento', exact:true}).click();
    await shot(page, `${mode}-modal`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name:/Voltar ao mural/}).click();
    await page.locator('[data-action="create"]').click();
    await shot(page, `${mode}-form`);
  });
}
test('visual dating secondary', async ({page}) => {
  await fixture(page, 'dating');
  await page.evaluate(() => navigate('profile'));
  await shot(page, 'dating-profile');
  await page.evaluate(() => navigate('edit-profile'));
  await shot(page, 'dating-form');
  await page.evaluate(id => abrirChat(id), OTHER);
  await expect(page.locator('#chatRoom')).toHaveClass(/open/);
  await shot(page, 'dating-chat');
  await page.evaluate(() => { fecharChat(); navigate('settings'); document.querySelector('#resetActivityBtn').click(); });
  await shot(page, 'dating-modal');
});
async function checkBounds(page) {
  const errors = await page.evaluate(() => {
    const nodes = [document.querySelector('#app'), document.querySelector('.screen.active'), ...document.querySelectorAll('.screen.active .cm-content, .screen.active .cm-scroll, #modeBar')];
    return nodes.filter(n => n && n.clientWidth && n.scrollWidth > n.clientWidth + 2).map(n => `${n.id || n.className}: ${n.scrollWidth}>${n.clientWidth}`);
  });
  expect(errors).toEqual([]);
}
async function checkShell(page, mode) {
  await expect(page.locator('#modeBar')).toBeVisible();
  await expect(page.locator('.screen.active > .topbar')).toHaveCount(mode === 'dating' ? 1 : 0);
  const visibleHeaders = await page.locator('header').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().height > 0).length);
  expect(visibleHeaders).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector('#modeBar').getBoundingClientRect();
    const screen = document.querySelector('.screen.active').getBoundingClientRect();
    return Math.abs(screen.y - header.bottom);
  })).toBeLessThanOrEqual(1);
  const header = await page.locator('#modeBar').boundingBox();
  expect(header.height).toBeGreaterThanOrEqual(64);
  const nav = page.locator('.screen.active .bottom-nav');
  await expect(nav).toBeVisible();
  expect(await nav.getByRole('button').count()).toBe(mode === 'dating' ? 5 : 2);
  const box = await nav.boundingBox();
  const app = await page.locator('#app').boundingBox();
  expect(Math.abs(box.y + box.height - (app.y + app.height))).toBeLessThanOrEqual(2);
  expect(app.width).toBeLessThanOrEqual(500);
}
async function checkPalette(page) {
  const results = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('#app'));
    function rgb(color) {
      const el=document.createElement('i');el.style.color=color;document.body.append(el);
      const value=getComputedStyle(el).color.match(/[\d.]+/g).slice(0,3).map(Number);el.remove();return value;
    }
    function luminance(color) { const v=rgb(color).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}); return .2126*v[0]+.7152*v[1]+.0722*v[2]; }
    function ratio(a,b) {const [x,y]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (x+.05)/(y+.05)}
    const v=name=>s.getPropertyValue(name).trim();
    return {primary:ratio(v('--primary'),'#fff'), text:ratio(v('--text'),v('--bg')), secondary:ratio(v('--text-secondary'),v('--bg')), muted:ratio(v('--text-muted'),v('--bg')), danger:ratio(v('--red'),v('--red-soft')), success:ratio(v('--green'),v('--green-soft')), warning:ratio(v('--yellow'),v('--yellow-soft')), info:ratio(v('--blue'),v('--blue-soft')), border:ratio(v('--border-strong'),'#fff'),focus:ratio(v('--focus'),'#fff')};
  });
  for (const [name,ratio] of Object.entries(results)) expect(ratio, name).toBeGreaterThanOrEqual(['border','focus'].includes(name)?3:4.5);
}
for (const mode of ['dating','study','ride']) {
  test(`visual enlarged text and short viewport ${mode}`, async ({page}) => {
    test.skip(BEFORE, 'New acceptance checks are only applied after implementation');
    await page.setViewportSize({width:320,height:640});
    await fixture(page, mode);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(() => document.documentElement.style.fontSize='30px');
    await checkShell(page, mode);
    await checkBounds(page);
    await shot(page, `${mode}-text200`);
    await page.locator('#switchMode').click();
    await expect(page.locator('#screen-modes')).toBeVisible();
    await page.locator(`[data-campus-mode=${mode}]`).click();
    if(mode === 'dating') {
      await expect(page.locator('#screen-discover')).toBeVisible();
      await page.evaluate(id=>abrirChat(id), OTHER);
    } else {
      await page.locator('[data-action=detail]').first().click();
      await expect(page.locator('#cmChatForm')).toBeVisible();
      await expect(page.locator('#cmMessages .sent')).toHaveCount(1);
      await expect(page.locator('#cmMessages .received')).toHaveCount(1);
    }
    await page.evaluate(() => document.documentElement.style.fontSize='15px');
    await page.setViewportSize({width:360,height:450});
    const input=page.locator(mode==='dating'?'#chatInput':'#cmChatInput');
    // A shortened viewport is a keyboard-layout simulation, not a physical-keyboard test.
    await input.fill('Rascunho preservado');
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeInViewport();
    const send=page.getByRole('button',{name:'Enviar mensagem',exact:true});
    await send.scrollIntoViewIfNeeded();
    await expect(send).toBeInViewport();
    await checkBounds(page);
    await shot(page, `${mode}-keyboard-simulation`);
  });
}
for (const mode of ['study','ride']) {
  test(`visual states ${mode}`, async ({page}) => {
    test.skip(BEFORE, 'After-only state coverage');
    const opts={errors:{}};
    await fixture(page,mode,opts);
    opts.empty=true;
    await page.getByRole('button', {name:'Atualizar mural',exact:true}).first().click();
    await expect(page.locator('#cmList article')).toHaveCount(0);
    await shot(page,`${mode}-empty`);
    opts.errors.campus_list='Falha de conexão: tente novamente';
    await page.getByRole('button', {name:'Atualizar mural',exact:true}).first().click();
    await expect(page.locator('#cmList')).toContainText('Falha de conexão');
    await shot(page,`${mode}-error`);
    delete opts.errors.campus_list;
    opts.empty=false;
    opts.delay={campus_list:700};
    await page.getByRole('button', {name:'Atualizar mural',exact:true}).first().click();
    await shot(page,`${mode}-loading`);
    await expect(page.locator('#cmList article')).not.toHaveCount(0);
    await page.locator('[data-action=create]').click();
    await checkBounds(page);
    const input=page.locator('#cmCreateForm input').first();
    expect(await input.evaluate(n=>getComputedStyle(n).fontSize)).toBe('16px');
    await input.fill(LONG);
    await page.getByRole('button',{name:/Voltar ao mural/}).click();
    await page.locator('[data-action=create]').click();
    await expect(input).toHaveValue(LONG);
  });
}
for (const mode of ['dating','study','ride']) {
  test(`visual loaded font and safe areas ${mode}`, async ({page}) => {
    test.skip(BEFORE, 'After-only enhanced conditions');
    await page.setViewportSize({width:360,height:800});
    await fixture(page,mode,{fonts:true});
    await page.evaluate(() => document.fonts.load('700 24px Poppins'));
    expect(await page.evaluate(() => [...document.fonts].some(face => face.family.includes('Poppins') && face.status === 'loaded'))).toBe(true);
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top','24px');
      document.documentElement.style.setProperty('--safe-bottom','24px');
    });
    await checkShell(page,mode);
    await checkBounds(page);
    await shot(page,`${mode}-font-loaded-safe-area`);
  });
}
test.beforeEach(async ({page}) => {
  page.__visualErrors=[];
  page.on('pageerror', error => page.__visualErrors.push(error.message));
});
test.afterEach(async ({page}) => expect(page.__visualErrors).toEqual([]));
test('visual dialog focus and persistent keyboard navigation', async ({page}) => {
  test.skip(BEFORE, 'After-only accessibility contract');
  await fixture(page,'dating');
  await page.locator('#btnFilter').click();
  await expect(page.locator('#filterAgeMin')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#resetFilters')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#filterAgeMin')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#filterModal')).toBeHidden();
  await expect(page.locator('#btnFilter')).toBeFocused();
  await page.locator('#datingNav [data-screen=profile]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-profile')).toBeVisible();
  await expect(page.locator('#datingNav')).toBeVisible();
  await expect(page.locator('#datingNav [data-screen=profile]')).toHaveAttribute('aria-current','page');
  await expect(page.locator('#datingNav')).toHaveCount(1);
});
