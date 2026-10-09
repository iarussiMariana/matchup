'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {File} = require('node:buffer');
function load(client,bridge={}) {
  const context = {window:{MentorApp:{client,user:{id:'learner'},...bridge}},Date,Map,Symbol,URL,Uint8Array,console,setTimeout,clearTimeout,AbortController};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','mentorship-academic.js'),'utf8'),context);
  return context.window.MentorAcademic;
}
test('academic uploads accept supported file signatures and reject disguised content',async()=>{
  const {validateFile} = load();
  for(const [name,type,bytes] of [
    ['notes.pdf','application/pdf',[37,80,68,70,45]],
    ['slide.ppt','application/vnd.ms-powerpoint',[208,207,17,224,161,177,26,225]],
    ['notes.doc','application/msword',[208,207,17,224,161,177,26,225]],
    ['notes.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',[80,75,3,4]],
    ['slide.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation',[80,75,3,4]],
    ['image.jpg','image/jpeg',[255,216,255]],
    ['image.png','image/png',[137,80,78,71,13,10,26,10]],
    ['image.webp','image/webp',[82,73,70,70,0,0,0,0,87,69,66,80]]
  ]) assert.equal(await validateFile(new File([Uint8Array.from(bytes)],name,{type})),type);
  await assert.rejects(()=>validateFile(new File(['<script>bad</script>'],'fake.pdf',{type:'application/pdf'})),/conteúdo/);
  await assert.rejects(()=>validateFile(new File(['%PDF-'],'fake.svg',{type:'image/svg+xml'})),/Use PDF/);
  await assert.rejects(()=>validateFile(new File(['%PDF-'],'fake.pdf',{type:'text/html'})),/Use PDF/);
  await assert.rejects(()=>validateFile(new File([],'empty.pdf',{type:'application/pdf'})),/10 MB/);
  await assert.rejects(()=>validateFile(new File([new Uint8Array(10*1024*1024+1)],'big.pdf',{type:'application/pdf'})),/10 MB/);
  assert.equal(await validateFile(new File(['%PDF-'],'NOTES.PDF')),'application/pdf');
});
test('next session uses real future non-cancelled records only',async()=>{
  let data=[];const addon=load({rpc:async name=>{assert.equal(name,'mentor_sessions');return {data,error:null};}});
  assert.equal(await addon.nextSession(),null);
  const future=offset=>new Date(Date.now()+offset).toISOString();
  data=[{id:'cancelled',status:'cancelled',starts_at:future(100000)}, {id:'old',status:'confirmed',starts_at:future(-100000)}, {id:'later',status:'confirmed',starts_at:future(300000)}, {id:'next',status:'pending',starts_at:future(200000)}];
  assert.equal((await addon.nextSession()).id,'next');
});
test('next session does not turn backend failures into empty success',async()=>{
  const error={code:'PGRST202',message:'Unavailable'};
  const addon=load({rpc:async()=>({data:null,error})});
  await assert.rejects(()=>addon.nextSession(),e=>e===error);
});
test('home metrics use persisted completions, ratings and unread events',async()=>{
  let captured;
  const past=new Date(Date.now()-7200000).toISOString(),future=new Date(Date.now()+7200000).toISOString();
  const values={mentor_sessions:[{id:'done',starts_at:past,status:'confirmed',duration_minutes:60},{id:'not-confirmed',starts_at:past,status:'pending',duration_minutes:60},{id:'declined',starts_at:future,status:'pending',my_response:'declined'},{id:'next',starts_at:future,status:'confirmed',participants:[{id:'learner',name:'Ana'},{id:'mentor',name:'Bia'}]}],mentor_reviews:{count:2,average:4.5},mentor_notifications:[{is_read:false},{is_read:true}]};
  const addon=load({rpc:async name=>({data:values[name],error:null})},{epoch:7,updateHomeMetrics:(metrics,epoch)=>captured={metrics,epoch}});
  const next=await addon.nextSession();assert.equal(next.id,'next');assert.equal(next.peer.name,'Bia');
  assert.deepEqual(JSON.parse(JSON.stringify(captured)),{metrics:{completedSessions:1,reviewCount:2,averageRating:4.5,unreadNotifications:1},epoch:7});
});
test('cleanup rejects a home result from an earlier navigation',async()=>{
  let finish;const addon=load({rpc:()=>new Promise(resolve=>finish=resolve)});
  const pending=addon.nextSession();addon.cleanup();finish({data:[],error:null});
  await assert.rejects(()=>pending,e=>e.code==='42501');
});
