'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../templates/wechat-full/game.js'),'utf8');
function boot(config){let passed,clientOptions,providerCalls=0;const client={kind:'online',scope:null,ready:Promise.resolve(),request:async()=>{}};
 const wx={createCanvas:()=>({}),getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:1}),getStorageSync:()=>'',setStorageSync(){},onTouchStart(){},onHide(){},onShow(){}};
 const modules={'./data/deals':[],'./data/art-manifest':{schema:1,assets:{}},'./preview-config':config,
  './src/product/art-assets':require('../src/product/art-assets'),'./src/product/wechat':{createPlatform:()=>null},
  './src/product/online-client':{wechatClient:(api,options)=>{assert.equal(api,wx);clientOptions=options;return client;}},
  './src/integration/wechat-provider':{createWechatPreviewProvider:()=>{providerCalls++;return {open(){}};}},
  './ui/product/app':{createFullApp:(_canvas,_deals,_w,_h,_dpr,options)=>{passed=options;return {frame(){}};}}};
 vm.runInNewContext(source,{wx,require:id=>modules[id],requestAnimationFrame(){}});passed.artAssets.dispose();return {passed,client,clientOptions,providerCalls};
}
test('native online: explicit online preview passes the authenticated client into the real app contract',()=>{
 const r=boot({mode:'online_preview',serviceUrl:'https://game.example.test',rewardRoute:'video'});
 assert.equal(r.passed.client,r.client);assert.deepEqual(JSON.parse(JSON.stringify(r.clientOptions)),{serviceUrl:'https://game.example.test'});assert.equal(r.providerCalls,1);
});
test('native online: simulation neither creates a network client nor invokes the native reward provider',()=>{
 const r=boot({mode:'simulation'});assert.equal(r.passed.client,undefined);assert.equal(r.clientOptions,undefined);assert.equal(r.providerCalls,0);
});
test('native online: missing backend configuration and production mode remain closed',()=>{
 assert.throws(()=>boot({mode:'online_preview'}),/ONLINE_SERVICE_NOT_CONFIGURED/);assert.throws(()=>boot({mode:'production',serviceUrl:'https:\/\/game.example.test'}),/PRODUCTION_GATE_CLOSED/);
});
