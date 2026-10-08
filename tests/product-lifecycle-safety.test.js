'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const {localClient}=require('../src/product/client');

const deal={schema:'astra-deal-1',dealId:'lifecycle-safety',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:[...'ABCABCABC'].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%3*100,y:Math.floor(i/3)*100,w:96,h:96}}))};
const witness=['t0','t3','t6','t1','t4','t7','t2','t5','t8'];

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function harness(t,options={}){
 let time=options.time??Date.UTC(2026,9,3,4);
 const values=new Map(),writes=[],apps=[],gates=[],platformEvents=[];
 const storage={get:key=>values.get(key),set(key,value){writes.push({key,value});values.set(key,value);}};
 // Share the real service across app instances, as an HTTP server would do.
 // Only response delivery is held; start/settle execute their real side effects.
 const base=localClient([deal],storage,'lifecycle-user',()=>time);
 const client={...base,async request(action,data={}){
  const gate=gates.find(candidate=>candidate.action===action&&!candidate.claimed);
  if(gate)gate.claimed=true;
  const result=await base.request(action,data);
  if(gate){gate.entered.resolve(result);await gate.release.promise;}
  return result;
 }};
 function create(){
  const context=new Proxy({measureText:value=>({width:String(value).length*7})},{get:(object,key)=>key in object?object[key]:()=>{}});
  const platform={publish:async()=>{platformEvents.push('publish');},destroy:()=>platformEvents.push('destroy'),hideFriends(){},hideClub(){}};
  const app=createFullApp({getContext:()=>context},[deal],390,844,1,{motion:false,now:()=>time,storage,client,platform});
  apps.push(app);return app;
 }
 t.after(()=>{gates.forEach(gate=>gate.release.resolve());apps.forEach(app=>app.destroy());});
 return {create,boot:async()=>{const app=create();await app.ready;return app;},values,writes,platformEvents,advance:ms=>time+=ms,
  holdNext(action){const gate={action,claimed:false,entered:deferred(),release:deferred()};gates.push(gate);
   return {entered:gate.entered.promise,release:()=>gate.release.resolve()};}};
}
async function click(app,id){
 const region=app.getHitRegions().find(region=>region.id===id);
 assert.ok(region,'missing '+id);assert.ok(region.enabled,'disabled '+id);
 return app.tap(region.x+region.w/2,region.y+region.h/2);
}
async function prepareLast(app){await app.qa.start('daily');for(const id of witness.slice(0,-1))assert.equal((await app.qa.pick(id)).ok,true);}
const terminalRecords=h=>({active:h.values.get('active-round'),outbox:h.values.get('outbox')});

test('lifecycle safety: delayed start response cannot enter a round after destroy',async t=>{
 const h=harness(t),app=await h.boot(),gate=h.holdNext('start');
 const starting=click(app,'start');await gate.entered;
 app.destroy();const before={scene:app.getScene(),state:app.getState(),modal:app.getModal()},writes=h.writes.length;
 gate.release();await starting;
 assert.deepEqual({scene:app.getScene(),state:app.getState(),modal:app.getModal()},before,
  'a destroyed app must ignore its delayed start response');
 assert.equal(h.writes.length,writes,'a delayed start must not write after destruction');
});

test('lifecycle safety: delayed bootstrap cannot publish or navigate after destroy',async t=>{
 const h=harness(t),app=await h.boot();await app.qa.start('daily');await click(app,'exit');
 const gate=h.holdNext('bootstrap'),returning=click(app,'confirm-exit');await gate.entered;
 app.destroy();const events=h.platformEvents.slice(),before={scene:app.getScene(),state:app.getState(),modal:app.getModal()};
 gate.release();await returning;
 assert.deepEqual(h.platformEvents,events,'platform publication must not happen after platform destruction');
 assert.deepEqual({scene:app.getScene(),state:app.getState(),modal:app.getModal()},before);
});

test('lifecycle safety: delayed settlement cannot clear recovery records after destroy',async t=>{
 const h=harness(t),app=await h.boot();await prepareLast(app);
 const gate=h.holdNext('settle'),finishing=app.qa.pick(witness.at(-1));await gate.entered;
 assert.ok(h.values.get('active-round'));assert.ok(h.values.get('outbox'));
 app.destroy();const records=terminalRecords(h),events=h.platformEvents.slice(),modal=app.getModal();
 gate.release();await finishing;
 assert.deepEqual(terminalRecords(h),records,'only a live owner may acknowledge and clear its pending recovery records');
 assert.deepEqual(h.platformEvents,events);assert.equal(app.getModal(),modal);
});

test('lifecycle safety: first tap after midnight cannot mutate or persist an expired board',async t=>{
 const h=harness(t,{time:Date.UTC(2026,9,3,15,59,59)}),app=await h.boot();await app.qa.start('daily');
 const before=app.getState(),records=terminalRecords(h),writes=h.writes.length;
 h.advance(2000); // No frame or visibility event has run to notice the reset yet.
 const result=await click(app,'tile:t0');
 assert.equal(result.ok,false,'the semantic pick must check expiry before applying or saving the command');
 assert.deepEqual(app.getState(),before);assert.deepEqual(terminalRecords(h),records);
 assert.equal(h.writes.length,writes);assert.equal(app.getModal(),'EXPIRED');
});

test('lifecycle safety: an older start response cannot overwrite a newer round',async t=>{
 const h=harness(t),app=await h.boot(),gate=h.holdNext('start');
 const older=app.qa.start('tutorial');await gate.entered;
 assert.equal((await app.qa.start('topic')).ok,true);
 const newer=app.getState(),scene=app.getScene();
 gate.release();await older;
 assert.deepEqual(app.getState(),newer,'the newer topic round owns the app after its start request supersedes the tutorial');
 assert.equal(app.getScene(),scene);
});

test('lifecycle safety: an old settlement response cannot clear a newer round recovery envelope',async t=>{
 const h=harness(t),old=await h.boot();await prepareLast(old);
 const oldGate=h.holdNext('settle'),oldFinishing=old.qa.pick(witness.at(-1));await oldGate.entered;
 const oldRoundId=old.getState().roundId;old.destroy();
 const current=await h.boot(); // Retry the old exact outbox through the live instance.
 assert.equal(current.getModal(),'WIN');await click(current,'return-home');await prepareLast(current);
 const newGate=h.holdNext('settle'),newFinishing=current.qa.pick(witness.at(-1));await newGate.entered;
 assert.notEqual(current.getState().roundId,oldRoundId);
 const newerRecords=terminalRecords(h),newerState=current.getState();
 assert.ok(newerRecords.active);assert.ok(newerRecords.outbox);
 oldGate.release();await oldFinishing;
 assert.deepEqual(terminalRecords(h),newerRecords,'late old acknowledgement must preserve the newer active and outbox records');
 assert.deepEqual(current.getState(),newerState);
 newGate.release();await newFinishing;
 assert.equal(current.getModal(),'WIN');assert.equal(current.getInfo().history.records.length,2);
 assert.equal(current.getInfo().totals.wins,1,'the two real settlements still deduplicate same-day contribution');
});
