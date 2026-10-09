'use strict';
// Default: core migration + addon + fixtures + tests in a single ROLLBACK transaction.
// --apply is an explicit deployment action: validate, commit DDL only, validate again in ROLLBACK.
// --https: bounded real HTTPS SDK/Storage test on the deployed schema; exactly three
// tagged disposable users. Removes bytes through Storage API before deleting fixtures.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { client } = require('./backend-db');
const migrations = ['mentorship.sql', 'mentorship-academic.sql'].map(f => fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8'));
const stripped = migrations.map(s => s.replace(/^BEGIN;\s*/m, '').replace(/COMMIT;\s*$/, '')).join('\n');
const signatures = {
 mentor_groups: [], mentor_group_create: ['jsonb'], mentor_group_detail: ['uuid'], mentor_group_join: ['uuid'], mentor_group_leave: ['uuid'], mentor_group_cancel: ['uuid'], mentor_group_send: ['uuid','text','uuid'], mentor_group_suggestions: ['uuid'], mentor_group_invite: ['uuid','uuid'],
 mentor_sessions: [], mentor_session_save: ['jsonb'], mentor_session_respond: ['uuid','boolean'], mentor_session_cancel: ['uuid'],
 mentor_file_prepare: ['uuid','uuid','text','text','bigint'], mentor_file_commit: ['uuid'], mentor_files: ['uuid','uuid'], mentor_file_abort: ['uuid'],
 mentor_review: ['uuid','integer','text'], mentor_reviews: ['uuid'], mentor_notifications: [], mentor_notification_read: ['text'],
};
const tables = ['mentor_study_groups','mentor_group_members','mentor_group_messages','mentor_group_invitations','mentor_study_sessions','mentor_session_participants','mentor_materials','mentor_session_reviews','mentor_notification_reads'];
const ids = Array.from({length:12}, () => randomUUID());
const [owner, learner, peer, outsider, minor, banned, deleted, unknownBirth, blank, inactive, fourth, fifth] = ids;
const groupKeys = ['id','name','subject','topic','objective','capacity','starts_at','needs_mentor','owner_id','member_count','is_member','is_owner','status'].sort();
const messageKeys = ['id','sender_id','sender_name','body','created_at','client_id'].sort();
const sessionKeys = ['id','request_id','group_id','title','subject','topic','starts_at','duration_minutes','location','format','created_by','status','my_response','participants','is_creator','mentor_id','can_review'].sort();
const fileKeys = ['id','name','mime','size','path','bucket','owner_id','created_at'].sort();
let assertions = 0;
function eq(a,b,m) { assert.deepEqual(a,b,m); assertions++; }
function check(a,m) { assert.ok(a,m); assertions++; }
function pass(m) { console.log(`PASS ${m}`); }
const groupData = (x={}) => ({name:'Grupo de cálculo',subject:'Cálculo',topic:'Derivadas',objective:'Estudar em conjunto',capacity:3,starts_at:null,needs_mentor:true,...x});
const future = () => new Date(Date.now()+6*3600000).toISOString();
const sessionData = (r,g,x={}) => ({title:'Monitoria de cálculo',subject:'Cálculo',topic:'Derivadas',starts_at:future(),duration_minutes:60,location:'Biblioteca',format:'hibrido',request_id:r,group_id:g,...x});
async function identity(db,id,role='authenticated') {
 await db.query(`SET LOCAL ROLE ${role}`);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id||'',JSON.stringify(id?{sub:id,role}:{role})]);
}
async function as(db,id,sql,args=[],role='authenticated') {
 await db.query('SAVEPOINT academic_action');
 try {
  await identity(db,id,role); const r=await db.query(sql,args); await db.query('RESET ROLE');
  await db.query('RELEASE SAVEPOINT academic_action'); return r;
 } catch(e) { await db.query('ROLLBACK TO SAVEPOINT academic_action'); await db.query('RELEASE SAVEPOINT academic_action'); throw e; }
}
function call(name,args) {
 const types=signatures[name]; assert.ok(types); assert.equal(types.length,args.length);
 return [`SELECT public.${name}(${types.map((t,i)=>`$${i+1}::${t}`).join(',')}) value`,args.map((v,i)=>types[i]==='jsonb'&&v!==null?JSON.stringify(v):v)];
}
async function rpc(db,id,name,...args) { return (await as(db,id,...call(name,args))).rows[0].value; }
async function denied(fn,code='42501') { await assert.rejects(fn,e=>e.code===code); assertions++; }
async function scoped(db,fn) {
 await db.query('SAVEPOINT academic_scope');
 try { return await fn(); } finally { await db.query('ROLLBACK TO SAVEPOINT academic_scope'); await db.query('RELEASE SAVEPOINT academic_scope'); }
}
async function fingerprint(db,legacy=false) {
 const result={};
 const relations=(await db.query(`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','auth','storage') ${legacy?"AND NOT (schemaname='public' AND tablename LIKE 'mentor\\_%' ESCAPE '\\') AND NOT (schemaname='storage' AND tablename='buckets')":''} ORDER BY 1,2`)).rows;
 // Only readable tables; catalog-derived identifiers, never values from fixture payloads.
 for(const {schemaname,tablename} of relations) {
  const relation=`"${schemaname.replaceAll('"','""')}"."${tablename.replaceAll('"','""')}"`;
  if(!(await db.query("SELECT has_table_privilege(current_user,$1,'SELECT') ok",[relation])).rows[0].ok) continue;
  result[`${schemaname}.${tablename}`]=(await db.query(`SELECT count(*)::integer n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM ${relation} t`)).rows[0];
 }
 result.policies=(await db.query(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN('public','storage') ${legacy?"AND policyname NOT LIKE 'mentor_material_%'":''} ORDER BY 1,2,3`)).rows;
 result.triggers=(await db.query(`SELECT tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) def FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN('public.profiles'::regclass,'auth.users'::regclass,'storage.objects'::regclass) ${legacy?"AND tgname<>'mentor_material_write_guard'":''} ORDER BY 1,2`)).rows;
 if(!legacy) {
  result.acl=(await db.query(`SELECT n.nspname,c.relname,c.relrowsecurity,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage','mentor_private') AND c.relkind IN('r','v') ORDER BY 1,2`)).rows;
  result.functions=(await db.query("SELECT oid::regprocedure::text signature,proacl::text,proconfig,md5(prosrc) source FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'mentor%' ORDER BY 1")).rows;
 }
 return result;
}
async function originalData(db,relations) {
 if(!relations) relations=(await db.query(`SELECT t.table_schema schema,t.table_name name,array_agg(c.column_name::text ORDER BY c.ordinal_position) columns FROM information_schema.tables t JOIN information_schema.columns c ON c.table_schema=t.table_schema AND c.table_name=t.table_name WHERE t.table_type='BASE TABLE' AND (t.table_schema='public' OR (t.table_schema='auth' AND t.table_name='users') OR (t.table_schema='storage' AND t.table_name IN('objects','buckets'))) GROUP BY t.table_schema,t.table_name ORDER BY 1,2`)).rows;
 const hashes={}; const quote=s=>'"'+s.replaceAll('"','""')+'"';
 for(const r of relations) {
  const qualified=`${quote(r.schema)}.${quote(r.name)}`;
  hashes[qualified]=(await db.query(`SELECT count(*)::integer n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM (SELECT ${r.columns.map(quote).join(',')} FROM ${qualified} ${r.schema==='storage'&&r.name==='buckets'?"WHERE id<>'mentor-materials'":''}) t`)).rows[0];
 }
 return {relations,hashes};
}
async function fixtures(db) {
 for(const id of ids) {
  const birth=id===minor?'2015-01-01':id===unknownBirth?null:'1995-01-01';
  await db.query(`INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at) VALUES($1,'authenticated','authenticated',$2,$3::jsonb,now(),now())`,[id,`academic-${id}@example.invalid`,JSON.stringify({name:'PRIVATE_ACCOUNT_NAME',birth_date:birth})]);
 }
 await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[banned]);
 await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1',[deleted]);
 await db.query("UPDATE public.profiles SET bio='PRIVATE_DATING_BIO',gender='PRIVATE_GENDER',photos=ARRAY['PRIVATE_PHOTO'] WHERE id=ANY($1::uuid[])",[ids]);
 for(const id of ids.filter(x=>x!==blank)) await db.query(`INSERT INTO public.mentor_profiles(id,name,course,semester,subjects,learning_subjects,format,active,institution,city,current_subjects,topics,study_preference) VALUES($1,$2,'Computação',3,ARRAY['Cálculo'],ARRAY['Física'],'online',$3,'Faculdade','Sorocaba',ARRAY['Cálculo'],ARRAY['Derivadas'],'ambos')`,[id,`Estudante ${ids.indexOf(id)}`,id!==inactive]);
}
async function permissions(db) {
 for(const role of ['anon','authenticated']) for(const table of tables) {
  for(const sql of [`SELECT * FROM public.${table}`,`INSERT INTO public.${table} DEFAULT VALUES`,`UPDATE public.${table} SET ${table==='mentor_notification_reads'?'notification_id':table==='mentor_group_members'||table==='mentor_group_invitations'?'group_id':table==='mentor_session_participants'||table==='mentor_session_reviews'?'session_id':'id'}=NULL`,`DELETE FROM public.${table}`]) await denied(()=>as(db,owner,sql,[],role));
 }
 const funcs=(await db.query(`SELECT p.oid,p.oid::regprocedure::text signature,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_exec FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'mentor_ac__%' OR p.proname=ANY($1::text[]))`,[Object.keys(signatures)])).rows;
 check(funcs.length>Object.keys(signatures).length);
 for(const f of funcs) {
  eq(f.prosecdef,true); check(f.proconfig.includes('search_path=""')); eq(f.anon_exec,false); eq(f.public_exec,false); eq(f.auth_exec,!!signatures[f.proname]);
  if(!signatures[f.proname]) {
   const args=(await db.query('SELECT format_type(t,NULL) type FROM pg_proc p,unnest(p.proargtypes::oid[]) t WHERE p.oid=$1',[f.oid])).rows;
   const sql=`SELECT public.${f.proname}(${args.map(a=>`NULL::${a.type}`).join(',')})`;
   await denied(()=>as(db,owner,sql)); await denied(()=>as(db,null,sql,[],'anon'));
  }
 }
 for(const [name,types] of Object.entries(signatures)) {
  const args=types.map(t=>t==='jsonb'?{}:t==='uuid'?randomUUID():t==='boolean'?true:t==='integer'||t==='bigint'?1:'x');
  await denied(()=>as(db,null,...call(name,args),'anon'));
  for(const id of [null,randomUUID(),minor,banned,deleted,unknownBirth,blank]) await denied(()=>rpc(db,id,name,...args));
 }
 const rls=(await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])',[tables.map(t=>`public.${t}`)])).rows;
 eq(rls.length,tables.length); check(rls.every(r=>r.relrowsecurity));
 pass('RPC/anon/ineligible matrices, direct CRUD denied, every internal helper revoked, RLS/search_path verified');
}
async function accepted(db,a=learner,b=owner,status='accepted') {
 const id=randomUUID(); await db.query('INSERT INTO public.mentor_requests(id,learner_id,mentor_id,subject,status) VALUES($1,$2,$3,$4,$5)',[id,a,b,'Cálculo',status]); return id;
}
async function groups(db) {
 for(const value of [null,[],1,'x',{},groupData({x:1}),groupData({name:' '}),groupData({name:'x'.repeat(101)}),groupData({name:1}),groupData({subject:''}),groupData({subject:'x'.repeat(81)}),groupData({topic:'x'.repeat(161)}),groupData({objective:'x'.repeat(1001)}),groupData({capacity:1}),groupData({capacity:31}),groupData({capacity:2.5}),groupData({capacity:'3'}),groupData({needs_mentor:'true'}),groupData({needs_mentor:null}),groupData({starts_at:'yesterday'}),groupData({starts_at:'infinity'}),groupData({starts_at:'2000-01-01'}),groupData({starts_at:2})]) await denied(()=>rpc(db,owner,'mentor_group_create',value),'22023');
 await scoped(db,async()=>{
  const max=await rpc(db,owner,'mentor_group_create',groupData({name:'x'.repeat(100),subject:'x'.repeat(80),topic:'x'.repeat(160),objective:'x'.repeat(1000),capacity:30,starts_at:future(),needs_mentor:false}));
  eq(max.name.length,100); eq(max.subject.length,80); eq(max.topic.length,160); eq(max.objective.length,1000); eq(max.capacity,30); eq(max.needs_mentor,false); check(new Date(max.starts_at)>new Date());
 });
 let g=await rpc(db,owner,'mentor_group_create',groupData());
 eq(Object.keys(g).sort(),groupKeys); eq(g.member_count,1); eq(g.is_member,true); eq(g.is_owner,true); eq(g.status,'open');
 const other=await rpc(db,peer,'mentor_group_create',groupData({name:'Other',capacity:2}));
 check((await rpc(db,learner,'mentor_groups')).some(x=>x.id===g.id));
 const out=await rpc(db,outsider,'mentor_group_detail',g.id); eq(out.members,[]); eq(out.messages,[]); eq(out.is_member,false);
 for(const fn of ['mentor_group_send','mentor_group_suggestions','mentor_group_invite','mentor_group_cancel']) await denied(()=>rpc(db,outsider,fn,...({mentor_group_send:[g.id,'x',randomUUID()],mentor_group_invite:[g.id,peer]}[fn]||[g.id])));
 g=await rpc(db,learner,'mentor_group_join',g.id); eq(g.member_count,2); eq(g.is_member,true); eq(g.is_owner,false);
 eq(await rpc(db,learner,'mentor_group_join',g.id),g);
 const msgid=randomUUID(); const m=await rpc(db,learner,'mentor_group_send',g.id,'  Olá grupo  ',msgid);
 eq(Object.keys(m).sort(),messageKeys); eq(m.body,'Olá grupo'); eq(await rpc(db,learner,'mentor_group_send',g.id,'Olá grupo',msgid),m);
 await denied(()=>rpc(db,learner,'mentor_group_send',g.id,'other',msgid),'22023');
 await rpc(db,learner,'mentor_group_join',other.id);
 await denied(()=>rpc(db,learner,'mentor_group_send',other.id,'Olá grupo',msgid),'22023');
 for(const body of [null,'',' \t\n','x'.repeat(2001)]) await denied(()=>rpc(db,learner,'mentor_group_send',g.id,body,randomUUID()),'22023');
 await denied(()=>rpc(db,learner,'mentor_group_send',g.id,'x',null),'22023');
 eq((await rpc(db,owner,'mentor_group_send',g.id,'x'.repeat(2000),randomUUID())).body.length,2000);
 const detail=await rpc(db,learner,'mentor_group_detail',g.id); eq(detail.members.length,2); eq(detail.messages.length,2); check(!JSON.stringify(detail).includes('PRIVATE'));
 for(const x of detail.members) eq(Object.keys(x).sort(),['id','name','course','subjects'].sort());
 eq(await rpc(db,owner,'mentor_group_invite',g.id,peer),true); eq(await rpc(db,owner,'mentor_group_invite',g.id,peer),true);
 eq((await rpc(db,owner,'mentor_group_detail',g.id)).member_count,2,'invitation never reserves a seat');
 const suggestions=await rpc(db,owner,'mentor_group_suggestions',g.id); check(suggestions.some(x=>x.id===peer)); check(suggestions.some(x=>x.id===inactive),'inactive academic learners remain compatible'); check(!suggestions.some(x=>x.id===learner));
 check((await rpc(db,peer,'mentor_notifications')).some(n=>n.group_id===g.id&&n.type==='invitation'));
 eq((await rpc(db,peer,'mentor_group_join',g.id)).member_count,3);
 await denied(()=>rpc(db,outsider,'mentor_group_join',g.id),'22023');
 await denied(()=>rpc(db,owner,'mentor_group_leave',g.id),'22023');
 eq(await rpc(db,learner,'mentor_group_leave',g.id),true); eq(await rpc(db,learner,'mentor_group_leave',g.id),true);
 eq((await rpc(db,learner,'mentor_group_detail',g.id)).messages,[]); await denied(()=>rpc(db,learner,'mentor_group_send',g.id,'left',randomUUID()));
 await rpc(db,learner,'mentor_group_join',g.id);
 for(const legacy of [false,true]) for(const reverse of [false,true]) await scoped(db,async()=>{
  const a=reverse?peer:learner,b=reverse?learner:peer;
  await db.query(`INSERT INTO public.${legacy?'blocks':'mentor_blocks'}(blocker_id,blocked_id) VALUES($1,$2)`,[a,b]);
  check(!(await rpc(db,learner,'mentor_groups')).some(x=>x.id===g.id));
  await denied(()=>rpc(db,learner,'mentor_group_detail',g.id)); await denied(()=>rpc(db,learner,'mentor_group_send',g.id,'blocked',randomUUID()));
  await denied(()=>rpc(db,learner,'mentor_group_join',g.id));
  eq(await rpc(db,learner,'mentor_group_leave',g.id),true,'blocked members can escape');
 });
 await scoped(db,async()=>{
  await db.query('INSERT INTO public.mentor_blocks(blocker_id,blocked_id) VALUES($1,$2)',[owner,outsider]);
  await denied(()=>rpc(db,outsider,'mentor_group_detail',g.id)); await denied(()=>rpc(db,owner,'mentor_group_invite',g.id,outsider)); check(!(await rpc(db,owner,'mentor_group_suggestions',g.id)).some(x=>x.id===outsider));
 });
 await scoped(db,async()=>{
  await db.query(`INSERT INTO public.mentor_group_messages(group_id,sender_id,body,client_id,created_at) SELECT $1,$2,'history-'||n,gen_random_uuid(),now()-interval '1 day'+make_interval(secs=>n) FROM generate_series(1,220) n`,[g.id,owner]);
  const history=(await rpc(db,learner,'mentor_group_detail',g.id)).messages; eq(history.length,200); check(history.every((v,i)=>!i||new Date(v.created_at)>=new Date(history[i-1].created_at)));
 });
 await scoped(db,async()=>{
  await db.query(`INSERT INTO public.mentor_study_groups(owner_id,name,subject,topic,objective,capacity) SELECT $1,'limit-'||n,'Cálculo','','',2 FROM generate_series(1,105) n`,[owner]); eq((await rpc(db,learner,'mentor_groups')).length,100);
 });
 await scoped(db,async()=>{
  eq(await rpc(db,owner,'mentor_group_cancel',g.id),true); eq(await rpc(db,owner,'mentor_group_cancel',g.id),true);
  eq((await rpc(db,learner,'mentor_group_detail',g.id)).messages,[]); await denied(()=>rpc(db,learner,'mentor_group_join',g.id),'22023'); await denied(()=>rpc(db,outsider,'mentor_group_detail',g.id)); await denied(()=>rpc(db,learner,'mentor_group_send',g.id,'x',randomUUID()));
 });
 pass('group validation, contract, ownership, capacity/idempotency, invites, bounds, both blocking systems, left/cancelled privacy');
 return g.id;
}
async function agenda(db,g,r,pending) {
 const data=sessionData(r,null);
 for(const value of [null,[],{}, {...data,x:1},{...data,request_id:null},{...data,group_id:g},{...data,request_id:'oops'},{...data,id:'oops'},{...data,title:' '},{...data,title:'x'.repeat(101)},{...data,subject:'Física'},{...data,subject:'x'.repeat(81)},{...data,topic:'x'.repeat(161)},{...data,location:'x'.repeat(201)},{...data,format:'remote'},{...data,format:null},{...data,duration_minutes:14},{...data,duration_minutes:241},{...data,duration_minutes:15.5},{...data,duration_minutes:'60'},{...data,starts_at:null},{...data,starts_at:'infinity'},{...data,starts_at:'2000-01-01'},{...data,starts_at:'invalid'}]) await denied(()=>rpc(db,learner,'mentor_session_save',value),'22023');
 await denied(()=>rpc(db,outsider,'mentor_session_save',data)); await denied(()=>rpc(db,learner,'mentor_session_save',sessionData(pending,null)));
 await scoped(db,async()=>{
  const max=await rpc(db,learner,'mentor_session_save',{...data,title:'x'.repeat(100),topic:'x'.repeat(160),location:'x'.repeat(200),duration_minutes:240});
  eq(max.title.length,100); eq(max.topic.length,160); eq(max.location.length,200); eq(max.duration_minutes,240);
  await db.query("UPDATE public.mentor_study_sessions SET starts_at=now()-interval '5 hours' WHERE id=$1",[max.id]);
  eq((await rpc(db,learner,'mentor_sessions')).find(x=>x.id===max.id).can_review,false,'past pending session cannot be reviewed'); await denied(()=>rpc(db,learner,'mentor_review',max.id,5,'pending'),'22023');
 });
 let s=await rpc(db,learner,'mentor_session_save',data); eq(Object.keys(s).sort(),sessionKeys); eq(s.my_response,'confirmed'); eq(s.status,'pending'); eq(s.mentor_id,owner); eq(s.can_review,false); eq(s.participants.length,2); eq(s.is_creator,true);
 for(const p of s.participants) eq(Object.keys(p).sort(),['id','name','response'].sort());
 check(!(await rpc(db,outsider,'mentor_sessions')).some(x=>x.id===s.id));
 await denied(()=>rpc(db,outsider,'mentor_session_respond',s.id,true)); await denied(()=>rpc(db,owner,'mentor_session_cancel',s.id)); await denied(()=>rpc(db,owner,'mentor_session_save',{...data,id:s.id}));
 await denied(()=>rpc(db,learner,'mentor_session_save',{...data,id:s.id,request_id:null,group_id:g}),'22023');
 await denied(()=>rpc(db,owner,'mentor_session_respond',s.id,null),'22023');
 s=await rpc(db,owner,'mentor_session_respond',s.id,true); eq(s.status,'confirmed'); eq(s.is_creator,false); eq(s.my_response,'confirmed'); eq(s.can_review,false);
 eq((await rpc(db,owner,'mentor_session_respond',s.id,true)).status,'confirmed');
 eq((await rpc(db,learner,'mentor_session_respond',s.id,false)).status,'pending','creator may decline');
 eq((await rpc(db,learner,'mentor_session_respond',s.id,true)).status,'confirmed');
 await denied(()=>rpc(db,learner,'mentor_review',s.id,5,'Early'),'22023');
 const oldNotifications=await rpc(db,owner,'mentor_notifications');
 s=await rpc(db,learner,'mentor_session_save',{...data,id:s.id,topic:'Integrais',duration_minutes:15}); eq(s.status,'pending'); eq(s.my_response,'confirmed'); eq(s.participants.find(x=>x.id===owner).response,'pending');
 const newNotifications=await rpc(db,owner,'mentor_notifications');
 check(newNotifications.some(n=>n.session_id===s.id&&n.type==='session'&&!oldNotifications.some(o=>o.id===n.id)),'reschedule gets a distinct stable event id');
 eq((await rpc(db,owner,'mentor_session_respond',s.id,true)).status,'confirmed');
 await scoped(db,async()=>{
  await db.query("UPDATE public.mentor_study_sessions SET starts_at=now()-interval '2 hours',duration_minutes=60 WHERE id=$1",[s.id]);
  const mine=(await rpc(db,learner,'mentor_sessions')).find(x=>x.id===s.id); eq(mine.can_review,true); eq((await rpc(db,owner,'mentor_sessions')).find(x=>x.id===s.id).can_review,false);
  await denied(()=>rpc(db,learner,'mentor_session_respond',s.id,true),'22023'); await denied(()=>rpc(db,learner,'mentor_session_respond',s.id,false),'22023'); await denied(()=>rpc(db,learner,'mentor_session_save',{...data,id:s.id}),'22023'); await denied(()=>rpc(db,learner,'mentor_session_cancel',s.id),'22023');
  for(const [rating,comment] of [[null,'x'],[0,'x'],[6,'x'],[5,null],[5,'x'.repeat(1001)]]) await denied(()=>rpc(db,learner,'mentor_review',s.id,rating,comment),'22023');
  await denied(()=>rpc(db,owner,'mentor_review',s.id,5,'self'),'22023'); await denied(()=>rpc(db,outsider,'mentor_review',s.id,5,'outside'));
  eq(await rpc(db,learner,'mentor_review',s.id,5,'  Excelente  '),true); eq(await rpc(db,learner,'mentor_review',s.id,5,'Excelente'),true);
  await denied(()=>rpc(db,learner,'mentor_review',s.id,4,'Change'),'22023'); eq((await rpc(db,learner,'mentor_sessions')).find(x=>x.id===s.id).can_review,false);
  const reviews=await rpc(db,outsider,'mentor_reviews',owner); eq(reviews.count,1); eq(reviews.average,5); eq(Object.keys(reviews.items[0]).sort(),['rating','comment','reviewer_name','created_at'].sort()); check(!JSON.stringify(reviews).includes('PRIVATE'));
  await db.query('INSERT INTO public.mentor_blocks(blocker_id,blocked_id) VALUES($1,$2)',[outsider,learner]); eq((await rpc(db,outsider,'mentor_reviews',owner)).count,0);
  await db.query('INSERT INTO public.mentor_blocks(blocker_id,blocked_id) VALUES($1,$2)',[owner,learner]); eq((await rpc(db,learner,'mentor_reviews',owner)).count,0); await denied(()=>rpc(db,learner,'mentor_review',s.id,5,'Excelente'));
 });
 await scoped(db,async()=>{
  eq(await rpc(db,learner,'mentor_session_cancel',s.id),true); eq(await rpc(db,learner,'mentor_session_cancel',s.id),true); eq((await rpc(db,owner,'mentor_sessions')).find(x=>x.id===s.id).status,'cancelled');
  await denied(()=>rpc(db,owner,'mentor_session_respond',s.id,true),'22023'); await denied(()=>rpc(db,learner,'mentor_session_save',{...data,id:s.id}),'22023');
 });
 const gd=sessionData(null,g); await denied(()=>rpc(db,learner,'mentor_session_save',gd));
 let gs=await rpc(db,owner,'mentor_session_save',gd); eq(gs.participants.length,3); eq(gs.status,'pending'); eq(gs.mentor_id,owner);
 await rpc(db,learner,'mentor_session_respond',gs.id,true); gs=await rpc(db,peer,'mentor_session_respond',gs.id,true); eq(gs.status,'confirmed');
 await scoped(db,async()=>{
  await db.query("UPDATE public.mentor_study_sessions SET starts_at=now()-interval '2 hours' WHERE id=$1",[gs.id]);
  eq((await rpc(db,learner,'mentor_sessions')).find(x=>x.id===gs.id).can_review,true); eq(await rpc(db,learner,'mentor_review',gs.id,4,'Bom grupo'),true); eq((await rpc(db,outsider,'mentor_reviews',owner)).average,4);
 });
 await scoped(db,async()=>{
  await rpc(db,peer,'mentor_group_leave',g); check(!(await rpc(db,peer,'mentor_sessions')).some(x=>x.id===gs.id)); await denied(()=>rpc(db,peer,'mentor_session_respond',gs.id,true)); eq((await rpc(db,owner,'mentor_sessions')).find(x=>x.id===gs.id).status,'pending');
  const updated=await rpc(db,owner,'mentor_session_save',{...gd,id:gs.id}); eq(updated.participants.length,2); eq(updated.participants.find(x=>x.id===learner).response,'pending');
  await rpc(db,outsider,'mentor_group_join',g); check(!(await rpc(db,outsider,'mentor_sessions')).some(x=>x.id===gs.id),'new members do not inherit prior participant snapshots');
  const rescheduled=await rpc(db,owner,'mentor_session_save',{...gd,id:gs.id}); eq(rescheduled.participants.length,3); eq(rescheduled.participants.find(x=>x.id===outsider).response,'pending');
 });
 await scoped(db,async()=>{
  await rpc(db,owner,'mentor_group_cancel',g); eq((await rpc(db,owner,'mentor_sessions')).find(x=>x.id===gs.id).status,'cancelled'); await denied(()=>rpc(db,learner,'mentor_session_respond',gs.id,true));
 });
 for(const legacy of [true,false]) for(const reverse of [true,false]) await scoped(db,async()=>{
  await db.query(`INSERT INTO public.${legacy?'blocks':'mentor_blocks'}(blocker_id,blocked_id) VALUES($1,$2)`,reverse?[owner,learner]:[learner,owner]);
  check(!(await rpc(db,learner,'mentor_sessions')).some(x=>[s.id,gs.id].includes(x.id))); await denied(()=>rpc(db,learner,'mentor_session_respond',s.id,true)); await denied(()=>rpc(db,learner,'mentor_session_save',data)); await denied(()=>rpc(db,learner,'mentor_session_cancel',s.id));
 });
 pass('agenda contracts/accepted contexts, confirmation/reset, snapshot membership, ownership, cancellation, review eligibility and duplicate/block filtering');
 return {individual:s.id,group:gs.id};
}
async function upload(db,id,p,mime='application/pdf',size=123,ownerId=id) {
 return as(db,id,`INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES('mentor-materials',$1,$2,$3::jsonb) RETURNING id`,[p.path,ownerId,JSON.stringify({mimetype:mime,size})]);
}
async function readObject(db,id,p,role='authenticated') { return (await as(db,id,"SELECT name FROM storage.objects WHERE bucket_id='mentor-materials' AND name=$1",[p.path],role)).rows; }
async function materials(db,g,r,pending) {
 const bucket=(await db.query("SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='mentor-materials'")).rows[0]; eq(bucket.public,false); eq(Number(bucket.file_size_limit),10485760); eq(bucket.allowed_mime_types.length,8);
 for(const [name,mime,size] of [[null,'application/pdf',1],['../x.pdf','application/pdf',1],['x\\y.pdf','application/pdf',1],['x\ny.pdf','application/pdf',1],['.x.pdf','application/pdf',1],['a'.repeat(180)+'.pdf','application/pdf',1],['bad.html','text/html',1],['bad.svg','image/svg+xml',1],['bad.exe','application/octet-stream',1],['x.pdf','text/html',1],['x.png','application/pdf',1],['x.pdf','application/pdf',0],['x.pdf','application/pdf',10485761],['x.pdf','application/pdf',null],[' x.pdf','application/pdf',1],['x?.pdf','application/pdf',1]]) await denied(()=>rpc(db,learner,'mentor_file_prepare',r,null,name,mime,size),'22023');
 for(const args of [[null,null],[r,g]]) { await denied(()=>rpc(db,learner,'mentor_file_prepare',...args,'x.pdf','application/pdf',1),'22023'); await denied(()=>rpc(db,learner,'mentor_files',...args),'22023'); }
 await denied(()=>rpc(db,outsider,'mentor_file_prepare',r,null,'x.pdf','application/pdf',1)); await denied(()=>rpc(db,learner,'mentor_file_prepare',pending,null,'x.pdf','application/pdf',1)); await denied(()=>rpc(db,outsider,'mentor_files',r,null)); await denied(()=>rpc(db,outsider,'mentor_files',null,g));
 const types=[['pdf','application/pdf'],['doc','application/msword'],['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['ppt','application/vnd.ms-powerpoint'],['pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],['jpg','image/jpeg'],['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']];
 for(const [ext,mime] of types) {
  const p=await rpc(db,learner,'mentor_file_prepare',r,null,`Aula.${ext.toUpperCase()}`,mime,10485760); eq(p.bucket,'mentor-materials'); check(p.path.startsWith(`${learner}/`)); check(p.path.endsWith(`.${ext}`)); eq(await rpc(db,learner,'mentor_file_abort',p.id),true); eq(await rpc(db,learner,'mentor_file_abort',p.id),true);
 }
 const p=await rpc(db,learner,'mentor_file_prepare',r,null,'Notas.pdf','application/pdf',123); eq(Object.keys(p).sort(),['id','path','bucket'].sort());
 eq(await rpc(db,learner,'mentor_files',r,null),[]); await denied(()=>rpc(db,learner,'mentor_file_commit',p.id),'22023'); await denied(()=>rpc(db,owner,'mentor_file_commit',p.id)); await denied(()=>rpc(db,owner,'mentor_file_abort',p.id));
 await denied(()=>upload(db,outsider,p)); await denied(()=>upload(db,learner,{path:`${learner}/${randomUUID()}.pdf`})); await denied(()=>upload(db,learner,p,'text/html')); await denied(()=>upload(db,learner,p,'application/pdf',124)); await denied(()=>upload(db,learner,p,'application/pdf',123,owner));
 const preflight=(id,metadata,version='1')=>as(db,id,"INSERT INTO storage.objects(bucket_id,name,owner_id,metadata,version) VALUES('mentor-materials',$1,$2,$3::jsonb,$4)",[p.path,id,JSON.stringify(metadata),version]);
 for(const metadata of [null,{}, {mimetype:'application/pdf',contentLength:123}, {mimetype:'application/pdf',contentLength:555}]) await scoped(db,async()=>{
  eq((await preflight(learner,metadata)).rowCount,1,'Storage permission probe accepts incomplete pre-stream metadata');
  await denied(()=>rpc(db,learner,'mentor_file_commit',p.id),'22023'); eq((await readObject(db,owner,p)).length,0,'preflight does not expose a shared file');
 });
 await denied(()=>preflight(outsider,{})); await denied(()=>preflight(learner,{mimetype:'text/html'})); await denied(()=>preflight(learner,{mimetype:'application/pdf',size:124})); await denied(()=>preflight(learner,{},randomUUID())); await denied(()=>preflight(learner,{},null));
 await upload(db,learner,p); eq((await readObject(db,learner,p)).length,1); eq((await readObject(db,owner,p)).length,0,'prepared files private even to peers'); eq(await readObject(db,null,p,'anon'),[]);
 await denied(()=>rpc(db,learner,'mentor_file_abort',p.id),'22023');
 eq((await as(db,learner,"UPDATE storage.objects SET metadata=metadata WHERE bucket_id='mentor-materials' AND name=$1",[p.path])).rowCount,0,'overwrites denied');
 const f=await rpc(db,learner,'mentor_file_commit',p.id); eq(Object.keys(f).sort(),fileKeys); eq(f.size,123); eq(await rpc(db,learner,'mentor_file_commit',p.id),f);
 eq((await rpc(db,owner,'mentor_files',r,null)).length,1); eq((await readObject(db,owner,p)).length,1,'signed URL SELECT allowed to accepted peer'); eq((await readObject(db,outsider,p)).length,0); eq(await readObject(db,null,p,'anon'),[]);
 eq((await as(db,learner,"DELETE FROM storage.objects WHERE bucket_id='mentor-materials' AND name=$1",[p.path])).rowCount,0,'lost commit response cannot delete committed bytes'); await denied(()=>rpc(db,learner,'mentor_file_abort',p.id),'22023');
 const abandoned=await rpc(db,learner,'mentor_file_prepare',r,null,'Abandon.pdf','application/pdf',123); await upload(db,learner,abandoned);
 eq((await as(db,learner,"DELETE FROM storage.objects WHERE bucket_id='mentor-materials' AND name=$1",[abandoned.path])).rowCount,1); eq(await rpc(db,learner,'mentor_file_abort',abandoned.id),true);
 const gp=await rpc(db,learner,'mentor_file_prepare',null,g,'Grupo.pdf','application/pdf',123); await upload(db,learner,gp); await rpc(db,learner,'mentor_file_commit',gp.id); eq((await readObject(db,peer,gp)).length,1); eq((await rpc(db,owner,'mentor_files',null,g)).length,1);
 await scoped(db,async()=>{
  await rpc(db,learner,'mentor_group_leave',g); eq((await readObject(db,learner,gp)).length,0); eq((await readObject(db,owner,gp)).length,0,'left uploader cannot leave shared material accessible'); eq(await rpc(db,owner,'mentor_files',null,g),[]); await denied(()=>rpc(db,learner,'mentor_files',null,g));
 });
 await scoped(db,async()=>{ await rpc(db,owner,'mentor_group_cancel',g); eq((await readObject(db,learner,gp)).length,0); await denied(()=>rpc(db,owner,'mentor_files',null,g)); });
 for(const legacy of [true,false]) for(const reverse of [true,false]) await scoped(db,async()=>{
  await db.query(`INSERT INTO public.${legacy?'blocks':'mentor_blocks'}(blocker_id,blocked_id) VALUES($1,$2)`,reverse?[owner,learner]:[learner,owner]);
  eq((await readObject(db,owner,p)).length,0); eq((await readObject(db,learner,p)).length,0); eq((await readObject(db,owner,gp)).length,0); await denied(()=>rpc(db,learner,'mentor_files',r,null)); await denied(()=>rpc(db,learner,'mentor_file_commit',p.id));
 });
 await scoped(db,async()=>{
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[learner]); eq((await readObject(db,owner,p)).length,0); eq((await readObject(db,learner,p)).length,0); eq((await readObject(db,peer,gp)).length,0);
 });
 // Existing broad policies must not accidentally make this private bucket public/writable.
 await scoped(db,async()=>{
  await db.query('CREATE POLICY academic_fixture_broad ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true)');
  eq((await readObject(db,outsider,p)).length,0); eq(await readObject(db,null,p,'anon'),[]); await denied(()=>upload(db,outsider,p));
  eq((await as(db,learner,"DELETE FROM storage.objects WHERE bucket_id='mentor-materials' AND name=$1",[p.path])).rowCount,0);
  eq((await as(db,learner,"UPDATE storage.objects SET metadata=metadata WHERE bucket_id='mentor-materials' AND name=$1",[p.path])).rowCount,0);
  const b=`academic-fixture-${randomUUID()}`; await db.query('INSERT INTO storage.buckets(id,name,public) VALUES($1,$1,true)',[b]);
  await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',[b,'public.txt']);
  eq((await as(db,null,'SELECT name FROM storage.objects WHERE bucket_id=$1',[b],'anon')).rows.length,1,'unrelated bucket policies preserved');
 });
 await scoped(db,async()=>{
  for(let i=1;i<50;i++) await rpc(db,learner,'mentor_file_prepare',r,null,`limit-${i}.pdf`,'application/pdf',1);
  await denied(()=>rpc(db,owner,'mentor_file_prepare',r,null,'overflow.pdf','application/pdf',1),'22023');
 });
 pass('private bucket whitelist/size/path limits; real role Storage SELECT/INSERT/DELETE/UPDATE; metadata commit/abort retries; blocks, cancellation, left member, broad-policy isolation');
 return {request:p,group:gp};
}
async function notifications(db,g,r,s,files) {
 const all=await rpc(db,owner,'mentor_notifications'); check(all.length>0); check(all.length<=100);
 check(all.some(n=>n.type==='accepted'&&n.request_id===r)); check(all.some(n=>n.type==='file'&&n.id===`file:${files.request.id}`)); check(all.some(n=>n.type==='upcoming'&&n.session_id===s.individual));
 for(const n of all) { eq(Object.keys(n).sort(),['id','type','title','body','request_id','group_id','session_id','created_at','is_read'].sort()); check(n.id.length<=200); eq(n.is_read,false); check(!JSON.stringify(n).includes('PRIVATE')); }
 eq(await rpc(db,owner,'mentor_notification_read',all[0].id),true); eq(await rpc(db,owner,'mentor_notification_read',all[0].id),true); eq((await rpc(db,owner,'mentor_notifications')).find(n=>n.id===all[0].id).is_read,true);
 await denied(()=>rpc(db,outsider,'mentor_notification_read',all[0].id)); await denied(()=>rpc(db,owner,'mentor_notification_read','arbitrary')); await denied(()=>rpc(db,owner,'mentor_notification_read','x'.repeat(201)),'22023');
 const common=all.find(n=>n.type==='accepted'&&n.request_id===r); await rpc(db,owner,'mentor_notification_read',common.id); eq((await rpc(db,learner,'mentor_notifications')).find(n=>n.id===common.id).is_read,false,'reads scoped by actor');
 const request=await accepted(db,fourth,owner,'pending'); check((await rpc(db,owner,'mentor_notifications')).some(n=>n.id===`request:${request}`)); check(!(await rpc(db,learner,'mentor_notifications')).some(n=>n.id===`request:${request}`));
 await scoped(db,async()=>{
  await db.query(`INSERT INTO public.mentor_messages(request_id,sender_id,body,client_id) SELECT $1,$2,'new-'||n,gen_random_uuid() FROM generate_series(1,105) n`,[r,learner]);
  const capped=await rpc(db,owner,'mentor_notifications'); eq(capped.length,100); check(capped.every(n=>n.type==='message'));
 });
 await scoped(db,async()=>{
  await db.query('INSERT INTO public.mentor_blocks(blocker_id,blocked_id) VALUES($1,$2)',[owner,learner]); const hidden=await rpc(db,owner,'mentor_notifications'); check(!hidden.some(n=>n.request_id===r||n.group_id===g)); await denied(()=>rpc(db,owner,'mentor_notification_read',common.id));
 });
 eq((await rpc(db,outsider,'mentor_notifications')).length,0);
 pass('notifications relevance/stable ids/max100, upcoming changes, personal read state, blocked/outsider isolation');
}
async function concurrency(db) {
 // Other connections cannot see uncommitted fixtures/DDL. Hold the very same advisory
 // keys in a second transaction, then prove each real RPC waits and rechecks on release.
 // This validates actual PostgreSQL cross-session serialization without committing fixtures.
 const holder=client(); await holder.connect();
 const g=randomUUID(),r=randomUUID(),s=randomUUID(),f=randomUUID();
 await db.query('INSERT INTO public.mentor_study_groups(id,owner_id,name,subject,topic,objective,capacity) VALUES($1,$2,$3,$4,$5,$6,2)',[g,owner,'Concurrency','Cálculo','','']);
 await db.query('INSERT INTO public.mentor_group_members(group_id,user_id) VALUES($1,$2)',[g,owner]);
 await db.query("INSERT INTO public.mentor_requests(id,learner_id,mentor_id,subject,status) VALUES($1,$2,$3,'Cálculo','accepted')",[r,learner,owner]);
 await db.query("INSERT INTO public.mentor_study_sessions(id,request_id,created_by,title,subject,topic,starts_at,duration_minutes,location,format) VALUES($1,$2,$3,'Concurrency','Cálculo','',now()+interval '1 day',60,'','online')",[s,r,learner]);
 await db.query("INSERT INTO public.mentor_session_participants(session_id,user_id,response) VALUES($1,$2,'confirmed'),($1,$3,'pending')",[s,learner,owner]);
 const actions=[['join','mentor_group_join',[g],learner,g],['send','mentor_group_send',[g,'hi',randomUUID()],owner,g],['cancel-group','mentor_group_cancel',[g],owner,g],['invite','mentor_group_invite',[g,peer],owner,g],['session-save','mentor_session_save',[sessionData(r,null)],learner,null],['session-response','mentor_session_respond',[s,true],owner,null],['file-prepare','mentor_file_prepare',[r,null,'lock.pdf','application/pdf',123],learner,null]];
 try {
  for(const [label,name,args,actor,group] of actions) for(const account of group?[null,owner]:[learner,owner]) {
   await db.query('SAVEPOINT contention'); await holder.query('BEGIN');
   const key=account?`spark:mentor:${account}`:`spark:mentor:group:${group}`;
   await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
   const pid=(await db.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   let settled=false; const work=rpc(db,actor,name,...args).then(result=>({result}),error=>({error})).finally(()=>{settled=true;});
   await new Promise(resolve=>setTimeout(resolve,130));
   const waits=(await holder.query("SELECT wait_event_type='Lock' AND wait_event='advisory' waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting;
   const blockedBeforeRelease=!settled;
   await holder.query('ROLLBACK'); const done=await work;
   if(done.error) throw done.error; check(waits&&blockedBeforeRelease,`${label} waits on shared ${account?'account':'group'} lock`);
   await db.query('ROLLBACK TO SAVEPOINT contention'); await db.query('RELEASE SAVEPOINT contention');
  }
  // A capacity-2 group has exactly one final seat, checked under the same group lock.
  eq((await rpc(db,learner,'mentor_group_join',g)).member_count,2); await denied(()=>rpc(db,peer,'mentor_group_join',g),'22023');
  eq((await rpc(db,learner,'mentor_group_join',g)).member_count,2);
  // Structural guards are part of the concurrency contract (UUID retries cannot race).
  const indexes=(await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN('mentor_group_messages','mentor_group_members','mentor_session_reviews') AND indexdef LIKE 'CREATE UNIQUE%'")).rows;
  check(indexes.length>=4);
  pass('14 cross-session account/group lock contentions; atomic final-seat and duplicate constraints; no fixtures committed');
 } finally { await holder.query('ROLLBACK').catch(()=>{}); await holder.end(); }
}
async function validate(db,runMigration=true) {
 const before=await fingerprint(db); const original=await originalData(db); const legacyBefore=await fingerprint(db,true);
 try {
  await db.query('BEGIN'); if(runMigration) { await db.query(stripped); await db.query(stripped); }
  eq((await originalData(db,original.relations)).hashes,original.hashes,'migration preserves every preexisting column/row, including core mentorship data');
  eq(await fingerprint(db,true),legacyBefore,'migration preserves legacy data and security inside the transaction');
  // Storage API sets this guard for its DELETE statements. Exercise its RLS as the
  // authenticated caller, on transaction-local metadata rows only (never real bytes).
  await db.query("SET LOCAL storage.allow_delete_query='true'");
  const legacy=await fingerprint(db,true);
  await fixtures(db); await permissions(db);
  await db.query('SAVEPOINT sequential_suite');
  const g=await groups(db); const r=await accepted(db); const pending=await accepted(db,learner,peer,'pending');
  const s=await agenda(db,g,r,pending); const f=await materials(db,g,r,pending); await notifications(db,g,r,s,f);
  await db.query('ROLLBACK TO SAVEPOINT sequential_suite'); await db.query('RELEASE SAVEPOINT sequential_suite');
  await concurrency(db);
  // The transaction boundary is the authoritative fixture cleanup; no external Storage object was created.
  check(legacy.policies.every(p=>!p.policyname.startsWith('mentor_material_')));
 } finally {
  await db.query('ROLLBACK');
  eq(await fingerprint(db),before,'original data, Auth, Storage, policies, triggers, ACLs and functions unchanged');
  pass('all fixtures, migration DDL and test Storage rows rolled back; original data/security fingerprints unchanged');
 }
}
async function httpsSmoke(db) {
 const {createClient}=require('@supabase/supabase-js');
 const source=fs.readFileSync(path.join(__dirname,'..','mentorship.js'),'utf8');
 const url=source.match(/\bconst\s+URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
 const key=source.match(/\bconst\s+KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
 check(url==='https://drvqiiddgcgvmbbnwdky.supabase.co'&&key?.startsWith('sb_publishable_'),'authorized project and publishable SDK only');
 const run=randomUUID(); const tag=`mentor-academic-https:${run}`;
 const people=Array.from({length:3},(_,i)=>{const id=randomUUID();return {id,email:`mentor-academic-https-${id}@example.invalid`,password:`${randomUUID()}${randomUUID()}Aa1!`,name:`Academic HTTPS ${i}`};});
 const owned=people.map(p=>p.id); const clients=[]; const prepared=[]; const observed=new Set();
 const before=await fingerprint(db); const original=await originalData(db); let inserted=false; let signedChecks=0; let uploaded=0;
 async function transport(input,init={}) {
  const endpoint=new URL(typeof input==='string'?input:input.url||input.toString());
  check(endpoint.origin===url,'SDK uses only authorized HTTPS origin');
  const headers=new Headers(init.headers||input.headers); const authorization=headers.get('authorization')||'';
  if(authorization.startsWith('Bearer ')&&authorization.slice(7).split('.').length===3) {
   const claims=JSON.parse(Buffer.from(authorization.slice(7).split('.')[1],'base64url').toString());
   if(claims.role==='authenticated') check(owned.includes(claims.sub),'all authenticated HTTPS calls belong to disposable accounts');
  }
  const result=await fetch(input,{...init,signal:AbortSignal.timeout(20000)});
  if(result.ok&&endpoint.pathname.startsWith('/rest/v1/rpc/')) observed.add(endpoint.pathname.split('/').at(-1));
  return result;
 }
 const sdk=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}});
 function success(result,label) { if(result.error) throw new Error(`${label} failed (${result.error.code||result.error.statusCode||result.error.status||'SDK error'})`); assertions++;return result.data; }
 async function remote(c,name,args={}) {return success(await c.rpc(name,args),name);}
 const failure=result=>{check(Boolean(result.error),'remote request denied'); return result.error;};
 function pdf() {
  let text='%PDF-1.4\n'; const offsets=[0]; const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>','<< /Length 4 >>\nstream\nq\nQ\nendstream'];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(text); text+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('');
  text+=`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(text);
 }
 const bytes=pdf();
 try {
  await db.query('BEGIN');
  try {
   for(const p of people) {
    await db.query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
     VALUES('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf',10)),now(),'','','','','{"provider":"email","providers":["email"]}'::jsonb,$4::jsonb,now(),now())`,[p.id,p.email,p.password,JSON.stringify({name:p.name,birth_date:'1995-01-01',backend_fixture:tag})]);
    await db.query(`INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) VALUES($1::text,$1::uuid,$2::jsonb,'email',now(),now())`,[p.id,JSON.stringify({sub:p.id,email:p.email,email_verified:true,phone_verified:false})]);
   }
   await db.query('COMMIT'); inserted=true;
  } catch(e) {await db.query('ROLLBACK');throw e;}
  for(const p of people) {
   const c=sdk();clients.push(c); const login=success(await c.auth.signInWithPassword({email:p.email,password:p.password}),'disposable Auth password login'); eq(login.user.id,p.id);check(Boolean(login.session?.access_token));
  }
  const [organizer,student,outside]=clients; const subject=`Cálculo HTTPS ${run.slice(0,8)}`;
  for(let i=0;i<people.length;i++) {
   const p=people[i]; const profile=await remote(clients[i],'mentor_save',{p_profile:{name:p.name,course:'Computação',semester:3,bio:'Disposable HTTPS validation',subjects:[subject],learning_subjects:[subject],availability:'Durante o teste',format:'online',photo_url:'',active:i===0,institution:'Instituição de teste',city:'Sorocaba',current_subjects:[subject],topics:['Derivadas'],study_preference:'ambos'}});
   eq(profile.id,p.id); eq((await remote(clients[i],'mentor_me')).id,p.id);
  }
  pass('HTTPS: three disposable adult Auth password logins and persisted academic profiles; no participant account used');
  let request=await remote(student,'mentor_request',{p_mentor:people[0].id,p_subject:subject}); eq(request.status,'pending');
  const incoming=await remote(organizer,'mentor_notifications');check(incoming.some(n=>n.id===`request:${request.id}`));
  request=await remote(organizer,'mentor_respond',{p_request:request.id,p_accept:true});eq(request.status,'accepted');
  const sent=await remote(student,'mentor_send',{p_request:request.id,p_body:'Mensagem acadêmica HTTPS',p_client_id:randomUUID()});
  check((await remote(organizer,'mentor_messages',{p_request:request.id})).some(m=>m.id===sent.id));
  failure(await outside.rpc('mentor_messages',{p_request:request.id}));
  const group=await remote(organizer,'mentor_group_create',{p_group:{...groupData(),name:`Academic HTTPS ${run.slice(0,8)}`,subject,capacity:3}});
  await remote(organizer,'mentor_group_invite',{p_group:group.id,p_user:people[1].id});
  const invites=await remote(student,'mentor_notifications'); const invitation=invites.find(n=>n.group_id===group.id&&n.type==='invitation');check(Boolean(invitation));
  await remote(student,'mentor_notification_read',{p_id:invitation.id}); eq((await remote(student,'mentor_notifications')).find(n=>n.id===invitation.id).is_read,true);
  eq((await remote(outside,'mentor_group_detail',{p_group:group.id})).messages,[]);
  await remote(student,'mentor_group_join',{p_group:group.id});
  const groupMessage=await remote(student,'mentor_group_send',{p_group:group.id,p_body:'Conversa do grupo via HTTPS',p_client_id:randomUUID()});
  check((await remote(organizer,'mentor_group_detail',{p_group:group.id})).messages.some(m=>m.id===groupMessage.id));
  failure(await outside.rpc('mentor_group_send',{p_group:group.id,p_body:'Outsider',p_client_id:randomUUID()}));
  const session=await remote(student,'mentor_session_save',{p_session:{...sessionData(request.id,null),subject}});
  eq((await remote(organizer,'mentor_session_respond',{p_session:session.id,p_accept:true})).status,'confirmed');
  const gs=await remote(organizer,'mentor_session_save',{p_session:{...sessionData(null,group.id),subject}});
  eq((await remote(student,'mentor_session_respond',{p_session:gs.id,p_accept:true})).status,'confirmed');
  const agenda=await remote(student,'mentor_sessions');check(agenda.some(s=>s.id===session.id));check(agenda.some(s=>s.id===gs.id));eq(agenda.find(s=>s.id===session.id).can_review,false);
  eq((await remote(outside,'mentor_sessions')).filter(s=>[session.id,gs.id].includes(s.id)),[]);
  eq((await remote(student,'mentor_reviews',{p_user:people[0].id})).count,0,'real review retrieval; no artificial completed session');
  failure(await student.rpc('mentor_review',{p_session:session.id,p_rating:5,p_comment:'Too early'}));
  pass('HTTPS: accepted request/text, group invitation/join/chat, confirmed individual/group agenda and real review retrieval; outsider denied');
  for(const context of [{p_request:request.id,p_group:null},{p_request:null,p_group:group.id}]) {
   const item=await remote(student,'mentor_file_prepare',{...context,p_name:'Academic.pdf',p_mime:'application/pdf',p_size:bytes.length});
   prepared.push({...item,user:1});eq(item.bucket,'mentor-materials');check(item.path.startsWith(`${people[1].id}/`));
   success(await student.storage.from(item.bucket).upload(item.path,bytes,{contentType:'application/pdf',upsert:false}),'private PDF HTTP upload');uploaded++;
   const committed=await remote(student,'mentor_file_commit',{p_file:item.id});eq(committed.size,bytes.length);
   const listed=await remote(organizer,'mentor_files',context);check(listed.some(f=>f.id===item.id));
   eq((await remote(student,'mentor_file_commit',{p_file:item.id})).id,item.id,'commit retry over HTTPS');
   failure(await outside.rpc('mentor_files',context));
   failure(await outside.storage.from(item.bucket).createSignedUrl(item.path,60));
   const signed=success(await organizer.storage.from(item.bucket).createSignedUrl(item.path,60),'private 60-second signed URL');
   const signedUrl=new URL(signed.signedUrl);eq(signedUrl.origin,url);check(signedUrl.pathname.includes('/object/sign/'));
   const token=signedUrl.searchParams.get('token');check(Boolean(token));
   const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());check(claims.exp-claims.iat<=60,'signed capability lifetime bounded to 60 seconds');
   const response=await fetch(signedUrl,{signal:AbortSignal.timeout(20000)});eq(response.status,200);check(response.headers.get('content-type')?.includes('application/pdf'));eq(Buffer.from(await response.arrayBuffer()),bytes);signedChecks++;
   const publicResponse=await fetch(`${url}/storage/v1/object/public/${item.bucket}/${item.path}`,{signal:AbortSignal.timeout(20000)});check(!publicResponse.ok,'no anonymous public file URL');await publicResponse.arrayBuffer();
   // The UI's failure cleanup must never remove bytes after a successful lost-response commit.
   await student.storage.from(item.bucket).remove([item.path]);
   eq((await db.query("SELECT count(*)::integer n FROM storage.objects WHERE bucket_id='mentor-materials' AND name=$1",[item.path])).rows[0].n,1,'committed object survives client removal');
  }
  const notes=await remote(organizer,'mentor_notifications');check(notes.some(n=>n.type==='file'&&n.request_id===request.id));check(notes.some(n=>n.type==='file'&&n.group_id===group.id));check(notes.some(n=>n.type==='group_message'&&n.group_id===group.id));
  const read=notes.find(n=>n.request_id===request.id);await remote(organizer,'mentor_notification_read',{p_id:read.id});eq((await remote(organizer,'mentor_notifications')).find(n=>n.id===read.id).is_read,true);failure(await outside.rpc('mentor_notification_read',{p_id:read.id}));
  failure(await sdk().rpc('mentor_groups'));failure(await student.from('mentor_materials').select('id').limit(1));
  eq(uploaded,2);eq(signedChecks,2);check(observed.size>=20,'successful distinct HTTPS RPC endpoint coverage');
  pass('HTTPS: two private PDF uploads (individual/group), commit/list/retry, 60-second signed fetch HTTP 200 with exact bytes; outsider/public denied; notifications/read isolation verified');
 } finally {
  let clean=true;
  if(inserted) {
   try {
    // Discover only this run's exact owned paths, also covering a lost prepare response.
    const rows=(await db.query(`SELECT f.id,f.path,f.owner_id FROM public.mentor_materials f JOIN auth.users u ON u.id=f.owner_id WHERE f.owner_id=ANY($1::uuid[]) AND u.raw_user_meta_data->>'backend_fixture'=$2`,[owned,tag])).rows;
    for(const row of rows) {
     const index=owned.indexOf(row.owner_id);check(index>=0&&row.path.startsWith(`${row.owner_id}/`),'teardown scope is fixture-only');
     let c=clients[index]; if(!c) {c=sdk();clients[index]=c;success(await c.auth.signInWithPassword({email:people[index].email,password:people[index].password}),'cleanup login');}
     // Explicitly authorized test-only unlock; never modify policies or another account.
     await db.query('BEGIN');
     try { const unlocked=await db.query(`UPDATE public.mentor_materials f SET committed=false FROM auth.users u WHERE f.id=$1 AND f.owner_id=$2 AND f.path=$3 AND u.id=f.owner_id AND u.raw_user_meta_data->>'backend_fixture'=$4`,[row.id,row.owner_id,row.path,tag]);eq(unlocked.rowCount,1);await db.query('COMMIT'); }
     catch(e) {await db.query('ROLLBACK');throw e;}
     success(await c.storage.from('mentor-materials').remove([row.path]),'fixture bytes removed through HTTPS Storage API');
     eq((await db.query("SELECT count(*)::integer n FROM storage.objects WHERE bucket_id='mentor-materials' AND name=$1",[row.path])).rows[0].n,0,'Storage API removal completed before metadata abort');
     await remote(c,'mentor_file_abort',{p_file:row.id});
    }
    eq((await db.query("SELECT count(*)::integer n FROM storage.objects WHERE bucket_id='mentor-materials' AND owner_id=ANY($1::text[])",[owned])).rows[0].n,0,'no fixture Storage objects remain');
   } catch(e) {clean=false;console.error(`CLEANUP BLOCKED for disposable run ${run}; preserving its users for byte cleanup`);throw e;}
   finally {
    if(clean) {
     for(const c of clients.filter(Boolean)) await c.auth.signOut({scope:'local'}).catch(()=>{});
     await db.query('BEGIN');
     try {
      const removed=await db.query(`DELETE FROM auth.users WHERE id=ANY($1::uuid[]) AND raw_user_meta_data->>'backend_fixture'=$2 AND email='mentor-academic-https-'||id::text||'@example.invalid' RETURNING id`,[owned,tag]);eq(removed.rowCount,3,'delete exactly the three owned Auth fixtures');
      // Auth audit rows identify their actor explicitly; remove only this run's actors.
      await db.query("DELETE FROM auth.audit_log_entries WHERE payload->>'actor_id'=ANY($1::text[])",[owned]);
      await db.query('COMMIT');
     } catch(e) {await db.query('ROLLBACK');throw e;}
     eq((await originalData(db,original.relations)).hashes,original.hashes,'all original application/Auth/Storage rows restored after HTTPS');
     eq(await fingerprint(db),before,'full original data/security fingerprints restored after HTTPS cleanup');
     pass('HTTPS cleanup: all fixture bytes removed through Storage API, three tagged Auth/academic fixtures removed, original data/security fingerprints identical');
    }
   }
  }
 }
 console.log(`SUCCESS HTTPS ${assertions} assertions; ${uploaded} PDF uploads and ${signedChecks} exact-byte signed downloads; ${observed.size} successful RPC endpoints`);
}
async function main() {
 const db=client();
 try {
  await db.connect();
  if(process.argv.includes('--https')&&!process.argv.includes('--apply')) {await httpsSmoke(db);return;}
  await validate(db);
  if(process.argv.includes('--apply')) {
   const before=await fingerprint(db,true); const original=await originalData(db);
   try { await db.query('BEGIN'); await db.query(stripped); eq(await fingerprint(db,true),before,'migration preserves legacy data/security'); eq((await originalData(db,original.relations)).hashes,original.hashes,'deployment preserves all existing application/Auth/Storage rows'); await db.query('COMMIT'); }
   catch(e) { await db.query('ROLLBACK'); throw e; }
   pass('explicit --apply: core + addon DDL committed; no fixtures committed'); await validate(db,false);
  }
  console.log(`SUCCESS ${assertions} assertions; ${process.argv.includes('--apply')?'explicit deployment and postvalidation':'validation only; no deployment'}`);
  if(process.argv.includes('--https')) await httpsSmoke(db);
 } finally { await db.query('ROLLBACK').catch(()=>{}); await db.end(); }
}
main().catch(error=>{console.error(`FAIL ${error.code||error.name}: ${error.message}`); if(error.where) console.error(error.where); console.error((error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4).join('\n')); process.exitCode=1;});
