'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createController}=require('../src/product/controller');
const Round=require('../src/product/round');
const filename=path.join(__dirname,'../src/product/progress.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(onChange){
 const exports=fs.existsSync(filename)?require(filename):{};assert.equal(typeof exports.createProgressSync,'function','createProgressSync must be implemented');
 const calls=[],client={scope:'online:service|user-A',request(action,data){return new Promise((resolve,reject)=>calls.push({action,data,resolve,reject}));}};
 const sync=exports.createProgressSync(client,{onChange});return {sync,calls,client};
}
const fixture={schema:'astra-deal-1',dealId:'progress-sync-fixture',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:[...'ABCABCABC'].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%3*100,y:Math.floor(i/3)*100,w:96,h:96}}))};
const logs=new Map();
function progress(id='ticket-A',elapsedMs=10){
 const key=id+'|'+elapsedMs;
 if(!logs.has(key)){const controller=createController(fixture,{roundId:id||'invalid-ticket-fixture'});controller.pick('t0');logs.set(key,controller.export());}
 return {ticket:{id,userId:'user-A'},log:logs.get(key),elapsedMs};
}
const result=(revision,p=progress())=>({revision,progress:p});
const error=code=>Object.assign(new Error(code),{code});
const rejected=(p,code)=>assert.rejects(p,e=>e.code===code);
async function loaded(revision=0,p=null,onChange){const h=setup(onChange),read=h.sync.load();await tick();h.calls[0].resolve(result(revision,p));await read;return h;}

test('progress load establishes cloud revision and returns independent snapshots',async()=>{
 const {sync,calls}=setup();assert.deepEqual(sync.getStatus(),{revision:0,pending:false,error:null,progress:null});
 const read=sync.load();await tick();assert.equal(calls[0].action,'progress.get');calls[0].resolve(result(4));const value=await read;
 assert.deepEqual(value,result(4));assert.deepEqual(sync.getStatus(),{revision:4,pending:false,error:null,progress:progress()});
 value.progress.log='mutated';sync.getStatus().progress.ticket.id='mutated';assert.deepEqual(sync.getStatus().progress,progress());sync.destroy();
});

test('save serializes an immutable snapshot with the latest confirmed CAS revision',async()=>{
 const {sync,calls}=await loaded(3),input=progress(),save=sync.save(input);input.log='mutated';input.ticket.id='mutated';await tick();
 assert.deepEqual(calls[1].data,{expectedRevision:3,ticketId:'ticket-A',log:progress().log,elapsedMs:10});assert.equal(calls[1].action,'progress.put');
 assert.deepEqual(sync.getStatus().progress,progress());assert.equal(sync.getStatus().pending,true);calls[1].resolve(result(4));assert.deepEqual(await save,result(4));
 assert.deepEqual(sync.getStatus(),{revision:4,pending:false,error:null,progress:progress()});sync.destroy();
});

test('save coalesces only unsent snapshots of the same ticket and settles every caller',async()=>{
 const {sync,calls}=await loaded(),a=sync.save(progress('ticket-A',1));await tick();const b=sync.save(progress('ticket-A',2)),c=sync.save(progress('ticket-A',3));await tick();assert.equal(calls.length,2);
 assert.equal(sync.getStatus().progress.elapsedMs,3);calls[1].resolve(result(1,progress('ticket-A',1)));await a;await tick();assert.equal(calls.length,3);
 assert.deepEqual(calls[2].data,{expectedRevision:1,ticketId:'ticket-A',log:progress('ticket-A',3).log,elapsedMs:3});calls[2].resolve(result(2,progress('ticket-A',3)));
 assert.deepEqual(await Promise.all([b,c]),[result(2,progress('ticket-A',3)),result(2,progress('ticket-A',3))]);sync.destroy();
});

test('different tickets stay separate and an old response cannot replace latest local progress',async()=>{
 const {sync,calls}=await loaded(),a=sync.save(progress('ticket-A',1));await tick();const b=sync.save(progress('ticket-B',2));
 calls[1].resolve(result(1,progress('ticket-A',1)));await a;await tick();assert.equal(sync.getStatus().progress.ticket.id,'ticket-B');assert.equal(calls[2].data.ticketId,'ticket-B');
 calls[2].resolve(result(2,progress('ticket-B',2)));await b;assert.equal(sync.getStatus().progress.ticket.id,'ticket-B');sync.destroy();
});

