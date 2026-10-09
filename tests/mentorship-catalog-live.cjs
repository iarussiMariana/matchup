'use strict';
// Opt-in: creates one tagged, temporary account; never reapplies database migrations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const {chromium, expect} = require('@playwright/test');
const {createClient} = require('@supabase/supabase-js');
const {client} = require('./backend-db.js');
const {assets, root} = require('../tools/web-assets.cjs');
const {normalizeCatalog} = require('../tools/catalog-data.cjs');
const {chooseSubjects} = require('./catalog-fixture.cjs');
const site = 'https://matchup-87k.pages.dev/';
async function run() {
  for (const name of [...assets, 'sw.js']) {
    const response = await fetch(new URL(name, site), {signal:AbortSignal.timeout(20000), cache:'no-store'});
    assert.equal(response.status, 200, name);
    if (name.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
    if (name.endsWith('.webmanifest')) assert.match(response.headers.get('content-type'), /application\/manifest\+json/);
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(fs.readFileSync(path.join(root, 'www', ...name.split('/')))), name);
  }
  const source = fs.readFileSync(path.join(root, 'mentorship.js'), 'utf8');
  const url = source.match(/\bconst\s+URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = source.match(/\bconst\s+KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  assert.equal(url, 'https://drvqiiddgcgvmbbnwdky.supabase.co'); assert.ok(key.startsWith('sb_publishable_'));
  const sdk = createClient(url, key, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}});
  const id = randomUUID(), tag = `catalog-live:${randomUUID()}`;
  const email = `catalog-live-${id}@example.invalid`, password = `${randomUUID()}Aa1!`;
  const db = client(); await db.connect();
  let browser;
  const original = async () => (await db.query(`select id,md5(to_jsonb(p)::text) as hash from mentor_profiles p where id<>$1 order by id`, [id])).rows;
  const before = await original();
  try {
    await db.query('BEGIN');
    try {
      await db.query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        VALUES('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf',10)),now(),'','','','','{"provider":"email","providers":["email"]}'::jsonb,$4::jsonb,now(),now())`, [id,email,password,JSON.stringify({name:'Verificação temporária',birth_date:'1995-01-01',backend_fixture:tag})]);
      await db.query(`INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) VALUES($1::text,$1::uuid,$2::jsonb,'email',now(),now())`, [id,JSON.stringify({sub:id,email,email_verified:true,phone_verified:false})]);
      await db.query('COMMIT');
    } catch(error) { await db.query('ROLLBACK'); throw error; }
    const login = await sdk.auth.signInWithPassword({email,password}); assert.equal(login.error, null);
    const catalog = await sdk.rpc('mentor_catalog'); assert.equal(catalog.error, null);
    const expected = normalizeCatalog(JSON.parse(fs.readFileSync(path.join(root, 'data', 'facens-catalog.json'), 'utf8')));
    assert.deepEqual(catalog.data, expected);
    const longest = expected.courses.flatMap(course => course.subjects.map(subject => ({course,subject}))).sort((a,b) => b.subject.name.length-a.subject.name.length)[0];
    browser = await chromium.launch({channel:'chrome', headless:true});
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(site); await page.getByLabel('E-mail', {exact:true}).fill(email); await page.getByLabel('Senha', {exact:true}).fill(password);
    await page.getByRole('button', {name:'Entrar no MatchUp'}).click();
    await expect(page.getByLabel('Curso', {exact:true})).toBeVisible({timeout:20000});
    await page.getByLabel('Curso', {exact:true}).selectOption(longest.course.id);
    await page.getByLabel('Instituição de ensino', {exact:true}).fill('FACENS'); await page.getByLabel('Cidade', {exact:true}).fill('Sorocaba');
    await page.getByRole('button', {name:'Continuar',exact:true}).click();
    await chooseSubjects(page, 'Matérias que estou cursando', [longest.subject.name]);
    await chooseSubjects(page, 'Quero aprender', [longest.subject.name]);
    await page.getByRole('button', {name:'Salvar e começar'}).click();
    await expect(page.getByRole('navigation')).toBeVisible({timeout:20000});
    const saved = (await db.query('select catalog_course_id,current_subjects,learning_subjects,active from mentor_profiles where id=$1', [id])).rows[0];
    assert.deepEqual(saved, {catalog_course_id:longest.course.id,current_subjects:[longest.subject.name],learning_subjects:[longest.subject.name],active:false});
    await page.reload(); await page.getByRole('navigation').getByRole('button', {name:'Perfil',exact:true}).click();
    await expect(page.getByLabel('Curso', {exact:true})).toHaveValue(longest.course.id);
    await expect(page.getByRole('group', {name:'Matérias que estou cursando',exact:true}).locator('.catalog-chip span:first-child')).toHaveText(longest.subject.name);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true); await page.reload(); await expect(page.locator('#app')).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(`PASS: ${assets.length + 1} remote asset hashes/MIME; exact authenticated catalog; live onboarding/save/reload of 113-character title; active worker and offline shell.`);
  } finally {
    try {
      if (browser) await browser.close();
      await sdk.auth.signOut({scope:'local'}).catch(() => {});
      await db.query('BEGIN');
      try {
        await db.query("DELETE FROM auth.users WHERE id=$1 AND email=$2 AND raw_user_meta_data->>'backend_fixture'=$3", [id,email,tag]);
        await db.query("DELETE FROM auth.audit_log_entries WHERE payload->>'actor_id'=$1", [id]);
        await db.query('COMMIT');
      } catch(error) { await db.query('ROLLBACK'); throw error; }
      assert.equal((await db.query('select count(*)::int n from auth.users where id=$1', [id])).rows[0].n, 0);
      assert.deepEqual(await original(), before);
      console.log('PASS: temporary account removed; original academic profiles unchanged.');
    } finally { await db.end(); }
  }
}
if (process.argv.includes('--run')) run().catch(error => { console.error('Live catalog verification failed:', error.code || error.name); process.exitCode=1; });
else console.log('Opt-in live validation: node tests\\mentorship-catalog-live.cjs --run');
