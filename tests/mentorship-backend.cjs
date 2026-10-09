'use strict';

// node tests\mentorship-backend.cjs          migration + fixtures + tests, always ROLLBACK
// node tests\mentorship-backend.cjs --apply  validate first, apply only additive DDL, retest in ROLLBACK
// No fixture is ever committed. Database credentials come only from the existing connection helper.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { client } = require('./backend-db');
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'mentorship.sql'), 'utf8');
const transactionalMigration = migration.replace(/COMMIT;\s*$/, '');
const signatures = {
  mentor_me: [], mentor_save: ['jsonb'], mentor_discover: ['text'], mentor_profile: ['uuid'],
  mentor_request: ['uuid', 'text'], mentor_requests: [], mentor_respond: ['uuid', 'boolean'],
  mentor_messages: ['uuid'], mentor_send: ['uuid', 'text', 'uuid'], mentor_block: ['uuid', 'text'],
};
const fixtureIds = Array.from({ length: 12 }, () => randomUUID());
const [learner, mentor, outsider, other, inactive, minor, unknownBirth, banned, deleted, legacyBlocker, newBlocker, blank] = fixtureIds;
const tables = ['mentor_profiles', 'mentor_requests', 'mentor_messages', 'mentor_blocks'];
const profileKeys = ['id', 'name', 'course', 'semester', 'bio', 'subjects', 'learning_subjects', 'availability', 'format', 'photo_url', 'active',
  'institution', 'city', 'current_subjects', 'topics', 'study_preference'].sort();
const helpers = ['mentor_actor', 'mentor_can_contact', 'mentor__actor', 'mentor__eligible', 'mentor__blocked',
  'mentor__lock', 'mentor__profile', 'mentor__request', 'mentor__message', 'mentor__access'];
const requestKeys = ['id', 'learner_id', 'mentor_id', 'subject', 'status', 'created_at'].sort();
const messageKeys = ['id', 'sender_id', 'body', 'created_at', 'client_id'].sort();
const photo = id => `https://drvqiiddgcgvmbbnwdky.supabase.co/storage/v1/object/public/photos/${id}/mentor-test.jpg`;
let assertions = 0;
function check(v, message) { assert.ok(v, message); assertions++; }
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions++; }
function pass(message) { console.log(`PASS ${message}`); }
const data = (overrides = {}) => ({ name: 'Mentoria teste', course: 'Computação', semester: 3,
  institution: 'FACENS', city: 'Sorocaba', current_subjects: ['Cálculo'], topics: ['Derivadas'], study_preference: 'ambos',
  bio: 'Ensino e aprendo', subjects: ['Cálculo', 'Programação'], learning_subjects: ['Física'],
  availability: 'Segunda à tarde', format: 'hibrido', photo_url: '', active: true, ...overrides });