test('remove is ordered after saves and before another ticket, using sequential revisions',async()=>{
 const {sync,calls}=await loaded(),a=sync.save(progress()),remove=sync.remove('ticket-A'),b=sync.save(progress('ticket-B',2)),flushed=sync.flush();await tick();assert.equal(calls.length,2);
 calls[1].resolve(result(1));await a;await tick();assert.equal(calls[2].action,'progress.clear');assert.deepEqual(calls[2].data,{expectedRevision:1,ticketId:'ticket-A'});
 calls[2].resolve(result(2,null));await remove;await tick();assert.equal(sync.getStatus().progress.ticket.id,'ticket-B');assert.equal(calls[3].data.expectedRevision,2);
 calls[3].resolve(result(3,progress('ticket-B',2)));await b;await flushed;assert.equal(sync.getStatus().pending,false);sync.destroy();
});

test('load waits behind in-flight writes and does not overlap requests',async()=>{
 const {sync,calls}=await loaded(),save=sync.save(progress()),read=sync.load();await tick();assert.equal(calls.length,2);
 calls[1].resolve(result(1));await save;await tick();assert.equal(calls.length,3);assert.equal(calls[2].action,'progress.get');calls[2].resolve(result(1));assert.deepEqual(await read,result(1));sync.destroy();
});

test('network failure retains pending progress and retry sends the exact original CAS operation',async()=>{
 const {sync,calls}=await loaded(4),a=sync.save(progress('ticket-A',1)),aFailed=rejected(a,'NETWORK_FAILED');await tick();const b=sync.save(progress('ticket-A',2)),bFailed=rejected(b,'NETWORK_FAILED');const flushFailed=rejected(sync.flush(),'NETWORK_FAILED');
 calls[1].reject(error('NETWORK_FAILED'));await Promise.all([aFailed,bFailed,flushFailed]);assert.equal(sync.getStatus().pending,true);assert.equal(sync.getStatus().progress.elapsedMs,2);assert.equal(sync.getStatus().error.code,'NETWORK_FAILED');
 const original=structuredClone(calls[1].data),retry=sync.retry();await tick();assert.deepEqual(calls[2].data,original);calls[2].resolve(result(5,progress('ticket-A',1)));await tick();assert.equal(calls[3].data.expectedRevision,5);
 calls[3].resolve(result(6,progress('ticket-A',2)));await retry;assert.deepEqual(sync.getStatus(),{revision:6,pending:false,error:null,progress:progress('ticket-A',2)});sync.destroy();
});

test('cloud conflict retains local data and new saves cannot silently rebase it',async()=>{
 const {sync,calls}=await loaded(2),save=sync.save(progress()),failed=rejected(save,'PROGRESS_CONFLICT');await tick();calls[1].reject(error('PROGRESS_CONFLICT'));await failed;
 await rejected(sync.save(progress('ticket-A',20)),'PROGRESS_CONFLICT');await tick();assert.equal(calls.length,2);assert.equal(sync.getStatus().pending,true);assert.equal(sync.getStatus().progress.elapsedMs,20);sync.destroy();
});

test('explicit load preserves conflicted local pending and retry still uses the original revision',async()=>{
 const {sync,calls}=await loaded(2),save=sync.save(progress()),failed=rejected(save,'PROGRESS_CONFLICT');await tick();calls[1].reject(error('PROGRESS_CONFLICT'));await failed;
 const read=sync.load();await tick();calls[2].resolve(result(8,progress('ticket-remote',80)));assert.deepEqual(await read,result(8,progress('ticket-remote',80)));
 assert.equal(sync.getStatus().revision,8);assert.equal(sync.getStatus().progress.ticket.id,'ticket-A');assert.equal(sync.getStatus().pending,true);assert.equal(sync.getStatus().error.code,'PROGRESS_CONFLICT');
 const retry=sync.retry(),retryFailed=rejected(retry,'PROGRESS_CONFLICT');await tick();assert.equal(calls[3].data.expectedRevision,2);calls[3].reject(error('PROGRESS_CONFLICT'));await retryFailed;sync.destroy();
});

test('only a successful explicit load plus a new save resolves a conflict with the cloud revision',async()=>{
 const {sync,calls}=await loaded(2),save=sync.save(progress()),failed=rejected(save,'PROGRESS_CONFLICT');await tick();calls[1].reject(error('PROGRESS_CONFLICT'));await failed;
 const read=sync.load();await tick();calls[2].resolve(result(8,progress('ticket-A',80)));await read;
 const replacement=sync.save(progress('ticket-A',90));await tick();assert.deepEqual(calls[3].data,{expectedRevision:8,ticketId:'ticket-A',log:progress('ticket-A',90).log,elapsedMs:90});
 calls[3].resolve(result(9,progress('ticket-A',90)));await replacement;assert.equal(sync.getStatus().pending,false);assert.equal(sync.getStatus().error,null);sync.destroy();
});

