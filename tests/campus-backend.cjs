'use strict';

// node tests\campus-backend.cjs                    existing schema + concurrency
// node tests\campus-backend.cjs --validate-migration  full transaction, rolled back
// node tests\campus-backend.cjs --apply              validate first, migrate, test
// node tests\campus-backend.cjs --https              Auth login + HTTPS SDK smoke only
// Only freshly generated UUID fixtures are inserted/deleted; never invokes resets/seeds.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { client } = require('./backend-db');
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'campus-modes.sql'), 'utf8');
const signatures = {
  campus_list: ['text'], campus_detail: ['uuid'], campus_create: ['text', 'jsonb'],
  campus_join: ['uuid'], campus_leave: ['uuid'], campus_cancel: ['uuid'], campus_send: ['uuid', 'text'],
};
const roles = new Set(['authenticated', 'anon']);
const fixtureIds = Array.from({ length: 12 }, () => randomUUID());
const [owner, member, outsider, driver, racer1, racer2, dating1, dating2, minor, unknownBirth, banned, deleted] = fixtureIds;
const realTables = ['profiles', 'user_filters', 'user_interests', 'user_photos', 'swipes', 'matches',
  'messages', 'blocks', 'reports', 'notifications', 'premium_subscriptions', 'favorite_lines'];
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions++; }
function pass(message) { console.log(`PASS ${message}`); }

