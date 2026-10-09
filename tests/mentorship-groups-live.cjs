'use strict';
// Opt-in ONLY after deploy-groups.cjs --apply. Never applies migrations.
// Creates three tagged accounts, exercises real Auth/PostgREST, then deletes exact IDs.
// Run separately from other live smokes: full original-data fingerprints detect concurrent writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
let stage = 'offline', assertions = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const ok = value => { assert.ok(value); assertions++; };
async function run() {
  const { createClient } = require('@supabase/supabase-js');
  const { client } = require('./backend-db.js');
  const { snapshot, authSnapshot } = require('../tools/deploy-groups.cjs');
  const source = fs.readFileSync(path.join(__dirname, '..', 'mentorship.js'), 'utf8');
  const url = source.match(/\bconst\s+URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = source.match(/\bconst\s+KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  assert.equal(url, 'https://drvqiiddgcgvmbbnwdky.supabase.co'); assert.ok(key);
  const tag = `groups-live:${randomUUID()}`;
  const actors = Array.from({ length: 3 }, () => {
    const id = randomUUID();
    return { id, email: `groups-live-${id}@example.invalid`, password: `${randomUUID()}Aa1!`, sdk: createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }) }
    }) };
  });
  const ids = actors.map(actor => actor.id), [owner, member, outsider] = actors;
  const db = client(); let before, authBefore;
  const rpc = async (actor, name, args) => {
    const result = await actor.sdk.rpc(name, args); eq(result.error, null); return result.data;
  };
  const denied = async (actor, name, args, code = '42501') => {
    const result = await actor.sdk.rpc(name, args); ok(result.error); eq(result.error.code, code); eq(result.data, null);
  };
  stage = 'connecting'; await db.connect();
  try {
    stage = 'deployed migration prerequisite';
    ok((await db.query("SELECT to_regprocedure('public.mentor_group_join_code(text)') IS NOT NULL AND to_regprocedure('public.mentor_group_update(uuid,jsonb)') IS NOT NULL AND to_regprocedure('public.mentor_group_remove(uuid,uuid)') IS NOT NULL ready")).rows[0].ready);
    before = await snapshot(db); authBefore = await authSnapshot(db);
    stage = 'tagged disposable accounts';
    await db.query('BEGIN');
    try {
      for (const actor of actors) {
        await db.query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          VALUES('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf',10)),now(),'','','','','{"provider":"email","providers":["email"]}'::jsonb,$4::jsonb,now(),now())`,
        [actor.id, actor.email, actor.password, JSON.stringify({ name: 'Validação temporária de grupos', birth_date: '1995-01-01', backend_fixture: tag })]);
        await db.query("INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) VALUES($1::text,$1::uuid,$2::jsonb,'email',now(),now())",
          [actor.id, JSON.stringify({ sub: actor.id, email: actor.email, email_verified: true, phone_verified: false })]);
      }
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    stage = 'real sign-in and catalog profiles';
    for (const actor of actors) {
      const signed = await actor.sdk.auth.signInWithPassword({ email: actor.email, password: actor.password }); eq(signed.error, null); eq(signed.data.user.id, actor.id);
    }
    const catalog = await rpc(owner, 'mentor_catalog'), course = catalog.courses.find(c => c.subjects.length); ok(course);
    const subject = course.subjects[0].name;
    for (const actor of actors) await rpc(actor, 'mentor_save_product', { p_course_id: course.id, p_profile: {
      name: 'Validação temporária de grupos', course: course.name, semester: 3, bio: 'Conta temporária de validação.', subjects: [], learning_subjects: [subject], current_subjects: [subject], topics: [], institution: 'FACENS', city: '', availability: 'À noite', format: 'online', study_preference: 'ambos', photo_url: '', active: false, methodology: '', experience: '', availability_slots: ['seg-noite']
    } });
    stage = 'private creation and visibility';
    const group = await rpc(owner, 'mentor_group_create', { p_group: { name: 'Grupo temporário de validação', subject, objective: 'Validar convites com contas descartáveis.', format: 'online', location: 'https://example.invalid/private-study' } });
    ok(group.id); eq(group.visibility, 'private'); eq(group.capacity, 12); eq(group.member_count, 1); eq(group.location, undefined);
    const p_group = group.id;
    ok(!(await rpc(outsider, 'mentor_groups')).some(g => g.id === p_group));
    await denied(outsider, 'mentor_group_detail', { p_group }); await denied(outsider, 'mentor_group_join', { p_group });
    await denied(outsider, 'mentor_group_code', { p_group, p_action: 'get' });
    eq((await rpc(owner, 'mentor_group_detail', { p_group })).location, 'https://example.invalid/private-study');
    await rpc(owner, 'mentor_group_update', { p_group, p_changes: { capacity: 2 } });
    stage = 'owner invitation and normalized idempotent membership';
    eq(await rpc(owner, 'mentor_group_code', { p_group, p_action: 'get' }), { code: null, enabled: false });
    const first = await rpc(owner, 'mentor_group_code', { p_group, p_action: 'rotate' }); ok(/^[A-F0-9]{32}$/.test(first.code)); eq(first.enabled, true);
    eq((await rpc(owner, 'mentor_group_code', { p_group, p_action: 'get' })).code, first.code);
    const normalized = first.code.toLowerCase().match(/.{1,4}/g).join(' - ');
    eq((await rpc(member, 'mentor_group_join_code', { p_code: normalized })).member_count, 2);
    eq((await rpc(member, 'mentor_group_join_code', { p_code: normalized })).member_count, 2);
    eq((await rpc(member, 'mentor_group_join', { p_group })).member_count, 2);
    ok((await rpc(member, 'mentor_groups')).some(g => g.id === p_group));
    const detail = await rpc(member, 'mentor_group_detail', { p_group }); eq(detail.members.length, 2); eq(detail.code, undefined);
    await denied(outsider, 'mentor_group_join_code', { p_code: first.code }, '22023');
    await denied(member, 'mentor_group_update', { p_group, p_changes: { capacity: 100 } });
    await denied(member, 'mentor_group_code', { p_group, p_action: 'get' });
    await denied(member, 'mentor_group_code', { p_group, p_action: 'rotate' });
    stage = 'rotation disable and enrollment revocation';
    await rpc(owner, 'mentor_group_update', { p_group, p_changes: { capacity: 3 } });
    const second = await rpc(owner, 'mentor_group_code', { p_group, p_action: 'rotate' }); ok(second.code !== first.code);
    await denied(outsider, 'mentor_group_join_code', { p_code: first.code });
    eq(await rpc(owner, 'mentor_group_code', { p_group, p_action: 'disable' }), { code: null, enabled: false });
    await denied(outsider, 'mentor_group_join_code', { p_code: second.code });
    const active = await rpc(owner, 'mentor_group_code', { p_group, p_action: 'rotate' });
    await rpc(owner, 'mentor_group_update', { p_group, p_changes: { enrollment_open: false } });
    await denied(outsider, 'mentor_group_join_code', { p_code: active.code }, '22023');
    eq((await rpc(member, 'mentor_group_join_code', { p_code: active.code })).member_count, 2);
    await rpc(owner, 'mentor_group_update', { p_group, p_changes: { enrollment_open: true } });
    stage = 'real future agenda membership';
    const meeting = await rpc(owner, 'mentor_session_save', { p_session: { group_id: p_group, title: 'Encontro temporário de validação', subject, topic: 'Revisar exercícios', starts_at: new Date(Date.now() + 86400000).toISOString(), duration_minutes: 60, format: 'online', location: 'https://example.invalid/private-study' } });
    ok(meeting.id); eq((await rpc(member, 'mentor_sessions')).find(s => s.id === meeting.id)?.group_id, p_group);
    await rpc(outsider, 'mentor_group_join_code', { p_code: active.code });
    eq((await rpc(outsider, 'mentor_sessions')).find(s => s.id === meeting.id)?.my_response, 'pending');
    stage = 'owner removal cannot be bypassed';
    await denied(member, 'mentor_group_remove', { p_group, p_user: outsider.id });
    eq(await rpc(owner, 'mentor_group_remove', { p_group, p_user: member.id }), true);
    await denied(member, 'mentor_group_join_code', { p_code: active.code }); await denied(member, 'mentor_group_join', { p_group }); await denied(member, 'mentor_group_detail', { p_group });
    ok(!(await rpc(member, 'mentor_sessions')).some(s => s.id === meeting.id));
    const rotated = await rpc(owner, 'mentor_group_code', { p_group, p_action: 'rotate' });
    await denied(member, 'mentor_group_join_code', { p_code: rotated.code });
    stage = 'archive revokes code and future meeting';
    eq(await rpc(owner, 'mentor_group_cancel', { p_group }), true);
    eq(await rpc(owner, 'mentor_group_code', { p_group, p_action: 'get' }), { code: null, enabled: false });
    const archived = await rpc(owner, 'mentor_group_detail', { p_group }); eq(archived.status, 'cancelled'); eq(archived.enrollment_open, false);
    await denied(outsider, 'mentor_group_join_code', { p_code: rotated.code }); await denied(owner, 'mentor_group_update', { p_group, p_changes: { name: 'No reopen' } }, '22023');
    eq((await rpc(outsider, 'mentor_sessions')).find(s => s.id === meeting.id)?.status, 'cancelled');
  } finally {
    try {
      if (before) {
        for (const actor of actors) await actor.sdk.auth.signOut({ scope: 'local' }).catch(() => {});
        await db.query('BEGIN');
        try {
          await db.query("DELETE FROM auth.users WHERE id=any($1::uuid[]) AND raw_user_meta_data->>'backend_fixture'=$2", [ids, tag]);
          await db.query("DELETE FROM auth.audit_log_entries WHERE payload->>'actor_id'=any($1::text[])", [ids]);
          await db.query('COMMIT');
        } catch (error) { await db.query('ROLLBACK'); throw error; }
        eq((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=any($1::uuid[])', [ids])).rows[0].n, 0);
        eq((await db.query('SELECT count(*)::int n FROM auth.identities WHERE user_id=any($1::uuid[])', [ids])).rows[0].n, 0);
        eq((await snapshot(db, before.relations)).hashes, before.hashes);
        eq(await authSnapshot(db), authBefore);
        console.log('PASS: exact tagged account cleanup; original public data, academic profiles, auth users, storage rows and auth helpers preserved.');
      }
    } catch (error) {
      console.error('Cleanup/preservation check failed; inspect only this disposable scope:', JSON.stringify({ tag, ids })); throw error;
    } finally { await db.end(); }
  }
  console.log(`PASS: ${assertions} real authenticated group assertions; private visibility, codes, normalized/idempotent joins, capacity, grants, revocation, removal, agenda and archive.`);
}
async function main(args = process.argv.slice(2)) {
  if (args.length === 0) { console.log('Offline by default. After migration apply: node tests\\mentorship-groups-live.cjs --run. Run separately from other live smokes.'); return; }
  assert.deepEqual(args, ['--run'], 'Usage: node tests\\mentorship-groups-live.cjs [--run]');
  await run();
}
if (require.main === module) main().catch(error => { console.error(`Live groups verification failed at ${stage}: ${error.code || error.name}; details suppressed.`); process.exitCode = 1; });
module.exports = { main };
