'use strict';
// Opt in: node tests\mentorship-catalog-backend.cjs --run
// Schema, parameterized seed, and disposable auth fixtures ALWAYS roll back.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeCatalog } = require('../tools/catalog-data.cjs');
const { migrationSql, seedCatalog } = require('../tools/deploy-catalog.cjs');
const tables = ['mentor_catalog_metadata', 'mentor_catalog_courses', 'mentor_catalog_subjects', 'mentor_catalog_course_subjects'];
const longSubject = 'Estágio de Ênfase em Processos Psicossocias e Psicoeducacionais OU Processos de Promoção da Saúde e bem-estar III';
const widenedFunctions = [
  ['public.mentor_save(jsonb)', 'length(v_text) NOT BETWEEN 1 AND 80', "length(v_text) NOT BETWEEN 1 AND (CASE WHEN v_key = 'topics' THEN 80 ELSE 256 END)"],
  ['public.mentor_discover(text)', 'length(p_subject) > 80', 'length(p_subject) > 256'],
  ['public.mentor_request(uuid,text)', 'length(btrim(p_subject)) NOT BETWEEN 1 AND 80', 'length(btrim(p_subject)) NOT BETWEEN 1 AND 256'],
  ['public.mentor_group_create(jsonb)', "public.mentor_ac__text(p_group,'subject',80,true)", "public.mentor_ac__text(p_group,'subject',256,true)"],
  ['public.mentor_session_save(jsonb)', "public.mentor_ac__text(p_session,'subject',80,true)", "public.mentor_ac__text(p_session,'subject',256,true)"],
];
const sample = () => ({ institution: 'FACENS', checked_at: '2026-10-02', source_url: 'https://facens.br/', courses: [
  { id: 'test-computacao-presencial', name: 'Computação', degree: 'Bacharelado', modality: 'Presencial', source_url: 'https://facens.br/computacao/', curriculum_source_url: 'https://facens.br/matriz.pdf', curriculum_version: '2026', curriculum_status: 'complete', subjects: [{ name: 'Algoritmos', semester: 1 }, { name: 'Cálculo', semester: 2 }, { name: 'Projeto', semester: null }] },
  { id: 'test-administracao-ead', name: 'Administração', degree: 'Bacharelado', modality: 'EAD', source_url: 'https://facens.br/administracao/', curriculum_source_url: 'https://facens.br/adm.pdf', curriculum_version: null, curriculum_status: 'partial', subjects: [{ name: 'Gestão', semester: 1 }] },
  { id: 'test-direito-presencial', name: 'Direito', degree: 'Bacharelado', modality: 'Presencial', source_url: 'https://facens.br/direito/', curriculum_source_url: null, curriculum_version: null, curriculum_status: 'unavailable', subjects: [] }
] });
const profile = (extra = {}) => ({ name: 'Estudante catálogo', course: 'Computação', semester: 2, bio: '', subjects: ['Algoritmos'], learning_subjects: ['Gestão'], availability: '', format: 'online', photo_url: '', active: true, institution: 'FACENS', city: 'Sorocaba', current_subjects: ['Cálculo'], topics: ['Subtópico livre: derivadas'], study_preference: 'ambos', ...extra });
let assertions = 0;
function eq(a, b, message) { assert.deepEqual(a, b, message); assertions++; }
async function denied(action, code = '22023') { await assert.rejects(action, error => error.code === code); assertions++; }
async function as(db, id, sql, args = [], role = 'authenticated') {
  await db.query('SAVEPOINT catalog_action');
  try {
    assert.ok(['anon', 'authenticated'].includes(role));
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [id || '', JSON.stringify(id ? { sub: id, role } : { role })]);
    const result = await db.query(sql, args);
    await db.query('RESET ROLE'); await db.query('RELEASE SAVEPOINT catalog_action'); return result;
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT catalog_action'); await db.query('RELEASE SAVEPOINT catalog_action'); throw error;
  }
}
async function rpc(db, id, payload, course = 'test-computacao-presencial') {
  return (await as(db, id, 'SELECT public.mentor_save_catalog($1::jsonb,$2::text) value', [JSON.stringify(payload), course])).rows[0].value;
}
async function catalog(db, id) { return (await as(db, id, 'SELECT public.mentor_catalog() value')).rows[0].value; }
async function saved(db, id) { return (await as(db, id, 'SELECT public.mentor_me() value')).rows[0].value; }
async function existingData(db) {
  return (await db.query(`SELECT md5(coalesce(string_agg((to_jsonb(p)-'catalog_course_id')::text,'' ORDER BY id),'')) hash FROM public.mentor_profiles p`)).rows[0].hash;
}
async function schemaState(db) {
  return (await db.query(`SELECT p.oid::regprocedure::text signature,p.proacl::text,p.proconfig,md5(p.prosrc) source FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'mentor%' ORDER BY 1`)).rows;
}
async function longNames(db, mentor, learner) {
  await db.query('SAVEPOINT long_names');
  try {
    eq([...longSubject].length, 113);
    const max = 'Disciplina ' + 'x'.repeat(245); const over = 'x'.repeat(257);
    eq(max.length, 256);
    const data = sample();
    data.courses[0].subjects.push(...[longSubject, max, over].map(name => ({ name, semester: 10 })));
    await seedCatalog(db, data);
    const payload = profile({ subjects: [longSubject, max], learning_subjects: [longSubject], current_subjects: [longSubject] });
    const oldApi = async p => (await as(db, mentor, 'SELECT public.mentor_save($1::jsonb) value', [JSON.stringify(p)])).rows[0].value;
    eq((await oldApi(payload)).subjects, payload.subjects, 'legacy save accepts full names without changing other validation');
    const p = await rpc(db, mentor, payload);
    eq(p.subjects, payload.subjects); eq(p.current_subjects, [longSubject]); eq(p.learning_subjects, [longSubject]);
    for (const key of ['subjects', 'learning_subjects', 'current_subjects']) {
      await denied(() => oldApi({ ...payload, [key]: [over] }));
      await denied(() => rpc(db, mentor, { ...payload, [key]: [over] }));
      eq((await rpc(db, mentor, { ...payload, [key]: [max] }))[key], [max]);
    }
    await rpc(db, mentor, payload);
    for (const extra of [{ topics: ['x'.repeat(81)] }, { name: 'x'.repeat(81) }, { course: 'x'.repeat(81) }]) await denied(() => oldApi({ ...payload, ...extra }));
    eq((await oldApi({ ...payload, topics: ['x'.repeat(80)] })).topics[0].length, 80, 'profile topic limit unchanged');
    const call = async (id, sql, args = []) => (await as(db, id, sql, args)).rows[0].value;
    eq((await call(learner, 'SELECT public.mentor_discover($1) value', [longSubject])).some(p => p.id === mentor), true);
    eq((await call(learner, 'SELECT public.mentor_discover($1) value', [max])).some(p => p.id === mentor), true);
    await denied(() => call(learner, 'SELECT public.mentor_discover($1) value', [over]));
    await denied(() => call(learner, 'SELECT public.mentor_request($1::uuid,$2) value', [mentor, over]));
    for (const subject of [longSubject, max]) {
      const request = await call(learner, 'SELECT public.mentor_request($1::uuid,$2) value', [mentor, subject]);
      eq(request.subject, subject);
      await call(mentor, 'SELECT public.mentor_respond($1::uuid,true) value', [request.id]);
      const groupPayload = { name: 'Grupo longo', subject, topic: '', objective: '', capacity: 3, starts_at: null, needs_mentor: false };
      const groupCall = p => call(mentor, 'SELECT public.mentor_group_create($1::jsonb) value', [JSON.stringify(p)]);
      const group = await groupCall(groupPayload); eq(group.subject, subject);
      await denied(() => groupCall({ ...groupPayload, subject: over }));
      await denied(() => groupCall({ ...groupPayload, name: 'x'.repeat(101) }));
      await denied(() => groupCall({ ...groupPayload, topic: 'x'.repeat(161) }));
      for (const context of [{ request_id: request.id, group_id: null }, { request_id: null, group_id: group.id }]) {
        const id = context.group_id ? mentor : learner;
        const sessionPayload = { ...context, title: 'Encontro longo', subject, topic: '', starts_at: new Date(Date.now() + 3600000).toISOString(), duration_minutes: 60, location: '', format: 'online' };
        const sessionCall = p => call(id, 'SELECT public.mentor_session_save($1::jsonb) value', [JSON.stringify(p)]);
        const session = await sessionCall(sessionPayload); eq(session.subject, subject, 'request/group session preserves full subject');
        await denied(() => sessionCall({ ...sessionPayload, subject: over }));
        await denied(() => sessionCall({ ...sessionPayload, topic: 'x'.repeat(161) }));
        await denied(() => sessionCall({ ...sessionPayload, title: 'x'.repeat(101) }));
        for (const [table, rowId] of [['mentor_requests', request.id], ['mentor_study_groups', group.id], ['mentor_study_sessions', session.id]]) {
          await db.query('SAVEPOINT subject_constraint');
          await denied(() => db.query(`UPDATE public.${table} SET subject=$1 WHERE id=$2`, [over, rowId]), '23514');
          await db.query('ROLLBACK TO SAVEPOINT subject_constraint'); await db.query('RELEASE SAVEPOINT subject_constraint');
        }
      }
    }
  } finally { await db.query('ROLLBACK TO SAVEPOINT long_names'); await db.query('RELEASE SAVEPOINT long_names'); }
}
async function run() {
  const { client } = require('./backend-db'); const db = client();
  await db.connect();
  let before; let schema; let begun = false;
  try {
    before = await existingData(db); schema = await schemaState(db);
    const originalDefinitions = new Map();
    for (const [signature] of widenedFunctions) originalDefinitions.set(signature,
      (await db.query('SELECT pg_get_functiondef($1::regprocedure) definition', [signature])).rows[0].definition);
    await db.query('BEGIN'); begun = true;
    await db.query(migrationSql());
    eq(await existingData(db), before, 'migration preserves every existing profile field');
    for (const [signature, oldFragment, newFragment] of widenedFunctions) {
      const actual = (await db.query('SELECT pg_get_functiondef($1::regprocedure) definition', [signature])).rows[0].definition;
      eq(actual, originalDefinitions.get(signature).replace(oldFragment, newFragment), `${signature}: only subject limit changes`);
    }
    const oldSave = schema.find(f => f.signature === 'mentor_save(jsonb)');
    eq(typeof oldSave, 'object', 'existing save function is present');
    const newSave = (await schemaState(db)).find(f => f.signature === 'mentor_save(jsonb)');
    eq({ ...newSave, source: oldSave.source }, oldSave, 'old save function privileges/configuration unchanged');
    const dataset = normalizeCatalog(sample());
    await seedCatalog(db, dataset);
    await db.query(migrationSql()); await seedCatalog(db, dataset);
    eq(await existingData(db), before, 'repeated migration/seed preserves profiles');
    const [user, legacy, other, minor, banned, deleted] = Array.from({ length: 6 }, () => randomUUID());
    const ids = [user, legacy, other, minor, banned, deleted];
    for (const id of ids) await db.query(`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
      VALUES($1,'authenticated','authenticated',$2,$3::jsonb,now(),now())`,
    [id, `catalog-${id}@example.invalid`, JSON.stringify({ name: 'Catalog rollback fixture', birth_date: id === minor ? '2015-01-01' : '1995-01-01' })]);
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [banned]);
    await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1', [deleted]);
    eq(await catalog(db, user), dataset, 'exact data, canonical sorting and explicit unavailable curriculum');
    const sourceFile = path.join(__dirname, '..', 'data', 'facens-catalog.json');
    const officialVerified = fs.existsSync(sourceFile);
    if (officialVerified) {
      await db.query('SAVEPOINT official_data');
      const actual = normalizeCatalog(JSON.parse(fs.readFileSync(sourceFile, 'utf8')));
      await seedCatalog(db, actual); eq(await catalog(db, user), actual, 'exact official dataset RPC response');
      await db.query('ROLLBACK TO SAVEPOINT official_data'); await db.query('RELEASE SAVEPOINT official_data');
    }
    for (const role of ['anon', 'authenticated']) for (const table of tables) {
      for (const statement of [`SELECT * FROM public.${table}`, `INSERT INTO public.${table} DEFAULT VALUES`, `DELETE FROM public.${table}`]) {
        await denied(() => as(db, user, statement, [], role), '42501');
      }
      const col = table === 'mentor_catalog_metadata' ? 'institution' : table === 'mentor_catalog_course_subjects' ? 'subject_name' : 'name';
      await denied(() => as(db, user, `UPDATE public.${table} SET ${col}=${col}`, [], role), '42501');
    }
    const rls = (await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])', [tables.map(t => `public.${t}`)])).rows;
    eq(rls.length, 4); eq(rls.every(t => t.relrowsecurity), true);
    const perms = (await db.query(`SELECT proname,prosecdef,proconfig,
      has_function_privilege('anon',oid,'EXECUTE') anon_exec,
      has_function_privilege('authenticated',oid,'EXECUTE') auth_exec,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE grantee=0 AND privilege_type='EXECUTE') public_exec
      FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('mentor_catalog','mentor_save_catalog','mentor__profile')`)).rows;
    eq(perms.length, 3);
    for (const p of perms) { eq(p.prosecdef, true); eq(p.proconfig.includes('search_path=""'), true); eq(p.anon_exec, false); eq(p.public_exec, false); eq(p.auth_exec, p.proname !== 'mentor__profile'); }
    await denied(() => as(db, null, 'SELECT public.mentor_catalog()', [], 'anon'), '42501');
    await denied(() => as(db, null, 'SELECT public.mentor_save_catalog($1::jsonb,$2)', [JSON.stringify(profile()), dataset.courses[0].id], 'anon'), '42501');
    for (const id of [null, randomUUID(), minor, banned, deleted]) {
      await denied(() => catalog(db, id), '42501'); await denied(() => rpc(db, id, profile()), '42501');
    }
    await denied(() => as(db, user, 'UPDATE public.mentor_profiles SET catalog_course_id=$1 WHERE id=$2', ['test-computacao-presencial', user]), '42501');
    await denied(() => rpc(db, user, profile(), null));
    for (const payload of [null, [], {}, profile({ course: 'Forged' }), profile({ course: ' Computação' }), profile({ subjects: ['Inventada'] }), profile({ learning_subjects: ['Inventada'] }), profile({ current_subjects: ['Gestão'] }), profile({ current_subjects: [123] }), profile({ subjects: ['Algoritmos', 'Algoritmos'] }), profile({ name: '' }), profile({ semester: 0 }), profile({ photo_url: 'https://example.invalid/photo.jpg' }), profile({ unexpected: true }), profile({ catalog_course_id: 'different' })]) await denied(() => rpc(db, user, payload));
    await denied(() => rpc(db, user, profile(), 'missing-course'));
    let current = await rpc(db, user, profile());
    eq(current.catalog_course_id, 'test-computacao-presencial'); eq(current.topics, profile().topics); eq(current.learning_subjects, ['Gestão']);
    eq(await rpc(db, user, current), current, 'complete returned profile round trips');
    await denied(() => rpc(db, user, { ...current, catalog_course_id: null }, null));
    current = await rpc(db, user, { ...current, course: 'Administração', catalog_course_id: 'test-administracao-ead' }, 'test-administracao-ead');
    eq(current.current_subjects, ['Cálculo'], 'course switch retains saved historical subjects');
    current = await rpc(db, user, { ...current, current_subjects: [] }, 'test-administracao-ead');
    await denied(() => rpc(db, user, { ...current, current_subjects: ['Cálculo'] }, 'test-administracao-ead'));
    const legacyPayload = profile({ course: 'Curso antigo', subjects: ['Disciplina antiga'], learning_subjects: ['Outra antiga'], current_subjects: ['Atual antiga'] });
    let old = (await as(db, legacy, 'SELECT public.mentor_save($1::jsonb) value', [JSON.stringify(legacyPayload)])).rows[0].value;
    eq(old.catalog_course_id, null);
    old = await rpc(db, legacy, old, null); eq(old.course, 'Curso antigo');
    await denied(() => rpc(db, legacy, { ...old, course: 'Outro curso antigo' }, null));
    for (const key of ['subjects', 'learning_subjects', 'current_subjects']) await denied(() => rpc(db, legacy, { ...old, [key]: ['Nova inventada'] }, null));
    await denied(() => rpc(db, other, profile({ subjects: ['Disciplina antiga'] })));
    await denied(() => rpc(db, legacy, { ...old, learning_subjects: ['Disciplina antiga'] }, null));
    old = await rpc(db, legacy, { ...old, subjects: [], active: false }, null);
    await denied(() => rpc(db, legacy, { ...old, subjects: ['Disciplina antiga'] }, null));
    old = await rpc(db, legacy, { ...old, course: 'Direito', catalog_course_id: 'test-direito-presencial' }, 'test-direito-presencial');
    eq(old.current_subjects, ['Atual antiga']); eq(old.learning_subjects, ['Outra antiga']);
    await denied(() => rpc(db, other, profile({ course: 'Direito', subjects: [], active: false, current_subjects: ['Cálculo'] }), 'test-direito-presencial'));
    eq((await rpc(db, other, profile({ course: 'Direito', current_subjects: [] }), 'test-direito-presencial')).catalog_course_id, 'test-direito-presencial');
    await longNames(db, user, other);
    await db.query('SAVEPOINT migration_guard');
    await db.query('ALTER TABLE public.mentor_requests DROP CONSTRAINT mentor_requests_subject_check');
    await db.query('ALTER TABLE public.mentor_requests ADD CONSTRAINT mentor_requests_subject_check CHECK (length(btrim(subject)) BETWEEN 1 AND 512)');
    await db.query('SAVEPOINT guard_action');
    await denied(() => db.query(migrationSql()), 'P0001');
    await db.query('ROLLBACK TO SAVEPOINT guard_action');
    await db.query('ROLLBACK TO SAVEPOINT migration_guard'); await db.query('RELEASE SAVEPOINT migration_guard');
    await db.query('SAVEPOINT retired_catalog');
    const retired = sample(); retired.courses = retired.courses.filter(c => c.id !== 'test-direito-presencial');
    await seedCatalog(db, retired);
    eq((await saved(db, legacy)).catalog_course_id, 'test-direito-presencial', 'retiring course preserves profile FK/history');
    eq((await db.query("SELECT active FROM public.mentor_catalog_courses WHERE id='test-direito-presencial'")).rows[0].active, false);
    await denied(() => rpc(db, legacy, old, 'test-direito-presencial'));
    eq(await catalog(db, user), normalizeCatalog(retired));
    await db.query('ROLLBACK TO SAVEPOINT retired_catalog'); await db.query('RELEASE SAVEPOINT retired_catalog');
    await db.query('ROLLBACK'); begun = false;
    eq(await existingData(db), before, 'rollback leaves all production profiles unchanged');
    eq(await schemaState(db), schema, 'rollback leaves all production functions/ACLs unchanged');
    eq((await db.query('SELECT count(*)::integer n FROM auth.users WHERE id=ANY($1::uuid[])', [ids])).rows[0].n, 0, 'no disposable accounts remain');
    console.log(`PASS catalog backend: ${assertions} assertions; schema, seed, permissions, selections, legacy compatibility, and fixtures rolled back. Official dataset: ${officialVerified ? 'exact RPC roundtrip verified' : 'not yet available (skipped)'}.`);
  } finally {
    if (begun) await db.query('ROLLBACK');
    await db.end();
  }
}
if (process.argv.includes('--run')) run().catch(error => {
  console.error(error instanceof assert.AssertionError ? error : `Catalog rollback test failed (${error.code || error.name}); no deployment committed.`);
  process.exitCode = 1;
});
else console.log('SKIP catalog backend (opt in with --run; all work is rolled back).');