async function identity(db, id, role = 'authenticated') {
  assert.ok(roles.has(role));
  await db.query(`SET LOCAL ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
    [id || '', JSON.stringify(id ? { sub: id, role } : { role })]);
}
async function as(db, id, sql, args = [], role = 'authenticated') {
  await db.query('SAVEPOINT campus_request');
  try {
    await identity(db, id, role);
    const result = await db.query(sql, args);
    await db.query('RESET ROLE');
    await db.query('RELEASE SAVEPOINT campus_request');
    return result;
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT campus_request');
    await db.query('RELEASE SAVEPOINT campus_request');
    throw error;
  }
}
function rpcQuery(name, args) {
  assert.ok(signatures[name]);
  eq(args.length, signatures[name].length, 'RPC argument count');
  return [`SELECT public.${name}(${signatures[name].map((type, i) => `$${i + 1}::${type}`).join(',')}) AS value`,
    args.map((v, i) => signatures[name][i] === 'jsonb' && v !== null ? JSON.stringify(v) : v)];
}
async function rpc(db, id, name, ...args) {
  const [sql, params] = rpcQuery(name, args);
  return (await as(db, id, sql, params)).rows[0].value;
}
async function denied(action, code = '42501') {
  await assert.rejects(action, e => e.code === code);
  assertions++;
}
const future = () => new Date(Date.now() + 7 * 86400000).toISOString();
const data = (mode, overrides = {}) => ({ title: `Campus fixture ${mode}`, starts_at: future(),
  capacity: mode === 'study' ? 3 : 2, ...(mode === 'study' ? { subject: 'Cálculo' } : { origin: 'Campus', destination: 'Estação' }), ...overrides });
const create = (db, user, mode, overrides) => rpc(db, user, 'campus_create', mode, data(mode, overrides));
const detail = (db, user, post) => rpc(db, user, 'campus_detail', post);
const list = (db, user, mode) => rpc(db, user, 'campus_list', mode);
const postKeys = ['id', 'mode', 'owner_id', 'owner_name', 'title', 'description', 'subject', 'origin', 'destination',
  'meeting_point', 'starts_at', 'capacity', 'member_count', 'is_owner', 'is_member', 'status'].sort();

async function fingerprint(db) {
  const result = {};
  for (const table of realTables) {
    result[table] = (await db.query(`SELECT count(*)::integer AS count,
      md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text), '')) AS hash FROM public.${table} t`)).rows[0];
  }
  result.auth = (await db.query('SELECT count(*)::integer AS count FROM auth.users')).rows[0];
  return result;
}
async function fixtures(db) {
  for (const id of fixtureIds) {
    const birth = id === unknownBirth ? null : id === minor ? '2015-01-01' : '1995-01-01';
    await db.query(`INSERT INTO auth.users(id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      VALUES ($1, 'authenticated', 'authenticated', $2, $3::jsonb, now(), now())`,
    [id, `campus-backend-${id}@example.invalid`, JSON.stringify({ name: 'Campus test identity', birth_date: birth })]);
  }
  await db.query('UPDATE public.profiles SET onboarding_complete = true, bio = $2, gender = $3, photos = ARRAY[$4] WHERE id = ANY($1::uuid[])',
    [[dating1, dating2], 'PRIVATE_DATING_BIO', 'PRIVATE_DATING_GENDER', 'https://example.invalid/private-photo']);
  await db.query("UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = $1", [banned]);
  await db.query('UPDATE auth.users SET deleted_at = now() WHERE id = $1', [deleted]);
  await db.query("INSERT INTO public.user_photos(user_id, url) VALUES ($1, 'https://example.invalid/private')", [dating1]);
  await db.query("INSERT INTO public.user_interests(user_id, interest) VALUES ($1, 'PRIVATE_INTEREST')", [dating1]);
}

async function suite(db) {
  const privateBaseline = (await db.query('SELECT count(*)::integer n FROM public.matches')).rows[0].n;
  const existingId = (await db.query('SELECT id FROM public.profiles WHERE NOT(id = ANY($1::uuid[])) LIMIT 1', [fixtureIds])).rows[0]?.id;
  if (existingId) eq((await as(db, existingId, 'SELECT id FROM public.profiles WHERE id = $1', [existingId])).rowCount, 1, 'existing own profile remains readable');
  eq((await as(db, owner, 'SELECT id FROM public.profiles WHERE id = $1', [owner])).rowCount, 1);
  eq((await as(db, owner, 'SELECT id FROM public.profiles WHERE id <> $1', [owner])).rowCount, 0, 'non-dating account cannot browse dating');
  eq((await as(db, dating1, 'SELECT id FROM public.profiles WHERE id = $1', [owner])).rowCount, 0, 'non-dating target hidden');
  eq((await as(db, dating1, 'SELECT id FROM public.profiles WHERE id = $1', [dating2])).rowCount, 1, 'dating accounts preserved');
  for (const table of ['user_photos', 'user_interests']) {
    eq((await as(db, owner, `SELECT * FROM public.${table} WHERE user_id = $1`, [dating1])).rowCount, 0);
    eq((await as(db, dating2, `SELECT * FROM public.${table} WHERE user_id = $1`, [dating1])).rowCount, 1);
  }
  await denied(() => as(db, owner, "INSERT INTO public.swipes(swiper_id,swiped_id,direction) VALUES ($1,$2,'like')", [owner, dating1]));
  await denied(() => as(db, dating1, "INSERT INTO public.swipes(swiper_id,swiped_id,direction) VALUES ($1,$2,'like')", [dating1, owner]));
  await as(db, dating1, "INSERT INTO public.swipes(swiper_id,swiped_id,direction) VALUES ($1,$2,'like')", [dating1, dating2]);
  await as(db, dating2, "INSERT INTO public.swipes(swiper_id,swiped_id,direction) VALUES ($1,$2,'like')", [dating2, dating1]);
  eq((await as(db, dating1, 'SELECT id FROM public.matches WHERE user1_id IN ($1,$2) AND user2_id IN ($1,$2)', [dating1, dating2])).rowCount, 1);
  pass('dating opt-in isolation, own profile reads, photos/interests and mutual dating match');

  const study = await create(db, owner, 'study');
  const ride = await create(db, driver, 'ride');
  check(/^[0-9a-f-]{36}$/.test(study), 'create returns UUID');
  let s = await detail(db, owner, study);
  eq(s.member_count, 1); eq(s.is_owner, true); eq(s.is_member, true); eq(s.description, ''); eq(s.meeting_point, '');
  let r = await detail(db, driver, ride);
  eq(r.member_count, 0); eq(r.is_owner, true); eq(r.is_member, false); eq(r.members.length, 1, 'driver appears in private roster');
  await rpc(db, driver, 'campus_join', ride);
  eq((await detail(db, driver, ride)).member_count, 0, 'driver never consumes passenger seat');
  const preview = await detail(db, outsider, study);
  eq(preview.members, []); eq(preview.messages, []); eq(preview.is_member, false);
  eq(Object.keys(preview).sort(), [...postKeys, 'members', 'messages'].sort());
  for (const mode of ['study', 'ride']) {
    const posts = await list(db, owner, mode);
    check(posts.every(p => p.mode === mode));
    check(posts.some(p => p.id === (mode === 'study' ? study : ride)));
    for (const p of posts) eq(Object.keys(p).sort(), postKeys);
    check(posts.every(p => Number.isInteger(p.capacity) && Number.isInteger(p.member_count) && Number.isFinite(Date.parse(p.starts_at))));
  }
  await denied(() => rpc(db, outsider, 'campus_send', study, 'não posso'));
  await denied(() => rpc(db, outsider, 'campus_cancel', study));
  await denied(() => rpc(db, owner, 'campus_leave', study), '22023');
  await denied(() => rpc(db, driver, 'campus_leave', ride), '22023');
  await rpc(db, member, 'campus_join', study);
  await rpc(db, member, 'campus_join', study);
  eq((await detail(db, member, study)).member_count, 2, 'join idempotent');
  await rpc(db, member, 'campus_join', ride);
  eq((await detail(db, member, ride)).member_count, 1);
  await rpc(db, owner, 'campus_send', study, '  Olá, estudos!  ');
  await rpc(db, member, 'campus_send', study, 'Mensagem de participante');
  s = await detail(db, member, study);
  eq(s.messages.length, 2); check(s.messages.some(m => m.content === 'Olá, estudos!'));
  eq(Object.keys(s.members[0]).sort(), ['name', 'user_id']);
  eq(Object.keys(s.messages[0]).sort(), ['content', 'created_at', 'id', 'sender_id', 'sender_name']);
  eq((await detail(db, member, ride)).messages, [], 'chat mode isolation');
  const datingPost = await create(db, dating1, 'study');
  await rpc(db, owner, 'campus_join', datingPost);
  await rpc(db, dating1, 'campus_send', datingPost, 'Identidade pública apenas');
  check(!JSON.stringify(await detail(db, owner, datingPost)).includes('PRIVATE'), 'no dating fields in campus data');
  await rpc(db, member, 'campus_leave', study);
  await rpc(db, member, 'campus_leave', study);
  eq((await detail(db, member, study)).messages, [], 'leaver loses history');
  await denied(() => rpc(db, member, 'campus_send', study, 'não posso mais'));
  await rpc(db, member, 'campus_join', study);
  pass('study/ride capacity semantics, organizer/member/outsider, strict projections, chat and leave/idempotency');

  for (const bad of [null, '', 'dating', 'STUDY']) {
    await denied(() => rpc(db, owner, 'campus_list', bad), '22023');
    await denied(() => rpc(db, owner, 'campus_create', bad, data('study')), '22023');
  }
  for (const bad of [null, [], 'text', {}, { ...data('study'), owner_id: outsider }]) {
    await denied(() => rpc(db, owner, 'campus_create', 'study', bad), '22023');
  }
  for (const overrides of [
    { title: 'ab' }, { title: ' '.repeat(5) }, { title: 'x'.repeat(81) }, { title: {} },
    { description: 'x'.repeat(1001) }, { description: false }, { subject: '' }, { subject: 'x'.repeat(81) },
    { origin: 'x'.repeat(101) }, { destination: 'x'.repeat(101) }, { meeting_point: 'x'.repeat(161) },
    { capacity: null }, { capacity: '3' }, { capacity: 2.5 }, { capacity: -1 }, { capacity: 1 }, { capacity: 31 },
    { starts_at: null }, { starts_at: 'infinity' }, { starts_at: 'not-a-date' }, { starts_at: '2027-02-30T12:00:00Z' },
    { starts_at: new Date(Date.now() - 86400000).toISOString() }, { starts_at: '2027-01-01T12:00:00' },
  ]) await denied(() => create(db, owner, 'study', overrides), '22023');
  for (const overrides of [{ origin: '' }, { destination: '' }, { capacity: 0 }, { capacity: 9 }]) {
    await denied(() => create(db, owner, 'ride', overrides), '22023');
  }
  await create(db, owner, 'study', { title: 'x'.repeat(80), description: 'x'.repeat(1000), subject: 'x'.repeat(80), meeting_point: 'x'.repeat(160), capacity: 30 });
  await create(db, owner, 'ride', { origin: 'x'.repeat(100), destination: 'x'.repeat(100), capacity: 8 });
  for (const content of [null, '', '   ', 'x'.repeat(2001)]) await denied(() => rpc(db, owner, 'campus_send', study, content), '22023');
  await rpc(db, owner, 'campus_send', study, 'x'.repeat(2000));
  for (const id of [null, randomUUID(), minor, unknownBirth, banned, deleted]) {
    await denied(() => list(db, id, 'study'));
    await denied(() => create(db, id, 'study'));
    await denied(() => rpc(db, id, 'campus_join', study));
    await denied(() => detail(db, id, study));
  }
  pass('invalid payload/text/date/capacity, field limits, adult/active account requirements');

  const lastSeat = await create(db, owner, 'study', { capacity: 2 });
  await rpc(db, member, 'campus_join', lastSeat);
  await denied(() => rpc(db, outsider, 'campus_join', lastSeat), '22023');
  await rpc(db, member, 'campus_join', lastSeat);
  eq((await detail(db, member, lastSeat)).member_count, 2);
  const oneRide = await create(db, driver, 'ride', { capacity: 1 });
  await rpc(db, member, 'campus_join', oneRide);
  await denied(() => rpc(db, outsider, 'campus_join', oneRide), '22023');
  await rpc(db, driver, 'campus_cancel', oneRide);
  await rpc(db, driver, 'campus_cancel', oneRide);
  r = await detail(db, member, oneRide);
  eq(r.status, 'cancelled'); eq(r.messages, []);
  check((await list(db, member, 'ride')).some(p => p.id === oneRide));
  check((await list(db, driver, 'ride')).some(p => p.id === oneRide));
  check(!(await list(db, outsider, 'ride')).some(p => p.id === oneRide));
  await denied(() => detail(db, outsider, oneRide));
  await denied(() => rpc(db, member, 'campus_send', oneRide, 'cancelled'));
  await denied(() => rpc(db, outsider, 'campus_join', oneRide), '22023');
  await rpc(db, member, 'campus_leave', oneRide);
  await denied(() => detail(db, member, oneRide));
  const past = await create(db, owner, 'study');
  await rpc(db, member, 'campus_join', past);
  await db.query("UPDATE public.campus_posts SET starts_at = now() - interval '1 day' WHERE id = $1", [past]);
  check((await list(db, member, 'study')).some(p => p.id === past));
  check((await list(db, owner, 'study')).some(p => p.id === past));
  check(!(await list(db, outsider, 'study')).some(p => p.id === past));
  await denied(() => detail(db, outsider, past));
  await denied(() => rpc(db, outsider, 'campus_join', past), '22023');
  pass('full study and ride, cancelled/past visibility, owner-only cancellation and denied closed chat');

  const blockedPost = await create(db, owner, 'study', { capacity: 5 });
  await rpc(db, member, 'campus_join', blockedPost);
  await rpc(db, outsider, 'campus_join', blockedPost);
  await rpc(db, member, 'campus_send', blockedPost, 'historical sender');
  await as(db, outsider, 'INSERT INTO public.blocks(blocker_id,blocked_id) VALUES ($1,$2)', [outsider, member]);
  for (const id of [owner, member, outsider, racer1]) {
    check(!(await list(db, id, 'study')).some(p => p.id === blockedPost));
    await denied(() => detail(db, id, blockedPost));
    await denied(() => rpc(db, id, 'campus_send', blockedPost, 'blocked'));
    await denied(() => rpc(db, id, 'campus_join', blockedPost));
  }
  await rpc(db, member, 'campus_leave', blockedPost);
  eq((await detail(db, outsider, blockedPost)).messages, [], 'blocked historical sender stays hidden after leaving');
  await denied(() => rpc(db, member, 'campus_join', blockedPost));
  await as(db, outsider, 'DELETE FROM public.blocks WHERE blocker_id = $1 AND blocked_id = $2', [outsider, member]);
  await rpc(db, member, 'campus_join', blockedPost);
  await as(db, member, 'INSERT INTO public.blocks(blocker_id,blocked_id) VALUES ($1,$2)', [member, owner]);
  await denied(() => detail(db, owner, blockedPost));
  await rpc(db, owner, 'campus_cancel', blockedPost);
  await rpc(db, member, 'campus_leave', blockedPost);
  await as(db, member, 'DELETE FROM public.blocks WHERE blocker_id = $1 AND blocked_id = $2', [member, owner]);
  await as(db, dating1, 'INSERT INTO public.blocks(blocker_id,blocked_id) VALUES ($1,$2)', [dating1, dating2]);
  eq((await as(db, dating2, 'SELECT id FROM public.profiles WHERE id=$1', [dating1])).rowCount, 0);
  eq((await as(db, dating1, 'SELECT id FROM public.profiles WHERE id=$1', [dating2])).rowCount, 0);
  pass('global blocks: both directions, all-member pairs, existing joins, roster/history suppression and safe exit');

  // Fixture-only privileged timestamps make latest-100 ordering deterministic even in one transaction.
  for (let i = 0; i < 105; i++) {
    const id = await rpc(db, owner, 'campus_send', study, `ordered-${i}`);
    await db.query("UPDATE public.campus_messages SET created_at = now() + ($2::integer * interval '1 second') WHERE id = $1 AND sender_id=$3", [id, i + 1, owner]);
  }
  const history = (await detail(db, member, study)).messages;
  eq(history.length, 100); eq(history[0].content, 'ordered-5'); eq(history.at(-1).content, 'ordered-104');
  check(history.every((m, i) => i === 0 || Date.parse(history[i - 1].created_at) <= Date.parse(m.created_at)));
  for (let i = 0; i < 102; i++) await create(db, driver, 'ride', { starts_at: new Date(Date.now() + (20 + i) * 86400000).toISOString() });
  const feed = await list(db, member, 'ride');
  eq(feed.length, 100); check(feed.every((p, i) => p.mode === 'ride' && (!i || Date.parse(feed[i - 1].starts_at) <= Date.parse(p.starts_at))));
  pass('latest 100 messages chronological and feed bounded to 100 ordered posts');

  for (const name of Object.keys(signatures)) {
    const args = name === 'campus_list' ? ['study'] : name === 'campus_create' ? ['study', data('study')]
      : name === 'campus_send' ? [study, 'anon'] : [study];
    const [sql, params] = rpcQuery(name, args);
    await denied(() => as(db, null, sql, params, 'anon'));
  }
  for (const role of ['authenticated', 'anon']) {
    for (const table of ['campus_posts', 'campus_members', 'campus_messages']) {
      for (const sql of [`SELECT * FROM public.${table}`, `DELETE FROM public.${table} WHERE false`,
        `UPDATE public.${table} SET ${table === 'campus_posts' ? 'title=title' : table === 'campus_members' ? 'user_id=user_id' : 'content=content'} WHERE false`,
        `INSERT INTO public.${table} DEFAULT VALUES`]) {
        await denied(() => as(db, owner, sql, [], role));
      }
      const security = (await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [`public.${table}`])).rows[0];
      check(security.relrowsecurity);
    }
  }
  for (const sql of ['SELECT public.campus_actor()', 'SELECT public.campus_visible($1::uuid)']) {
    await denied(() => as(db, owner, sql, sql.includes('$1') ? [study] : []));
  }
  const functions = (await db.query(`SELECT proname, prosecdef, proconfig FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND (proname LIKE 'campus_%' OR proname='dating_can_view')`)).rows;
  check(functions.length >= 11);
  check(functions.every(f => f.prosecdef && f.proconfig.includes('search_path=""')));
  eq((await db.query('SELECT count(*)::integer n FROM public.matches')).rows[0].n, privateBaseline + 1, 'campus adds no dating matches');
  pass('anonymous RPC denial, raw table denial, helper ACLs, SECURITY DEFINER empty search_path');
}

async function concurrency(admin) {
  for (const mode of ['study', 'ride']) {
    await admin.query('BEGIN');
    const post = await create(admin, owner, mode, { capacity: mode === 'study' ? 2 : 1 });
    await admin.query('COMMIT');
    const a = client(); const b = client();
    try {
      await Promise.all([a.connect(), b.connect()]);
      await Promise.all([a.query('BEGIN'), b.query('BEGIN')]);
      await Promise.all([identity(a, racer1), identity(b, racer2)]);
      await a.query('SELECT public.campus_join($1)', [post]);
      // The second transaction waits on the same post row until the first commits.
      const waiting = b.query('SELECT public.campus_join($1)', [post]).then(() => ({ success: true }), e => ({ code: e.code }));
      await new Promise(resolve => setTimeout(resolve, 100));
      await a.query('COMMIT');
      eq((await waiting).code, '22023', 'only one last-seat contender can commit');
      await b.query('ROLLBACK');
      const count = (await admin.query('SELECT count(*)::integer n FROM public.campus_members WHERE post_id=$1', [post])).rows[0].n;
      eq(count, mode === 'study' ? 2 : 1);
      pass(`concurrent ${mode} last seat: one winner, one full-capacity rejection, no duplicate/overbooking`);
    } finally {
      await Promise.all([a, b].map(async db => { await db.query('ROLLBACK').catch(() => {}); await db.end(); }));
    }
  }
}

async function validate(admin) {
  const before = await fingerprint(admin);
  try {
    await admin.query(migration.replace(/COMMIT;\s*$/, ''));
    await fixtures(admin);
    await suite(admin);
  } finally { await admin.query('ROLLBACK'); }
  eq(await fingerprint(admin), before, 'validation changes are fully rolled back');
  pass('migration + complete sequential suite validated in rollback; real rows unchanged');
}
async function live(admin) {
  const before = await fingerprint(admin);
  let committed = false;
  try {
    await admin.query('BEGIN');
    await fixtures(admin);
    await suite(admin);
    await admin.query('COMMIT');
    committed = true;
    await concurrency(admin);
  } finally {
    await admin.query('ROLLBACK');
    if (committed) {
      await admin.query('BEGIN');
      try {
        const removed = await admin.query('DELETE FROM auth.users WHERE id=ANY($1::uuid[]) AND email LIKE $2', [fixtureIds, 'campus-backend-%@example.invalid']);
        eq(removed.rowCount, fixtureIds.length, 'cleanup only generated fixtures');
        for (const [table, column] of [['campus_posts', 'owner_id'], ['campus_members', 'user_id'], ['campus_messages', 'sender_id']]) {
          eq((await admin.query(`SELECT count(*)::integer n FROM public.${table} WHERE ${column}=ANY($1::uuid[])`, [fixtureIds])).rows[0].n, 0);
        }
        await admin.query('COMMIT');
      } catch (error) { await admin.query('ROLLBACK'); throw error; }
    }
    eq(await fingerprint(admin), before, 'all preexisting dating rows unchanged after fixture cleanup');
    console.log(`CLEANUP ${fixtureIds.length} generated auth users removed or rolled back; FK cascade verified`);
    console.log(`PRESERVED auth users ${before.auth.count} -> ${before.auth.count}; dating matches ${before.matches.count} -> ${before.matches.count}; all ${realTables.length} dating tables fingerprint-identical`);
  }
}
async function httpsSmoke(admin) {
  const { createClient } = require('@supabase/supabase-js');
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const url = source.match(/\bSUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = source.match(/\bSUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  check(Boolean(url && key), 'public SDK configuration exists');
  eq(new URL(url).origin, 'https://drvqiiddgcgvmbbnwdky.supabase.co', 'only the authorized project');
  const settingsResponse = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
  eq(settingsResponse.status, 200);
  check((await settingsResponse.json()).mailer_autoconfirm === true, 'abort rather than sending fixture confirmation email');
  const before = await fingerprint(admin);
  const campusSnapshot = async () => {
    const snapshot = {};
    for (const table of ['campus_posts', 'campus_members', 'campus_messages']) {
      snapshot[table] = (await admin.query(`SELECT count(*)::integer AS count,
        md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text), '')) AS hash FROM public.${table} t`)).rows[0];
    }
    return snapshot;
  };
  const campusBefore = await campusSnapshot();
  const ownedEmails = [];
  const ownedIds = new Set();
  const clients = [];
  const observedRpc = new Set();
  let passwordLogins = 0;
  async function transport(input, init) {
    const endpoint = new URL(typeof input === 'string' ? input : input.url || input.toString());
    eq(endpoint.origin, new URL(url).origin, 'SDK transport remains on authorized HTTPS origin');
    const headers = new Headers(init?.headers || input.headers);
    let authenticatedRpc = false;
    if (endpoint.pathname.startsWith('/rest/v1/rpc/')) {
      const token = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (token.split('.').length === 3) {
        const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        if (claims.role === 'authenticated') {
          check(ownedIds.has(claims.sub), 'RPC JWT belongs to this fixture lifecycle');
          authenticatedRpc = true;
        }
      }
    }
    const response = await fetch(input, { ...init, signal: AbortSignal.timeout(20000) });
    if (response.ok && authenticatedRpc) observedRpc.add(endpoint.pathname.split('/').at(-1));
    if (response.ok && endpoint.pathname.endsWith('/token') && endpoint.searchParams.get('grant_type') === 'password') passwordLogins++;
    return response;
  }
  const sdk = () => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport },
  });
  function succeeded(result, operation) {
    if (result.error) throw new Error(`${operation} failed (${result.error.code || result.error.status || 'SDK error'})`);
    assertions++;
    return result.data;
  }
  async function call(client, name, args) { return succeeded(await client.rpc(name, args), name); }
  try {
    for (let i = 0; i < 2; i++) {
      const email = `campus-https-${randomUUID()}@example.com`;
      const password = `${randomUUID()}Aa1!`;
      ownedEmails.push(email);
      const c = sdk(); clients.push(c);
      const signup = succeeded(await c.auth.signUp({ email, password,
        options: { data: { name: 'Campus HTTPS fixture', birth_date: '1995-01-01' } } }), 'Auth signup');
      check(Boolean(signup.user?.id && signup.session?.access_token), 'signup has disposable user and session');
      ownedIds.add(signup.user.id);
      succeeded(await c.auth.signOut({ scope: 'local' }), 'local signout');
      const signin = succeeded(await c.auth.signInWithPassword({ email, password }), 'Auth password login');
      eq(signin.user.id, signup.user.id); check(Boolean(signin.session?.access_token));
      const profile = succeeded(await c.from('profiles').select('id,onboarding_complete').eq('id', signup.user.id).single(), 'own profile HTTPS');
      eq(profile.onboarding_complete, false, 'campus works without dating opt-in');
    }
    eq(passwordLogins, 2, 'two actual successful Auth password grant responses observed');
    pass('HTTPS Auth signup + password sign-in for two disposable non-dating users; actual JWTs observed');
    for (const [mode, organizer, participant] of [['study', clients[0], clients[1]], ['ride', clients[1], clients[0]]]) {
      const id = await call(organizer, 'campus_create', { p_mode: mode, p_data: data(mode) });
      check(/^[0-9a-f-]{36}$/.test(id));
      const posts = await call(participant, 'campus_list', { p_mode: mode });
      check(Array.isArray(posts) && posts.some(p => p.id === id));
      check(posts.every(p => p.mode === mode));
      const other = await call(participant, 'campus_list', { p_mode: mode === 'study' ? 'ride' : 'study' });
      check(!other.some(p => p.id === id));
      let preview = await call(participant, 'campus_detail', { p_post_id: id });
      eq(preview.members, []); eq(preview.messages, []);
      eq(Object.keys(preview).sort(), [...postKeys, 'members', 'messages'].sort());
      check((await participant.rpc('campus_send', { p_post_id: id, p_content: 'outsider' })).error?.code === '42501');
      await call(participant, 'campus_join', { p_post_id: id });
      await call(participant, 'campus_join', { p_post_id: id });
      await call(organizer, 'campus_send', { p_post_id: id, p_content: `Olá pelo HTTPS ${mode}` });
      await call(participant, 'campus_send', { p_post_id: id, p_content: 'Confirmado pelo SDK' });
      const joined = await call(participant, 'campus_detail', { p_post_id: id });
      eq(joined.messages.length, 2); eq(joined.member_count, mode === 'study' ? 2 : 1);
      eq(joined.is_member, true); eq(joined.members.length, 2);
      await call(participant, 'campus_leave', { p_post_id: id });
      preview = await call(participant, 'campus_detail', { p_post_id: id });
      eq(preview.members, []); eq(preview.messages, []);
      check((await participant.rpc('campus_send', { p_post_id: id, p_content: 'leaver' })).error?.code === '42501');
      await call(participant, 'campus_join', { p_post_id: id });
      await call(organizer, 'campus_cancel', { p_post_id: id });
      await call(organizer, 'campus_cancel', { p_post_id: id });
      const cancelled = await call(participant, 'campus_detail', { p_post_id: id });
      eq(cancelled.status, 'cancelled'); eq(cancelled.messages, []);
      check((await call(participant, 'campus_list', { p_mode: mode })).some(p => p.id === id && p.status === 'cancelled'));
      check((await participant.rpc('campus_send', { p_post_id: id, p_content: 'cancelled' })).error?.code === '42501');
      pass(`HTTPS ${mode}: create/list/detail/join/send/leave/cancel via public SDK + actual Auth JWT; private chat boundaries enforced`);
    }
    const anonymous = sdk();
    check((await anonymous.rpc('campus_list', { p_mode: 'study' })).error?.code === '42501');
    for (const table of ['campus_posts', 'campus_members', 'campus_messages']) {
      check((await clients[0].from(table).select('*').limit(1)).error?.code === '42501');
    }
    eq([...observedRpc].sort(), Object.keys(signatures).sort(), 'schema cache exposes all seven exact RPC signatures');
    pass('HTTPS PostgREST schema cache resolves all 7 RPCs; anonymous RPC and raw tables rejected');
  } finally {
    await Promise.all(clients.map(c => c.auth.signOut({ scope: 'local' }).catch(() => {})));
    await admin.query('BEGIN');
    try {
      // Exact random addresses are recorded before signup, covering a lost HTTP signup response too.
      const removed = await admin.query('DELETE FROM auth.users WHERE email=ANY($1::text[]) AND email LIKE $2 RETURNING id',
        [ownedEmails, 'campus-https-%@example.com']);
      for (const id of ownedIds) check(removed.rows.some(row => row.id === id), 'known fixture removed');
      eq((await admin.query('SELECT count(*)::integer n FROM auth.users WHERE email=ANY($1::text[])', [ownedEmails])).rows[0].n, 0);
      await admin.query('COMMIT');
      eq(await fingerprint(admin), before, 'preexisting dating data unchanged by HTTPS smoke');
      eq(await campusSnapshot(), campusBefore, 'fixture cascade restores preexisting campus data');
      console.log(`CLEANUP HTTPS removed ${removed.rowCount} own disposable users; campus/auth fixture cascade verified`);
      console.log(`PRESERVED HTTPS auth users ${before.auth.count} -> ${before.auth.count}; dating matches ${before.matches.count} -> ${before.matches.count}; 12 dating + 3 campus tables fingerprint-identical`);
    } catch (error) { await admin.query('ROLLBACK'); throw error; }
  }
}

async function main() {
  const admin = client();
  try {
    await admin.connect();
    if (process.argv.includes('--https')) {
      await httpsSmoke(admin);
      console.log(`SUCCESS HTTPS ${assertions} assertions; Auth password login and all 7 PostgREST RPCs verified for study and ride`);
      return;
    }
    if (process.argv.includes('--validate-migration') || process.argv.includes('--apply')) await validate(admin);
    if (process.argv.includes('--apply')) {
      const before = await fingerprint(admin);
      await admin.query(migration);
      eq(await fingerprint(admin), before, 'migration preserves all existing rows');
      pass('additive migration committed; all existing users/dating rows unchanged');
    }
    if (!process.argv.includes('--validate-migration')) await live(admin);
    console.log(`SUCCESS ${assertions} assertions; ${process.argv.includes('--validate-migration') ? 'validation rolled back' : 'live authenticated-role RPC suite and concurrency passed'}`);
  } finally { await admin.query('ROLLBACK').catch(() => {}); await admin.end(); }
}
main().catch(error => {
  // Never output connection configuration, query parameters or private rows.
  console.error(`FAIL ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
});
