const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {root, assets, shellAssets, serviceWorker} = require('../tools/web-assets.cjs');
function worker() {
  const events = {}, log = {added:[],matched:[],deleted:[],fetches:[],claimed:0,skipped:0};
  const cache = {addAll:async requests=>{log.added.push(...requests);},match:async url=>{log.matched.push(url);return new Response('public shell');}};
  vm.runInNewContext(serviceWorker(), {
    URL,Request,Response,Set,
    self:{registration:{scope:'https://example.test/matchup/'},location:{origin:'https://example.test'},clients:{claim:async()=>{log.claimed++;}},skipWaiting:()=>{log.skipped++;},addEventListener:(name,fn)=>{events[name]=fn;}},
    caches:{open:async()=>cache,keys:async()=>['other-app','matchup-static-old'],delete:async key=>{log.deleted.push(key);}},
    fetch:async request=>{log.fetches.push(request.url);throw new Error('offline');},
  });
  async function lifecycle(name){let pending;events[name]({waitUntil:p=>{pending=p;}});await pending;}
  async function fetch(url,overrides={}){let response;events.fetch({request:{url,method:'GET',mode:'cors',headers:new Headers(),...overrides},respondWith:p=>{response=p;}});return response===undefined?null:await response;}
  return {events,log,lifecycle,fetch};
}
test('PWA manifest uses relative scope and real dimensioned icons',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.name,'MatchUp');assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
  for(const icon of [...manifest.icons,{src:'assets/brand/apple-touch-icon.png',sizes:'180x180'}]){
    const bytes=fs.readFileSync(path.join(root,...icon.src.split('/')));
    assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);
  }
  assert.equal(manifest.icons.filter(i=>i.purpose==='maskable').length,1);
});
test('generated worker is content-versioned and precaches only public allowlist without credentials',async()=>{
  const source=serviceWorker();assert.match(source,/matchup-static-[a-f0-9]{20}/);assert.doesNotMatch(source,/__MATCHUP_/);
  const w=worker();await w.lifecycle('install');assert.equal(w.log.added.length,shellAssets.length);
  assert.ok(assets.includes('assets/brand/matchup-intro.mp4'));
  assert.ok(!w.log.added.some(request=>request.url.endsWith('.mp4')));
  for(const request of w.log.added){assert.equal(request.credentials,'omit');assert.equal(request.cache,'reload');assert.match(request.url,/^https:\/\/example\.test\/matchup\//);assert.equal(new URL(request.url).search,'');}
  assert.equal(w.log.skipped,0);
});
test('API, authorization, private materials, queries and non-GET bypass cache entirely',async()=>{
  const w=worker();for(const [url,options] of [
    ['https://project.supabase.co/rest/v1/rpc/mentor_me',{}],['https://project.supabase.co/storage/v1/object/sign/private?token=secret',{}],
    ['https://example.test/matchup/private.pdf',{}],['https://example.test/matchup/index.html?token=secret',{}],
    ['https://example.test/matchup/assets/brand/matchup-intro.mp4',{}],
    ['https://example.test/matchup/assets/brand/matchup-intro.mp4',{headers:new Headers({Range:'bytes=0-1023'})}],
    ['https://example.test/matchup/index.html',{method:'POST'}],['https://example.test/matchup/index.html',{headers:new Headers({Authorization:'Bearer secret'})}],
  ]) assert.equal(await w.fetch(url,options),null);
  assert.deepEqual(w.log.matched,[]);assert.deepEqual(w.log.fetches,[]);
});
test('offline root and recovery navigation fall back to clean shell without persisting token URL',async()=>{
  const w=worker();const response=await w.fetch('https://example.test/matchup/?code=secret',{mode:'navigate'});
  assert.equal(await response.text(),'public shell');assert.deepEqual(w.log.matched,['https://example.test/matchup/index.html']);assert.deepEqual(w.log.added,[]);
  assert.equal(await w.fetch('https://example.test/another-app/',{mode:'navigate'}),null);
});
test('static resources use existing cache; activation only removes own old versions',async()=>{
  const w=worker();await w.fetch('https://example.test/matchup/mentorship.js');assert.deepEqual(w.log.fetches,[]);
  w.events.message({data:{type:'unrelated'}});assert.equal(w.log.skipped,0);
  w.events.message({data:{type:'MATCHUP_ACTIVATE_UPDATE'}});assert.equal(w.log.skipped,1);
  await w.lifecycle('activate');assert.deepEqual(w.log.deleted,['matchup-static-old']);assert.equal(w.log.claimed,1);
});
