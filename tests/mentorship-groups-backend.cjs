'use strict';
// Opt-in integration against deployed prerequisites. EVERY migration and fixture rolls back.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { validate, snapshot, authSnapshot } = require('../tools/deploy-groups.cjs');
const { client } = require('./backend-db');
let stage = 'connecting', assertions = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); assertions++; };
const ok = (value, message) => { assert.ok(value, message); assertions++; };
async function as(db, id, sql, args = [], role = 'authenticated') {
  assert.ok(['authenticated', 'anon'].includes(role));
  await db.query('SAVEPOINT groups_action');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [id || '', JSON.stringify({ sub: id, role })]);
    const result = await db.query(sql, args);
    await db.query('RESET ROLE'); await db.query('RELEASE SAVEPOINT groups_action'); return result;
  } catch (e) { await db.query('ROLLBACK TO SAVEPOINT groups_action'); await db.query('RELEASE SAVEPOINT groups_action'); throw e; }
}
async function denied(fn, code = '42501') { await assert.rejects(fn, e => e.code === code); assertions++; }
async function isolated(db, fn) {
  await db.query('SAVEPOINT groups_isolated');
  try { await fn(); } finally { await db.query('ROLLBACK TO SAVEPOINT groups_isolated'); await db.query('RELEASE SAVEPOINT groups_isolated'); }
}
async function run() {
  const db = client(); let begun = false;
  const ids = Array.from({ length: 9 }, () => randomUUID()).sort();
  const [owner, learner, peer, outsider, minor, restricted, blank, banned, deleted] = ids;
  const rpc = async (id, call, args = [], role) => (await as(db, id, `SELECT public.${call} value`, args, role)).rows[0].value;
  const create = (extra = {}) => rpc(owner, 'mentor_group_create($1::jsonb)', [JSON.stringify({ name: 'Hub rollback fixture', subject: 'Cálculo', topic: 'Derivadas', objective: 'Estudar', ...extra })]);
  const update = (g, extra, actor = owner) => rpc(actor, 'mentor_group_update($1::uuid,$2::jsonb)', [g, JSON.stringify(extra)]);
  const detail = (id, g) => rpc(id, 'mentor_group_detail($1::uuid)', [g]);
  const join = (id, g) => rpc(id, 'mentor_group_join($1::uuid)', [g]);
  const joinCode = (id, code) => rpc(id, 'mentor_group_join_code($1)', [code]);
  const code = (g, action = 'get', id = owner) => rpc(id, 'mentor_group_code($1::uuid,$2)', [g, action]);
  const remove = (g, id, actor = owner) => rpc(actor, 'mentor_group_remove($1::uuid,$2::uuid)', [g, id]);
  const leave = (id, g) => rpc(id, 'mentor_group_leave($1::uuid)', [g]);
  const future = () => new Date(Date.now() + 86400000).toISOString();
  await db.connect();
  try {
    const before = await snapshot(db), auth = await authSnapshot(db);
    const originalFunctions = (await db.query("SELECT oid,proname,md5(prosrc) hash FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'mentor%'")).rows;
    await db.query('BEGIN'); begun = true;
    stage = 'migration and replay';
    await db.query(validate());
    eq((await snapshot(db, before.relations)).hashes, before.hashes, 'Original rows and columns preserved');
    const once = await snapshot(db);
    await db.query(validate());
    eq((await snapshot(db, once.relations)).hashes, once.hashes, 'Idempotent migration');
    eq(await authSnapshot(db), auth, 'Product restrictions/auth helpers retained exactly');
    const modified = new Set(['mentor_ac__group_visible', 'mentor_ac__group', 'mentor_group_create', 'mentor_group_detail', 'mentor_group_join', 'mentor_group_leave', 'mentor_group_cancel', 'mentor_group_suggestions', 'mentor_group_invite']);
    for (const f of originalFunctions.filter(f => !modified.has(f.proname))) eq((await db.query('SELECT md5(prosrc) hash FROM pg_proc WHERE oid=$1', [f.oid])).rows[0].hash, f.hash, `${f.proname} unaffected`);
    stage = 'fixtures';
    await db.query(`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
      SELECT id,'authenticated','authenticated','groups-'||id||'@example.invalid',jsonb_build_object('name','Group rollback fixture','birth_date',CASE WHEN id=$2::uuid THEN '2015-01-01' ELSE '1995-01-01' END),now(),now() FROM unnest($1::uuid[]) id`, [ids, minor]);
    await db.query(`INSERT INTO public.mentor_profiles(id,name,course,semester,bio,subjects,learning_subjects,availability,format,photo_url,active,institution,city,current_subjects,topics,study_preference)
      SELECT id,'Group rollback fixture','Computação',3,'',ARRAY['Cálculo'],ARRAY['Cálculo'],'','online','',true,'FACENS','Sorocaba',ARRAY['Cálculo'],ARRAY['Derivadas'],'ambos' FROM unnest($1::uuid[]) id WHERE id<>$2::uuid`, [ids, blank]);
    await db.query('INSERT INTO public.mentor_restrictions(user_id,restricted) VALUES($1,true)', [restricted]);
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [banned]);
    await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1', [deleted]);
    stage = 'privacy and defaults';
    let g = await create({ location: 'https://private.example.invalid/secret' });
    eq(g.capacity, 12); eq(g.visibility, 'private'); eq(g.member_count, 1); eq(g.enrollment_open, true); eq(g.location, undefined);
    ok(!(await rpc(outsider, 'mentor_groups()')).some(x => x.id === g.id));
    await denied(() => detail(outsider, g.id)); await denied(() => join(outsider, g.id));
    eq((await detail(owner, g.id)).location, 'https://private.example.invalid/secret');
    for (const who of [learner, outsider]) { await denied(() => code(g.id, 'get', who)); await denied(() => update(g.id, { capacity: 100 }, who)); await denied(() => remove(g.id, owner, who)); }
    eq(await code(g.id), { code: null, enabled: false });
    const initial = await code(g.id, 'rotate'); ok(/^[A-F0-9]{32}$/.test(initial.code)); eq(initial.enabled, true);
    eq((await joinCode(learner, initial.code.toLowerCase().match(/.{1,4}/g).join(' - '))).member_count, 2);
    eq((await joinCode(learner, initial.code)).member_count, 2, 'Idempotent join');
    const member = await detail(learner, g.id); eq(member.members.length, 2); eq(member.code, undefined);
    await denied(() => code(g.id, 'get', learner));
    stage = 'validation and state';
    for (const changes of [{ capacity: 1 }, { capacity: 101 }, { capacity: 2.5 }, { capacity: '12' }, { name: '' }, { visibility: 'other' }, { enrollment_open: 'true' }, { format: 'other' }, { location: 'x'.repeat(201) }, { subject: 'x'.repeat(257) }, { unknown: 1 }, { starts_at: 'infinity' }, { starts_at: '2000-01-01' }]) await denied(() => update(g.id, changes), '22023');
    for (const invalid of [null, '', 'x', 'a'.repeat(121), '<script>', 'Z'.repeat(32)]) await denied(() => joinCode(outsider, invalid), '22023');
    await denied(() => joinCode(outsider, 'F'.repeat(32)));
    await update(g.id, { capacity: 2, enrollment_open: false });
    eq((await join(learner, g.id)).member_count, 2);
    await denied(() => joinCode(peer, initial.code), '22023');
    await update(g.id, { enrollment_open: true }); await denied(() => joinCode(peer, initial.code), '22023');
    await update(g.id, { capacity: 100, name: 'Renamed', subject: 'x'.repeat(256), objective: 'Updated', visibility: 'public', format: 'online' });
    const listing = (await rpc(outsider, 'mentor_groups()')).find(x => x.id === g.id);
    eq(listing.name, 'Renamed'); eq(listing.capacity, 100); eq(listing.location, undefined); eq(listing.code, undefined);
    const publicDetail = await detail(outsider, g.id); eq(publicDetail.location, undefined); eq(publicDetail.members, []); eq(publicDetail.messages, []);
    await update(g.id, { subject: 'Cálculo', visibility: 'private' });
    stage = 'targeted invites and code revocation';
    eq(await rpc(owner, 'mentor_group_invite($1::uuid,$2::uuid)', [g.id, peer]), true);
    ok((await rpc(peer, 'mentor_notifications()')).some(n => n.group_id === g.id && n.type === 'invitation'));
    eq((await detail(peer, g.id)).members, []); eq((await detail(peer, g.id)).location, undefined);
    await join(peer, g.id); await leave(peer, g.id); await denied(() => detail(peer, g.id));
    await denied(() => join(peer, g.id), '42501');
    const renewed = await code(g.id, 'rotate'); ok(renewed.code !== initial.code);
    await denied(() => joinCode(peer, initial.code));
    eq(await code(g.id, 'disable'), { code: null, enabled: false }); await denied(() => joinCode(peer, renewed.code));
    const active = await code(g.id, 'rotate');
    stage = 'eligibility, blocking and permission matrix';
    for (const who of [null, randomUUID(), minor, restricted, blank, banned, deleted]) {
      await denied(() => joinCode(who, active.code)); await denied(() => join(who, g.id)); await denied(() => detail(who, g.id));
      await denied(() => rpc(who, 'mentor_group_create($1::jsonb)', [JSON.stringify({ name: 'No', subject: 'No' })]));
      await denied(() => code(g.id, 'rotate', who));
    }
    for (const table of ['mentor_group_codes', 'mentor_group_removals']) for (const role of ['anon', 'authenticated']) for (const sql of [`SELECT * FROM public.${table}`, `INSERT INTO public.${table} DEFAULT VALUES`, `UPDATE public.${table} SET group_id=NULL`, `DELETE FROM public.${table}`]) await denied(() => as(db, owner, sql, [], role));
    const newFunctions = (await db.query(`SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'mentor_groups__%' OR p.proname IN('mentor_group_code','mentor_group_join_code','mentor_group_update','mentor_group_remove'))`)).rows;
    for (const f of newFunctions) { eq(f.prosecdef, true); ok(f.proconfig.includes('search_path=""')); eq(f.anon_exec, false); eq(f.auth_exec, !f.proname.startsWith('mentor_groups__')); }
    for (const table of ['blocks', 'mentor_blocks']) for (const reverse of [true, false]) await isolated(db, async () => {
      await db.query(`INSERT INTO public.${table}(blocker_id,blocked_id) VALUES($1,$2)`, reverse ? [peer, learner] : [learner, peer]);
      await denied(() => joinCode(peer, active.code)); await denied(() => join(peer, g.id));
    });
    await isolated(db, async () => { await db.query('INSERT INTO public.mentor_restrictions(user_id,restricted) VALUES($1,true)', [owner]); await denied(() => joinCode(peer, active.code)); });
    stage = 'meetings, member removal and archive';
    const meeting = await rpc(owner, 'mentor_session_save($1::jsonb)', [JSON.stringify({ group_id: g.id, title: 'Future study', subject: 'Cálculo', topic: '', starts_at: future(), duration_minutes: 60, format: 'online', location: 'https://secret.example.invalid' })]);
    await joinCode(peer, active.code);
    eq((await rpc(peer, 'mentor_sessions()')).find(x => x.id === meeting.id).my_response, 'pending');
    eq(await remove(g.id, peer), true); eq(await remove(g.id, peer), true);
    await denied(() => joinCode(peer, active.code)); await denied(() => join(peer, g.id)); await denied(() => detail(peer, g.id));
    await denied(() => rpc(peer, 'mentor_group_send($1::uuid,$2,$3::uuid)', [g.id, 'No bypass', randomUUID()]));
    await denied(() => rpc(peer, 'mentor_files(NULL,$1::uuid)', [g.id]));
    await denied(() => rpc(owner, 'mentor_group_invite($1::uuid,$2::uuid)', [g.id, peer]));
    ok(!(await rpc(peer, 'mentor_sessions()')).some(x => x.id === meeting.id));
    const afterRemoval = await code(g.id, 'rotate'); await denied(() => joinCode(peer, afterRemoval.code));
    await denied(() => remove(g.id, owner), '22023'); await denied(() => update(g.id, { capacity: 1 }), '22023');
    await denied(() => leave(owner, g.id), '22023');
    await isolated(db, async () => { await db.query('INSERT INTO public.mentor_blocks(blocker_id,blocked_id) VALUES($1,$2)', [owner, learner]); eq(await leave(learner, g.id), true, 'Blocked member can safely leave'); });
    eq(await rpc(owner, 'mentor_group_cancel($1::uuid)', [g.id]), true);
    eq(await code(g.id), { code: null, enabled: false });
    await denied(() => joinCode(outsider, afterRemoval.code)); await denied(() => update(g.id, { name: 'No' }), '22023');
    eq((await rpc(learner, 'mentor_sessions()')).find(x => x.id === meeting.id).status, 'cancelled');
    stage = 'rollback preservation';
    await db.query('ROLLBACK'); begun = false;
    eq((await snapshot(db, before.relations)).hashes, before.hashes, 'Rollback restores every original column/row');
    eq(await authSnapshot(db), auth);
    console.log(`PASS groups backend: ${assertions} assertions; migration/replay, privacy, membership, revocation, restrictions, agenda, preservation. All changes rolled back.`);
  } finally { if (begun) await db.query('ROLLBACK'); await db.end(); }
}
if (!process.argv.includes('--run')) console.log('Offline by default. Opt in: node tests\\mentorship-groups-backend.cjs --run (rollback-only).');
else run().catch(error => { console.error(`FAIL groups backend at ${stage}; SQLSTATE ${error.code || 'assertion'}; details suppressed.`); process.exitCode = 1; });
