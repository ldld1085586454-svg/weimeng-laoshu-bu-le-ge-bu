'use strict';
// Default: playable simulation. SDK preview is opt-in; never a production build.
const {createIntegrationApp}=require('./ui/integration-app');
const {createWechatPreviewProvider}=require('./src/integration/wechat-provider');
const deal=require('./data/deal');
const config=require('./preview-config');
if(!['simulation','sdk_preview'].includes(config.mode))throw Error('PRODUCTION_GATE_CLOSED');
const provider=config.mode==='sdk_preview'?createWechatPreviewProvider(wx,config):null;
const info=()=>typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
const windowInfo=info(),canvas=wx.createCanvas();
const storageFactory=typeof wx.setStorageSync==='function'?roundId=>({
  write:text=>wx.setStorageSync('sheep-v011:'+roundId,text)
}):undefined;
const app=createIntegrationApp(canvas,deal,windowInfo.windowWidth,windowInfo.windowHeight,windowInfo.pixelRatio||1,
  {provider,storageFactory});
wx.onTouchStart(e=>{const t=e.touches||[];if(t.length===1)app.tap(t[0].clientX,t[0].clientY);});
wx.onHide(()=>app.setVisible(false));
wx.onShow(()=>app.setVisible(true));
if(typeof wx.onWindowResize==='function')wx.onWindowResize(()=>{const i=info();app.resize(i.windowWidth,i.windowHeight,i.pixelRatio||1);});
