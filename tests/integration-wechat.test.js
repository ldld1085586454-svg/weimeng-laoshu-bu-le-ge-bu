'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'wechat_integration');
function boot(){const ev={},lines=[],canvas={},ctx=new Proxy({measureText:t=>({width:t.length*8}),fillText:t=>lines.push(t)},{get:(o,k)=>k in o?o[k]:(()=>{})});
canvas.getContext=()=>ctx;const wx={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:2}),
onTouchStart:f=>ev.touch=f,onHide:f=>ev.hide=f,onShow:f=>ev.show=f,onWindowResize:f=>ev.resize=f};
const file=path.join(dir,'game.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{wx,require:createRequire(file)});return {ev,lines,canvas};}
test('integrated WeChat entry stub: imports resolve and touch starts actual session',()=>{const {ev,lines,canvas}=boot();assert.equal(canvas.width,780);ev.touch({touches:[{clientX:195,clientY:448}]});assert.ok(lines.includes('单人对局'));});
test('integrated WeChat entry stub: background and multi-touch cannot auto-start or grant',()=>{const {ev,lines}=boot();ev.hide();ev.touch({touches:[{clientX:195,clientY:448}]});assert.ok(!lines.includes('单人对局'));ev.show();ev.touch({touches:[{},{}]});assert.ok(!lines.includes('单人对局'));});
test('integrated package: every SDK-bundled module matches its tested source',()=>{for(const folder of ['src','ui'])for(const item of fs.readdirSync(path.join(dir,folder),{recursive:true,withFileTypes:true})){
 if(!item.isFile()||!item.name.endsWith('.js'))continue;
 const full=path.join(item.parentPath||item.path,item.name),relative=path.relative(dir,full);
 assert.equal(fs.readFileSync(full,'utf8'),fs.readFileSync(path.join(root,relative),'utf8'),relative);}});
test('integrated package: native requests default off with no production mode',()=>{const c=require('../wechat_integration/preview-config');assert.equal(c.mode,'simulation');assert.equal(c.allowAdPreview,false);assert.equal(c.allowSharePreview,false);assert.equal(c.adUnitId,'');});
