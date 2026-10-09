'use strict';
// Opt-in real database validation: every schema change and fixture ALWAYS rolls back.
// Never invokes setup-supabase.js and never commits or alters real accounts.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { migrationSql, applyProduct } = require('../tools/deploy-product.cjs');
let assertions = 0;
let stage = 'connecting';
let addedColumns = {};
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions++; }
async function as(db, id, sql, args = [], role = 'authenticated') {
  assert.ok(['anon', 'authenticated'].includes(role));
  await db.query('SAVEPOINT product_action');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [id || '', JSON.stringify({ sub: id, role, app_metadata: { moderator: true, role: 'moderator' } })]);
    const result = await db.query(sql, args);
    await db.query('RESET ROLE'); await db.query('RELEASE SAVEPOINT product_action'); return result;
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT product_action'); await db.query('RELEASE SAVEPOINT product_action'); throw error;
  }
}
async function denied(action, code = '22023') { await assert.rejects(action, e => e.code === code); assertions++; }
async function isolated(db, action) {
  await db.query('SAVEPOINT product_isolated');
  try { return await action(); }
  finally { await db.query('ROLLBACK TO SAVEPOINT product_isolated'); await db.query('RELEASE SAVEPOINT product_isolated'); }
}
async function snapshot(db, tables) {
  const result = {};
  for (const [schema, table] of tables) {
    const omit = schema === 'public' ? addedColumns[table] || [] : [];
    const q = x => '"' + x.replaceAll('"', '""') + '"';
    result[`${schema}.${table}`] = (await db.query(`SELECT count(*)::integer n,md5(coalesce(string_agg(j::text,'' ORDER BY j::text),'')) hash FROM (SELECT to_jsonb(t)-$1::text[] j FROM ${q(schema)}.${q(table)} t) x`, [omit])).rows[0];
  }
  return result;
}
async function schemaSnapshot(db) {
  return (await db.query(`SELECT p.oid id,p.oid::regprocedure::text signature,p.proacl::text,p.proconfig,md5(p.prosrc) source
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'mentor%' ORDER BY 1`)).rows;
}
async function relationSnapshot(db) {
  return (await db.query(`SELECT c.oid,c.relname,c.relkind,c.relacl::text,c.relrowsecurity,c.reloptions,
    (SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
    (SELECT jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints
    FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'mentor_private'::regnamespace)
    AND c.relname LIKE 'mentor%' ORDER BY c.oid`)).rows;
}
const profile = (extra = {}) => ({ name: 'Product rollback fixture', course: 'Product rollback course', semester: 2,
  bio: '', subjects: ['Product rollback mathematics'], learning_subjects: ['Product rollback science'], availability: 'Legacy free text',
  format: 'online', photo_url: '', active: true, institution: 'FACENS', city: 'Sorocaba', current_subjects: [], topics: [], study_preference: 'ambos', ...extra });
