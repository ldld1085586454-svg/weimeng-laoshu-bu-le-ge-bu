'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const deal=require('../examples/deal-270.json');
test('visual integration: home uses the approved carrot instead of legacy sheep sprites',async t=>{
 const image={width:1213,height:1296},drawn=[],old=[];
 const context=new Proxy({measureText:value=>({width:String(value).length*7}),drawImage:source=>drawn.push(source)},{get:(o,k)=>k in o?o[k]:()=>{}});
 const assets={get:key=>key==='character.reference'?{image,rect:{x:0,y:0,w:1213,h:1296},width:1213,height:1296}:null,draw:(ctx,key)=>{old.push(key);return false;},dispose(){}};
 const app=createFullApp({getContext:()=>context},[deal],390,844,1,{artAssets:assets,createCanvas:()=>null,motion:false});t.after(()=>app.destroy());await app.ready;
 assert.ok(drawn.includes(image),'approved character pixels reach the runtime Canvas');
 assert.equal(old.some(key=>key.startsWith('character.')||key.startsWith('honor.')),false,'old sheep atlas is no longer preferred');
 assert.ok(app.getHitRegions().some(r=>r.id==='mascot'));
});