async function identity(db, id, role = 'authenticated') {
  check(['authenticated', 'anon'].includes(role));
  await db.query(`SET LOCAL ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
    [id || '', JSON.stringify(id ? { sub: id, role } : { role })]);
}
async function as(db, id, sql, args = [], role = 'authenticated') {
  await db.query('SAVEPOINT mentor_test');
  try {
    await identity(db, id, role);
    const result = await db.query(sql, args);
    await db.query('RESET ROLE');
    await db.query('RELEASE SAVEPOINT mentor_test');
    return result;
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT mentor_test');
    await db.query('RELEASE SAVEPOINT mentor_test');
    throw error;
  }
}
function query(name, args) {
  assert.ok(signatures[name]); assert.equal(args.length, signatures[name].length);
  return [`SELECT public.${name}(${signatures[name].map((t, i) => `$${i + 1}::${t}`).join(',')}) AS value`,
    args.map((v, i) => signatures[name][i] === 'jsonb' && v !== null ? JSON.stringify(v) : v)];
}
async function rpc(db, id, name, ...args) { return (await as(db, id, ...query(name, args))).rows[0].value; }
async function denied(action, code = '42501') {
  await assert.rejects(action, e => e.code === code); assertions++;
}
async function contact(db, viewer, peer) {
  await db.query('SAVEPOINT internal_contact');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [viewer || '', JSON.stringify(viewer ? { sub: viewer, role: 'authenticated' } : { role: 'anon' })]);
    return (await db.query('SELECT public.mentor_can_contact($1) value', [peer])).rows[0].value;
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT internal_contact'); await db.query('RELEASE SAVEPOINT internal_contact');
  }
}
async function fingerprint(db, includeMentorship = true) {
  const names = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
    ${includeMentorship ? '' : "AND tablename NOT LIKE 'mentor\\_%' ESCAPE '\\'"} ORDER BY tablename`)).rows.map(r => r.tablename);
  const result = {};
  // Includes campus tables and all existing application tables; identifiers originate only in pg_catalog.
  for (const table of names) {
    const quoted = table.replace(/"/g, '""');
    result[table] = (await db.query(`SELECT count(*)::integer n,
      md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM public."${quoted}" t`)).rows[0];
  }
  result.auth = (await db.query(`SELECT count(*)::integer n,
    md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) hash FROM auth.users t`)).rows[0];
  result.policies = (await db.query(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename,policyname`)).rows;
  result.triggers = (await db.query(`SELECT tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) definition
    FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass)) ORDER BY relation,tgname`)).rows;
  return result;
}
async function fixtures(db) {
  for (const id of fixtureIds) {
    const birth = id === unknownBirth ? null : id === minor ? '2015-01-01' : '1995-01-01';
    await db.query(`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
      VALUES($1,'authenticated','authenticated',$2,$3::jsonb,now(),now())`,
    [id, `mentorship-test-${id}@example.invalid`, JSON.stringify({ name: 'PRIVATE_LEGACY_NAME', birth_date: birth })]);
  }
  await db.query(`UPDATE public.profiles SET bio='PRIVATE_DATING_BIO',gender='PRIVATE_DATING_GENDER',
    photos=ARRAY['https://example.invalid/PRIVATE_PHOTO'],onboarding_complete=false WHERE id=ANY($1::uuid[])`, [fixtureIds]);
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [banned]);
  await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1', [deleted]);
}
async function permissions(db) {
  for (const role of ['anon', 'authenticated']) {
    for (const table of tables) {
      for (const sql of [`SELECT * FROM public.${table}`, `DELETE FROM public.${table}`,
        `INSERT INTO public.${table} DEFAULT VALUES`, `UPDATE public.${table} SET ${table === 'mentor_blocks' ? 'reason' : table === 'mentor_profiles' ? 'bio' : table === 'mentor_requests' ? 'subject' : 'body'}=''`]) {
        await denied(() => as(db, learner, sql, [], role));
      }
    }
  }
  const rpcArgs = { mentor_me: [], mentor_save: [data()], mentor_discover: [''], mentor_profile: [mentor],
    mentor_request: [mentor, 'Cálculo'], mentor_requests: [], mentor_respond: [randomUUID(), true],
    mentor_messages: [randomUUID()], mentor_send: [randomUUID(), 'x', randomUUID()], mentor_block: [mentor, ''] };
  for (const [name, args] of Object.entries(rpcArgs)) {
    await denied(() => as(db, null, ...query(name, args), 'anon'));
    for (const id of [null, randomUUID(), minor, unknownBirth, banned, deleted]) await denied(() => rpc(db, id, name, ...args));
  }
  const functions = (await db.query(`SELECT p.oid,p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') auth_execute,
    EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute
    FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname=ANY($1::text[])`,
  [[...Object.keys(signatures), ...helpers]])).rows;
  eq(functions.length, 20);
  for (const f of functions) {
    check(f.prosecdef && f.proconfig.includes('search_path=""'));
    eq(f.anon_execute, false); eq(f.public_execute, false); eq(f.auth_execute, Boolean(signatures[f.proname]));
  }
  for (const sql of [
    'SELECT public.mentor_actor()', `SELECT public.mentor_can_contact('${mentor}')`,
    'SELECT public.mentor__actor()', `SELECT public.mentor__eligible('${mentor}')`,
    `SELECT public.mentor__blocked('${learner}','${mentor}')`, `SELECT public.mentor__lock('${learner}')`,
    'SELECT public.mentor__profile(NULL::public.mentor_profiles)', 'SELECT public.mentor__request(NULL::public.mentor_requests)',
    'SELECT public.mentor__message(NULL::public.mentor_messages)', `SELECT public.mentor__access('${randomUUID()}','${learner}')`,
  ]) await denied(() => as(db, learner, sql));
  const rls = (await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])', [tables.map(t => `public.${t}`)])).rows;
  eq(rls.length, 4); check(rls.every(r => r.relrowsecurity));
  pass('all 10 RPCs deny anonymous/ineligible accounts; direct CRUD/helper/PUBLIC ACLs denied; RLS and empty search paths verified');
}
async function suite(db) {
  const legacyBefore = await fingerprint(db, false);
  for (const id of [learner, mentor, outsider]) eq(await rpc(db, id, 'mentor_me'), null, 'no implicit opt-in');
  for (const overrides of [{ institution: '' }, { city: ' \t' }]) {
    await denied(() => rpc(db, learner, 'mentor_save', data(overrides)), '22023');
  }
  const oldPayload = data();
  for (const key of ['institution', 'city', 'current_subjects', 'topics', 'study_preference']) delete oldPayload[key];
  await denied(() => rpc(db, learner, 'mentor_save', oldPayload), '22023');
  for (const id of [learner, mentor, outsider, other, inactive, legacyBlocker, newBlocker]) {
    const p = await rpc(db, id, 'mentor_save', data({ active: id !== learner && id !== inactive,
      subjects: id === learner ? [] : ['Cálculo', 'Programação'], photo_url: id === mentor ? photo(id) : '' }));
    eq(Object.keys(p).sort(), profileKeys); eq(p.id, id); check(!JSON.stringify(p).includes('PRIVATE'));
    eq(await rpc(db, id, 'mentor_me'), p);
  }
  eq(await contact(db, learner, mentor), true);
  eq(await contact(db, mentor, learner), true, 'inactive learner can contact peers');
  for (const peer of [null, learner, blank, banned, randomUUID()]) eq(await contact(db, learner, peer), false);
  for (const viewer of [null, blank, minor, banned]) eq(await contact(db, viewer, mentor), false);
  await db.query('SAVEPOINT old_profile_defaults');
  await db.query(`INSERT INTO public.mentor_profiles(id,name,course,semester,format)
    VALUES($1,'Old profile','Computação',1,'online')`, [blank]);
  const previous = await rpc(db, blank, 'mentor_me');
  eq(previous.institution, ''); eq(previous.city, ''); eq(previous.current_subjects, []);
  eq(previous.topics, []); eq(previous.study_preference, 'ambos');
  const previousSaved = await rpc(db, blank, 'mentor_save', oldPayload);
  eq(previousSaved.institution, ''); eq(previousSaved.study_preference, 'ambos');
  await db.query('ROLLBACK TO SAVEPOINT old_profile_defaults'); await db.query('RELEASE SAVEPOINT old_profile_defaults');
  const richBefore = await rpc(db, learner, 'mentor_me');
  const oldUpdate = await rpc(db, learner, 'mentor_save', { ...oldPayload, active: false, subjects: [] });
  for (const key of ['institution', 'city', 'current_subjects', 'topics', 'study_preference']) {
    eq(oldUpdate[key], richBefore[key], 'old clients preserve extended profile fields');
  }
  await db.query('SAVEPOINT feed_limit');
  const feedIds = Array.from({ length: 105 }, () => randomUUID());
  await db.query(`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
    SELECT id,'authenticated','authenticated','mentorship-feed-'||id||'@example.invalid',
      '{"name":"Feed fixture","birth_date":"1995-01-01"}'::jsonb,now(),now() FROM unnest($1::uuid[]) id`, [feedIds]);
  await db.query(`INSERT INTO public.mentor_profiles(id,name,course,semester,subjects,format,active)
    SELECT id,'Feed fixture','Computação',1,ARRAY['UniqueFeedFixture'],'online',true FROM unnest($1::uuid[]) id`, [feedIds]);
  const capped = await rpc(db, learner, 'mentor_discover', 'UniqueFeedFixture');
  eq(capped.length, 100, 'feed capped at 100 even with 105 matching profiles');
  check(capped.every(p => feedIds.includes(p.id)));
  await db.query('ROLLBACK TO SAVEPOINT feed_limit'); await db.query('RELEASE SAVEPOINT feed_limit');
  const own = await rpc(db, learner, 'mentor_me');
  eq(own.active, false); eq(own.subjects, []);
  eq(await rpc(db, learner, 'mentor_save', { ...own, name: '  Aprendiz  ' }), { ...own, name: 'Aprendiz' });
  eq(await rpc(db, learner, 'mentor_profile', inactive), null);
  eq(await rpc(db, learner, 'mentor_profile', learner), await rpc(db, learner, 'mentor_me'));
  for (const target of [null, randomUUID(), blank]) eq(await rpc(db, learner, 'mentor_profile', target), null);
  let cards = await rpc(db, learner, 'mentor_discover', 'cÁl');
  check(cards.some(p => p.id === mentor)); check(!cards.some(p => p.id === learner || p.id === inactive));
  check(cards.length <= 100); cards.forEach(p => eq(Object.keys(p).sort(), profileKeys));
  eq(await rpc(db, learner, 'mentor_discover', '%'), [], 'search is literal, not SQL wildcard');
  check(Array.isArray((await as(db, learner, 'SELECT public.mentor_discover() AS value')).rows[0].value));
  await denied(() => rpc(db, blank, 'mentor_request', mentor, 'Cálculo'));
  await denied(() => rpc(db, learner, 'mentor_request', inactive, 'Cálculo'), '22023');
  const first = await rpc(db, learner, 'mentor_request', mentor, ' cálculo ');
  eq(Object.keys(first).sort(), requestKeys); eq(first.subject, 'Cálculo'); eq(first.status, 'pending');
  eq(await rpc(db, learner, 'mentor_request', mentor, 'CÁLCULO'), first, 'pending request idempotency');
  check(!(await rpc(db, learner, 'mentor_discover', '')).some(p => p.id === mentor));
  eq((await rpc(db, mentor, 'mentor_requests')).find(r => r.id === first.id).direction, 'incoming');
  const outgoing = (await rpc(db, learner, 'mentor_requests')).find(r => r.id === first.id);
  eq(outgoing.direction, 'outgoing'); eq(outgoing.peer.id, mentor); eq(Object.keys(outgoing.peer).sort(), profileKeys);
  eq(Object.keys(outgoing).sort(), [...requestKeys, 'peer', 'direction', 'updated_at'].sort());
  eq(await rpc(db, outsider, 'mentor_requests'), []);
  eq((await rpc(db, mentor, 'mentor_profile', learner)).id, learner, 'inactive learner visible to request peer');
  await denied(() => rpc(db, learner, 'mentor_messages', first.id));
  await denied(() => rpc(db, learner, 'mentor_send', first.id, 'pending', randomUUID()));
  await denied(() => rpc(db, learner, 'mentor_respond', first.id, true));
  await denied(() => rpc(db, outsider, 'mentor_respond', first.id, true));
  const accepted = await rpc(db, mentor, 'mentor_respond', first.id, true);
  eq(accepted.status, 'accepted'); eq(await rpc(db, mentor, 'mentor_respond', first.id, true), accepted);
  await denied(() => rpc(db, mentor, 'mentor_respond', first.id, false), '22023');
  eq(await rpc(db, learner, 'mentor_request', mentor, 'cálculo'), accepted);
  await denied(() => rpc(db, outsider, 'mentor_messages', first.id));
  await denied(() => rpc(db, outsider, 'mentor_send', first.id, 'private', randomUUID()));
  const clientId = randomUUID();
  const sent = await rpc(db, learner, 'mentor_send', first.id, '  Olá!  ', clientId);
  eq(Object.keys(sent).sort(), messageKeys); eq(sent.body, 'Olá!'); eq(sent.sender_id, learner); eq(sent.client_id, clientId);
  eq(await rpc(db, learner, 'mentor_send', first.id, '\tOlá!\n', clientId), sent);
  await denied(() => rpc(db, learner, 'mentor_send', first.id, 'changed', clientId), '22023');
  const reply = await rpc(db, mentor, 'mentor_send', first.id, 'Resposta', clientId);
  check(reply.id !== sent.id, 'idempotency key scoped per sender');
  eq(await rpc(db, learner, 'mentor_messages', first.id), [sent, reply]);
  const second = await rpc(db, learner, 'mentor_request', mentor, 'Programação');
  const declined = await rpc(db, mentor, 'mentor_respond', second.id, false);
  eq(declined.status, 'declined'); eq(await rpc(db, mentor, 'mentor_respond', second.id, false), declined);
  await denied(() => rpc(db, mentor, 'mentor_respond', second.id, true), '22023');
  await denied(() => rpc(db, learner, 'mentor_messages', second.id));
  const retry = await rpc(db, learner, 'mentor_request', mentor, 'PROGRAMAÇÃO');
  check(retry.id !== second.id); eq(await rpc(db, learner, 'mentor_request', mentor, 'Programação'), retry);
  await rpc(db, mentor, 'mentor_respond', retry.id, true);
  await denied(() => rpc(db, learner, 'mentor_send', retry.id, 'Olá!', clientId), '22023');
  eq(await rpc(db, learner, 'mentor_messages', retry.id), [], 'no cross-request messages');
  const dualRole = await rpc(db, mentor, 'mentor_request', other, 'Cálculo');
  eq(dualRole.learner_id, mentor, 'same account teaches and learns');
  check((await rpc(db, mentor, 'mentor_requests')).some(r => r.direction === 'incoming'));
  check((await rpc(db, mentor, 'mentor_requests')).some(r => r.direction === 'outgoing'));
  for (const sql of [
    `INSERT INTO public.mentor_requests(learner_id,mentor_id,subject,status) VALUES('${learner}','${mentor}',' CÁLCULO ','pending')`,
    `INSERT INTO public.mentor_requests(learner_id,mentor_id,subject,status) VALUES('${learner}','${mentor}','cálculo','accepted')`,
    `INSERT INTO public.mentor_messages(request_id,sender_id,body,client_id) VALUES('${first.id}','${learner}','duplicate','${clientId}')`,
  ]) {
    await db.query('SAVEPOINT unique_invariant');
    await denied(() => db.query(sql), '23505');
    await db.query('ROLLBACK TO SAVEPOINT unique_invariant'); await db.query('RELEASE SAVEPOINT unique_invariant');
  }
  await rpc(db, mentor, 'mentor_save', data({ active: false }));
  eq((await rpc(db, learner, 'mentor_profile', mentor)).active, false, 'existing peer remains visible after opt-out');
  eq(await rpc(db, outsider, 'mentor_profile', mentor), null);
  await rpc(db, mentor, 'mentor_send', first.id, 'Existing conversation', randomUUID());
  await rpc(db, mentor, 'mentor_save', data());
  // Insert only generated-fixture messages to exercise pagination without 200 network round trips.
  await db.query(`INSERT INTO public.mentor_messages(request_id,sender_id,body,client_id,created_at)
    SELECT $1,$2,'Page '||n,gen_random_uuid(),clock_timestamp()+n*interval '1 millisecond' FROM generate_series(1,205) n`, [first.id, mentor]);
  const history = await rpc(db, learner, 'mentor_messages', first.id);
  eq(history.length, 200); eq(history[0].body, 'Page 6'); eq(history.at(-1).body, 'Page 205');
  history.forEach(p => eq(Object.keys(p).sort(), messageKeys));
  eq(history.map(m => m.created_at), history.map(m => m.created_at).sort());
  eq(await fingerprint(db, false), legacyBefore, 'all mentorship RPCs leave legacy tables, account trigger and RLS unchanged');
  pass('independent opt-in, exact safe projections, matching, requests/terminal retries, inactive peers, private/idempotent chat and last-200 history');

  for (const bad of [null, [], 'text', {}, data({ email: 'bad' }), data({ id: outsider }), data({ id: null })]) {
    await denied(() => rpc(db, learner, 'mentor_save', bad), '22023');
  }
  for (const overrides of [
    { name: '' }, { name: ' '.repeat(5) }, { name: 'x'.repeat(81) }, { name: null }, { name: {} },
    { institution: 'x'.repeat(121) }, { institution: null }, { city: 'x'.repeat(101) }, { city: [] },
    { current_subjects: Array.from({ length: 13 }, (_, i) => `s${i}`) }, { current_subjects: ['x'.repeat(81)] },
    { current_subjects: null }, { current_subjects: ['a', 'A'] }, { current_subjects: ['\t\n'] },
    { topics: Array.from({ length: 21 }, (_, i) => `s${i}`) }, { topics: ['x'.repeat(81)] }, { topics: [null] },
    { topics: ['a', ' a '] }, { study_preference: null }, { study_preference: 'solo' }, { study_preference: [] },
    { course: '' }, { course: 'x'.repeat(81) }, { bio: 'x'.repeat(1001) }, { bio: [] },
    { semester: null }, { semester: '3' }, { semester: 1.5 }, { semester: 0 }, { semester: 21 }, { semester: {} },
    { availability: 'x'.repeat(161) }, { format: 'remote' }, { format: null }, { active: 'true' }, { active: null },
    { subjects: [] }, { subjects: [''] }, { subjects: ['x'.repeat(81)] }, { subjects: ['Math', ' math '] },
    { subjects: null }, { subjects: 'Cálculo' }, { subjects: [null] }, { subjects: [{}] },
    { subjects: Array.from({ length: 9 }, (_, i) => `s${i}`) },
    { learning_subjects: ['a', 'A'] }, { learning_subjects: [5] }, { learning_subjects: null },
    { learning_subjects: Array.from({ length: 9 }, (_, i) => `s${i}`) },
    { photo_url: photo(mentor) }, { photo_url: 'https://evil.invalid/avatar.jpg' },
    { photo_url: photo(learner).replace('drvqiiddgcgvmbbnwdky', 'other-project') },
    { photo_url: photo(learner).replace('/photos/', '/private/') },
    { photo_url: `${photo(learner)}?redirect=evil` }, { photo_url: photo(learner).replace('mentor-test.jpg', '../other.jpg') },
    { photo_url: photo(learner).replace('mentor-test.jpg', '%2e%2e%2fother.jpg') },
    { photo_url: photo(learner).replace('mentor-test.jpg', 'x/y.jpg') }, { photo_url: null },
  ]) await denied(() => rpc(db, learner, 'mentor_save', data(overrides)), '22023');
  await rpc(db, learner, 'mentor_save', data({ name: 'x'.repeat(80), course: 'x'.repeat(80), bio: 'x'.repeat(1000),
    institution: 'x'.repeat(120), city: 'x'.repeat(100), current_subjects: Array.from({ length: 12 }, (_, i) => `s${i}`),
    topics: Array.from({ length: 20 }, (_, i) => `${i}${'x'.repeat(78)}`), study_preference: 'grupo',
    semester: 20, availability: 'x'.repeat(160), photo_url: photo(learner), subjects: Array.from({ length: 8 }, (_, i) => `${i}${'x'.repeat(79)}`) }));
  await rpc(db, learner, 'mentor_save', data({ active: false, subjects: [] }));
  for (const f of ['online', 'presencial', 'hibrido']) await rpc(db, other, 'mentor_save', data({ format: f, semester: 1 }));
  for (const study_preference of ['individual', 'grupo', 'ambos']) await rpc(db, other, 'mentor_save', data({ study_preference }));
  for (const s of [null, 'x'.repeat(81)]) await denied(() => rpc(db, learner, 'mentor_discover', s), '22023');
  for (const target of [null, learner]) await denied(() => rpc(db, learner, 'mentor_request', target, 'Cálculo'), '22023');
  for (const s of [null, '', '   ', 'x'.repeat(81), 'Matéria não ensinada']) await denied(() => rpc(db, learner, 'mentor_request', mentor, s), '22023');
  await denied(() => rpc(db, learner, 'mentor_request', randomUUID(), 'Cálculo'));
  await denied(() => rpc(db, mentor, 'mentor_respond', first.id, null), '22023');
  for (const target of [null, randomUUID()]) {
    await denied(() => rpc(db, mentor, 'mentor_respond', target, true));
    await denied(() => rpc(db, learner, 'mentor_messages', target));
    await denied(() => rpc(db, learner, 'mentor_send', target, 'test', randomUUID()));
  }
  for (const b of [null, '', '  ', '\t\n\r', 'x'.repeat(2001)]) await denied(() => rpc(db, learner, 'mentor_send', first.id, b, randomUUID()), '22023');
  await denied(() => rpc(db, learner, 'mentor_send', first.id, 'body', null), '22023');
  await rpc(db, learner, 'mentor_send', first.id, 'x'.repeat(2000), randomUUID());
  for (const target of [null, learner]) await denied(() => rpc(db, learner, 'mentor_block', target, ''), '22023');
  for (const reason of [null, 'x'.repeat(1001)]) await denied(() => rpc(db, learner, 'mentor_block', mentor, reason), '22023');
  await denied(() => rpc(db, learner, 'mentor_block', blank, ''));
  await denied(() => rpc(db, blank, 'mentor_block', mentor, ''));
  await denied(() => rpc(db, learner, 'mentor_block', randomUUID(), ''));
  pass('strict payload/types/length/cardinality/subject/semester and owned project photo validation, boundary inputs accepted');

  const blockLegacyBefore = await fingerprint(db, false);
  for (const [target, reverse, legacy] of [[legacyBlocker, false, true], [other, true, true], [newBlocker, false, false], [outsider, true, false]]) {
    const r = await rpc(db, learner, 'mentor_request', target, 'Cálculo');
    await rpc(db, target, 'mentor_respond', r.id, true);
    await rpc(db, learner, 'mentor_send', r.id, 'Private before block', randomUUID());
    await db.query('SAVEPOINT block_case');
    const blocker = reverse ? target : learner; const blocked = reverse ? learner : target;
    if (legacy) await db.query('INSERT INTO public.blocks(blocker_id,blocked_id) VALUES($1,$2)', [blocker, blocked]);
    else {
      eq(await rpc(db, blocker, 'mentor_block', blocked, 'PRIVATE_REASON'), true);
      eq(await rpc(db, blocker, 'mentor_block', blocked, 'retry'), true);
    }
    for (const [a, b] of [[learner, target], [target, learner]]) {
      eq(await contact(db, a, b), false, 'shared contact helper honors both block directions');
      check(!(await rpc(db, a, 'mentor_discover', '')).some(p => p.id === b));
      eq(await rpc(db, a, 'mentor_profile', b), null);
      check(!(await rpc(db, a, 'mentor_requests')).some(p => p.id === r.id));
      await denied(() => rpc(db, a, 'mentor_messages', r.id));
      await denied(() => rpc(db, a, 'mentor_send', r.id, 'blocked', randomUUID()));
    }
    await denied(() => rpc(db, learner, 'mentor_request', target, 'Cálculo'));
    await denied(() => rpc(db, target, 'mentor_respond', r.id, true));
    check(!JSON.stringify(await rpc(db, learner, 'mentor_requests')).includes('PRIVATE_REASON'));
    await db.query('ROLLBACK TO SAVEPOINT block_case'); await db.query('RELEASE SAVEPOINT block_case');
  }
  eq(await fingerprint(db, false), blockLegacyBefore, 'isolated block RPC never changes old blocks or other legacy data');
  for (const state of ['banned', 'deleted', 'minor', 'unknown', 'infinite']) {
    await db.query('SAVEPOINT account_state');
    if (state === 'banned') await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [mentor]);
    else if (state === 'deleted') await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1', [mentor]);
    else await db.query('UPDATE public.profiles SET birth_date=$2::date WHERE id=$1', [mentor, state === 'minor' ? '2015-01-01' : state === 'infinite' ? '-infinity' : null]);
    eq(await contact(db, learner, mentor), false, 'shared contact helper rejects ineligible peers');
    check(!(await rpc(db, learner, 'mentor_discover', '')).some(p => p.id === mentor));
    eq(await rpc(db, learner, 'mentor_profile', mentor), null);
    check(!(await rpc(db, learner, 'mentor_requests')).some(r => r.mentor_id === mentor));
    await denied(() => rpc(db, learner, 'mentor_request', mentor, 'Cálculo'));
    await denied(() => rpc(db, learner, 'mentor_messages', first.id));
    await denied(() => rpc(db, learner, 'mentor_send', first.id, 'bad peer', randomUUID()));
    await db.query('ROLLBACK TO SAVEPOINT account_state'); await db.query('RELEASE SAVEPOINT account_state');
  }
  await db.query('SAVEPOINT expired_ban');
  await db.query("UPDATE auth.users SET banned_until=now()-interval '1 minute' WHERE id=$1", [mentor]);
  check((await rpc(db, learner, 'mentor_profile', mentor)).id === mentor);
  await db.query('ROLLBACK TO SAVEPOINT expired_ban'); await db.query('RELEASE SAVEPOINT expired_ban');
  await permissions(db);
  pass('legacy and isolated blocks in BOTH directions revoke all card/request/chat access; ineligible peers hidden; private reasons never projected');
}

// Cross-session lock contention proves request/respond/send/block serialize on BOTH accounts.
// Fixtures remain uncommitted: a separate session holds only an advisory lock, never fixture data.
async function concurrency(db) {
  const blocker = client();
  await blocker.connect();
  const blockerPid = (await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const workerPid = (await db.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  try {
    for (const account of [learner, mentor]) {
      for (const action of ['save', 'request', 'respond', 'send', 'block']) {
        await db.query('SAVEPOINT contention_fixture');
        // Prior suite is rolled back before this function so no earlier xact lock is held.
        let request;
        if (['respond', 'send'].includes(action)) {
          request = (await db.query(`INSERT INTO public.mentor_requests(learner_id,mentor_id,subject,status)
            VALUES($1,$2,$3,$4) RETURNING id`, [learner, mentor, `Lock-${action}-${account}`, action === 'send' ? 'accepted' : 'pending'])).rows[0].id;
        }
        await blocker.query('BEGIN');
        await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended('spark:mentor:'||$1,0))", [account]);
        let settled = false;
        const operation = action === 'save' ? () => rpc(db, account, 'mentor_save', data())
          : action === 'request' ? () => rpc(db, learner, 'mentor_request', mentor, 'Cálculo')
          : action === 'respond' ? () => rpc(db, mentor, 'mentor_respond', request, true)
          : action === 'send' ? () => rpc(db, learner, 'mentor_send', request, 'Concurrent retry', randomUUID())
          : () => rpc(db, learner, 'mentor_block', mentor, 'lock test');
        const pending = operation().then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
        let waits = false;
        for (let i = 0; i < 40 && !settled; i++) {
          await new Promise(resolve => setTimeout(resolve, 25));
          waits = (await blocker.query('SELECT $2::integer = ANY(pg_blocking_pids($1::integer)) AS waits', [workerPid, blockerPid])).rows[0].waits;
          if (waits) break;
        }
        await blocker.query('ROLLBACK');
        const result = await pending;
        if (result.error) throw result.error;
        check(waits, `${action} serializes on ${account === learner ? 'learner' : 'mentor'} account across database sessions`);
        await db.query('ROLLBACK TO SAVEPOINT contention_fixture'); await db.query('RELEASE SAVEPOINT contention_fixture');
      }
    }
    pass('10 real cross-session contention checks: save/request/respond/send/block account locks; all lock-only sessions rolled back');
  } finally { await blocker.query('ROLLBACK').catch(() => {}); await blocker.end(); }
}
async function validate(db, runMigration = true) {
  const before = await fingerprint(db);
  try {
    await db.query(runMigration ? transactionalMigration : 'BEGIN');
    await fixtures(db);
    await db.query('SAVEPOINT sequential_suite');
    await suite(db);
    await db.query('ROLLBACK TO SAVEPOINT sequential_suite'); await db.query('RELEASE SAVEPOINT sequential_suite');
    // Insert mentorship fixtures directly, without retaining RPC transaction locks from setup.
    for (const id of [learner, mentor]) await db.query(`INSERT INTO public.mentor_profiles(id,name,course,semester,subjects,format,active)
      VALUES($1,'Concurrency fixture','Computação',1,ARRAY['Cálculo'],'online',true)`, [id]);
    await concurrency(db);
    const duplicates = (await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('mentor_requests_open_unique','mentor_messages_sender_id_client_id_key')`)).rows;
    eq(duplicates.length, 2); check(duplicates.every(i => i.indexdef.includes('UNIQUE')));
  } finally { await db.query('ROLLBACK'); }
  eq(await fingerprint(db), before, 'all original rows/policies/triggers preserved; every fixture rolled back');
  pass(`${runMigration ? 'migration + ' : ''}suite rolled back; original application/auth fingerprints unchanged`);
}
async function main() {
  const db = client();
  try {
    await db.connect();
    await validate(db);
    if (process.argv.includes('--apply')) {
      const before = await fingerprint(db, false);
      await db.query(migration);
      eq(await fingerprint(db, false), before, 'additive deployment preserves all legacy rows, RLS and triggers');
      pass('additive mentorship migration deployed; no fixtures or legacy writes committed');
      await validate(db, false);
    }
    console.log(`SUCCESS ${assertions} assertions; ${process.argv.includes('--apply') ? 'deployed and retested' : 'validation only; migration and fixtures rolled back'}`);
  } finally { await db.query('ROLLBACK').catch(() => {}); await db.end(); }
}
main().catch(error => {
  // Do not dump SQL parameters, row data, connection strings, or credentials.
  console.error(`FAIL ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
});
