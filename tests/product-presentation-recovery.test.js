'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const {localClient}=require('../src/product/client');
const Round=require('../src/product/round');
const deal={schema:'astra-deal-1',dealId:'presentation-recovery-three',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:Array.from({length:3},(_,i)=>({id:'p'+i,type:'T00',zone:'board',z:0,rect:{x:i*100,y:0,w:96,h:96}}))};
function harness(t){
 const values=new Map(),attempts=[],settlements=[],apps=[],gates=[];
 let time=Date.UTC(2026,9,2,6),offline=false,loseResponse=false,nextGate=null;
 const storage={get:key=>values.get(key),set:(key,value)=>values.set(key,value)};
 function create(){
  const base=localClient([deal],storage,'presentation-user',()=>time);
  const client={kind:'local',scope:'local',async request(action,data={}){
   if(action!=='settle')return base.request(action,data);
   attempts.push(JSON.parse(JSON.stringify(data)));
   const gate=nextGate;nextGate=null;if(gate)await gate.promise;
   if(offline)throw Error('NETWORK_DOWN');
   const result=await base.request(action,data);settlements.push(result);
   if(loseResponse){loseResponse=false;throw Error('RESPONSE_LOST');}
   return result;
  }};
  const ctx=new Proxy({measureText:value=>({width:String(value).length*7})},{get:(object,key)=>key in object?object[key]:()=>{}});
  const app=createFullApp({getContext:()=>ctx},[deal],390,844,1,{motion:true,storage,now:()=>time,client});
  apps.push(app);return app;
 }
 t.after(()=>{gates.forEach(gate=>gate.release());apps.forEach(app=>app.destroy());});
 return {create,boot:async()=>{const app=create();await app.ready;return app;},values,attempts,settlements,
  advance:ms=>time+=ms,offline:value=>offline=value,loseResponse:()=>loseResponse=true,
  holdNextSettlement(){let release;const promise=new Promise(resolve=>{release=resolve;});nextGate={promise,release};gates.push(nextGate);return release;}};
}
function target(app,id){const region=app.getHitRegions().find(region=>region.id===id);assert.ok(region,'missing '+id);assert.ok(region.enabled,'disabled '+id);return [region.x+region.w/2,region.y+region.h/2];}
async function click(app,id){return app.tap(...target(app,id));}
async function prepareLast(app,h){await app.qa.start('daily');for(const id of ['p0','p1']){assert.equal((await click(app,'tile:'+id)).ok,true);h.advance(250);app.frame();}}
async function complete(app,h){await prepareLast(app,h);assert.equal((await click(app,'tile:p2')).ok,true);assert.equal(app.getState().board.status,'WON');}
async function until(predicate){for(let i=0;i<20&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),'asynchronous setup did not reach its expected stage');}

test('presentation recovery: restoring a durable outcome locks input until the exact pending settlement returns',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');
 await click(first,'exit');const oldConfirm=target(first,'confirm-exit');await click(first,'cancel-exit');
 h.offline(true);for(const id of ['p0','p1','p2']){assert.equal((await click(first,'tile:'+id)).ok,true);if(id!=='p2'){h.advance(250);first.frame();}}
 const original=JSON.parse(h.values.get('outbox')).payload;first.destroy();h.offline(false);
 const release=h.holdNextSettlement(),restored=h.create();await until(()=>h.attempts.length===2);
 h.advance(1000);restored.frame();assert.equal(restored.getScene(),'PLAY');const terminal=restored.getState();
 assert.equal((await click(restored,'exit'))?.code,'UI_LOCKED');
 assert.equal((await restored.tap(...oldConfirm))?.code,'UI_LOCKED');
 assert.equal((await restored.qa.start('daily')).ok,false);
 assert.equal(restored.getScene(),'PLAY');assert.equal(restored.getModal(),null);assert.deepEqual(restored.getState(),terminal);
 assert.deepEqual(JSON.parse(h.values.get('outbox')).payload,original);
 release();await restored.ready;assert.equal(restored.getModal(),'WIN');assert.equal(restored.getInfo().totals.wins,1);
 assert.deepEqual(h.attempts.at(-1),original);assert.equal(restored.getInfo().history.records.length,1);
});

