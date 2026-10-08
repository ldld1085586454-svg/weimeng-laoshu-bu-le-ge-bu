'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const {wechatClient}=require('../src/product/online-client');
const {createSocial}=require('../src/product/social');
const {createController}=require('../src/product/controller');
const Round=require('../src/product/round');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deal={schema:'astra-deal-1',dealId:'identity-race-fixture',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:[...'ABCABCABC'].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%3*100,y:Math.floor(i/3)*100,w:96,h:96}}))};
function harness(t){
 let loginUser='u1',expireBootstrap=false,tokenNumber=0,time=Date.UTC(2026,9,3,4);
 const sessions=new Map(),clouds=new Map(),values=new Map(),writes=[],reads=[],apps=[],requests=[],observations=[],flows=[];
 const social=createSocial({deals:[deal],now:()=>time});
 const scope=user=>'online:https://identity.example.test|'+user;
 const storage={get(key){reads.push(key);return values.get(key);},set(key,value){writes.push({key,value});values.set(key,value);}};
 const provider={open(_source,flow,callback){flows.push({flow,callback});return {ok:true};},cancel(){},destroy(){}};
 const wx={login(options){queueMicrotask(()=>options.success({code:'code-for-'+loginUser}));},request(options){
  requests.push(options);
  queueMicrotask(()=>{
   if(options.url.endsWith('/api/auth/wechat')){const token='session-'+(++tokenNumber);sessions.set(token,loginUser);options.success({statusCode:200,data:{token,userId:loginUser,expiresAt:Date.now()+60000}});return;}
   const user=sessions.get(options.header.Authorization?.slice(7)),{action,data}=options.data;
   if(action==='bootstrap'&&expireBootstrap){expireBootstrap=false;options.success({statusCode:401,data:{ok:false,error:'SESSION_EXPIRED'}});return;}
   let cloud=clouds.get(user);if(!cloud){cloud={revision:0,progress:null};clouds.set(user,cloud);}
   const ok=value=>options.success({statusCode:200,data:{ok:true,data:value}});
   const fail=code=>options.success({statusCode:409,data:{ok:false,error:code}});
   try{
    if(action==='progress.get')return ok(structuredClone(cloud));
    if(action==='progress.put'){
     if(data.expectedRevision!==cloud.revision)return fail('PROGRESS_CONFLICT');
     const ticket=JSON.parse(social.export()).tickets[data.ticketId];cloud.progress={ticket,log:data.log,elapsedMs:data.elapsedMs};cloud.revision++;return ok(structuredClone(cloud));
    }
    if(action==='progress.clear'){cloud.progress=null;cloud.revision++;return ok(structuredClone(cloud));}
    if(action==='reward.offer')return ok({token:Round.restore(data.log).state.pending.token});
    if(action==='reward.observe'){observations.push({user,data,resolve:()=>ok({authorized:true,token:data.token}),reject:code=>fail(code)});return;}
    const value=social.call(user,action,data);
    return ok(action==='bootstrap'?{...value,capabilities:{cloudProgress:true,rewards:true}}:value);
   }catch(error){fail(error.message);}
  });
  return {abort(){}};
 }};
 const client=wechatClient(wx,{serviceUrl:'https://identity.example.test',timeoutMs:5000});
 function create(){
  const ctx=new Proxy({measureText:s=>({width:String(s).length*7})},{get:(object,key)=>key in object?object[key]:()=>{}});
  const app=createFullApp({getContext:()=>ctx},[deal],390,844,1,{motion:false,client,storage,provider,now:()=>time});apps.push(app);return app;
 }
 t.after(()=>{apps.forEach(app=>app.destroy());client.destroy();});
 function seed(user){const {ticket,deal:assigned}=social.call(user,'start',{mode:'daily'}),ctl=createController(assigned,{roundId:ticket.id});ctl.pick('t1');const p={ticket,log:ctl.export(),elapsedMs:321};
  clouds.set(user,{revision:1,progress:p});const saved=JSON.stringify({...p,scope:scope(user)});values.set(scope(user)+':active-round',saved);return {saved,ticket};
 }
 return {client,create,boot:async()=>{const app=create();assert.equal((await app.ready).ok,true);return app;},provider,values,writes,reads,requests,observations,flows,scope,seed,
  switchOnBootstrap(user){loginUser=user;expireBootstrap=true;},
  complete(index){const {flow,callback}=flows[index];callback({kind:'ad_closed',roundId:flow.roundId,flowId:flow.id,isEnded:true});},
  advance:ms=>time+=ms};
}
async function click(app,id){const r=app.getHitRegions().find(r=>r.id===id);assert.ok(r,'missing '+id);assert.ok(r.enabled,'disabled '+id);return app.tap(r.x+r.w/2,r.y+r.h/2);}
async function prepareAd(app){await app.qa.start('daily');await app.qa.pick('t0');await click(app,'undo');await click(app,'grant');}

