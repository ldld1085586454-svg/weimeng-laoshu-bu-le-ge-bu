'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const {localClient}=require('../src/product/client');
const Round=require('../src/product/round');

function fixture(types='ABCABCABC'){
 return {schema:'astra-deal-1',dealId:'recovery-fixture-'+types.length,layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
  cells:[...types].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%3*100,y:Math.floor(i/3)*100,w:96,h:96}}))};
}
const witness=['t0','t3','t6','t1','t4','t7','t2','t5','t8'];
function harness(t,deal=fixture()){
 const values=new Map(),attempts=[],settlements=[],apps=[];
 let time=Date.UTC(2026,9,2,4),offline=false,loseResponse=false,failOutbox=false,failClearOutbox=false,failRefresh=false,bootstrapFailure=false;
 const storage={get:key=>values.get(key),set(key,value){
  if(key==='outbox'&&value&&failOutbox)throw Error('OUTBOX_WRITE_FAILED');
  if(key==='outbox'&&!value&&failClearOutbox)throw Error('OUTBOX_CLEAR_FAILED');
  values.set(key,value);
 }};
 async function boot(scope='local'){
  const base=localClient([deal],storage,'recovery-user',()=>time);
  const client={kind:base.kind,scope,async request(action,data={}){
   if(action==='bootstrap'&&bootstrapFailure){bootstrapFailure=false;throw Error('BOOTSTRAP_DOWN');}
   if(action!=='settle')return base.request(action,data);
   attempts.push(JSON.parse(JSON.stringify(data)));
   if(offline)throw Error('NETWORK_DOWN');
   let result;try{result=await base.request(action,data);}finally{if(failRefresh){failRefresh=false;bootstrapFailure=true;}}
   settlements.push(result);
   if(loseResponse){loseResponse=false;throw Error('RESPONSE_LOST');}
   return result;
  }};
  const context=new Proxy({measureText:value=>({width:String(value).length*7})},{get:(object,key)=>key in object?object[key]:()=>{}});
  const app=createFullApp({getContext:()=>context},[deal],390,844,1,{motion:false,storage,now:()=>time,client});
  apps.push(app);await app.ready;return app;
 }
 t.after(()=>apps.forEach(app=>app.destroy()));
 return {boot,values,attempts,settlements,advance:ms=>time+=ms,
  offline:value=>offline=value,loseResponse:()=>loseResponse=true,failOutbox:value=>failOutbox=value,failClearOutbox:value=>failClearOutbox=value,failRefresh:()=>failRefresh=true};
}
async function click(app,id){
 const region=app.getHitRegions().find(region=>region.id===id);
 assert.ok(region,'missing '+id);assert.ok(region.enabled,'disabled '+id);
 return app.tap(region.x+region.w/2,region.y+region.h/2);
}
async function finish(app,h){for(const id of witness){h.advance(25);assert.equal((await app.qa.pick(id)).ok,true);}}
async function win(app,h){assert.equal((await app.qa.start('daily')).ok,true);await finish(app,h);}

test('recovery: offline completed outcome reloads with its exact payload and visible retry',async t=>{
 const h=harness(t),first=await h.boot();h.offline(true);await win(first,h);
 assert.equal(first.getModal(),'SETTLEMENT_ERROR');
 const original=JSON.parse(h.values.get('outbox')).payload;first.destroy();
 const restored=await h.boot();
 assert.equal(restored.getModal(),'SETTLEMENT_ERROR');
 assert.equal(restored.getState().roundId,original.ticketId);
 assert.ok(restored.getHitRegions().some(region=>region.id==='retry-settlement'&&region.enabled));
 assert.equal((await restored.qa.start('daily')).ok,false);
 assert.deepEqual(JSON.parse(h.values.get('outbox')).payload,original,'a new round cannot replace the completed outcome');
 h.advance(1000);h.offline(false);assert.equal((await click(restored,'retry-settlement')).ok,true);
 assert.equal(restored.getModal(),'WIN');assert.equal(restored.getInfo().totals.wins,1);
 assert.ok(h.attempts.every(payload=>JSON.stringify(payload)===JSON.stringify(original)),'retry must retain ticket, log, and elapsed time');
 restored.destroy();const acknowledged=await h.boot();
 assert.equal(acknowledged.getScene(),'HOME');assert.equal(acknowledged.getModal(),null);
 assert.equal(acknowledged.getInfo().history.records.length,1);
});

test('recovery: a durable winning action survives failure to create the outbox',async t=>{
 const h=harness(t),first=await h.boot();h.failOutbox(true);await win(first,h);
 assert.equal(first.getModal(),'SETTLEMENT_ERROR');assert.equal(h.attempts.length,0);
 const saved=JSON.parse(h.values.get('active-round'));
 assert.equal(Round.restore(saved.log).state.board.status,'WON');
 const duration=first.qa.elapsed();first.destroy();h.failOutbox(false);h.offline(true);
 const restored=await h.boot();assert.equal(restored.getModal(),'SETTLEMENT_ERROR');
 assert.equal(restored.getState().roundId,saved.ticket.id);
 h.advance(1000);h.offline(false);assert.equal((await click(restored,'retry-settlement')).ok,true);
 assert.equal(restored.getInfo().totals.wins,1);
 assert.deepEqual(h.attempts.at(-1),{ticketId:saved.ticket.id,log:saved.log,elapsedMs:duration});
});

