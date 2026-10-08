'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const {localClient}=require('../src/product/client');
const {createWechatPreviewProvider}=require('../src/integration/wechat-provider');
const deal={schema:'astra-deal-1',dealId:'runtime-safety',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:[...'ABCABCABC'].map((type,i)=>({id:'t'+i,type,zone:'board',z:0,rect:{x:i%3*100,y:Math.floor(i/3)*100,w:96,h:96}}))};
const witness=['t0','t3','t6','t1','t4','t7','t2','t5','t8'];
async function harness(t,options={}){
 let time=Date.UTC(2026,9,3,4),bootstrapFails=false;
 const texts=[],base=localClient([deal],null,'safety-user',()=>time);
 const client={...base,request:async(action,data)=>{if(action==='bootstrap'&&bootstrapFails)throw Error('NETWORK_DOWN');return base.request(action,data);}};
 const context=new Proxy({measureText:value=>({width:String(value).length*7}),fillText:value=>texts.push(String(value))},{get:(o,k)=>k in o?o[k]:()=>{}});
 const app=createFullApp({getContext:()=>context},[deal],390,844,1,{motion:false,now:()=>time,client,...options});
 t.after(()=>app.destroy());await app.ready;
 return {app,texts,advance:ms=>time+=ms,failBootstrap:value=>bootstrapFails=value};
}
async function click(app,id){const r=app.getHitRegions().find(r=>r.id===id);assert.ok(r,'missing '+id);assert.ok(r.enabled,'disabled '+id);return app.tap(r.x+r.w/2,r.y+r.h/2);}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('runtime safety: native share return never earns or consumes an assist',async t=>{
 const listeners={},provider=createWechatPreviewProvider({onHide:f=>listeners.hide=f,onShow:f=>listeners.show=f,shareAppMessage:()=>{}},{allowSharePreview:true});
 const {app,texts}=await harness(t,{provider,rewardRoute:'share'});await app.qa.start('daily');await app.qa.pick('t0');
 await click(app,'undo');await click(app,'grant');const before=app.getState().board;
 listeners.hide();listeners.show();await tick();
 assert.deepEqual(app.getState().board,before);assert.equal(app.getState().used.undo,0);
 assert.equal(app.getState().pending,null);assert.equal(app.getModal(),null);
 assert.ok(texts.some(s=>s.includes('分享返回不能确认发送成功')));
 listeners.show();await tick();assert.equal(app.getState().used.undo,0);
});

test('runtime safety: native share offer does not promise a reward it cannot verify',async t=>{
 const provider={open:()=>({ok:true}),cancel(){},destroy(){}},h=await harness(t,{provider,rewardRoute:'share'});
 await h.app.qa.start('daily');await h.app.qa.pick('t0');h.texts.length=0;await click(h.app,'undo');
 assert.ok(h.texts.includes('分享预览（不发奖）'));assert.equal(h.texts.includes('分享领取'),false);
});

test('runtime safety: failed exit refresh does not stop resumed round time',async t=>{
 const h=await harness(t),{app}=h;await app.qa.start('daily');h.advance(1000);await click(app,'exit');
 h.failBootstrap(true);assert.equal((await click(app,'confirm-exit')).code,'NETWORK_DOWN');assert.equal(app.getModal(),'EXIT');
 h.failBootstrap(false);await click(app,'cancel-exit');h.advance(2000);
 assert.equal(app.qa.elapsed(),3000);assert.equal(app.getScene(),'PLAY');
});

test('runtime safety: topic victory displays only its actual topic contribution',async t=>{
 const {app,texts}=await harness(t);await app.qa.start('topic');for(const id of witness)await app.qa.pick(id);
 assert.equal(app.getModal(),'WIN');assert.equal(app.getInfo().totals.wins,0);
 texts.length=0;app.frame();
 assert.ok(texts.some(s=>s.includes('话题阵营增加了贡献')));
 assert.equal(texts.some(s=>s.includes('羊队增加了贡献')),false);
});
