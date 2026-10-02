'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=fs.existsSync(path.join(__dirname,'../src/integration/wechat-provider.js'))?require('../src/integration/wechat-provider'):{};
function sdk(){const e={},calls={share:0,load:0,show:0,create:0},ad={
onClose:f=>e.close=f,offClose:f=>{if(e.close===f)delete e.close;},onError:f=>e.error=f,offError:f=>{if(e.error===f)delete e.error;},
load:async()=>{calls.load++;},show:async()=>{calls.show++;}};
return {e,calls,ad,wx:{onHide:f=>e.hide=f,offHide:f=>{if(e.hide===f)delete e.hide;},onShow:f=>e.front=f,offShow:f=>{if(e.front===f)delete e.front;},shareAppMessage:()=>{calls.share++;},createRewardedVideoAd:()=>{calls.create++;return ad;}}};}
function boot(cfg={}){assert.equal(typeof api.createWechatPreviewProvider,'function','provider missing');const s=sdk(),out=[];return {...s,out,p:api.createWechatPreviewProvider(s.wx,cfg),f:{id:'f1',roundId:'r1'}};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('wx preview: native API calls gated off by default',()=>{const x=boot();assert.equal(x.p.open('share',x.f,e=>x.out.push(e)).ok,false);assert.equal(x.p.open('ad',x.f,e=>x.out.push(e)).ok,false);assert.equal(x.calls.share,0);assert.equal(x.calls.create,0);});
test('wx preview: initiating share does not claim a send',()=>{const x=boot({allowSharePreview:true});assert.ok(x.p.open('share',x.f,e=>x.out.push(e)).ok);assert.equal(x.calls.share,1);assert.equal(x.out.length,0);});
test('wx preview: unrelated onShow does not grant share reward',()=>{const x=boot({allowSharePreview:true});x.p.open('share',x.f,e=>x.out.push(e));x.e.front();assert.equal(x.out.length,0);});
test('wx preview: hide then return yields return-only once',()=>{const x=boot({allowSharePreview:true});x.p.open('share',x.f,e=>x.out.push(e));x.e.hide();x.e.front();x.e.front();assert.deepEqual(x.out,[{flowId:'f1',roundId:'r1',kind:'share_returned'}]);});
test('wx preview: cancelling pending share prevents late return',()=>{const x=boot({allowSharePreview:true});x.p.open('share',x.f,e=>x.out.push(e));x.e.hide();x.p.cancel();x.e.front();assert.equal(x.out.length,0);});
test('wx preview: concurrent provider request rejected',()=>{const x=boot({allowSharePreview:true});x.p.open('share',x.f,()=>{});assert.equal(x.p.open('share',{id:'f2',roundId:'r2'},()=>{}).code,'PROVIDER_BUSY');});
test('wx preview: video waits for close evidence, not load/show',async()=>{const x=boot({allowAdPreview:true,adUnitId:'unit-test'});x.p.open('ad',x.f,e=>x.out.push(e));await tick();assert.equal(x.calls.load,1);assert.equal(x.calls.show,1);assert.equal(x.out.length,0);x.e.close({isEnded:true});assert.equal(x.out[0].isEnded,true);});
test('wx preview: missing isEnded remains unverified',async()=>{const x=boot({allowAdPreview:true,adUnitId:'unit-test'});x.p.open('ad',x.f,e=>x.out.push(e));await tick();x.e.close({});assert.deepEqual(x.out[0],{flowId:'f1',roundId:'r1',kind:'ad_closed'});});
test('wx preview: late old close is ignored after cancel',async()=>{const x=boot({allowAdPreview:true,adUnitId:'unit-test'});x.p.open('ad',x.f,e=>x.out.push(e));await tick();const old=x.e.close;x.p.cancel();old({isEnded:true});assert.equal(x.out.length,0);});
test('wx preview: duplicate onError and promise rejection yields one failure',async()=>{const x=boot({allowAdPreview:true,adUnitId:'unit-test'});x.ad.load=async()=>{x.e.error({});throw Error('no fill');};x.p.open('ad',x.f,e=>x.out.push(e));await tick();assert.equal(x.out.length,1);assert.equal(x.out[0].kind,'failed');});
test('wx preview: throwing share API yields failure without reward',()=>{const x=boot({allowSharePreview:true});x.wx.shareAppMessage=()=>{throw Error('unsupported');};x.p.open('share',x.f,e=>x.out.push(e));assert.equal(x.out[0].kind,'failed');});
test('wx preview: destroy unregisters only owned handlers',()=>{const x=boot();x.p.destroy();assert.equal(x.e.hide,undefined);assert.equal(x.e.front,undefined);});

test('wx preview: cancelling a visible singleton ad quarantines later requests until close',async()=>{
 const x=boot({allowAdPreview:true,adUnitId:'unit-test'});
 x.p.open('ad',x.f,e=>x.out.push(e));await tick();const oldClose=x.e.close;
 x.p.cancel();
 assert.equal(x.p.open('ad',{id:'f2',roundId:'r2'},e=>x.out.push(e)).code,'PROVIDER_BUSY');
 oldClose({isEnded:true});assert.equal(x.out.length,0);
 assert.equal(x.p.open('ad',{id:'f3',roundId:'r3'},e=>x.out.push(e)).ok,true);
 await tick();x.e.close({isEnded:true});assert.equal(x.out.length,1);assert.equal(x.out[0].roundId,'r3');
});
