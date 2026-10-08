'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createOnlineServer}=require('../services/online/server');
const {wechatClient}=require('../src/product/online-client');
const {createWechatPreviewProvider}=require('../src/integration/wechat-provider');
const {createFullApp}=require('../ui/product/app');
const Round=require('../src/product/round');
const {createController}=require('../src/product/controller');
const deal={schema:'astra-deal-1',dealId:'online-e2e',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:[...'ABCABCABC'].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%3*100,y:Math.floor(i/3)*100,w:96,h:96}}))};
const witness=['t0','t3','t6','t1','t4','t7','t2','t5','t8'];
async function setup(t,rewards=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bu-online-e2e-'));let serial=0,time=Date.now();
 const server=createOnlineServer({dbFile:path.join(dir,'test.sqlite'),deals:[deal],now:()=>time,
  exchangeCode:async()=>({openid:'test-only-account'}),...(rewards?{verifyReward:async evidence=>({verified:true,evidenceId:'test-only-evidence-'+evidence.token})}:{})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port,clients=[],apps=[];
 t.after(async()=>{for(const app of apps)app.destroy();for(const client of clients)client.destroy();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
 async function device(values=new Map()){
  const handlers={},ad={onClose:f=>handlers.close=f,offClose:f=>{if(handlers.close===f)delete handlers.close;},onError:f=>handlers.error=f,offError:f=>{if(handlers.error===f)delete handlers.error;},load:async()=>{},show:async()=>{}};
  const wx={login:options=>{queueMicrotask(()=>options.success({code:'test-code-'+(++serial)}));},request:options=>{
   const abort=new AbortController();fetch(options.url,{method:options.method,headers:options.header,body:JSON.stringify(options.data),signal:abort.signal}).then(async response=>options.success({statusCode:response.status,data:await response.json()})).catch(()=>options.fail({}));return {abort:()=>abort.abort()};},
   onHide:f=>handlers.hide=f,onShow:f=>handlers.show=f,createRewardedVideoAd:()=>ad};
  const client=wechatClient(wx,{serviceUrl:url,allowLoopbackForTests:true});clients.push(client);
  const provider=createWechatPreviewProvider(wx,{allowAdPreview:true,adUnitId:'test-only-ad'}),storage={get:key=>values.get(key),set:(key,value)=>values.set(key,value)};
  const ctx=new Proxy({measureText:s=>({width:String(s).length*7})},{get:(o,k)=>k in o?o[k]:()=>{}});
  const app=createFullApp({getContext:()=>ctx},[deal],390,844,1,{motion:false,client,provider,storage,now:()=>time});apps.push(app);
  assert.deepEqual(await app.ready,{ok:true});return {app,client,handlers,values};
 }
 return {device,advance:ms=>time+=ms};
}
async function click(app,id){const r=app.getHitRegions().find(r=>r.id===id);assert.ok(r,'missing '+id);assert.ok(r.enabled,'disabled '+id);return app.tap(r.x+r.w/2,r.y+r.h/2);}
async function until(predicate){const deadline=Date.now()+3000;while(!predicate()){if(Date.now()>=deadline)throw Error('CONDITION_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,10));}}

test('online end-to-end: real HTTP login, device transfer, resume and settlement use one original ticket',async t=>{
 const h=await setup(t),a=await h.device();await a.app.qa.start('daily');h.advance(1200);await a.app.qa.pick('t0');await a.app.setVisible(false);
 const id=a.app.getState().roundId;a.app.destroy();h.advance(30000);
 const b=await h.device();await click(b.app,'resume');assert.equal(b.app.getState().roundId,id);assert.equal(b.app.qa.elapsed(),1200);
 for(const tile of witness.slice(1)){h.advance(50);assert.equal((await b.app.qa.pick(tile)).ok,true);}
 assert.equal(b.app.getModal(),'WIN');assert.equal(b.app.getInfo().totals.wins,1);assert.equal((await b.client.request('progress.get')).progress,null);
 await click(b.app,'return-home');const c=await h.device();assert.equal(c.app.getHitRegions().some(r=>r.id==='resume'),false);assert.equal(c.app.getInfo().history.records.length,1);
});

test('online end-to-end: independently authorized reward survives cloud progress and contributes once',async t=>{
 const h=await setup(t,true),a=await h.device();await a.app.qa.start('daily');await a.app.qa.pick('t0');
 await click(a.app,'undo');await click(a.app,'grant');await until(()=>typeof a.handlers.close==='function');await new Promise(resolve=>setImmediate(resolve));
 a.handlers.close({isEnded:true});await until(()=>a.app.getState().used.undo===1);await a.app.setVisible(false);
 const saved=await a.client.request('progress.get');assert.equal(Round.restore(saved.progress.log).state.used.undo,1);const id=a.app.getState().roundId;a.app.destroy();
 const b=await h.device();await click(b.app,'resume');assert.equal(b.app.getState().roundId,id);assert.equal(b.app.getState().used.undo,1);
 for(const tile of witness){h.advance(50);assert.equal((await b.app.qa.pick(tile)).ok,true);}
 assert.equal(b.app.getModal(),'WIN');assert.equal(b.app.getInfo().totals.wins,1);assert.equal((await b.client.request('progress.get')).progress,null);
});

for(const sameTicket of [false,true])test('online end-to-end: explicit local conflict choice resumes syncing '+(sameTicket?'a pure-pick fork':'another ticket'),async t=>{
 const h=await setup(t),a=await h.device(),local=await a.client.request('start',{mode:'daily'}),remote=sameTicket?local:await a.client.request('start',{mode:'daily'});
 const localCtl=createController(local.deal,{roundId:local.ticket.id}),remoteCtl=createController(remote.deal,{roundId:remote.ticket.id});localCtl.pick('t0');remoteCtl.pick('t1');h.advance(500);
 const initial=await a.client.request('progress.get');await a.client.request('progress.put',{expectedRevision:initial.revision,ticketId:remote.ticket.id,log:remoteCtl.export(),elapsedMs:500});
 a.values.set(a.client.scope+':active-round',JSON.stringify({scope:a.client.scope,ticket:local.ticket,log:localCtl.export(),elapsedMs:500}));a.app.destroy();
 const b=await h.device(a.values);assert.equal(b.app.getModal(),'CLOUD_CONFLICT');await click(b.app,'use-local-progress');assert.equal(b.app.getModal(),null);
 await click(b.app,'resume');assert.equal(b.app.getState().roundId,local.ticket.id);assert.deepEqual(b.app.getState().board.rack,['t0']);
 h.advance(200);await b.app.qa.pick('t3');await b.app.setVisible(false);const saved=await b.client.request('progress.get');
 assert.deepEqual(Round.restore(saved.progress.log).state.board.rack,['t0','t3'],'a new move still passes the post-choice CAS write');
 assert.ok(b.values.get(b.client.scope+':progress-conflict-backup'));
});

test('online end-to-end: reward-bearing fork offers cloud recovery instead of unsafe local replacement',async t=>{
 const h=await setup(t),a=await h.device(),issued=await a.client.request('start',{mode:'daily'});
 const local=createController(issued.deal,{roundId:issued.ticket.id}),remote=createController(issued.deal,{roundId:issued.ticket.id});local.pick('t0');remote.pick('t1');remote.offer('undo','video');
 await a.client.request('progress.put',{expectedRevision:0,ticketId:issued.ticket.id,log:remote.export(),elapsedMs:0});
 a.values.set(a.client.scope+':active-round',JSON.stringify({scope:a.client.scope,ticket:issued.ticket,log:local.export(),elapsedMs:0}));a.app.destroy();
 const b=await h.device(a.values);assert.equal(b.app.getModal(),'CLOUD_CONFLICT');const result=await click(b.app,'use-local-progress');
 assert.equal(result.code,'PROGRESS_REWARD_BRANCH_CONFLICT');assert.equal(b.app.getModal(),'CLOUD_CONFLICT');assert.ok(b.app.getHitRegions().some(r=>r.id==='restart-cloud-conflict'));
 await click(b.app,'use-cloud-progress');await click(b.app,'resume');assert.deepEqual(b.app.getState().board.rack,['t1']);assert.equal(b.app.getState().pending,null);
 h.advance(50);await b.app.qa.pick('t4');await b.app.setVisible(false);const saved=await b.client.request('progress.get');assert.deepEqual(Round.restore(saved.progress.log).state.board.rack,['t1','t4']);
});
