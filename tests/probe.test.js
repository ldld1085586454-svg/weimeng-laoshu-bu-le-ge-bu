'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createProbe}=require('../wechat_probe/app');const data=require('../wechat_probe/data/sample');
function canvas(){const c={width:0,height:0};const ctx={setTransform(){},fillRect(){},strokeRect(){},fillText(){}};c.getContext=()=>ctx;return c;}
test('probe runs 270 evidence steps through actual runtime',()=>{
 const app=createProbe(canvas(),data.deal,data.witness,390,844,2);let n=0;while(app.stepEvidence())n++;
 assert.equal(n,270);assert.equal(app.getState().status,'WON');assert.equal(app.getState().cleared,270);app.destroy();
});
test('probe resize and restart restore consistent playable state',()=>{
 const c=canvas(),app=createProbe(c,data.deal,data.witness,390,844,2);app.stepEvidence();app.resize(420,860,1);
 assert.equal(c.width,420);assert.equal(c.height,860);app.restart();assert.equal(app.getState().rack.length,0);assert.equal(app.getState().revision,0);app.destroy();
});
test('WeChat probe runtime is byte-identical to tested runtime',()=>{
 for(const n of ['runtime.js','layout.js','schema.js','content-hash.js'])assert.equal(fs.readFileSync(path.join(__dirname,'../src',n),'utf8'),fs.readFileSync(path.join(__dirname,'../wechat_probe/engine',n),'utf8'));
});