test('failed reads never authorize replacing a conflicted CAS baseline',async()=>{
 const {sync,calls}=await loaded(2),save=sync.save(progress()),failed=rejected(save,'PROGRESS_CONFLICT');await tick();calls[1].reject(error('PROGRESS_CONFLICT'));await failed;
 const read=sync.load(),readFailed=rejected(read,'NETWORK_FAILED');await tick();calls[2].reject(error('NETWORK_FAILED'));await readFailed;
 await rejected(sync.save(progress('ticket-A',20)),'PROGRESS_CONFLICT');assert.equal(calls.length,3);sync.destroy();
});

test('network-failed snapshots are not silently discarded by an explicit load',async()=>{
 const {sync,calls}=await loaded(2),save=sync.save(progress()),failed=rejected(save,'NETWORK_FAILED');await tick();calls[1].reject(error('NETWORK_FAILED'));await failed;
 const read=sync.load();await tick();calls[2].resolve(result(3,progress('ticket-remote',30)));await read;assert.equal(sync.getStatus().progress.ticket.id,'ticket-A');assert.equal(sync.getStatus().pending,true);
 const retry=sync.retry();await tick();assert.equal(calls[3].data.expectedRevision,2);calls[3].resolve(result(3));await retry;sync.destroy();
});

test('clear failure preserves its pending command and retries without advancing revision',async()=>{
 const {sync,calls}=await loaded(3,progress()),clear=sync.remove('ticket-A'),failed=rejected(clear,'NETWORK_FAILED');await tick();calls[1].reject(error('NETWORK_FAILED'));await failed;
 assert.equal(sync.getStatus().pending,true);assert.equal(sync.getStatus().progress,null);const retry=sync.retry();await tick();assert.equal(calls[2].action,'progress.clear');assert.deepEqual(calls[2].data,{expectedRevision:3,ticketId:'ticket-A'});
 calls[2].resolve(result(4,null));await retry;assert.equal(sync.getStatus().revision,4);sync.destroy();
});

test('destroy rejects outstanding consumers, stops queued writes and ignores late success',async()=>{
 const changes=[],{sync,calls}=await loaded(0,null,state=>changes.push(state)),a=sync.save(progress('ticket-A',1)),aFailed=rejected(a,'PROGRESS_SYNC_DESTROYED');await tick();const b=sync.save(progress('ticket-A',2)),bFailed=rejected(b,'PROGRESS_SYNC_DESTROYED'),flushFailed=rejected(sync.flush(),'PROGRESS_SYNC_DESTROYED');
 const count=changes.length;sync.destroy();sync.destroy();await Promise.all([aFailed,bFailed,flushFailed]);calls[1].resolve(result(1));await tick();assert.equal(calls.length,2);assert.equal(changes.length,count);
 await rejected(sync.load(),'PROGRESS_SYNC_DESTROYED');await rejected(sync.save(progress()),'PROGRESS_SYNC_DESTROYED');await rejected(sync.remove('ticket-A'),'PROGRESS_SYNC_DESTROYED');await rejected(sync.retry(),'PROGRESS_SYNC_DESTROYED');
});

test('identity change rejects late cloud data and prevents any further use of the old synchronizer',async()=>{
 const {sync,calls,client}=await loaded(),save=sync.save(progress()),failed=rejected(save,'IDENTITY_CHANGED');await tick();client.scope='online:service|user-B';calls[1].resolve(result(1));await failed;
 assert.equal(sync.getStatus().revision,0);assert.equal(sync.getStatus().progress.ticket.userId,'user-A');await rejected(sync.retry(),'IDENTITY_CHANGED');await rejected(sync.load(),'IDENTITY_CHANGED');assert.equal(calls.length,2);sync.destroy();
});

test('onChange receives snapshots and exceptions cannot break queue processing',async()=>{
 let callsBack=0;const {sync,calls}=await loaded(0,null,status=>{callsBack++;if(status.progress)status.progress.ticket.id='mutated';throw Error('UI callback');});
 const save=sync.save(progress());await tick();calls[1].resolve(result(1));await save;assert.equal(sync.getStatus().progress.ticket.id,'ticket-A');assert.ok(callsBack>=2);sync.destroy();
});

test('invalid cloud responses fail closed without publishing a new revision or losing pending data',async()=>{
 const {sync,calls}=await loaded(2),save=sync.save(progress()),failed=rejected(save,'INVALID_PROGRESS_RESPONSE');await tick();calls[1].resolve({revision:-1,progress:null});await failed;
 assert.equal(sync.getStatus().revision,2);assert.equal(sync.getStatus().pending,true);assert.equal(sync.getStatus().progress.ticket.id,'ticket-A');sync.destroy();
});

