'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,migrationSql,snapshot,applyGroups,main}=require('../tools/deploy-groups.cjs');
function fakeDb({changed=false,authChanged=false,migrationError=false}={}){
  const calls=[];let applied=false;
  return {calls,query:async sql=>{
    calls.push(sql);
    if(sql.includes('FROM information_schema.columns'))return {rows:[{schema:'public',name:'existing',columns:['id','name']}]};
    if(sql.includes('md5(coalesce(string_agg'))return {rows:[{n:1,hash:changed&&applied?'changed':'original'}]};
    if(sql.startsWith('SELECT oid::regprocedure'))return {rows:[{signature:'mentor_actor()',hash:authChanged&&applied?'changed':'original'}]};
    if(sql.includes('CREATE OR REPLACE FUNCTION')){if(migrationError)throw Error('simulated failure');applied=true;}
    return {rows:[]};
  }};
}
test('group validation remains offline, additive, and never replaces product auth',async()=>{
  const sql=validate();assert.ok(!/^BEGIN;$/m.test(migrationSql()));assert.ok(!/COMMIT;\s*$/.test(migrationSql()));
  assert.match(sql,/ALTER COLUMN visibility SET DEFAULT 'private'/);assert.match(sql,/DEFAULT 'public'/);assert.match(sql,/capacity BETWEEN 2 AND 100/);
  assert.match(sql,/SELECT \* INTO g FROM public\.mentor_study_groups WHERE id=p_group FOR UPDATE/);assert.match(sql,/code=p_code/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.(mentor_actor|mentor__eligible|mentor_ac__actor)\(/);
  await main([]);await assert.rejects(main(['--unknown']));await assert.rejects(main(['--apply','--apply']));
});
test('live API smoke defaults offline and rejects ambiguous opt-in flags',async()=>{
  const {main:liveMain}=require('./mentorship-groups-live.cjs');
  await liveMain([]);await assert.rejects(liveMain(['--unknown']));await assert.rejects(liveMain(['--run','--run']));
});
test('fingerprints select original columns, allowing additive columns but not lost data',async()=>{
  const db=fakeDb(),before=await snapshot(db);await snapshot(db,before.relations);
  assert.equal(db.calls.filter(sql=>sql.includes('information_schema.columns')).length,1);
  assert.equal(db.calls.filter(sql=>sql.includes('SELECT "id","name" FROM "public"."existing"')).length,2);
});
test('deployment commits only after row and auth preservation checks',async()=>{
  const db=fakeDb();await applyGroups(db);assert.equal(db.calls[0],'BEGIN');assert.equal(db.calls.at(-1),'COMMIT');assert.equal(db.calls.filter(sql=>sql.startsWith('SELECT oid::regprocedure')).length,2);
});
for(const scenario of [{changed:true},{authChanged:true},{migrationError:true}])test('deployment rolls back '+JSON.stringify(scenario),async()=>{
  const db=fakeDb(scenario);await assert.rejects(applyGroups(db));assert.equal(db.calls.at(-1),'ROLLBACK');assert.ok(!db.calls.includes('COMMIT'));
});
