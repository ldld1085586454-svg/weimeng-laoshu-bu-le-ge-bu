'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const {localClient}=require('../src/product/client');
const deal={schema:'astra-deal-1',dealId:'resume-fixture',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:[...'ABCDEFGHIJABCDEFGHIJABCDEFGHIJ'].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%6*60,y:Math.floor(i/6)*60,w:56,h:56}}))};
function harness(t){let time=Date.UTC(2026,9,3,4);const values=new Map(),apps=[];
 const storage={get:key=>values.get(key),set:(key,value)=>values.set(key,value)};
 async function boot(user='resume-user'){
  const context=new Proxy({measureText:value=>({width:String(value).length*7})},{get:(o,k)=>k in o?o[k]:()=>{}});
  const app=createFullApp({getContext:()=>context},[deal],390,844,1,{motion:false,storage,now:()=>time,client:localClient([deal],storage,user,()=>time)});
  apps.push(app);await app.ready;return app;
 }
 t.after(()=>apps.forEach(a=>a.destroy()));return {boot,values,advance:ms=>time+=ms};
}
async function click(a,id){const r=a.getHitRegions().find(r=>r.id===id);assert.ok(r,'missing '+id);assert.ok(r.enabled,'disabled '+id);return a.tap(r.x+r.w/2,r.y+r.h/2);}

test('resume: home offers the same original round and excludes offline time',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');h.advance(1500);await first.qa.pick('t0');
 h.advance(500);await first.setVisible(false);const before=first.getState();first.destroy();h.advance(60000);
 const app=await h.boot();assert.equal(app.getScene(),'HOME');await click(app,'resume');
 assert.equal(app.getState().roundId,before.roundId);assert.deepEqual(app.getState().board,before.board);
 assert.equal(app.qa.elapsed(),2000);h.advance(1000);assert.equal(app.qa.elapsed(),3000);
});

test('resume: returning home keeps a continuable round and restart requires confirmation',async t=>{
 const h=harness(t),app=await h.boot();await app.qa.start('daily');await app.qa.pick('t0');const id=app.getState().roundId;
 await click(app,'exit');await click(app,'confirm-exit');await click(app,'new-game');assert.equal(app.getModal(),'RESTART_CONFIRM');
 await click(app,'cancel-restart');await click(app,'resume');assert.equal(app.getState().roundId,id);
 await click(app,'exit');await click(app,'confirm-exit');await click(app,'new-game');await click(app,'confirm-restart');
 assert.equal(app.getScene(),'PLAY');assert.notEqual(app.getState().roundId,id);assert.equal(app.getState().board.rack.length,0);
});

test('resume: unconfirmed first loss restores its revival choice without reporting failure',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');for(let i=0;i<7;i++)await first.qa.pick('t'+i);
 const id=first.getState().roundId;assert.equal(first.getModal(),'REVIVE');first.destroy();
 const app=await h.boot();await click(app,'resume');assert.equal(app.getState().roundId,id);assert.equal(app.getModal(),'REVIVE');
 assert.equal(app.getInfo().today.failures,0);assert.equal(app.getState().used.revive,0);
});

test('resume: pending unverified provider is interrupted without spending a reward',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');await first.qa.pick('t0');await click(first,'undo');await click(first,'grant');first.destroy();
 const app=await h.boot();await click(app,'resume');assert.equal(app.getState().pending,null);assert.equal(app.getState().used.undo,0);
 assert.equal(app.getState().board.rack.length,1);assert.equal(app.getModal(),null);
});

test('resume: different account or expired ticket does not expose continue',async t=>{
 const h=harness(t),first=await h.boot();await first.qa.start('daily');await first.qa.pick('t0');first.destroy();
 const other=await h.boot('other-user');assert.equal(other.getHitRegions().some(r=>r.id==='resume'),false);other.destroy();
 h.advance(86400000);const expired=await h.boot();assert.equal(expired.getHitRegions().some(r=>r.id==='resume'),false);
});
