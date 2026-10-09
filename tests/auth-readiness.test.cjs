const {test}=require('node:test');
const assert=require('node:assert/strict');
const {desired,audit,run,SITE}=require('../tools/auth-readiness.cjs');
test('Auth patch preserves existing redirects and never weakens security settings',()=>{
 const original={site_url:'https://old.example',uri_allow_list:'https://old.example/callback',mailer_autoconfirm:false,smtp_pass:'private'};
 assert.deepEqual(desired(original),{site_url:SITE,uri_allow_list:`https://old.example/callback,${SITE}`});
 assert.deepEqual(desired({...original,...desired(original)}),desired(original));
 assert.equal(audit(original).emailConfirmationEnabled,true);assert.ok(!JSON.stringify(audit(original)).includes('private'));
});
test('Missing management credential is explicit and makes no network request',async()=>{
 const result=await run({token:'',fetcher:()=>{throw new Error('unexpected');}});assert.equal(result.managementAccess,false);
 await assert.rejects(run({apply:true,token:''}),/ausente/);
});
test('Auth defaults to audit only and explicit apply verifies exact redirect',async()=>{
 const calls=[];let config={site_url:'https://old.example',uri_allow_list:'https://old.example/callback',mailer_autoconfirm:false};
 const fetcher=async(url,options)=>{calls.push(options.method);assert.equal(new URL(url).hostname,'api.supabase.com');if(options.method==='PATCH')config={...config,...JSON.parse(options.body)};return {ok:true,json:async()=>config};};
 await run({token:'test',fetcher});assert.deepEqual(calls,['GET']);calls.length=0;
 const result=await run({apply:true,token:'test',fetcher});assert.deepEqual(calls,['GET','PATCH','GET']);assert.equal(result.redirectReady,true);assert.equal(config.mailer_autoconfirm,false);assert.equal(result.emailDeliveryPhysicallyVerified,false);
});
