'use strict';
// Explicit opt-in, one rollback-only transaction; no real account is reset.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { validate } = require('../tools/deploy-lab.cjs');
const { snapshot, authSnapshot } = require('../tools/deploy-groups.cjs');
let stage = 'connecting', assertions = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); assertions++; };
const ok = (value, message) => { assert.ok(value, message); assertions++; };
async function as(db, id, sql, args = [], role = 'authenticated') {
  assert.ok(['authenticated', 'anon'].includes(role));
  await db.query('SAVEPOINT lab_action');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [id || '', JSON.stringify({ sub: id, role })]);
    const result = await db.query(sql, args);
    await db.query('RESET ROLE'); await db.query('RELEASE SAVEPOINT lab_action'); return result;
  } catch (error) { await db.query('ROLLBACK TO SAVEPOINT lab_action'); await db.query('RELEASE SAVEPOINT lab_action'); throw error; }
}
async function denied(fn, code = '42501') { await assert.rejects(fn, e => e.code === code); assertions++; }
async function run() {
  const db = require('./backend-db').client(); let begun = false;
  const ids = Array.from({ length: 9 }, () => randomUUID());
  const [self, peer, other, fourth, minor, restricted, blank, banned, deleted] = ids;
  const [outgoing, incoming, declined, unrelated, group, individual, thirdSession, groupSession, message, thirdMessage, material, thirdMaterial, groupMaterial] = Array.from({ length: 13 }, () => randomUUID());
  const reset = async (id = self, text = 'RESETAR', role) => (await as(db, id, 'SELECT public.mentor_reset_connections($1) value', [text], role)).rows[0].value;
  const count = async (table, column, values) => Number((await db.query(`SELECT count(*) n FROM public.${table} WHERE ${column}=ANY($1::uuid[])`, [values])).rows[0].n);
  await db.connect();
  try {
    const before = await snapshot(db), auth = await authSnapshot(db);
    await db.query('BEGIN'); begun = true;
    stage = 'migration and permissions';
    await db.query(validate()); await db.query(validate());
    eq((await snapshot(db, before.relations)).hashes, before.hashes, 'Installing/replaying the migration resets nobody');
    eq(await authSnapshot(db), auth, 'Auth and moderation remain intact');
    const fn = (await db.query("SELECT prosecdef,proconfig,pronargs,proargnames,has_function_privilege('anon',oid,'EXECUTE') anon_exec,has_function_privilege('authenticated',oid,'EXECUTE') auth_exec FROM pg_proc WHERE oid='public.mentor_reset_connections(text)'::regprocedure")).rows[0];
    eq(fn.prosecdef, true); ok(fn.proconfig.includes('search_path=""')); ok(fn.proconfig.includes('lock_timeout=5s'));
    eq(fn.pronargs, 1); eq(fn.proargnames, ['p_confirmation']); eq(fn.anon_exec, false); eq(fn.auth_exec, true);
    stage = 'isolated fixtures';
    await db.query(`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
      SELECT id,'authenticated','authenticated','lab-'||id||'@example.invalid',jsonb_build_object('name','Laboratory rollback fixture','birth_date',CASE WHEN id=$2::uuid THEN '2015-01-01' ELSE '1995-01-01' END),now(),now() FROM unnest($1::uuid[]) id`, [ids, minor]);
    await db.query(`INSERT INTO public.mentor_profiles(id,name,course,semester,subjects,learning_subjects,format,active)
      SELECT id,'Laboratory rollback fixture','Computação',3,ARRAY['Cálculo'],ARRAY['Cálculo'],'online',true FROM unnest($1::uuid[]) id WHERE id<>$2::uuid`, [ids, blank]);
    await db.query('INSERT INTO public.mentor_restrictions(user_id,restricted) VALUES($1,true)', [restricted]);
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1", [banned]);
    await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1', [deleted]);
    await db.query(`INSERT INTO public.mentor_requests(id,learner_id,mentor_id,subject,status) VALUES
      ($1,$5,$6,'Cálculo','accepted'),($2,$7,$5,'Cálculo','pending'),($3,$5,$8,'Cálculo','declined'),($4,$6,$7,'Cálculo','accepted')`, [outgoing,incoming,declined,unrelated,self,peer,other,fourth]);
    await db.query(`INSERT INTO public.mentor_messages(id,request_id,sender_id,body,client_id) VALUES($1,$3,$5,'Own connection',gen_random_uuid()),($2,$4,$6,'Unrelated connection',gen_random_uuid())`, [message,thirdMessage,outgoing,unrelated,self,peer]);
    await db.query(`INSERT INTO public.mentor_study_groups(id,owner_id,name,subject,topic,objective,capacity) VALUES($1,$2,'Preserved group','Cálculo','','Study',12)`, [group,self]);
    await db.query('INSERT INTO public.mentor_group_members(group_id,user_id) VALUES($1,$2),($1,$3)', [group,self,peer]);
    await db.query(`INSERT INTO public.mentor_group_messages(group_id,sender_id,body,client_id) VALUES($1,$2,'Keep group draft and history',gen_random_uuid())`, [group,self]);
    await db.query(`INSERT INTO public.mentor_study_sessions(id,request_id,group_id,created_by,title,subject,topic,starts_at,duration_minutes,location,format,status) VALUES
      ($1,$4,NULL,$7,'Own session','Cálculo','',now()-interval '1 day',60,'Library','presencial','confirmed'),
      ($2,$5,NULL,$8,'Unrelated session','Cálculo','',now()-interval '1 day',60,'Library','presencial','confirmed'),
      ($3,NULL,$6,$7,'Group session','Cálculo','',now()+interval '1 day',60,'Library','presencial','pending')`, [individual,thirdSession,groupSession,outgoing,unrelated,group,self,peer]);
    await db.query(`INSERT INTO public.mentor_session_participants(session_id,user_id,response) VALUES($1,$4,'confirmed'),($1,$5,'confirmed'),($2,$5,'confirmed'),($2,$6,'confirmed'),($3,$4,'pending')`, [individual,thirdSession,groupSession,self,peer,other]);
    await db.query(`INSERT INTO public.mentor_session_reviews(session_id,reviewer_id,recipient_id,rating,comment) VALUES($1,$3,$4,5,'Own review'),($2,$4,$5,4,'Unrelated review')`, [individual,thirdSession,self,peer,other]);
    await db.query(`INSERT INTO public.mentor_materials(id,request_id,group_id,owner_id,name,mime,size,path,committed) VALUES
      ($1,$4,NULL,$7,'own.pdf','application/pdf',32,      $7::uuid::text||'/'||$1::uuid::text||'.pdf',true),
            ($2,$5,NULL,$8,'third.pdf','application/pdf',32,$8::uuid::text||'/'||$2::uuid::text||'.pdf',true),
            ($3,NULL,$6,$7,'group.pdf','application/pdf',32,$7::uuid::text||'/'||$3::uuid::text||'.pdf',true)`, [material,thirdMaterial,groupMaterial,outgoing,unrelated,group,self,peer]);
    const removedNotices = [`request:${incoming}`,`accepted:${outgoing}`,`message:${message}`,`file:${material}`,`session:${individual}:123`,`upcoming:${individual}:456`];
    const keptNotices = [`accepted:${unrelated}`,`session:${groupSession}:123`,`group-message:${randomUUID()}`];
    await db.query('INSERT INTO public.mentor_notification_reads(user_id,notification_id) SELECT $1,n FROM unnest($2::text[]) n', [peer,[...removedNotices,...keptNotices]]);
    await db.query('INSERT INTO public.mentor_favorites(owner_id,user_id) VALUES($1,$2)', [self,peer]);
    // Access to new signed URLs must disappear after metadata is removed; physical objects are not touched.
    eq((await as(db,self,'SELECT path FROM mentor_private.mentor_material_permissions WHERE path=$1',[`${self}/${material}.pdf`])).rows.length,1);
    await db.query('INSERT INTO public.mentor_blocks(blocker_id,blocked_id) VALUES($1,$2)', [self,peer]);
    stage = 'confirmation and eligibility';
    for (const text of [null,'','resetar','RESETAR ',other]) await denied(() => reset(self,text),'22023');
    for (const who of [null,randomUUID(),minor,restricted,blank,banned,deleted]) await denied(() => reset(who));
    await denied(() => reset(self,'RESETAR','anon'));
    await denied(() => as(db,self,'DELETE FROM public.mentor_requests'));
    eq(await count('mentor_requests','id',[outgoing,incoming,declined]),3);
    const preservedTables = ['profiles','mentor_profiles','mentor_favorites','mentor_blocks','mentor_reports','mentor_restrictions','mentor_study_groups','mentor_group_members','mentor_group_messages','mentor_group_invitations','mentor_group_codes','mentor_group_removals'];
    const preserved = await snapshot(db, (await snapshot(db)).relations.filter(r => r.schema==='public' && preservedTables.includes(r.name)));
    stage = 'shared account lock';
    const locker = require('./backend-db').client(); await locker.connect();
    try {
      await locker.query('BEGIN'); await locker.query('SELECT public.mentor__lock($1)', [self]);
      await denied(() => reset(), '55P03');
      eq(await count('mentor_requests','id',[outgoing,incoming,declined]),3,'Lock timeout causes no partial reset');
      await locker.query('ROLLBACK');
      stage = 'exact reset scope';
      eq(await reset(),{reset:true,requests:3,messages:1,sessions:1,materials:1,reviews:1});
      await locker.query('BEGIN'); await locker.query("SET LOCAL lock_timeout='150ms'");
      await denied(() => locker.query('SELECT public.mentor__lock($1)', [self]), '55P03');
    } finally { await locker.query('ROLLBACK'); await locker.end(); }
    for (const [table,column,values] of [['mentor_requests','id',[outgoing,incoming,declined]],['mentor_messages','id',[message]],['mentor_study_sessions','id',[individual]],['mentor_session_participants','session_id',[individual]],['mentor_session_reviews','session_id',[individual]],['mentor_materials','id',[material]]]) eq(await count(table,column,values),0,`${table} scoped deletion`);
    for (const [table,column,values,n] of [['mentor_requests','id',[unrelated],1],['mentor_messages','id',[thirdMessage],1],['mentor_study_sessions','id',[thirdSession,groupSession],2],['mentor_session_reviews','session_id',[thirdSession],1],['mentor_materials','id',[thirdMaterial,groupMaterial],2]]) eq(await count(table,column,values),n,`${table} unrelated/group preservation`);
    eq((await db.query('SELECT notification_id FROM public.mentor_notification_reads WHERE user_id=$1 ORDER BY notification_id',[peer])).rows.map(r=>r.notification_id),keptNotices.sort());
    eq((await snapshot(db,preserved.relations)).hashes,preserved.hashes,'Profiles, safety, favorites and every group unchanged');
    eq((await as(db,self,'SELECT path FROM mentor_private.mentor_material_permissions WHERE path=$1',[`${self}/${material}.pdf`])).rows.length,0);
    eq(await reset(),{reset:true,requests:0,messages:0,sessions:0,materials:0,reviews:0},'Empty reset is idempotent');
    await denied(() => as(db,self,'SELECT public.mentor_messages($1)',[outgoing]));
    const fresh = (await as(db,self,"SELECT public.mentor_request($1,'Cálculo') value",[other])).rows[0].value;
    ok(fresh.id && fresh.id!==incoming); eq(fresh.status,'pending','New contact possible without recreating accounts');
    stage = 'rollback preservation';
    await db.query('ROLLBACK'); begun = false;
    eq((await snapshot(db,before.relations)).hashes,before.hashes,'All original rows preserved after rollback');
    eq(await authSnapshot(db),auth);
    console.log(`PASS laboratory backend: ${assertions} assertions; scope, confirmation, permissions, cascades, preserved groups, renewed contact, rollback. No real account reset.`);
  } finally { if (begun) await db.query('ROLLBACK'); await db.end(); }
}
if (!process.argv.includes('--run')) console.log('Offline by default. node tests\\mentorship-lab-backend.cjs --run runs isolated fixtures and always rolls back.');
else run().catch(error => { console.error(`FAIL laboratory backend at ${stage}; SQLSTATE ${error.code || 'assertion'}; database details suppressed.`); process.exitCode=1; });
