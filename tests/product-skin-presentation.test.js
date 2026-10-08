'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');

const deal={schema:'astra-deal-1',dealId:'skin-presentation-three',layoutId:'open',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:Array.from({length:3},(_,i)=>({id:'skin-'+i,type:'T00',zone:'board',z:0,rect:{x:i*100,y:0,w:96,h:96}}))};

function harness(t){
 let time=Date.UTC(2026,9,1,6);
 const characters=[],values=new Map();
 const storage={get:key=>values.get(key),set:(key,value)=>values.set(key,value)};
 const ctx=new Proxy({measureText:value=>({width:String(value).length*7})},{get:(object,key)=>key in object?object[key]:()=>{}});
 // Observe the renderer's selected artwork; controller, unlock rules, service,
 // storage, and all navigation remain the real implementation.
 const artAssets={draw(_ctx,key){if(key.startsWith('character.'))characters.push(key);return true;},dispose(){}};
 const app=createFullApp({getContext:()=>ctx},[deal],390,844,1,{motion:false,storage,artAssets,now:()=>time});
 t.after(()=>app.destroy());
 return {app,characters,nextDay:()=>{time+=86400000;}};
}

async function click(app,id){
 const region=app.getHitRegions().find(region=>region.id===id);
 assert.ok(region,'missing '+id);assert.equal(region.enabled,true,'disabled '+id);
 return app.tap(region.x+region.w/2,region.y+region.h/2);
}
async function finishChallenge(app){
 for(const id of ['skin-0','skin-1','skin-2'])assert.equal((await click(app,'tile:'+id)).ok,true);
 assert.equal(app.getModal(),'WIN');
}
async function firstDaily(app){
 await app.ready;await click(app,'start');
 assert.equal(app.getState().board.deal.cells.length,12);
 for(let i=0;i<12;i++)assert.equal((await click(app,'tile:teach-'+i)).ok,true);
 assert.equal(app.getModal(),'TUTORIAL_WIN');await click(app,'next-daily');
 await finishChallenge(app);await click(app,'return-home');
}
async function equip(app,skin){
 assert.ok(app.getInfo().profile.owned.includes(skin),'skin was not really unlocked');
 await click(app,'wardrobe');await click(app,'equip:'+skin);await click(app,'close');
 assert.equal(app.getInfo().profile.skin,skin);
}
async function assertWinSkin(app,characters,skin){
 await click(app,'start');await finishChallenge(app);
 assert.equal(app.getInfo().profile.skin,skin);
 characters.length=0;app.frame();
 assert.equal(characters.at(-1),'character.'+skin,'the foreground win portrait must preserve the equipped skin');
 assert.ok(characters.every(key=>key==='character.'+skin),'the board companion must also preserve the same equipped skin');
}

test('skin presentation: a cap earned by a real daily clear remains visible after equipping and clearing again',async t=>{
 const {app,characters}=harness(t);await firstDaily(app);await equip(app,'cap');
 await assertWinSkin(app,characters,'cap');
});

test('skin presentation: a scarf earned by the previous topic win remains visible after equipping and a daily clear',async t=>{
 const {app,characters,nextDay}=harness(t);await firstDaily(app);
 await click(app,'topic');await click(app,'topic-start');await finishChallenge(app);await click(app,'return-home');
 await app.setVisible(false);nextDay();await app.setVisible(true);
 await equip(app,'scarf');await assertWinSkin(app,characters,'scarf');
});
