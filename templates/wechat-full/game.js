'use strict';
const {createFullApp}=require('./ui/product/app');
const {createPlatform}=require('./src/product/wechat');
const {createWechatPreviewProvider}=require('./src/integration/wechat-provider');
const {createArtAssets}=require('./src/product/art-assets');
const deals=require('./data/deals'),cfg=require('./preview-config');
const artManifest=require('./data/art-manifest');
if(!['simulation','sdk_preview','online_preview'].includes(cfg.mode))throw Error('PRODUCTION_GATE_CLOSED');
if(cfg.mode==='online_preview'&&!cfg.serviceUrl)throw Error('ONLINE_SERVICE_NOT_CONFIGURED');
const client=cfg.mode==='online_preview'?require('./src/product/online-client').wechatClient(wx,{serviceUrl:cfg.serviceUrl}):null;
const canvas=wx.createCanvas(),windowInfo=()=>typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
let headingFont=null;
if(artManifest.fonts?.heading&&typeof wx.loadFont==='function')try{
 const loaded=wx.loadFont(artManifest.fonts.heading.src);if(typeof loaded==='string'&&loaded.trim())headingFont=loaded;
}catch(e){}
const artAssets=createArtAssets(artManifest,{createImage:()=>{
 if(typeof wx.createImage==='function')return wx.createImage();
 if(typeof canvas.createImage==='function')return canvas.createImage();
 throw Error('IMAGE_FACTORY_UNAVAILABLE');
}});
const storage={get:k=>wx.getStorageSync('sheep-full-012:'+k)||'',set:(k,v)=>wx.setStorageSync('sheep-full-012:'+k,v)};
const provider=cfg.mode==='simulation'?null:createWechatPreviewProvider(wx,cfg),platform=createPlatform(wx,cfg);
let bgm=null;const effects=[];
const audio={play(name){if(typeof wx.createInnerAudioContext!=='function')return;const a=wx.createInnerAudioContext();a.src='audio/'+name+'.wav';const done=()=>{const i=effects.indexOf(a);if(i>=0)effects.splice(i,1);a.destroy();};a.onEnded(done);a.onError(done);effects.push(a);a.play();},
 music(active){if(typeof wx.createInnerAudioContext!=='function')return;if(!bgm){bgm=wx.createInnerAudioContext();bgm.src='audio/music.wav';bgm.loop=true;bgm.volume=.22;bgm.onError(()=>{});}if(active)bgm.play();else bgm.pause();},destroy(){for(const a of effects)a.destroy();if(bgm)bgm.destroy();}};
function safeInsets(i){let menuBottom=0;try{if(typeof wx.getMenuButtonBoundingClientRect==='function')menuBottom=wx.getMenuButtonBoundingClientRect().bottom||0;}catch(e){}return {top:Math.max(i.safeArea?.top||0,menuBottom?menuBottom+8:0),bottom:Math.max(0,i.windowHeight-(i.safeArea?.bottom||i.windowHeight))};}
const i=windowInfo(),app=createFullApp(canvas,deals,i.windowWidth,i.windowHeight,i.pixelRatio||1,{storage,client:client||undefined,provider,platform,audio,artAssets,headingFont,insets:safeInsets(i),rewardRoute:cfg.rewardRoute,
 vibrate:()=>{if(typeof wx.vibrateShort==='function')wx.vibrateShort({type:'light'});}});
const pointerTouches=typeof wx.onTouchEnd==='function';
if(typeof wx.onTouchStart==='function')wx.onTouchStart(e=>{
 if(e?.touches?.length!==1){if(pointerTouches)app.pointerCancel();return;}
 const t=e.touches[0];
 if(pointerTouches)app.pointerDown(t.clientX,t.clientY,t.identifier??0);
 else app.tap(t.clientX,t.clientY); // Older hosts lacking touch-end retain the tap entry.
});
if(pointerTouches){
 if(typeof wx.onTouchMove==='function')wx.onTouchMove(e=>{
  if(e?.touches?.length!==1){app.pointerCancel();return;}
  const t=e.touches[0];app.pointerMove(t.clientX,t.clientY,t.identifier??0);
 });
 wx.onTouchEnd(e=>{
  if(e?.touches?.length>0||e?.changedTouches?.length!==1){app.pointerCancel();return;}
  const t=e.changedTouches[0];app.pointerUp(t.clientX,t.clientY,t.identifier??0);
 });
 if(typeof wx.onTouchCancel==='function')wx.onTouchCancel(e=>{
  if(e?.touches?.length>0||e?.changedTouches?.length!==1){app.pointerCancel();return;}
  app.pointerCancel(e.changedTouches[0].identifier??0);
 });
}
wx.onHide(()=>app.setVisible(false));wx.onShow(()=>app.setVisible(true));
if(typeof wx.onWindowResize==='function')wx.onWindowResize(()=>{const n=windowInfo();app.resize(n.windowWidth,n.windowHeight,n.pixelRatio||1,safeInsets(n));});
function render(){app.frame();requestAnimationFrame(render);}requestAnimationFrame(render);
// No fake ad completion is emitted here. In sdk_preview, the simulation buttons disappear.
