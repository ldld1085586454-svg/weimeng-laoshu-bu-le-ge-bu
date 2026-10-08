'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const {createSocial}=require('../src/product/social');
const {createController}=require('../src/product/controller');
const deal={schema:'astra-deal-1',dealId:'cloud-ui-fixture',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:[...'ABCABCABC'].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%3*100,y:Math.floor(i/3)*100,w:96,h:96}}))};
async function setup(t,options={}){let time=Date.UTC(2026,9,3,4),revision=0,progress=null;const calls=[],values=new Map(),apps=[];
 const social=createSocial({deals:[deal],now:()=>time});
 const client={kind:'online',scope:'online:https://example.test|u1',ready:Promise.resolve(),request:async(action,data={})=>{
  calls.push({action,data});
  if(action==='progress.get')return {revision,progress};
  if(action==='progress.put'){if(data.expectedRevision!==revision)throw Error('PROGRESS_CONFLICT');const ticket=JSON.parse(social.export()).tickets[data.ticketId];progress={ticket,log:data.log,elapsedMs:data.elapsedMs};return {revision:++revision,progress};}
  if(action==='progress.clear'){if(data.expectedRevision!==revision)throw Error('PROGRESS_CONFLICT');progress=null;return {revision:++revision,progress};}
  if(action==='reward.offer')return {token:require('../src/product/round').restore(data.log).state.pending.token};
  if(action==='reward.observe'){if(options.verify)await options.verify();return {authorized:true,token:data.token};}
  const result=social.call('u1',action,data);
  if(action==='bootstrap')return {...result,dataMode:'authenticated_service',capabilities:{cloudProgress:true,rewards:options.rewards===true}};
  if(action==='settle'){progress=null;revision++;}
  return result;
 }};
 const storage={get:key=>values.get(key),set:(key,value)=>values.set(key,value)};
 async function boot(){const ctx=new Proxy({measureText:s=>({width:String(s).length*7})},{get:(o,k)=>k in o?o[k]:()=>{}});const app=createFullApp({getContext:()=>ctx},[deal],390,844,1,{motion:false,storage,client,now:()=>time,provider:options.provider});apps.push(app);await app.ready;return app;}
 t.after(()=>apps.forEach(a=>a.destroy()));
 function seed(ids){const {ticket,deal:assigned}=social.call('u1','start',{mode:'daily'}),ctl=createController(assigned,{roundId:ticket.id});for(const id of ids)ctl.pick(id);progress={ticket,log:ctl.export(),elapsedMs:500};revision++;return progress;}
 return {boot,client,values,calls,seed,advance:ms=>time+=ms,getCloud:()=>({revision,progress}),setCloud:p=>{progress=p;revision++;}};
}
async function click(app,id){const r=app.getHitRegions().find(r=>r.id===id);assert.ok(r,'missing '+id);assert.ok(r.enabled,'disabled '+id);return app.tap(r.x+r.w/2,r.y+r.h/2);}

test('online UI: cloud progress on a fresh device resumes the original ticket',async t=>{
 const h=await setup(t),saved=h.seed(['t0']),app=await h.boot();await click(app,'resume');
 assert.equal(app.getState().roundId,saved.ticket.id);assert.deepEqual(app.getState().board.rack,['t0']);assert.equal(app.qa.elapsed(),500);
});

test('online UI: local moves synchronize into account-scoped cloud progress',async t=>{
 const h=await setup(t),app=await h.boot();await app.qa.start('daily');h.advance(1000);await app.qa.pick('t0');await app.setVisible(false);
 const cloud=h.getCloud();assert.equal(cloud.progress.ticket.id,app.getState().roundId);assert.equal(cloud.progress.elapsedMs,1000);
 assert.ok(h.calls.some(c=>c.action==='progress.put'));assert.ok([...h.values.keys()].some(k=>k.includes(h.client.scope)));
});

test('online UI: missing trusted reward capability cannot start an assist',async t=>{
 const h=await setup(t),app=await h.boot();await app.qa.start('daily');await app.qa.pick('t0');const before=app.getState();
 const result=await click(app,'undo');assert.equal(result.ok,false);assert.equal(result.code,'REWARDS_NOT_AVAILABLE');
 assert.deepEqual(app.getState(),before);assert.equal(app.getModal(),null);
});

test('online UI: unrelated valid device and cloud rounds require an explicit choice',async t=>{
 const h=await setup(t),first=await h.boot();await first.qa.start('daily');await first.qa.pick('t0');await first.setVisible(false);first.destroy();
 const localId=first.getState().roundId,remote=h.seed(['t1']),app=await h.boot();
 assert.equal(app.getModal(),'CLOUD_CONFLICT');assert.notEqual(localId,remote.ticket.id);
 assert.equal(h.getCloud().progress.ticket.id,remote.ticket.id,'loading must not overwrite another device');
 await click(app,'use-cloud-progress');await click(app,'resume');assert.equal(app.getState().roundId,remote.ticket.id);
});

test('online UI: native completion requires server authorization before applying a reward',async t=>{
 let callback,flow,authorize;const approved=new Promise(resolve=>authorize=resolve);
 const provider={open(_source,f,cb){flow=f;callback=cb;return {ok:true};},cancel(){},destroy(){}};
 const h=await setup(t,{rewards:true,provider,verify:()=>approved}),app=await h.boot();await app.qa.start('daily');await app.qa.pick('t0');
 await click(app,'undo');await click(app,'grant');assert.ok(h.calls.some(c=>c.action==='reward.offer'));
 callback({kind:'ad_closed',roundId:flow.roundId,flowId:flow.id,isEnded:true});await new Promise(r=>setImmediate(r));
 assert.equal(app.getState().used.undo,0);assert.ok(h.calls.some(c=>c.action==='reward.observe'));
 authorize();await new Promise(r=>setImmediate(r));assert.equal(app.getState().used.undo,1);
 callback({kind:'ad_closed',roundId:flow.roundId,flowId:flow.id,isEnded:true});await new Promise(r=>setImmediate(r));assert.equal(app.getState().used.undo,1);
});

test('online UI: unavailable verification retries the original request without replaying the ad',async t=>{
 let callback,flow,opens=0,fail=true;const provider={open(_source,f,cb){opens++;flow=f;callback=cb;return {ok:true};},cancel(){},destroy(){}};
 const h=await setup(t,{rewards:true,provider,verify:async()=>{if(fail)throw Error('NETWORK_FAILED');}}),app=await h.boot();await app.qa.start('daily');await app.qa.pick('t0');await click(app,'undo');await click(app,'grant');
 callback({kind:'ad_closed',roundId:flow.roundId,flowId:flow.id,isEnded:true});await new Promise(r=>setImmediate(r));assert.equal(app.getModal(),'VERIFY_REWARD');assert.equal(app.getState().used.undo,0);
 fail=false;await click(app,'retry-verification');assert.equal(opens,1);assert.equal(app.getState().used.undo,1);
});
