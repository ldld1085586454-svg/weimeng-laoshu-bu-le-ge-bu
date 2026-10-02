'use strict';
// Minimal WeChat developer-tool probe; no account, advertisements or network requests.
const {createProbe}=require('./app');
const data=require('./data/sample');
const canvas=wx.createCanvas();
const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
const app=createProbe(canvas,data.deal,data.witness,info.windowWidth,info.windowHeight,info.pixelRatio||1);
wx.onTouchStart(e=>{const t=e.touches[0];if(t)app.tap(t.clientX,t.clientY);});
wx.onHide(()=>app.destroy());
if(typeof wx.onWindowResize==='function')wx.onWindowResize(()=>{
  const i=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
  app.resize(i.windowWidth,i.windowHeight,i.pixelRatio||1);
});