test('invalid local snapshots reject before queueing or sending a request',async()=>{
 const {sync,calls}=await loaded();
 for(const value of [null,{},progress('',10),{...progress(),elapsedMs:-1},{...progress(),elapsedMs:0.5},{...progress(),log:{}},{...progress(),log:[]},{...progress(),log:''},{...progress(),log:'x'.repeat(8*1024*1024+1)}])await rejected(sync.save(value),'INVALID_PROGRESS');
 await rejected(sync.remove(''),'INVALID_PROGRESS');assert.equal(calls.length,1);assert.equal(sync.getStatus().pending,false);sync.destroy();
});

test('explicit discard removes only a settled ticket and reloads before sending retained other-ticket writes',async()=>{
 const {sync,calls}=await loaded(2),a=sync.save(progress('ticket-A')),aFailed=rejected(a,'NETWORK_FAILED');await tick();const b=sync.save(progress('ticket-B',20)),bFailed=rejected(b,'NETWORK_FAILED');
 calls[1].reject(error('NETWORK_FAILED'));await Promise.all([aFailed,bFailed]);await sync.discardPending('ticket-A');await tick();assert.equal(calls.length,2);assert.equal(sync.getStatus().progress.ticket.id,'ticket-B');assert.equal(sync.getStatus().error,null);
 const read=sync.load();await tick();assert.equal(calls[2].action,'progress.get');calls[2].resolve(result(7,null));await read;await tick();assert.equal(calls[3].data.ticketId,'ticket-B');assert.equal(calls[3].data.expectedRevision,7);
 const flushed=sync.flush();calls[3].resolve(result(8,progress('ticket-B',20)));await flushed;sync.destroy();
});

test('discard isolates same-ticket in-flight replies without overlapping a read or losing another ticket',async()=>{
 const {sync,calls}=await loaded(2),a=sync.save(progress('ticket-A')),aFailed=rejected(a,'PROGRESS_DISCARDED');await tick();const same=sync.save(progress('ticket-A',20)),sameFailed=rejected(same,'PROGRESS_DISCARDED'),other=sync.save(progress('ticket-B',30));
 await sync.discardPending('ticket-A');await Promise.all([aFailed,sameFailed]);const read=sync.load();await tick();assert.equal(calls.length,2);assert.equal(sync.getStatus().progress.ticket.id,'ticket-B');
 calls[1].resolve(result(3));await tick();assert.equal(sync.getStatus().revision,2);assert.equal(calls.length,3);assert.equal(calls[2].action,'progress.get');calls[2].resolve(result(9,null));await read;await tick();assert.equal(calls[3].data.expectedRevision,9);assert.equal(calls[3].data.ticketId,'ticket-B');
 calls[3].resolve(result(10,progress('ticket-B',30)));await other;sync.destroy();
});

test('discarded late failures cannot block a reload and confirmed same-ticket progress is cleared',async()=>{
 const {sync,calls}=await loaded(2,progress()),save=sync.save(progress()),failed=rejected(save,'PROGRESS_DISCARDED');await tick();await sync.discardPending('ticket-A');await failed;assert.equal(sync.getStatus().progress,null);
 const read=sync.load();calls[1].reject(error('NETWORK_FAILED'));await tick();assert.equal(sync.getStatus().error,null);calls[2].resolve(result(8,null));await read;assert.equal(sync.getStatus().pending,false);sync.destroy();
});

test('discard never accepts a cloud read that began before the settlement decision',async()=>{
 const {sync,calls}=await loaded(2,progress()),oldRead=sync.load(),oldFailed=rejected(oldRead,'PROGRESS_DISCARDED');await tick();await sync.discardPending('ticket-A');await oldFailed;
 const newRead=sync.load();calls[1].resolve(result(2));await tick();assert.equal(sync.getStatus().progress,null);assert.equal(calls[2].action,'progress.get');calls[2].resolve(result(3,null));await newRead;sync.destroy();
});


test('cloud progress round-trips the actual controller serialization and remains replayable',async()=>{
 const source=progress('serialized-ticket',30);assert.equal(typeof source.log,'string');assert.equal(Round.restore(source.log).ok,true);
 const {sync,calls}=await loaded(0,null),save=sync.save(source);await tick();assert.equal(calls[1].data.log,source.log);calls[1].resolve(result(1,source));await save;
 const restored=Round.restore(sync.getStatus().progress.log);assert.equal(restored.ok,true);assert.equal(restored.state.roundId,'serialized-ticket');assert.deepEqual(restored.state.board.rack,['t0']);sync.destroy();
});

test('discard before a queued transport starts never sends that discarded write',async()=>{
 const {sync,calls}=await loaded(2),save=sync.save(progress()),failed=rejected(save,'PROGRESS_DISCARDED');await sync.discardPending('ticket-A');await failed;await tick();assert.equal(calls.length,1);
 const read=sync.load();await tick();assert.equal(calls[1].action,'progress.get');calls[1].resolve(result(3,null));await read;sync.destroy();
});
