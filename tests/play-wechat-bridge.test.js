'use strict';
// Interface-stub smoke only. This does NOT run WeChat DevTools or the real SDK.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function boot(legacy=false){const lines=[],events={},canvas={};const ctx=new Proxy({measureText:t=>({width:t.length*8}),fillText:t=>lines.push(t)},{get:(o,k)=>k in o?o[k]:(()=>{})});canvas.getContext=()=>ctx;const info=()=>({windowWidth:390,windowHeight:844,pixelRatio:2});
 const wx={createCanvas:()=>canvas,onTouchStart:f=>events.touch=f,onHide:f=>events.hide=f,onShow:f=>events.show=f,onWindowResize:f=>events.resize=f,getSystemInfoSync:info};if(!legacy)wx.getWindowInfo=info;
 const file=path.join(__dirname,'../wechat_game/game.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{wx,require:createRequire(file)});return {lines,events,canvas};}
test('WeChat interface stub: entry registers lifecycle hooks and accepts a single touch',()=>{const {events,lines,canvas}=boot();assert.equal(canvas.width,780);for(const name of ['touch','hide','show','resize'])assert.equal(typeof events[name],'function');events.touch({touches:[{clientX:195,clientY:448}]});assert.ok(lines.includes('单人对局'));});
test('WeChat interface stub: background input and multiple touches are ignored',()=>{const {events,lines}=boot();events.hide();events.touch({touches:[{clientX:195,clientY:448}]});assert.equal(lines.includes('单人对局'),false);events.show();events.touch({touches:[{clientX:195,clientY:448},{clientX:10,clientY:10}]});assert.equal(lines.includes('单人对局'),false);});
test('WeChat interface stub: older window-info fallback and resize have no missing imports',()=>{const {events,canvas}=boot(true);events.resize();assert.equal(canvas.height,1688);});
