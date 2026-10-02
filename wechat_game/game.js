'use strict';
// Developer build only. Real ads, accounts and social services are NOT connected.
const {createPlayApp}=require('./ui/play-app');
const deal=require('./data/deal');
const canvas=wx.createCanvas();
const getInfo=()=>typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
const info=getInfo();
const app=createPlayApp(canvas,deal,info.windowWidth,info.windowHeight,info.pixelRatio||1);
wx.onTouchStart(event=>{const touches=event.touches||[];if(touches.length!==1)return;const t=touches[0];app.tap(t.clientX,t.clientY);});
wx.onHide(()=>app.setVisible(false));
wx.onShow(()=>app.setVisible(true));
if(typeof wx.onWindowResize==='function')wx.onWindowResize(()=>{const i=getInfo();app.resize(i.windowWidth,i.windowHeight,i.pixelRatio||1);});