test('recovery: accepted settlement with a lost response retries once without duplicate contribution',async t=>{
 const h=harness(t),first=await h.boot();h.loseResponse();await win(first,h);
 assert.equal(first.getModal(),'SETTLEMENT_ERROR');assert.equal(h.settlements[0].replayed,false);
 const original=JSON.parse(h.values.get('outbox')).payload;first.destroy();h.offline(true);
 const restored=await h.boot();assert.equal(restored.getModal(),'SETTLEMENT_ERROR');
 assert.equal(restored.getInfo().totals.wins,1);
 h.offline(false);assert.equal((await click(restored,'retry-settlement')).ok,true);
 assert.equal(h.settlements.at(-1).replayed,true);
 assert.deepEqual(h.attempts.at(-1),original);assert.equal(restored.getInfo().totals.wins,1);
 assert.equal(restored.getInfo().history.records.length,1);
 restored.destroy();const acknowledged=await h.boot();
 assert.equal(acknowledged.getModal(),null);assert.equal(acknowledged.getScene(),'HOME');
 assert.equal(acknowledged.getInfo().history.records.length,1);
});

test('recovery: same-day daily replay uses the same deal without adding a second sheep',async t=>{
 const h=harness(t),app=await h.boot();await click(app,'start');
 for(let i=0;i<12;i++)await app.qa.pick('teach-'+i);
 await click(app,'next-daily');const original=app.getState().initialDeal;
 await finish(app,h);assert.equal(app.getInfo().totals.wins,1);await click(app,'return-home');
 await click(app,'start');assert.equal(app.getScene(),'PLAY');
 assert.deepEqual(app.getState().initialDeal,original);await finish(app,h);
 assert.equal(app.getInfo().totals.wins,1);
 assert.equal(app.getInfo().history.records.filter(record=>record.mode==='daily').length,2);
});

test('recovery: ordinary playing saves remain excluded from automatic restoration',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');await first.qa.pick('t0');first.destroy();
 const restored=await h.boot();assert.equal(restored.getScene(),'HOME');assert.equal(restored.getState(),null);
 assert.equal(restored.getModal(),null);assert.equal(h.attempts.length,0);
});

test('recovery: an earned reward still restores and applies to its original round',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');await first.qa.pick('t0');
 await click(first,'undo');await click(first,'grant');await first.qa.failEarned();
 const id=first.getState().roundId;first.destroy();const restored=await h.boot();
 assert.equal(restored.getModal(),'RECOVERY');assert.equal(restored.getState().roundId,id);
 assert.equal((await click(restored,'retry-grant')).ok,true);
 assert.equal(restored.getState().used.undo,1);assert.equal(restored.getState().board.rack.length,0);
 assert.equal(restored.getMetrics().videoRequests,1);assert.equal(h.attempts.length,0);
});

test('recovery: expired completed outcomes cannot count toward a new cycle',async t=>{
 const h=harness(t),first=await h.boot();h.offline(true);await win(first,h);first.destroy();
 h.advance(86400000);h.offline(false);const restored=await h.boot();
 assert.equal(restored.getScene(),'HOME');assert.equal(restored.getState(),null);assert.equal(restored.getModal(),null);
 assert.equal(restored.getInfo().totals.wins,0);assert.equal(h.values.get('outbox'),'');
 assert.equal((await restored.qa.start('daily')).ok,true);
});

test('recovery: another client scope cannot restore or submit the saved outcome',async t=>{
 const h=harness(t),first=await h.boot();h.offline(true);await win(first,h);first.destroy();
 const attempts=h.attempts.length,outbox=h.values.get('outbox'),active=h.values.get('active-round');
 const other=await h.boot('other-service');
 assert.equal(other.getScene(),'HOME');assert.equal(other.getState(),null);assert.equal(h.attempts.length,attempts);
 assert.equal(h.values.get('outbox'),outbox);assert.equal(h.values.get('active-round'),active);
});

test('recovery: first loss awaiting a revival decision is not automatically settled',async t=>{
 const h=harness(t,fixture('ABCDEFGHIJABCDEFGHIJABCDEFGHIJ')),first=await h.boot();await first.qa.start('daily');
 for(let i=0;i<7;i++)await first.qa.pick('t'+i);
 assert.equal(first.getModal(),'REVIVE');first.destroy();const restored=await h.boot();
 assert.equal(restored.getScene(),'HOME');assert.equal(restored.getState(),null);
 assert.equal(h.attempts.length,0);assert.equal(restored.getInfo().today.failures,0);
});