test('presentation recovery: failed final clear is durable before its deferred error panel and retries the same outcome',async t=>{
 const h=harness(t),app=await h.boot();h.offline(true);await complete(app,h);
 assert.equal(app.getModal(),null,'settlement errors must allow the last clear to finish');
 const queued=JSON.parse(h.values.get('outbox')),saved=JSON.parse(h.values.get('active-round'));
 assert.deepEqual(h.attempts,[queued.payload]);
 assert.equal(saved.ticket.id,queued.payload.ticketId);assert.equal(saved.log,queued.payload.log);assert.equal(saved.elapsedMs,queued.payload.elapsedMs);
 assert.equal(Round.restore(saved.log).state.board.status,'WON');
 assert.equal((await click(app,'exit')).code,'UI_LOCKED');
 h.advance(100);app.frame();assert.equal(app.getModal(),null);
 h.advance(1000);app.frame();assert.equal(app.getModal(),'SETTLEMENT_ERROR');
 assert.deepEqual(JSON.parse(h.values.get('outbox')).payload,queued.payload);
 h.offline(false);assert.equal((await click(app,'retry-settlement')).ok,true);
 assert.deepEqual(h.attempts,[queued.payload,queued.payload]);assert.equal(app.getModal(),'WIN');
 assert.equal(app.getInfo().totals.wins,1);assert.equal(app.getInfo().history.records.length,1);
});

test('presentation recovery: reloading during the final clear preserves ticket log and active duration',async t=>{
 const h=harness(t),first=await h.boot();h.offline(true);await complete(first,h);
 assert.equal(first.getModal(),null);const original=JSON.parse(h.values.get('outbox')).payload;
 first.destroy();const restored=await h.boot();
 assert.equal(restored.getModal(),'SETTLEMENT_ERROR');assert.equal(restored.getState().roundId,original.ticketId);
 assert.equal(restored.exportDiagnostic(),original.log);assert.equal(restored.qa.elapsed(),original.elapsedMs);
 h.advance(10000);restored.frame();h.offline(false);assert.equal((await click(restored,'retry-settlement')).ok,true);
 assert.ok(h.attempts.every(payload=>JSON.stringify(payload)===JSON.stringify(original)));
 assert.equal(restored.getInfo().totals.wins,1);assert.equal(restored.getInfo().history.records.length,1);
 restored.destroy();const acknowledged=await h.boot();assert.equal(acknowledged.getScene(),'HOME');assert.equal(acknowledged.getModal(),null);
});

test('presentation recovery: enabling reduced motion releases either terminal panel without another settlement',async t=>{
 for(const offline of [false,true]){
  const h=harness(t),app=await h.boot();h.offline(offline);await complete(app,h);
  assert.equal(app.getModal(),null);assert.equal(h.attempts.length,1);
  const before=app.getState(),pending=h.values.get('outbox');app.qa.settings({reducedMotion:true});
  assert.equal(app.getModal(),offline?'SETTLEMENT_ERROR':'WIN');assert.equal(h.attempts.length,1);
  assert.deepEqual(app.getState(),before);assert.equal(h.values.get('outbox'),pending);
  if(offline){h.offline(false);assert.equal((await click(app,'retry-settlement')).ok,true);assert.deepEqual(h.attempts[1],h.attempts[0]);}
  else{await click(app,'return-home');assert.equal(app.getScene(),'HOME');assert.equal(h.attempts.length,1);}
 }
});

