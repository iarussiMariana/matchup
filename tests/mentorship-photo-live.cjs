'use strict';
// Opt-in production photo flow; uses one tagged disposable account and its own storage paths only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { client } = require('./backend-db');
async function run() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'mentorship.js'), 'utf8');
  const url = source.match(/\bconst\s+URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = source.match(/\bconst\s+KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  assert.equal(url, 'https://drvqiiddgcgvmbbnwdky.supabase.co');
  const site = process.env.SPARK_LIVE_URL || 'https://matchup-87k.pages.dev/';
  assert.ok(/^https:\/\/(?:[a-f0-9]+\.)?matchup-87k\.pages\.dev\/?$/.test(site), 'Only the approved deployment may be verified');
  const id = randomUUID(), tag = `photo-live:${randomUUID()}`, email = `photo-live-${id}@example.invalid`, password = `${randomUUID()}Aa1!`;
  const sdk = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const db = client(); await db.connect();
  const original = async () => (await db.query('select id,md5(to_jsonb(p)::text) hash from mentor_profiles p where id<>$1 order by id', [id])).rows;
  const before = await original();
  const uploaded = new Set(); let browser;
  try {
    await db.query('BEGIN');
    try {
      await db.query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        VALUES('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf',10)),now(),'','','','','{"provider":"email","providers":["email"]}'::jsonb,$4::jsonb,now(),now())`, [id, email, password, JSON.stringify({ name: 'Validação temporária', birth_date: '1995-01-01', backend_fixture: tag })]);
      await db.query(`INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) VALUES($1::text,$1::uuid,$2::jsonb,'email',now(),now())`, [id, JSON.stringify({ sub: id, email, email_verified: true, phone_verified: false })]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    const signed = await sdk.auth.signInWithPassword({ email, password }); assert.equal(signed.error, null);
    const catalog = await sdk.rpc('mentor_catalog'); assert.equal(catalog.error, null);
    const course = catalog.data.courses.find(c => c.subjects.length);
    const seed = await sdk.rpc('mentor_save_product', { p_course_id: course.id, p_profile: { name: 'Validação temporária', course: course.name, semester: 3, bio: 'Teste temporário de foto.', subjects: [], learning_subjects: [], current_subjects: [], topics: [], institution: 'FACENS', city: '', availability: '', format: 'online', study_preference: 'ambos', photo_url: '', active: false, methodology: '', experience: '', availability_slots: [] } });
    assert.equal(seed.error, null);
    browser = await chromium.launch({ channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(session => localStorage.setItem('sb-drvqiiddgcgvmbbnwdky-auth-token', JSON.stringify(session)), signed.data.session);
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.name));
    page.on('request', req => {
      const parsed = new URL(req.url()), prefix = `/storage/v1/object/photos/${id}/`;
      if (parsed.origin === url && req.method() === 'POST' && parsed.pathname.startsWith(prefix)) uploaded.add(parsed.pathname.slice('/storage/v1/object/photos/'.length));
    });
    await page.goto(site);
    const profileTab = () => page.getByRole('navigation').getByRole('button', { name: 'Perfil', exact: true }).click();
    await profileTab();
    await page.getByRole('heading', { name: 'Sua foto de perfil' }).waitFor();
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
    for (let index = 0; index < 2; index++) {
      await page.getByLabel('Foto de perfil (opcional)').setInputFiles({ name: `foto-${index}.png`, mimeType: 'image/png', buffer: image });
      await page.waitForFunction(() => document.querySelector('.photo-preview')?.src.startsWith('blob:') && document.querySelector('.photo-preview').naturalWidth > 0);
      await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
      await page.waitForFunction(() => window.MentorApp?.view === 'home');
      const current = await sdk.rpc('mentor_me'); assert.equal(current.error, null);
      assert.ok(current.data.photo_url.startsWith(`${url}/storage/v1/object/public/photos/${id}/`));
      assert.ok(current.data.photo_url.endsWith('.jpg'));
      assert.ok(uploaded.has(current.data.photo_url.split('/public/photos/')[1]));
      const response = await fetch(current.data.photo_url); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/jpeg/);
      const bytes = Buffer.from(await response.arrayBuffer()); assert.deepEqual([...bytes.subarray(0, 3)], [255, 216, 255]);
      await page.reload(); await profileTab();
      await page.waitForFunction(expected => document.querySelector('.photo-preview')?.src === expected && document.querySelector('.photo-preview').naturalWidth > 0, current.data.photo_url);
    }
    assert.equal(uploaded.size, 2);
    await page.getByRole('button', { name: 'Remover foto do perfil' }).click();
    assert.equal(await page.locator('.photo-preview').count(), 0);
    await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
    await page.waitForFunction(() => window.MentorApp?.view === 'home');
    const removed = await sdk.rpc('mentor_me'); assert.equal(removed.error, null); assert.equal(removed.data.photo_url, '');
    await page.reload(); await profileTab(); await page.getByRole('button', { name: 'Adicionar foto', exact: true }).waitFor();
    assert.equal(await page.locator('.photo-preview').count(), 0); assert.deepEqual(errors, []);
    console.log('PASS: published photo picker, local preview, JPEG optimization, real Storage upload, replacement, reload persistence and profile photo removal.');
  } finally {
    try {
      if (browser) await browser.close();
      let photoCleanupError;
      try {
        if (uploaded.size) {
          const result = await sdk.storage.from('photos').remove([...uploaded]); assert.equal(result.error, null);
          assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='photos' and name=any($1::text[])", [[...uploaded]])).rows[0].n, 0);
        }
      } catch (error) { photoCleanupError = error; }
      await sdk.auth.signOut({ scope: 'local' }).catch(() => {});
      await db.query('BEGIN');
      try {
        await db.query("DELETE FROM auth.users WHERE id=$1 AND raw_user_meta_data->>'backend_fixture'=$2", [id, tag]);
        await db.query("DELETE FROM auth.audit_log_entries WHERE payload->>'actor_id'=$1", [id]);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      assert.equal((await db.query('select count(*)::int n from auth.users where id=$1', [id])).rows[0].n, 0);
      assert.deepEqual(await original(), before);
      if (photoCleanupError) throw photoCleanupError;
      console.log('PASS: temporary photos/account removed; original academic profiles preserved.');
    } finally { await db.end(); }
  }
}
if (process.argv.includes('--run')) run().catch(error => { console.error('Live photo verification failed:', error.code || error.name); process.exitCode = 1; });
else console.log('Opt-in live validation: node tests\\mentorship-photo-live.cjs --run');