async function run() {
  const { client } = require('./backend-db'); const db = client(); let begun = false; const ids = Array.from({ length: 118 }, () => randomUUID()).sort();
  const [actor, teacher, other, moderator, privatePeer, minor, deleted, rateUser] = ids;
  const later = ids.at(-1); const subject = profile().subjects[0];
  const rpc = async (id, sql, args = [], role) => (await as(db, id, `SELECT public.${sql} value`, args, role)).rows[0].value;
  const save = (id, p, course = null) => rpc(id, 'mentor_save_product($1::jsonb,$2::text)', [JSON.stringify(p), course]);
  const discover = (id, args = [subject, null, null, null, null, false]) => rpc(id, 'mentor_discover_product($1,$2,$3,$4,$5,$6)', args);
  const report = (id, target, reason = 'spam', details = 'Repeated unsolicited messages.') => rpc(id, 'mentor_report($1::uuid,$2,$3)', [target, reason, details]);
  const favorite = (id, target, saved = true) => rpc(id, 'mentor_favorite($1::uuid,$2)', [target, saved]);
  const request = (id, target, question = 'How do I solve this exercise?', objective = 'Understand the solution', proposed = null) => rpc(id, 'mentor_request_product($1::uuid,$2,$3,$4,$5::timestamptz)', [target, subject, question, objective, proposed]);
  const moderate = (reportId, status = 'reviewed', action = 'none', note = '') => rpc(moderator, 'mentor_moderate($1::uuid,$2,$3,$4)', [reportId, status, action, note]);
  await db.connect();
  try {
    stage = 'original fingerprints';
    const tables = (await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' OR (schemaname='auth' AND tablename='users') OR (schemaname='storage' AND tablename='objects') ORDER BY 1,2")).rows.map(r => [r.schemaname, r.tablename]);
    const existingColumns = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('mentor_profiles','mentor_requests')")).rows;
    addedColumns = Object.fromEntries(Object.entries({ mentor_profiles: ['methodology', 'experience', 'availability_slots'], mentor_requests: ['question', 'objective', 'proposed_at'] })
      .map(([table, columns]) => [table, columns.filter(column => !existingColumns.some(c => c.table_name === table && c.column_name === column))]));
    const before = await snapshot(db, tables); const schema = await schemaSnapshot(db); const relations = await relationSnapshot(db);
    const viewBefore = (await db.query("SELECT pg_get_viewdef('mentor_private.mentor_material_permissions'::regclass,true) src")).rows[0].src;
    await db.query('BEGIN'); begun = true;
    stage = 'migration and replay';
    await db.query(migrationSql());
    eq(await snapshot(db, tables), before, 'migration preserves original rows');
    await db.query(migrationSql());
    eq(await snapshot(db, tables), before, 'replay preserves original rows');
    const changedSchema = await schemaSnapshot(db);
    const changedNames = ['mentor__eligible', 'mentor__profile', 'mentor__request', 'mentor_actor', 'mentor_save', 'mentor_request', 'mentor_discover', 'mentor_profile', 'mentor_ac__session'];
    for (const previous of schema) {
      const next = changedSchema.find(x => x.id === previous.id);
      assert.ok(next, 'migration retains every existing helper OID'); assertions++;
      eq(next.proacl, previous.proacl, `${previous.signature} ACL preserved`);
      if (!changedNames.some(n => previous.signature.startsWith(`${n}(`))) eq(next.source, previous.source, `${previous.signature} unchanged`);
    }
    stage = 'fixtures';
    await db.query(`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
      SELECT id,'authenticated','authenticated','product-'||id||'@example.invalid',
      jsonb_build_object('name','Product rollback fixture','birth_date',CASE WHEN id=$2::uuid THEN '2015-01-01' ELSE '1995-01-01' END),now(),now()
      FROM unnest($1::uuid[]) id`, [ids, minor]);
    // Only a disposable fixture is deleted; no bans or real accounts are ever changed.
    await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1', [deleted]);
    await db.query(`INSERT INTO public.mentor_profiles(id,name,course,semester,bio,subjects,learning_subjects,availability,format,photo_url,active,institution,city)
      SELECT id,$2,$3,2,'',ARRAY[$4],ARRAY['Product rollback science'],'Legacy free text','online','',true,'FACENS','Sorocaba' FROM unnest($1::uuid[]) id`, [ids, profile().name, profile().course, subject]);
    await db.query("UPDATE public.mentor_profiles SET active=false,learning_subjects='{}' WHERE id=$1", [privatePeer]);
    await db.query("UPDATE public.mentor_profiles SET semester=19,format='hibrido',availability_slots=ARRAY['dom-noite'] WHERE id=$1", [later]);
    stage = 'RLS and least privileges';
    const productTables = ['mentor_favorites', 'mentor_reports', 'mentor_restrictions', 'mentor_moderators', 'mentor_moderation_audit'];
    for (const table of productTables) {
      eq((await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
      const timestamp = table === 'mentor_restrictions' ? 'updated_at' : 'created_at';
      for (const role of ['anon', 'authenticated']) for (const statement of [`SELECT * FROM public.${table}`, `INSERT INTO public.${table} DEFAULT VALUES`, `UPDATE public.${table} SET ${timestamp}=${timestamp}`, `DELETE FROM public.${table}`]) await denied(() => as(db, actor, statement, [], role), '42501');
    }
    const apiNames = ['mentor_save_product', 'mentor_discover_product', 'mentor_favorites', 'mentor_favorite', 'mentor_request_product', 'mentor_report', 'mentor_my_reports', 'mentor_moderation_access', 'mentor_moderation_queue', 'mentor_moderate'];
    const permissions = (await db.query(`SELECT proname,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon_exec,
      has_function_privilege('authenticated',oid,'EXECUTE') auth_exec,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE grantee=0 AND privilege_type='EXECUTE') public_exec
      FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname=ANY($1::text[]) OR proname LIKE 'mentor_product__%')`, [apiNames])).rows;
    eq(permissions.length, apiNames.length + 4);
    for (const p of permissions) { eq(p.prosecdef, true); eq(p.proconfig.includes('search_path=""'), true); eq(p.anon_exec, false); eq(p.public_exec, false); eq(p.auth_exec, apiNames.includes(p.proname)); }
    await denied(() => rpc(actor, 'mentor_favorites()', [], 'anon'), '42501');
    for (const id of [null, randomUUID(), minor, deleted]) { await denied(() => discover(id), '42501'); await denied(() => save(id, profile()), '42501'); await denied(() => favorite(id, teacher), '42501'); }
    eq(await rpc(actor, 'mentor_moderation_access()'), false, 'client moderator claim ignored');
    await denied(() => rpc(actor, 'mentor_moderation_queue()'), '42501');
    await denied(() => rpc(actor, 'mentor_moderate($1::uuid,$2)', [randomUUID(), 'reviewed']), '42501');
    await denied(() => as(db, actor, 'INSERT INTO public.mentor_moderators(user_id) VALUES($1)', [actor]), '42501');
    stage = 'profile product fields';
    let saved = await save(actor, profile({ methodology: ' Guided exercises ', experience: ' Peer tutor ', availability_slots: ['seg-manha', 'ter-noite'] }));
    eq(saved.methodology, 'Guided exercises'); eq(saved.experience, 'Peer tutor'); eq(saved.availability_slots, ['seg-manha', 'ter-noite']); eq(saved.availability, 'Legacy free text'); eq(saved.is_favorite, false);
    eq(await save(actor, saved), saved, 'serialized profile round trip');
    for (const extras of [{ methodology: 'x'.repeat(1001) }, { experience: null }, { experience: 2 }, { availability_slots: null }, { availability_slots: ['seg-noite', 'seg-noite'] }, { availability_slots: ['SEG-noite'] }, { availability_slots: ['seg-dawn'] }, { availability_slots: [null] }, { availability_slots: [1] }, { availability_slots: Array(22).fill('seg-manha') }, { id: teacher }, { unknown: 'bad' }]) await denied(() => save(actor, profile(extras)));
    const slots = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].flatMap(d => ['manha', 'tarde', 'noite'].map(t => `${d}-${t}`));
    eq((await save(actor, profile({ methodology: 'x'.repeat(1000), experience: 'x'.repeat(1000), availability_slots: slots }))).availability_slots.length, 21);
    saved = await save(actor, profile({ methodology: 'Persisted methodology', experience: 'Persisted experience', availability_slots: ['seg-manha'] }));
    const old = await rpc(actor, 'mentor_save($1::jsonb)', [JSON.stringify(profile({ methodology: 'Ignored new field', experience: '', availability_slots: [] }))]);
    eq(old.methodology, saved.methodology); eq(old.experience, saved.experience); eq(old.availability_slots, saved.availability_slots);
    eq((await rpc(actor, 'mentor_save_catalog($1::jsonb,NULL)', [JSON.stringify(saved)])).methodology, saved.methodology);
    const official = (await db.query('SELECT c.id,c.name,s.subject_name FROM public.mentor_catalog_courses c JOIN public.mentor_catalog_course_subjects s ON s.course_id=c.id WHERE c.active AND s.active ORDER BY c.id,s.subject_name LIMIT 1')).rows[0];
    assert.ok(official); assertions++;
    eq((await save(other, profile({ course: official.name, current_subjects: [official.subject_name], catalog_course_id: official.id }), official.id)).catalog_course_id, official.id);
    eq((await discover(actor, ['', official.id, null, null, null, false])).map(p => p.id), [other]);
    stage = 'server filters before limit';
    const originalPage = await rpc(actor, 'mentor_discover($1)', [subject]);
    eq(originalPage.length, 100); eq(originalPage.some(p => p.id === later), false, 'fixture is beyond old page');
    eq((await discover(actor, [subject, null, 19, 'online', 'dom-noite', false])).map(p => p.id), [later]);
    eq((await discover(actor, [subject, null, 19, 'presencial', 'dom-noite', false])).map(p => p.id), [later]);
    eq(await discover(actor, [subject, null, 19, 'online', 'dom-manha', false]), []);
    for (const args of [[null, null, null, null, null, false], ['', null, 0, null, null, false], ['', null, null, 'bad', null, false], ['', null, null, null, 'bad', false], ['', null, null, null, null, null]]) await denied(() => discover(actor, args));
    stage = 'mutually compatible learner discovery';
    await isolated(db, async () => {
      const learning = 'Product rollback science';
      await db.query('UPDATE public.mentor_profiles SET subjects=\'{}\',learning_subjects=ARRAY[$2] WHERE id=$1', [privatePeer, learning]);
      eq((await discover(actor, [learning, null, null, null, null, false])).some(p => p.id === privatePeer), true);
      eq((await rpc(actor, 'mentor_discover($1)', [learning])).some(p => p.id === privatePeer), true);
      eq((await rpc(actor, 'mentor_profile($1)', [privatePeer])).id, privatePeer);
      eq(await favorite(actor, privatePeer), true);
      await db.query("UPDATE public.mentor_profiles SET study_preference='grupo' WHERE id=$1", [privatePeer]);
      eq((await discover(actor, [learning, null, null, null, null, false])).some(p => p.id === privatePeer), false);
      await denied(() => rpc(actor, 'mentor_request($1,$2)', [privatePeer, learning]));
      await db.query("UPDATE public.mentor_profiles SET study_preference='ambos',format='presencial' WHERE id=$1", [privatePeer]);
      eq((await discover(actor, [learning, null, null, null, null, false])).some(p => p.id === privatePeer), false);
      await db.query("UPDATE public.mentor_profiles SET format='hibrido' WHERE id=$1", [privatePeer]);
      const match = await rpc(actor, 'mentor_request_product($1,$2,$3,$4)', [privatePeer, learning, 'Study this shared subject together', 'Practice together']);
      eq(match.mentor_id, privatePeer); eq(match.subject, learning);
      await db.query("UPDATE public.mentor_profiles SET learning_subjects='{}' WHERE id=$1", [actor]);
      eq((await rpc(actor, 'mentor_favorites()')).some(p => p.id === privatePeer), false, 'inactive unaccepted learner remains private after compatibility ends');
      await rpc(privatePeer, 'mentor_respond($1,true)', [match.id]);
      eq((await rpc(actor, 'mentor_favorites()')).some(p => p.id === privatePeer), true, 'accepted learner remains a permitted peer');
    });
    stage = 'favorites privacy and availability';
    eq(await favorite(actor, teacher), true); eq(await favorite(actor, teacher), true);
    eq((await rpc(actor, 'mentor_favorites()')).map(p => p.id), [teacher]);
    eq((await rpc(actor, 'mentor_favorites()'))[0].is_favorite, true);
    eq(await rpc(other, 'mentor_favorites()'), []); eq((await rpc(other, 'mentor_profile($1)', [teacher])).is_favorite, false);
    eq((await discover(actor, ['', null, null, null, null, true])).map(p => p.id), [teacher]);
    await denied(() => favorite(actor, actor)); await denied(() => favorite(actor, privatePeer), '42501'); await denied(() => favorite(actor, randomUUID()), '42501');
    for (const target of [minor, deleted]) await denied(() => favorite(actor, target), '42501');
    await isolated(db, async () => {
      await db.query('UPDATE public.mentor_profiles SET learning_subjects=ARRAY[\'Unrelated\'],current_subjects=\'{}\' WHERE id=$1', [actor]);
      eq((await rpc(actor, 'mentor_favorites()')).map(p => p.id), [teacher], 'no matching subject required');
      await db.query('UPDATE public.mentor_profiles SET active=false WHERE id=$1', [teacher]);
      eq(await rpc(actor, 'mentor_favorites()'), [], 'inactive unconnected peer hidden without deleting relationship');
      await db.query('UPDATE public.mentor_profiles SET active=true WHERE id=$1', [teacher]);
      eq((await rpc(actor, 'mentor_favorites()')).length, 1);
    });
    for (const table of ['mentor_blocks', 'blocks']) for (const reverse of [false, true]) await isolated(db, async () => {
      await db.query(`INSERT INTO public.${table}(blocker_id,blocked_id) VALUES($1,$2)`, reverse ? [teacher, actor] : [actor, teacher]);
      eq(await rpc(actor, 'mentor_favorites()'), []); eq((await discover(actor)).some(p => p.id === teacher), false);
      await denied(() => favorite(actor, teacher), '42501');
      const reported = await report(actor, teacher); eq(typeof reported, 'string', 'blocked known peer remains reportable');
    });
    eq(await favorite(actor, teacher, false), false); eq(await favorite(actor, teacher, false), false); eq(await rpc(actor, 'mentor_favorites()'), []); await favorite(actor, teacher);
    stage = 'guided request idempotency';
    const proposed = new Date(Date.now() + 3600000).toISOString();
    let r = await request(actor, teacher, '  How do I solve this exercise?  ', '  Understand the solution  ', proposed);
    eq(r.question, 'How do I solve this exercise?'); eq(r.objective, 'Understand the solution'); eq(new Date(r.proposed_at).toISOString(), proposed);
    const retry = await request(actor, teacher, 'Do not overwrite the original question', 'A different objective', null);
    eq(retry, r, 'duplicate request preserves original details');
    eq(await rpc(actor, 'mentor_request($1::uuid,$2)', [teacher, subject]), r, 'legacy duplicate retains details');
    eq((await rpc(actor, 'mentor_requests()')).find(x => x.id === r.id).question, r.question);
    for (const args of [[null, 'valid objective', null], ['too short', 'valid objective', null], ['x'.repeat(1001), 'valid objective', null], ['valid question', 'tiny', null], ['valid question', 'x'.repeat(501), null], ['valid question', 'valid objective', '2000-01-01'], ['valid question', 'valid objective', 'infinity'], ['valid question', 'valid objective', new Date(Date.now() + 370 * 86400000).toISOString()]]) await denied(() => request(actor, teacher, ...args));
    await denied(() => request(actor, actor)); await denied(() => request(actor, privatePeer));
    const legacy = await rpc(other, 'mentor_request($1::uuid,$2)', [teacher, subject]);
    eq(legacy.question, ''); eq(legacy.objective, ''); eq(legacy.proposed_at, null);
    eq(await request(other, teacher), legacy, 'guided duplicate must not silently enrich a legacy request');
    await denied(() => rpc(other, 'mentor_respond($1,true)', [r.id]), '42501');
    r = await rpc(teacher, 'mentor_respond($1,true)', [r.id]);
    await isolated(db, async () => {
      await db.query('UPDATE public.mentor_profiles SET active=false WHERE id=$1', [teacher]);
      eq((await rpc(actor, 'mentor_favorites()')).map(p => p.id), [teacher], 'accepted inactive peer stays visible');
    });
    stage = 'optional institution and city for first onboarding';
    await isolated(db, async () => {
      await db.query('DELETE FROM public.mentor_profiles WHERE id=$1', [privatePeer]);
      const firstProfile = profile({ course: official.name, subjects: [official.subject_name], learning_subjects: [], institution: '', city: '' });
      const first = await save(privatePeer, firstProfile, official.id);
      eq(first.institution, ''); eq(first.city, '');
      await db.query('DELETE FROM public.mentor_profiles WHERE id=$1', [privatePeer]);
      const onboarding = await save(privatePeer, { ...firstProfile, institution: 'FACENS' }, official.id);
      eq(onboarding.institution, 'FACENS'); eq(onboarding.city, '');
      await db.query('DELETE FROM public.mentor_profiles WHERE id=$1', [privatePeer]);
      const legacyOnboarding = await rpc(privatePeer, 'mentor_save($1::jsonb)', [JSON.stringify(profile({ institution: '', city: '' }))]);
      eq(legacyOnboarding.institution, ''); eq(legacyOnboarding.city, '');
    });
    stage = 'calendar session revision timestamps';
    await isolated(db, async () => {
      const session = await rpc(actor, 'mentor_session_save($1::jsonb)', [JSON.stringify({ request_id: r.id, subject, title: 'Rollback calendar', topic: '', starts_at: proposed, duration_minutes: 30, location: '', format: 'online' })]);
      const saved = (await db.query('SELECT to_jsonb(s) value FROM public.mentor_study_sessions s WHERE id=$1', [session.id])).rows[0].value;
      eq(session.created_at, saved.created_at); eq(session.updated_at, saved.updated_at);
      eq((await rpc(actor, 'mentor_sessions()')).find(s => s.id === session.id), session, 'stable calendar timestamp fields in existing list RPC');
      eq((await rpc(other, 'mentor_sessions()')).some(s => s.id === session.id), false, 'session timestamp addition does not expose private sessions');
      const responded = await rpc(teacher, 'mentor_session_respond($1,$2)', [session.id, true]);
      eq(responded.created_at, session.created_at);
      eq(new Date(responded.updated_at) >= new Date(session.updated_at), true);
      eq((await rpc(actor, 'mentor_sessions()')).find(s => s.id === session.id).updated_at, responded.updated_at);
    });
    stage = 'reports owner privacy and rates';
    await denied(() => report(actor, actor)); await denied(() => report(actor, teacher, 'invalid')); await denied(() => report(actor, teacher, 'spam', 'too short')); await denied(() => report(actor, teacher, 'spam', 'x'.repeat(2001)));
    await denied(() => report(actor, privatePeer), '42501'); await denied(() => report(actor, randomUUID()), '42501');
    await isolated(db, async () => {
      const group = await rpc(actor, 'mentor_group_create($1::jsonb)', [JSON.stringify({ name: 'Rollback report group', subject, topic: '', objective: '', capacity: 3, starts_at: null, needs_mentor: false })]);
      await rpc(privatePeer, 'mentor_group_join($1)', [group.id]);
      eq(typeof await report(actor, privatePeer), 'string', 'reachable inactive group member can be reported without exposing profile');
      await denied(() => favorite(actor, privatePeer), '42501');
    });
    const reportId = await report(actor, teacher);
    eq(await report(actor, teacher, 'other', 'Different contents never overwrite the first.'), reportId);
    const my = await rpc(actor, 'mentor_my_reports()'); eq(my.length, 1); eq(my[0].reason, 'spam'); eq(my[0].status, 'pending'); eq('details' in my[0], false);
    eq(await rpc(teacher, 'mentor_my_reports()'), []); eq(await rpc(other, 'mentor_my_reports()'), []);
    for (const peer of ids.slice(10, 20)) await report(rateUser, peer);
    await denied(() => report(rateUser, ids[20]), '54000');
    eq(typeof await report(rateUser, ids[10]), 'string', 'duplicate succeeds after rate limit');
    stage = 'moderation and persistent restrictions';
    await db.query('INSERT INTO public.mentor_moderators(user_id) VALUES($1)', [moderator]);
    eq(await rpc(moderator, 'mentor_moderation_access()'), true);
    const queue = await rpc(moderator, 'mentor_moderation_queue()'); eq(queue.length, 11);
    eq(queue.find(x => x.id === reportId).reporter_name, profile().name); eq(queue.find(x => x.id === reportId).details, 'Repeated unsolicited messages.');
    await denied(() => moderate(reportId, 'pending')); await denied(() => moderate(reportId, 'reviewed', 'invalid')); await denied(() => moderate(reportId, 'reviewed', 'restrict', 'short'));
    await denied(() => moderate(randomUUID()), '42501');
    await isolated(db, async () => {
      await db.query('INSERT INTO public.mentor_moderators(user_id) VALUES($1)', [actor]);
      await denied(() => rpc(actor, 'mentor_moderate($1,$2)', [reportId, 'reviewed']), '42501');
    });
    // Metadata fixture exercises the actual authenticated Storage view, not an owner-only query.
    const material = randomUUID(); const materialPath = `${actor}/${material}.pdf`;
    await db.query(`INSERT INTO public.mentor_materials(id,request_id,owner_id,path,name,mime,size,committed) VALUES($1,$2,$3,$4,'Rollback material','application/pdf',100,true)`, [material, r.id, actor, materialPath]);
    eq((await as(db, teacher, 'SELECT path FROM mentor_private.mentor_material_permissions WHERE path=$1', [materialPath])).rows.length, 1);
    const beforeTeacher = (await db.query('SELECT to_jsonb(p) p FROM public.mentor_profiles p WHERE id=$1', [teacher])).rows[0].p;
    const decision = await moderate(reportId, 'reviewed', 'restrict', 'Internal moderator explanation, not for reporter.');
    eq(decision.status, 'reviewed'); eq(decision.action, 'restrict');
    for (const sql of ['mentor_me()', 'mentor_discover()', 'mentor_requests()', 'mentor_groups()']) await denied(() => rpc(teacher, sql), '42501');
    await denied(() => rpc(teacher, 'mentor_save($1::jsonb)', [JSON.stringify(profile())]), '42501');
    await denied(() => rpc(teacher, 'mentor_request($1,$2)', [other, subject]), '42501');
    await denied(() => rpc(teacher, 'mentor_messages($1)', [r.id]), '42501');
    await denied(() => rpc(actor, 'mentor_send($1,$2,$3)', [r.id, 'Not allowed while restricted', randomUUID()]), '42501');
    eq(await rpc(actor, 'mentor_profile($1)', [teacher]), null); eq(await rpc(actor, 'mentor_favorites()'), []);
    eq((await as(db, teacher, 'SELECT path FROM mentor_private.mentor_material_permissions WHERE path=$1', [materialPath])).rows, []);
    eq((await as(db, actor, 'SELECT path FROM mentor_private.mentor_material_permissions WHERE path=$1', [materialPath])).rows, []);
    eq((await db.query('SELECT to_jsonb(p) p FROM public.mentor_profiles p WHERE id=$1', [teacher])).rows[0].p, beforeTeacher, 'restriction does not destroy or rewrite profile');
    const resolved = (await rpc(actor, 'mentor_my_reports()'))[0]; eq(resolved.resolution_note, 'Denúncia analisada pela moderação.'); eq(JSON.stringify(resolved).includes('Internal'), false);
    await denied(() => rpc(other, 'mentor_moderation_queue($1)', ['reviewed']), '42501');
    for (const statement of ['UPDATE public.mentor_moderation_audit SET note=note', 'DELETE FROM public.mentor_moderation_audit', 'TRUNCATE public.mentor_moderation_audit']) await isolated(db, async () => {
      await db.query('SAVEPOINT audit_denied');
      await denied(() => db.query(statement), '42501');
      await db.query('ROLLBACK TO SAVEPOINT audit_denied');
    });
    await moderate(reportId, 'reviewed', 'restore', 'Reviewed appeal and restored access.');
    eq((await rpc(teacher, 'mentor_me()')).id, teacher); eq((await rpc(actor, 'mentor_favorites()')).length, 1);
    eq((await as(db, teacher, 'SELECT path FROM mentor_private.mentor_material_permissions WHERE path=$1', [materialPath])).rows.length, 1);
    eq((await db.query('SELECT count(*)::integer n FROM public.mentor_moderation_audit WHERE report_id=$1', [reportId])).rows[0].n, 2);
    stage = 'legacy account removal compatibility';
    await isolated(db, async () => {
      const auditBefore = (await db.query('SELECT md5(string_agg(to_jsonb(a)::text,\'\' ORDER BY id)) hash FROM public.mentor_moderation_audit a')).rows[0].hash;
      await db.query('DELETE FROM auth.users WHERE id=$1', [teacher]);
      eq((await db.query('SELECT target_id FROM public.mentor_reports WHERE id=$1', [reportId])).rows[0].target_id, null);
      eq((await db.query('SELECT md5(string_agg(to_jsonb(a)::text,\'\' ORDER BY id)) hash FROM public.mentor_moderation_audit a')).rows[0].hash, auditBefore, 'account removal does not rewrite immutable audit');
      await denied(() => moderate(reportId, 'reviewed', 'restrict', 'Cannot restrict a removed account.'));
      eq((await moderate(reportId, 'dismissed')).status, 'dismissed');
    });
    await db.query('DELETE FROM public.mentor_moderators WHERE user_id=$1', [moderator]);
    eq(await rpc(moderator, 'mentor_moderation_access()'), false); await denied(() => moderate(reportId), '42501');
    stage = 'unknown source guards';
    await isolated(db, async () => {
      const definition = (await db.query("SELECT pg_get_functiondef('public.mentor__profile(public.mentor_profiles)'::regprocedure) src")).rows[0].src;
      await db.query(definition.replace("'methodology',p.methodology", "'methodology_unknown',p.methodology"));
      await db.query('SAVEPOINT unknown_guard');
      await denied(() => db.query(migrationSql()), 'P0001');
      await db.query('ROLLBACK TO SAVEPOINT unknown_guard');
    });
    stage = 'rollback verification';
    await db.query('ROLLBACK'); begun = false;
    eq(await snapshot(db, tables), before, 'ALL original table fingerprints unchanged after rollback');
    eq(await schemaSnapshot(db), schema, 'ALL original mentor helper sources and ACLs unchanged');
    eq(await relationSnapshot(db), relations, 'ALL original tables, views, indexes, columns, constraints, ACLs and RLS unchanged');
    eq((await db.query("SELECT pg_get_viewdef('mentor_private.mentor_material_permissions'::regclass,true) src")).rows[0].src, viewBefore, 'Storage view unchanged after rollback');
    eq((await db.query('SELECT count(*)::integer n FROM auth.users WHERE id=ANY($1::uuid[])', [ids])).rows[0].n, 0, 'no fixtures persist');
    stage = 'deployment preservation hooks force rollback';
    await assert.rejects(() => applyProduct(db, {
      beforeApply: async connection => {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        return snapshot(connection, tables);
      },
      afterApply: async (connection, baseline) => {
        eq(await snapshot(connection, tables), baseline, 'deployment hooks preserve all original column projections inside the same transaction');
        return false; // Deliberate veto: this integration test must NEVER commit.
      }
    }), /Migration preservation validation failed/);
    assertions++;
    eq(await snapshot(db, tables), before, 'deployment hook veto leaves original data unchanged');
    eq(await schemaSnapshot(db), schema, 'deployment hook veto rolls back all helper replacements');
    eq(await relationSnapshot(db), relations, 'deployment hook veto rolls back all relation changes');
    console.log(`PASS product backend: ${assertions} assertions; migrations, fixtures, ACLs, IDOR, filters, favorites, requests, moderation and Storage tested and rolled back; original data/schema unchanged.`);
  } finally { if (begun) await db.query('ROLLBACK'); await db.end(); }
}
if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--run') run().catch(error => {
    console.error(`Product rollback tests failed at ${stage} (${error.code || error.name}); database details suppressed; no deployment committed.`);
    if (error instanceof assert.AssertionError) console.error(error.message);
    process.exitCode = 1;
  });
  else console.log('SKIP product backend. Opt in with --run; schema and fixtures always roll back.');
}
module.exports = { run };
