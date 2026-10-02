'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const inputPath=path.join(__dirname,'../ui/product/input.js');
const createPointerInput=fs.existsSync(inputPath)?require(inputPath).createPointerInput:null;

function setup(options={}){
 assert.equal(typeof createPointerInput,'function','pointer input helper is missing');
 const regions=[{id:'move',x:0,y:0,w:40,h:40,enabled:true},{id:'undo',x:60,y:0,w:40,h:40,enabled:true}];
 const activated=[],changes=[];
 let allowed=true,input;
 input=createPointerInput({
  hitTest:(x,y)=>{
   const region=regions.find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);
   return region?{...region}:null;
  },
  activate:id=>{activated.push(id);return options.activate?.(id)??'activated:'+id;},
  enabled:()=>allowed,
  onChange:()=>changes.push(input.pressed())
 });
 return {input,regions,activated,changes,setEnabled:v=>{allowed=v;}};
}

test('pointer input: press draws feedback and release activates the captured target once',()=>{
 const {input,activated,changes}=setup();
 assert.equal(input.down(10,10),true);
 assert.equal(input.pressed(),'move');
 assert.deepEqual(activated,[]);
 input.move(20,20);
 assert.deepEqual(changes,['move'],'moving inside the same target redraws unnecessarily');
 assert.equal(input.up(20,20),'activated:move');
 assert.equal(input.pressed(),null);
 input.up(20,20);
 assert.deepEqual(activated,['move']);
 assert.deepEqual(changes,['move',null]);
});

test('pointer input: empty and disabled targets cannot capture or activate',()=>{
 const {input,regions,activated,changes}=setup();
 regions[0].enabled=false;
 assert.equal(input.down(10,10),false);
 input.up(10,10);
 assert.equal(input.down(50,10),false);
 input.up(70,10);
 assert.deepEqual(activated,[]);
 assert.deepEqual(changes,[]);
 assert.equal(input.pressed(),null);
});

test('pointer input: leaving cancels feedback and re-entering restores the original target',()=>{
 const {input,activated,changes}=setup();
 input.down(10,10,7);
 input.move(50,10,7);
 assert.equal(input.pressed(),null);
 input.move(70,10,7);
 assert.equal(input.pressed(),null,'moving to a different target must not transfer the press');
 input.move(15,15,7);
 assert.equal(input.pressed(),'move');
 input.up(15,15,7);
 assert.deepEqual(activated,['move']);
 assert.deepEqual(changes,['move',null,'move',null]);
});

test('pointer input: release outside or over another target cannot activate either action',()=>{
 const {input,activated}=setup();
 for(const x of [50,70]){
  input.down(10,10);
  input.up(x,10);
  assert.equal(input.pressed(),null);
 }
 assert.deepEqual(activated,[]);
});

test('pointer input: release rechecks target identity and current business availability',()=>{
 const {input,regions,activated}=setup();
 input.down(10,10);
 regions[0].enabled=false;
 input.up(10,10);
 regions[0].enabled=true;
 input.down(10,10);
 regions[0].id='replacement-action';
 input.up(10,10);
 assert.deepEqual(activated,[],'a spent tool or replaced panel must not receive the old press');
});

test('pointer input: disabled host input prevents capture and cancels an active release',()=>{
 const {input,activated,setEnabled}=setup();
 setEnabled(false);
 assert.equal(input.down(10,10),false);
 setEnabled(true);
 input.down(10,10);
 setEnabled(false);
 input.up(10,10);
 setEnabled(true);
 input.up(10,10);
 assert.deepEqual(activated,[]);
 assert.equal(input.pressed(),null);
});

test('pointer input: other pointers cannot take over, move, release or cancel a captured press',()=>{
 const {input,activated}=setup();
 input.down(10,10,3);
 assert.equal(input.down(70,10,4),false);
 input.move(70,10,4);
 input.up(70,10,4);
 input.cancel(4);
 assert.equal(input.pressed(),'move');
 input.up(10,10,3);
 assert.deepEqual(activated,['move']);
});

test('pointer input: non-finite coordinates and compound pointer identifiers never activate',()=>{
 const {input,activated}=setup();
 for(const [x,y] of [[NaN,10],[10,NaN],[Infinity,10],[10,-Infinity],[[10,20],10]]){
  assert.equal(input.down(x,y),false);
  input.down(10,10);
  input.move(x,y);
  input.up(10,10);
  input.down(10,10);
  input.up(x,y);
  input.up(10,10);
 }
 for(const pointerId of [NaN,Infinity,[3,4],{}]){
  assert.equal(input.down(10,10,pointerId),false);
  input.up(10,10,pointerId);
 }
 assert.deepEqual(activated,[]);
 assert.equal(input.pressed(),null);
});

test('pointer input: global cancel and lifecycle reset discard the gesture',()=>{
 const {input,activated}=setup();
 input.down(10,10,8);
 input.cancel();
 input.up(10,10,8);
 input.down(70,10,9);
 input.reset();
 input.up(70,10,9);
 assert.equal(input.pressed(),null);
 assert.deepEqual(activated,[]);
});