test('recovery: explicitly ending the first loss survives outbox creation failure',async t=>{
 const h=harness(t,fixture('ABCDEFGHIJABCDEFGHIJABCDEFGHIJ')),first=await h.boot();await first.qa.start('daily');
 for(let i=0;i<7;i++)await first.qa.pick('t'+i);
 h.failOutbox(true);await click(first,'give-up');assert.equal(first.getModal(),'SETTLEMENT_ERROR');
 first.destroy();h.failOutbox(false);const restored=await h.boot();
 assert.equal(restored.getInfo().today.failures,1);assert.equal(restored.getInfo().history.records.length,1);
 assert.equal(restored.getModal(),'LOSE');
});

test('recovery: pending outbox can retry after accepted settlement cleared the active log',async t=>{
 const h=harness(t),first=await h.boot();h.failClearOutbox(true);await win(first,h);
 assert.equal(first.getModal(),'SETTLEMENT_ERROR');const original=JSON.parse(h.values.get('outbox')).payload;
 assert.equal(h.values.get('active-round'),'','the outbox must remain recoverable after active cleanup');
 first.destroy();h.failClearOutbox(false);h.offline(true);const restored=await h.boot();
 assert.equal(restored.getModal(),'SETTLEMENT_ERROR');
 h.offline(false);assert.equal((await click(restored,'retry-settlement')).ok,true);
 assert.deepEqual(h.attempts.at(-1),original);assert.equal(restored.getInfo().totals.wins,1);
 assert.equal(restored.getInfo().history.records.length,1);
});

test('recovery: legacy outbox envelopes retain the ticket from the matching active save',async t=>{
 const h=harness(t),first=await h.boot();h.offline(true);await win(first,h);first.destroy();
 const envelope=JSON.parse(h.values.get('outbox'));delete envelope.ticket;h.values.set('outbox',JSON.stringify(envelope));
 const restored=await h.boot();assert.equal(restored.getModal(),'SETTLEMENT_ERROR');
 assert.equal(restored.getState().roundId,envelope.payload.ticketId);
 h.offline(false);await click(restored,'retry-settlement');assert.deepEqual(h.attempts.at(-1),envelope.payload);
});

test('recovery: acknowledged legacy terminal saves do not trap play on an old duration conflict',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');
 h.advance(25);await first.qa.pick(witness[0]);const ticket=JSON.parse(h.values.get('active-round')).ticket;
 for(const id of witness.slice(1)){h.advance(25);await first.qa.pick(id);}
 const accepted=h.attempts[0];assert.equal(first.getInfo().totals.wins,1);first.destroy();
 // Earlier builds kept this terminal save after acknowledgment and captured its time before final persistence.
 h.values.set('active-round',JSON.stringify({scope:'local',ticket,log:accepted.log,elapsedMs:accepted.elapsedMs-1}));
 h.offline(true);const offline=await h.boot();assert.equal(offline.getModal(),'SETTLEMENT_ERROR');offline.destroy();
 h.offline(false);const acknowledged=await h.boot();
 assert.equal(acknowledged.getScene(),'HOME');assert.equal(acknowledged.getModal(),null);
 assert.equal(acknowledged.getInfo().totals.wins,1);assert.equal(acknowledged.getInfo().history.records.length,1);
 assert.equal(h.values.get('active-round'),'');assert.equal(h.values.get('outbox'),'');
 assert.equal((await acknowledged.qa.start('daily')).ok,true);
});

test('recovery: an explicit queued payload conflict remains visible rather than becoming acknowledged',async t=>{
 const h=harness(t),first=await h.boot();h.loseResponse();await win(first,h);first.destroy();
 const queued=JSON.parse(h.values.get('outbox'));queued.payload.elapsedMs--;
 h.values.set('outbox',JSON.stringify(queued));const restored=await h.boot();
 assert.equal(restored.getModal(),'SETTLEMENT_ERROR');assert.equal(restored.getInfo().totals.wins,1);
 assert.deepEqual(JSON.parse(h.values.get('outbox')).payload,queued.payload);
 assert.equal((await click(restored,'retry-settlement')).code,'SETTLEMENT_CONFLICT');
});

test('recovery: refreshing legacy acknowledgment failure retains a working retry',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');
 h.advance(25);await first.qa.pick(witness[0]);const ticket=JSON.parse(h.values.get('active-round')).ticket;
 for(const id of witness.slice(1)){h.advance(25);await first.qa.pick(id);}
 const accepted=h.attempts[0];first.destroy();
 h.values.set('active-round',JSON.stringify({scope:'local',ticket,log:accepted.log,elapsedMs:accepted.elapsedMs-1}));
 h.failRefresh();const restored=await h.boot();assert.equal(restored.getModal(),'SETTLEMENT_ERROR');
 assert.equal(restored.getState()?.roundId,accepted.ticketId);
 assert.equal((await click(restored,'retry-settlement')).ok,true);
 assert.equal(restored.getScene(),'HOME');assert.equal(restored.getModal(),null);
 assert.equal(restored.getInfo().totals.wins,1);assert.equal(restored.getInfo().history.records.length,1);
});
