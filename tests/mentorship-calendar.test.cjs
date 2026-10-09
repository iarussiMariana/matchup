'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calendar,escapeText,foldLine,safeText}=require('../mentorship-calendar.js');
const meeting=(overrides={})=>({id:'55555555-5555-4555-8555-555555555555',subject:'Cálculo',title:'Revisão',topic:'Derivadas',format:'presencial',location:'Biblioteca',starts_at:'2026-10-05T09:30:00-03:00',duration_minutes:60,status:'confirmed',created_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-02T15:00:00Z',...overrides});
const now='2026-10-03T12:45:12.456Z';
const unfold=text=>text.replace(/\r\n /g,'');
const property=(text,name)=>unfold(text).split('\r\n').find(line=>line.startsWith(name+':'));
test('ICS has valid CRLF envelope, UTC timestamps, meaningful subject and location',()=>{
  const text=calendar([meeting()],now);
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(text.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'));
  assert.equal(text.replace(/\r\n/g,'').includes('\n'),false);
  for(const line of ['METHOD:PUBLISH','DTSTAMP:20261003T124512Z','DTSTART:20261005T123000Z','DTEND:20261005T133000Z','LAST-MODIFIED:20261002T150000Z','STATUS:CONFIRMED','SUMMARY:Cálculo — Revisão','LOCATION:Biblioteca'])assert.ok(unfold(text).includes(line+'\r\n'),line);
  assert.equal(property(text,'UID'),'UID:55555555-5555-4555-8555-555555555555@agenda.matchup');
});
test('UID is stable across rescheduling and cancellation, updates carry newer revision',()=>{
  const first=calendar([meeting()],now);
  const moved=calendar([meeting({starts_at:'2026-10-06T14:00:00Z',updated_at:'2026-10-04T14:00:00Z',status:'pending'})],now);
  const cancelled=calendar([meeting({status:'cancelled',updated_at:'2026-10-05T14:00:00Z'})],now);
  assert.equal(property(first,'UID'),property(moved,'UID'));
  assert.equal(property(first,'UID'),property(cancelled,'UID'));
  assert.equal(property(moved,'STATUS'),'STATUS:TENTATIVE');
  assert.equal(property(cancelled,'STATUS'),'STATUS:CANCELLED');
  assert.ok(Number(property(moved,'SEQUENCE').split(':')[1])>Number(property(first,'SEQUENCE').split(':')[1]));
  assert.equal(calendar([meeting()],now),first);
});
test('all authorized records including cancelled events appear once in bulk ICS',()=>{
  const text=calendar([meeting(),meeting({id:'cancelled',status:'cancelled'}),meeting({id:'pending',status:'pending'})],now);
  assert.equal(text.match(/BEGIN:VEVENT/g).length,3);
  assert.equal(text.match(/STATUS:CANCELLED/g).length,1);
  assert.equal(text.match(/STATUS:TENTATIVE/g).length,1);
});
test('text escaping prevents property injection and preserves literal punctuation',()=>{
  assert.equal(escapeText('A\\B, C; D\r\nE\rF\nG'),'A\\\\B\\, C\\; D\\nE\\nF\\nG');
  const text=unfold(calendar([meeting({title:'x\r\nEND:VEVENT\r\nBEGIN:VEVENT',location:'Sala A, B; C\\D'})],now));
  assert.equal(text.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1);
  assert.ok(text.includes('LOCATION:Sala A\\, B\\; C\\\\D\r\n'));
});
test('UTF-8 folding never splits codepoints or exceeds 75 octets including continuation spaces',()=>{
  const original='SUMMARY:'+('Cálculo 🧑🏽‍🎓 漢字, '.repeat(40));
  const folded=foldLine(original);
  for(const line of folded.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
  assert.equal(unfold(folded),original);
  assert.equal(folded.includes('\uFFFD'),false);
  assert.equal(foldLine('x'.repeat(76)),'x'.repeat(75)+'\r\n x');
});
test('meeting URLs and signed credentials never leave the app in any exported text field',()=>{
  const secret='https://storage.example.test/object/sign/private.pdf?token=PRIVATE_SECRET#fragment';
  const text=unfold(calendar([meeting({subject:secret,title:'Revisão '+secret,topic:'token=BARE_SECRET; detalhes',location:'Online '+secret,access_token:'ALSO_SECRET',participants:[{signed_url:secret}]})],now));
  assert.ok(text.includes('LOCATION:Online [link disponível no MatchUp]'));
  for(const forbidden of ['PRIVATE_SECRET','BARE_SECRET','ALSO_SECRET','storage.example.test','private.pdf'])assert.equal(text.includes(forbidden),false);
  assert.equal(safeText('Biblioteca, sala 2'),'Biblioteca, sala 2');
});
function nativeHarness(overrides={}) {
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const calls=[],files=new Map();
  const filesystem={
    writeFile:async args=>{calls.push(['write',args]);files.set(args.path,args.data);return {uri:'file:///cache/'+args.path};},
    deleteFile:async args=>{calls.push(['delete',args]);files.delete(args.path);},
    readdir:async args=>{calls.push(['list',args]);return {files:[]};},
    ...overrides.filesystem
  };
  const share={canShare:async()=>({value:true}),share:async args=>{calls.push(['share',args]);return {};},...overrides.share};
  const capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>true,registerPlugin:name=>{calls.push(['register',name]);return name==='Filesystem'?filesystem:share;},...overrides.capacitor};
  const context={window:{Capacitor:capacitor,crypto:require('node:crypto')},TextEncoder,Date};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','mentorship-calendar.js'),'utf8'),context);
  return {api:context.window.MentorCalendar,calls,files};
}
test('native bridge writes UTF-8 ICS into dedicated cache and retains handed-off files',async()=>{
  const {api,calls,files}=nativeHarness();
  const text=calendar([meeting()],now);
  assert.equal(await api.shareNative(text,'Agenda MatchUp',()=>true),'shared');
  const write=calls.find(c=>c[0]==='write')[1],shared=calls.find(c=>c[0]==='share')[1];
  assert.equal(write.directory,'CACHE');assert.equal(write.encoding,'utf8');assert.equal(write.recursive,true);assert.equal(write.data,text);
  assert.match(write.path,/^matchup-calendar\/matchup-\d{13}-[a-f0-9-]+\.ics$/);
  assert.deepEqual(Array.from(shared.files),['file:///cache/'+write.path]);
  assert.equal(files.size,1);assert.equal(calls.filter(c=>c[0]==='delete').length,0);
});
test('native pruning only deletes own older export files and respects recent access metadata',async()=>{
  const old=Date.now()-48*60*60*1000,uuid='11111111-1111-4111-8111-111111111111';
  const own=`matchup-${old}-${uuid}.ics`,recent=`matchup-${Date.now()}-${uuid}.ics`,modified=`matchup-${old}-22222222-2222-4222-8222-222222222222.ics`;
  const {api,calls}=nativeHarness({filesystem:{readdir:async()=>({files:[{name:own,type:'file'},{name:recent,type:'file'},{name:modified,type:'file',mtime:Date.now()},{name:'../'+own,type:'file'},{name:'other.txt',type:'file'},{name:`matchup-${old}-33333333-3333-4333-8333-333333333333.ics`,type:'directory'}]})}});
  await api.shareNative('ICS','Agenda',()=>true);
  assert.deepEqual(calls.filter(c=>c[0]==='delete').map(c=>c[1].path),['matchup-calendar/'+own]);
});
test('native export deletes an unshared file when the account changes during writing',async()=>{
  let current=true;
  const {api,calls}=nativeHarness({filesystem:{writeFile:async args=>{current=false;return {uri:'file:///cache/'+args.path};}}});
  assert.equal(await api.shareNative('ICS','Agenda',()=>current),'stale');
  assert.equal(calls.filter(c=>c[0]==='share').length,0);assert.equal(calls.filter(c=>c[0]==='delete').length,1);
});
test('native failures clean specific unshared files and never downgrade to browser download',async()=>{
  const {api,calls,files}=nativeHarness({share:{share:async()=>{throw new Error('Share canceled');}}});
  await assert.rejects(()=>api.shareNative('ICS','Agenda',()=>true),/canceled/);
  assert.equal(files.size,0);assert.equal(calls.filter(c=>c[0]==='delete').length,1);
  const missing=nativeHarness({capacitor:{isPluginAvailable:()=>false}});
  await assert.rejects(()=>missing.api.shareNative('ICS','Agenda',()=>true),/unavailable/);assert.equal(missing.calls.length,0);
});
test('native stale entry makes no file and successful chooser result keeps file despite later navigation',async()=>{
  const untouched=nativeHarness();assert.equal(await untouched.api.shareNative('ICS','Agenda',()=>false),'stale');assert.equal(untouched.files.size,0);
  let current=true;
  const handed=nativeHarness({share:{share:async()=>{current=false;return {};}}});
  assert.equal(await handed.api.shareNative('ICS','Agenda',()=>current),'stale');assert.equal(handed.files.size,1);assert.equal(handed.calls.filter(c=>c[0]==='delete').length,0);
});
test('native failed cleanup is explicit rather than silently claiming success',async()=>{
  const {api}=nativeHarness({filesystem:{deleteFile:async()=>{throw new Error('FS failure');}},share:{share:async()=>{throw new Error('Share failure');}}});
  await assert.rejects(()=>api.shareNative('ICS','Agenda',()=>true),error=>error.code==='CALENDAR_CACHE_CLEANUP');
});
test('invalid dates, duration, duplicates and empty exports fail closed',()=>{
  for(const sessions of [[],[meeting({starts_at:'invalid'})],[meeting({duration_minutes:0})],[meeting({duration_minutes:300})],[meeting({updated_at:'invalid'})],[meeting({id:''})],[meeting(),meeting()]])assert.throws(()=>calendar(sessions,now));
});