test('identity race: a reauthenticated old app cannot overwrite another account on destroy',async t=>{
 const h=harness(t),old=await h.boot();await old.qa.start('daily');await old.qa.pick('t0');await old.setVisible(false);await old.setVisible(true);
 const other=h.seed('u2');await click(old,'exit');h.switchOnBootstrap('u2');assert.equal((await click(old,'confirm-exit')).code,'IDENTITY_CHANGED');
 assert.equal(h.client.scope,h.scope('u2'));const writes=h.writes.length,u1=h.values.get(h.scope('u1')+':active-round');old.destroy();
 assert.equal(h.values.get(h.scope('u2')+':active-round'),other.saved,'u1 destroy must never overwrite u2 storage');assert.equal(h.values.get(h.scope('u1')+':active-round'),u1);assert.equal(h.writes.length,writes,'identity-invalid instances cannot save even into their original namespace');
 const next=await h.boot();assert.equal(next.getInfo().profile.id,'u2');await click(next,'resume');assert.equal(next.getState().roundId,other.ticket.id);assert.deepEqual(next.getState().board.rack,['t1']);
});

test('identity race: externally refreshed scope locks old inputs, frame, callbacks and lifecycle writes',async t=>{
 const h=harness(t),app=await h.boot();await prepareAd(app);const other=h.seed('u2');h.switchOnBootstrap('u2');await assert.rejects(h.client.request('bootstrap'),e=>e.code==='IDENTITY_CHANGED');
 const before=app.getState(),writes=h.writes.length,requests=h.requests.length;h.complete(0);await tick();
 assert.deepEqual(app.getState(),before,'late provider completion must not mutate the old account state');await app.setVisible(false);await app.setVisible(true);app.frame();
 const start=await app.qa.start('daily');assert.equal(start.ok,false);assert.equal(start.code,'IDENTITY_CHANGED');assert.equal((await app.qa.pick('t1')).ok,false);await tick();
 assert.deepEqual(app.getState(),before);assert.equal(h.values.get(h.scope('u2')+':active-round'),other.saved);assert.equal(h.writes.length,writes);assert.equal(h.requests.length,requests);assert.deepEqual(app.getHitRegions(),[],'locked old instances show no actionable controls');
});

test('verification race: cancelling one observation never suppresses the next completed ad',async t=>{
 const h=harness(t),app=await h.boot();await prepareAd(app);h.complete(0);await tick();assert.equal(h.observations.length,1);
 await click(app,'cancel-grant');await click(app,'undo');await click(app,'grant');h.complete(1);await tick();
 assert.equal(h.observations.length,2,'each new round/token owner must get its own observe request');const secondToken=h.flows[1].flow.id;assert.notEqual(secondToken,h.flows[0].flow.id);
 const saved=JSON.parse(h.values.get(h.scope('u1')+':active-round'));assert.equal(saved.rewardObservation.token,secondToken,'the second completion is durable before verification');
 h.observations[0].resolve();await tick();assert.equal(app.getState().used.undo,0);assert.equal(app.getState().pending.token,secondToken);
 h.complete(1);await tick();assert.equal(h.observations.length,2,'an old finally must not clear the second in-flight owner');
 h.observations[1].resolve();await tick();assert.equal(app.getState().used.undo,1);assert.equal(app.getState().pending,null);
});

test('verification race: the second failed verification survives restart and retries without another ad',async t=>{
 const h=harness(t),first=await h.boot();await prepareAd(first);h.complete(0);await tick();await click(first,'cancel-grant');await click(first,'undo');await click(first,'grant');h.complete(1);await tick();assert.equal(h.observations.length,2);
 const secondToken=h.flows[1].flow.id;h.observations[0].reject('NETWORK_FAILED');await tick();h.observations[1].reject('NETWORK_FAILED');await tick();assert.equal(first.getModal(),'VERIFY_REWARD');first.destroy();
 const app=await h.boot();assert.equal(app.getModal(),'VERIFY_REWARD');assert.equal(app.getState().pending.token,secondToken);const retry=click(app,'retry-verification');await tick();assert.equal(h.flows.length,2);assert.equal(h.observations.length,3);assert.equal(h.observations[2].data.token,secondToken);
 h.observations[2].resolve();await retry;assert.equal(app.getState().used.undo,1);assert.equal(app.getState().pending,null);
});