test('pointer input: disposed input clears feedback and cannot trigger later actions',()=>{
 const {input,activated,changes}=setup();
 input.down(10,10);
 input.dispose();
 const changedBefore=changes.length;
 input.up(10,10);
 input.down(70,10);
 input.move(70,10);
 input.up(70,10);
 input.cancel();
 input.reset();
 input.dispose();
 assert.equal(input.pressed(),null);
 assert.deepEqual(activated,[]);
 assert.equal(changes.length,changedBefore);
});

test('pointer input: asynchronous activation preserves its result and releases immediately',async()=>{
 let finish;
 const pending=new Promise(resolve=>{finish=resolve;});
 const {input,activated}=setup({activate:()=>pending});
 input.down(10,10);
 const result=input.up(10,10);
 assert.equal(result,pending);
 assert.equal(input.pressed(),null);
 input.up(10,10);
 assert.deepEqual(activated,['move']);
 finish({ok:true});
 assert.deepEqual(await result,{ok:true});
});

test('pointer input: ignored async rejection is handled while callers can still observe it',async()=>{
 const {input}=setup({activate:async()=>{throw Error('activation rejected');}});
 input.down(10,10);
 const result=input.up(10,10);
 await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(result,/activation rejected/);
 assert.equal(input.pressed(),null);
});

// Execute the actual host entry against the real pointer helper. Only platform
// registration and unrelated app startup are stubbed; gestures use real state.
function nativeInput({end=true,move=true,cancel=true}={}){
 const state=setup(),listeners={};
 const app={pointerDown:state.input.down,pointerMove:state.input.move,
  pointerUp:state.input.up,pointerCancel:state.input.cancel,
  tap:(x,y)=>{state.input.down(x,y);return state.input.up(x,y);},
  frame:()=>{},resize:()=>{},setVisible:()=>{}};
 const wx={createCanvas:()=>({}),getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:1}),
  getStorageSync:()=>'',setStorageSync:()=>{},
  onTouchStart:fn=>{listeners.start=fn;},onHide:()=>{},onShow:()=>{}};
 if(end)wx.onTouchEnd=fn=>{listeners.end=fn;};
 if(move)wx.onTouchMove=fn=>{listeners.move=fn;};
 if(cancel)wx.onTouchCancel=fn=>{listeners.cancel=fn;};
 const modules={
  './ui/product/app':{createFullApp:()=>app},
  './src/product/wechat':{createPlatform:()=>null},
  './src/integration/wechat-provider':{},
  './src/product/art-assets':require('../src/product/art-assets'),
  './data/art-manifest':{schema:1,assets:{}},
  './data/deals':[], './preview-config':{mode:'simulation'}
 };
 const source=fs.readFileSync(path.join(__dirname,'../templates/wechat-full/game.js'),'utf8');
 vm.runInNewContext(source,{wx,require:id=>{assert.ok(Object.hasOwn(modules,id),id);return modules[id];},requestAnimationFrame:()=>{}});
 return {...state,listeners};
}
const touch=(x=10,y=10,identifier=7)=>({clientX:x,clientY:y,identifier});

test('native input: modern touch entry presses, moves and releases with the same identifier',()=>{
 const {input,activated,listeners}=nativeInput();
 listeners.start({touches:[touch()]});
 assert.equal(input.pressed(),'move');
 assert.deepEqual(activated,[],'touch start must not spend the action');
 listeners.move({touches:[touch(70)]});
 assert.equal(input.pressed(),null);
 listeners.move({touches:[touch()]});
 assert.equal(input.pressed(),'move');
 listeners.end({touches:[],changedTouches:[touch()]});
 assert.deepEqual(activated,['move']);
 assert.equal(input.pressed(),null);
});

test('native input: multi-touch and cancellation discard the entire captured gesture',()=>{
 const {input,activated,listeners}=nativeInput();
 assert.equal(typeof listeners.move,'function','touch move handler is missing');
 assert.equal(typeof listeners.cancel,'function','touch cancel handler is missing');
 assert.equal(typeof listeners.end,'function','touch end handler is missing');
 listeners.start({touches:[touch()]});
 listeners.move({touches:[touch(),touch(70,10,8)]});
 assert.equal(input.pressed(),null);
 listeners.end({touches:[],changedTouches:[touch()]});
 listeners.start({touches:[touch()]});
 listeners.cancel({touches:[],changedTouches:[touch()]});
 listeners.end({touches:[],changedTouches:[touch()]});
 listeners.start({touches:[touch(),touch(70,10,8)]});
 listeners.end({touches:[],changedTouches:[touch(),touch(70,10,8)]});
 assert.equal(input.pressed(),null);
 assert.deepEqual(activated,[]);
});

test('native input: missing end capability retains legacy tap and optional hooks are detected',()=>{
 const legacy=nativeInput({end:false,move:false,cancel:false});
 legacy.listeners.start({touches:[touch()]});
 assert.deepEqual(legacy.activated,['move']);
 legacy.listeners.start({touches:[touch(),touch(70,10,8)]});
 assert.deepEqual(legacy.activated,['move']);
 const modern=nativeInput({move:false,cancel:false});
 modern.listeners.start({touches:[touch()]});
 assert.deepEqual(modern.activated,[]);
 modern.listeners.end({touches:[],changedTouches:[touch()]});
 assert.deepEqual(modern.activated,['move']);
});
