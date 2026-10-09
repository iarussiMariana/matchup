'use strict';
// Opt-in, real authenticated API checks using only tagged disposable accounts.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {client}=require('./backend-db.js');
async function run(){
 const source=fs.readFileSync(path.join(__dirname,'..','mentorship.js'),'utf8');
 const url=source.match(/\bconst\s+URL\s*=\s*['"]([^'"]+)['"]/)?.[1],key=source.match(/\bconst\s+KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
 assert.equal(url,'https://drvqiiddgcgvmbbnwdky.supabase.co');
 const db=client();await db.connect();const tag=`product-live:${randomUUID()}`;
 const actors=Array.from({length:2},()=>{const id=randomUUID();return {id,email:`product-live-${id}@example.invalid`,password:`${randomUUID()}Aa1!`,sdk:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})};});
 const ids=actors.map(a=>a.id);
 const original=async()=>(await db.query('select id,md5(to_jsonb(p)::text) hash from mentor_profiles p where not(id=any($1::uuid[])) order by id',[ids])).rows;
 const before=await original();
 const rpc=async(actor,name,args)=>{const result=await actor.sdk.rpc(name,args);assert.equal(result.error,null,`${name}: authenticated operation should succeed`);return result.data;};
 try {
  await db.query('BEGIN');
  try{for(const actor of actors){
   await db.query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf',10)),now(),'','','','','{"provider":"email","providers":["email"]}'::jsonb,$4::jsonb,now(),now())`,[actor.id,actor.email,actor.password,JSON.stringify({name:'Verificação temporária',birth_date:'1995-01-01',backend_fixture:tag})]);
   await db.query(`INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) VALUES($1::text,$1::uuid,$2::jsonb,'email',now(),now())`,[actor.id,JSON.stringify({sub:actor.id,email:actor.email,email_verified:true,phone_verified:false})]);
  }await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}
  for(const actor of actors)assert.equal((await actor.sdk.auth.signInWithPassword({email:actor.email,password:actor.password})).error,null);
  const [learner,mentor]=actors;const catalog=await rpc(learner,'mentor_catalog');const course=catalog.courses.find(c=>c.subjects.length);const subject=course.subjects[0].name;
  for(const actor of actors){const saved=await rpc(actor,'mentor_save_product',{p_course_id:course.id,p_profile:{name:'Verificação temporária',course:course.name,semester:3,bio:'Conta temporária de validação.',subjects:actor===mentor?[subject]:[],learning_subjects:[subject],current_subjects:[subject],topics:[],institution:'FACENS',city:'',availability:'À noite',format:'online',study_preference:'ambos',photo_url:'',active:actor===mentor,methodology:'Exemplos acompanhados e exercícios.',experience:'Experiência declarada em grupo de estudos.',availability_slots:['seg-noite']}});assert.equal(saved.methodology,'Exemplos acompanhados e exercícios.');assert.deepEqual(saved.availability_slots,['seg-noite']);}
  const peers=await rpc(learner,'mentor_discover_product',{p_subject:subject,p_course_id:course.id,p_semester:3,p_format:'online',p_slot:'seg-noite',p_favorites_only:false});assert.ok(peers.some(p=>p.id===mentor.id));
  assert.equal(await rpc(learner,'mentor_favorite',{p_user:mentor.id,p_saved:true}),true);assert.ok((await rpc(learner,'mentor_favorites')).some(p=>p.id===mentor.id));assert.equal((await rpc(mentor,'mentor_favorites')).length,0);
  const args={p_mentor:mentor.id,p_subject:subject,p_question:'Como resolver este exercício com clareza?',p_objective:'Aprender a resolver exercícios sozinho.',p_proposed_at:new Date(Date.now()+86400000).toISOString()};
  const request=await rpc(learner,'mentor_request_product',args);assert.equal(request.question,args.p_question);assert.equal(request.objective,args.p_objective);
  const received=(await rpc(mentor,'mentor_requests')).find(r=>r.id===request.id);assert.equal(received.question,args.p_question);
  const repeated=await rpc(learner,'mentor_request_product',{...args,p_question:'Outro texto que não deve sobrescrever o original.'});assert.equal(repeated.id,request.id);assert.equal(repeated.question,args.p_question);
  const notices=await rpc(mentor,'mentor_notifications');const notice=notices.find(n=>n.request_id===request.id&&n.type==='request');assert.ok(notice);
  assert.equal(await rpc(mentor,'mentor_notification_read',{p_id:notice.id}),true);assert.equal((await rpc(mentor,'mentor_notifications')).find(n=>n.id===notice.id).is_read,true);
  await rpc(mentor,'mentor_respond',{p_request:request.id,p_accept:true});
  const meeting=await rpc(mentor,'mentor_session_save',{p_session:{request_id:request.id,title:'Encontro temporário de validação',subject,topic:'Revisar exercícios',starts_at:args.p_proposed_at,duration_minutes:60,format:'online',location:'Sala virtual combinada no chat'}});
  assert.ok(meeting.created_at);assert.ok(meeting.updated_at);assert.ok((await rpc(learner,'mentor_sessions')).some(s=>s.id===meeting.id));
  await rpc(learner,'mentor_session_respond',{p_session:meeting.id,p_accept:true});assert.equal(await rpc(mentor,'mentor_session_cancel',{p_session:meeting.id}),true);
  assert.equal((await rpc(learner,'mentor_sessions')).find(s=>s.id===meeting.id).status,'cancelled');
  const report=await rpc(learner,'mentor_report',{p_user:mentor.id,p_reason:'spam',p_details:'Relato sintético de validação entre contas temporárias.'});assert.ok(report);assert.ok((await rpc(learner,'mentor_my_reports')).length);assert.equal((await rpc(mentor,'mentor_my_reports')).length,0);assert.equal(await rpc(learner,'mentor_moderation_access'),false);
  const denied=await learner.sdk.rpc('mentor_moderation_queue',{p_status:'pending'});assert.ok(denied.error);
  assert.equal(await rpc(learner,'mentor_favorite',{p_user:mentor.id,p_saved:false}),false);assert.equal((await rpc(learner,'mentor_favorites')).length,0);
  console.log('PASS: authenticated rich profiles, combined discovery filters, private favorites, guided requests, notification reads, accepted connection, session timestamps/confirmation/cancellation, private reports and moderator access denial.');
 } finally {
  try{for(const actor of actors)await actor.sdk.auth.signOut({scope:'local'}).catch(()=>{});
   await db.query('BEGIN');try{await db.query("DELETE FROM auth.users WHERE id=any($1::uuid[]) AND raw_user_meta_data->>'backend_fixture'=$2",[ids,tag]);await db.query("DELETE FROM auth.audit_log_entries WHERE payload->>'actor_id'=any($1::text[])",[ids]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}
   assert.equal((await db.query('select count(*)::int n from auth.users where id=any($1::uuid[])',[ids])).rows[0].n,0);assert.deepEqual(await original(),before);console.log('PASS: both temporary accounts removed and original academic profiles unchanged.');
  }finally{await db.end();}
 }
}
if(process.argv.includes('--run'))run().catch(error=>{console.error('Live product verification failed:',error.code||error.name);process.exitCode=1;});
else console.log('Opt-in live validation: node tests\\mentorship-product-live.cjs --run');
