'use strict';
const {createFullApp}=require('./ui/product/app');
const {createPlatform}=require('./src/product/wechat');
const {createWechatPreviewProvider}=require('./src/integration/wechat-provider');
const deals=require('./data/deals'),cfg=require('./preview-config');
if(!['simulation','sdk_preview'].includes(cfg.mode))throw Error('PRODUCTION_GATE_CLOSED');
const canvas=wx.createCanvas(),windowInfo=()=>typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
const storage={get:k=>wx.getStorageSync('sheep-full-012:'+k)||'',set:(k,v)=>wx.setStorageSync('sheep-full-012:'+k,v)};
const provider=cfg.mode==='sdk_preview'?createWechatPreviewProvider(wx,cfg):null,platform=createPlatform(wx,cfg);
let bgm=null;const effects=[];
const audio={play(name){if(typeof wx.createInnerAudioContext!=='function')return;const a=wx.createInnerAudioContext();a.src='audio/'+name+'.wav';const done=()=>{const i=effects.indexOf(a);if(i>=0)effects.splice(i,1);a.destroy();};a.onEnded(done);a.onError(done);effects.push(a);a.play();},
 music(active){if(typeof wx.createInnerAudioContext!=='function')return;if(!bgm){bgm=wx.createInnerAudioContext();bgm.src='audio/music.wav';bgm.loop=true;bgm.volume=.22;bgm.onError(()=>{});}if(active)bgm.play();else bgm.pause();},destroy(){for(const a of effects)a.destroy();if(bgm)bgm.destroy();}};
function safeInsets(i){let menuBottom=0;try{if(typeof wx.getMenuButtonBoundingClientRect==='function')menuBottom=wx.getMenuButtonBoundingClientRect().bottom||0;}catch(e){}return {top:Math.max(i.safeArea?.top||0,menuBottom?menuBottom+8:0),bottom:Math.max(0,i.windowHeight-(i.safeArea?.bottom||i.windowHeight))};}
const i=windowInfo(),app=createFullApp(canvas,deals,i.windowWidth,i.windowHeight,i.pixelRatio||1,{storage,provider,platform,audio,insets:safeInsets(i),rewardRoute:cfg.rewardRoute,
 vibrate:()=>{if(typeof wx.vibrateShort==='function')wx.vibrateShort({type:'light'});}});
wx.onTouchStart(e=>{if(e.touches?.length===1){const t=e.touches[0];app.tap(t.clientX,t.clientY);}});
wx.onHide(()=>app.setVisible(false));wx.onShow(()=>app.setVisible(true));
if(typeof wx.onWindowResize==='function')wx.onWindowResize(()=>{const n=windowInfo();app.resize(n.windowWidth,n.windowHeight,n.pixelRatio||1,safeInsets(n));});
function render(){app.frame();requestAnimationFrame(render);}requestAnimationFrame(render);
// No fake ad completion is emitted here. In sdk_preview, the simulation buttons disappear.