test('presentation recovery: hide and resize cancel pressed tiles while a fresh release still plays',async t=>{
 const h=harness(t),app=await h.boot();await app.qa.start('daily');const before=app.getState();
 assert.equal(app.pointerDown(...target(app,'tile:p0'),7),true);await app.setVisible(false);
 assert.equal(await app.pointerUp(...target(app,'tile:p0'),7),false);
 await app.setVisible(true);assert.equal(await app.pointerUp(...target(app,'tile:p0'),7),false);assert.deepEqual(app.getState(),before);
 assert.equal(app.pointerDown(...target(app,'tile:p0'),8),true);app.resize(320,568,2);
 assert.equal(await app.pointerUp(...target(app,'tile:p0'),8),false);assert.deepEqual(app.getState(),before);assert.equal(h.attempts.length,0);
 assert.equal(app.pointerDown(...target(app,'tile:p0'),9),true);assert.equal((await app.pointerUp(...target(app,'tile:p0'),9)).ok,true);
 assert.equal(app.getState().board.rack.length,1);
});

test('presentation recovery: resizing before or after a terminal response cannot leave the outcome locked',async t=>{
 for(const delayed of [false,true])for(const offline of [false,true]){
  const h=harness(t),app=await h.boot();await prepareLast(app,h);h.offline(offline);
  const release=delayed?h.holdNextSettlement():null,picking=click(app,'tile:p2');
  if(!delayed)await picking;
  assert.equal(app.getState().board.status,'WON');assert.equal(h.attempts.length,1);
  const original=h.attempts[0];app.resize(430,932,2);
  if(release){release();await picking;}
  assert.equal(app.getModal(),offline?'SETTLEMENT_ERROR':'WIN');assert.equal(h.attempts.length,1);
  if(offline){h.offline(false);assert.equal((await click(app,'retry-settlement')).ok,true);assert.deepEqual(h.attempts[1],original);}
  await click(app,'return-home');assert.equal(app.getScene(),'HOME');assert.equal(app.getModal(),null);
  assert.equal(app.getInfo().totals.wins,1);assert.equal(app.getInfo().history.records.length,1);
 }
});

test('presentation recovery: a hidden terminal failure resumes with a usable retry and no extra playing time',async t=>{
 const h=harness(t),app=await h.boot();await prepareLast(app,h);const release=h.holdNextSettlement();
 const picking=click(app,'tile:p2'),original=JSON.parse(h.values.get('outbox')).payload;
 await app.setVisible(false);h.advance(5000);app.frame();h.offline(true);release();await picking;
 assert.equal((await click(app,'retry-settlement')).code,'UI_LOCKED');assert.equal(h.attempts.length,1);
 await app.setVisible(true);assert.equal(app.getModal(),'SETTLEMENT_ERROR');assert.equal(app.qa.elapsed(),original.elapsedMs);
 h.offline(false);assert.equal((await click(app,'retry-settlement')).ok,true);
 assert.deepEqual(h.attempts,[original,original]);assert.equal(app.getInfo().totals.wins,1);
});

test('presentation recovery: an accepted response loss and another animated daily clear still add one sheep',async t=>{
 const h=harness(t),app=await h.boot();h.loseResponse();await complete(app,h);const original=h.attempts[0],assigned=app.getState().initialDeal;
 assert.equal(app.getModal(),null);h.advance(1000);app.frame();assert.equal(app.getModal(),'SETTLEMENT_ERROR');
 assert.equal((await click(app,'retry-settlement')).ok,true);assert.deepEqual(h.attempts[1],original);
 assert.equal(h.settlements[0].replayed,false);assert.equal(h.settlements[1].replayed,true);
 assert.equal(app.getInfo().totals.wins,1);assert.equal(app.getInfo().history.records.length,1);
 await click(app,'return-home');await complete(app,h);assert.deepEqual(app.getState().initialDeal,assigned);
 assert.equal(app.getInfo().totals.wins,1);assert.equal(app.getInfo().history.records.length,2);
 h.advance(1000);app.frame();assert.equal(app.getModal(),'WIN');assert.equal(h.attempts.length,3);
});
