'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFullApp}=require('../ui/product/app');
const Theme=require('../ui/product/theme');

function fixture(columns=3,layered=false){
 return {schema:'astra-deal-1',dealId:'card-geometry-'+columns+(layered?'-layered':''),layoutId:'geometry-fixture',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
  cells:Array.from({length:columns*3},(_,i)=>({id:'g'+i,type:'T'+String(i%columns).padStart(2,'0'),zone:'board',z:layered?Math.floor(i/columns):0,
   rect:{x:i%columns*100,y:layered?0:Math.floor(i/columns)*100,w:96,h:96}}))};
}
async function boot(t,{deal=fixture(),motion=false}={}){
 let time=Date.UTC(2026,9,2,6),transform={a:1,d:1,e:0,f:0};const frames=[];
 const ctx=new Proxy({measureText:value=>({width:String(value).length*7}),setTransform(a,_b,_c,d,e,f){transform={a,d,e,f};}},{get:(object,key)=>key in object?object[key]:()=>{}});
 const artAssets={draw(_ctx,key,x,y,w,h){if(key==='tile.frame')frames.push({x,y,w,h,screen:{x:x*transform.a+transform.e,y:y*transform.d+transform.f,w:w*transform.a,h:h*transform.d}});return true;},dispose(){}};
 const app=createFullApp({getContext:()=>ctx},[deal],390,844,1,{now:()=>time,motion,artAssets});t.after(()=>app.destroy());
 await app.ready;assert.equal((await app.qa.start('daily')).ok,true);
 return {app,frames,advance(ms){time+=ms;frames.length=0;app.frame();}};
}
const close=(actual,expected,message,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<tolerance,message+' ('+actual+' vs '+expected+')');
function region(app,id){const r=app.getHitRegions().find(r=>r.id===id);assert.ok(r,'missing '+id);return r;}
async function click(app,id){const r=region(app,id);assert.equal(r.enabled,true,'disabled '+id);return app.tap(r.x+r.w/2,r.y+r.h/2);}
async function earn(app,kind){assert.equal((await click(app,kind)).ok,true);await click(app,'grant');assert.equal(app.getModal(),'PROVIDER');await click(app,'dev-complete');assert.equal(app.getModal(),null);}

test('card geometry: dense board gaps shrink without changing deal, blockers, aspect or hit bounds',async t=>{
 const deal=fixture(),original=JSON.stringify(deal),{app,frames}=await boot(t,{deal}),before=app.getState();
 for(const [width,height,padding] of [[390,844,{}],[320,568,{}],[375,667,{top:88,bottom:25}],[430,932,{}]]){
  frames.length=0;app.resize(width,height,1,padding);
  const a=region(app,'tile:g0'),right=region(app,'tile:g1'),below=region(app,'tile:g3'),k=region(app,'move').w/112;
  const gapX=(right.x-a.x-a.w)/k,gapY=(below.y-a.y-a.h)/k;
  assert.ok(gapX>0&&gapX<=1,'main board horizontal gap exceeds one logical pixel: '+gapX);
  assert.ok(gapY>0&&gapY<=1.3,'main board vertical gap is too wide: '+gapY);
  close(a.h/a.w,1.25,'board card aspect');
  for(const r of app.getHitRegions().filter(r=>r.kind==='tile')){
   assert.ok(r.x>=0&&r.y>=(padding.top||0)&&r.x+r.w<=width&&r.y+r.h<=height-(padding.bottom||0));
   assert.ok(frames.some(frame=>['x','y','w','h'].every(key=>Math.abs(frame.screen[key]-r[key])<1e-5)),'draw and hit bounds differ for '+r.id);
  }
  const lowest=Math.max(...app.getHitRegions().filter(r=>r.zone==='board').map(r=>r.y+r.h));
  const bufferTop=(height-(padding.bottom||0))-(302*k);
  assert.ok(lowest<=bufferTop-28*k,'main board crowds the reserve label');
  assert.deepEqual(app.getState(),before,'layout must not alter the board or blockers');
 }
 assert.equal(JSON.stringify(deal),original,'display layout mutated the supplied deal');
});

test('card geometry: the expanded fringe selects the visible front layer and then exposes the next',async t=>{
 const {app}=await boot(t,{deal:fixture(3,true)}),r=region(app,'tile:g6'),g=Theme.boardGeometry(app.getState().board.deal,844);
 const originalLeft=g.tx,fringe=originalLeft-g.scale*.75,y=r.y+r.h/2;
 assert.ok(fringe<originalLeft,'test point must be outside the original 96-unit card');
 for(const id of ['g6','g3','g0']){
  const before=app.getState(),i=before.board.byId[id];assert.equal(before.board.blockers[i],0);
  assert.equal((await app.tap(fringe,y)).ok,true,'expanded edge did not pick '+id);
  const after=app.getState();assert.equal(after.board.taken[i],true);
  assert.equal(after.board.taken.filter(Boolean).length,before.board.taken.filter(Boolean).length+1,'one tap must pick one front tile');
 }
 assert.equal(app.getState().board.cleared,3);
});

test('card geometry: rack landing and the last three clear frames use the same two-pixel slot gap',async t=>{
 const {app,frames,advance}=await boot(t,{motion:true}),rack=Theme.rackGeometry(844),cardW=rack.w-2;
 await click(app,'tile:g0');advance(179);
 close(frames.at(-1).w,cardW,'flying card landing width',1e-4);close(frames.at(-1).h,rack.h,'flying card landing height',1e-4);
 advance(71);const landed=frames.find(frame=>Math.abs(frame.y-rack.y)<1e-5);
 assert.ok(landed,'landed rack tile missing');close(landed.w,cardW,'static rack card width');
 await click(app,'tile:g3');advance(250);await click(app,'tile:g6');advance(180);
 const clearing=frames.filter(frame=>Math.abs(frame.y-rack.y)<1e-5);
 assert.equal(clearing.length,3,'three cards must begin clearing at their rack positions');
 for(const frame of clearing){close(frame.w,cardW,'clear frame width');close(frame.h,rack.h,'clear frame height');}
 close(clearing[1].x-clearing[0].x-clearing[0].w,2,'rack inter-card gap');
});

test('card geometry: move and undo animations start from the wider rack card without jumping',async t=>{
 for(const kind of ['move','undo'])await t.test(kind,async t=>{
  const {app,frames,advance}=await boot(t,{motion:true}),rack=Theme.rackGeometry(844),cardW=rack.w-2;
  for(const id of kind==='move'?['g0','g1','g2']:['g0'])await app.qa.pick(id);
  frames.length=0;await earn(app,kind);
  const sourceFrames=frames.filter(frame=>Math.abs(frame.y-rack.y)<1e-5).slice(-(kind==='move'?3:1));
  assert.equal(sourceFrames.length,kind==='move'?3:1);
  for(const frame of sourceFrames){close(frame.w,cardW,kind+' source width');close(frame.h,rack.h,kind+' source height');}
  advance(230);
  for(const id of kind==='move'?['g0','g1','g2']:['g0']){
   const target=region(app,'tile:'+id);
   assert.ok(frames.some(frame=>['x','y','w','h'].every(key=>Math.abs(frame.screen[key]-target[key])<1e-5)),kind+' destination must match its drawn hit bounds');
  }
 });
});

test('card geometry: six reserve cards remain separated after actual move and revival',async t=>{
 const {app}=await boot(t,{deal:fixture(10)});
 for(const id of ['g0','g1','g2'])await app.qa.pick(id);await earn(app,'move');
 for(let i=3;i<10;i++)await app.qa.pick('g'+i);assert.equal(app.getModal(),'REVIVE');await earn(app,'revive');
 assert.equal(app.getState().board.buffer.length,6);
 for(const [width,height,padding] of [[390,844,{}],[320,568,{}],[375,667,{top:88,bottom:25}]]){
  app.resize(width,height,1,padding);const rs=app.getHitRegions().filter(r=>r.zone==='buffer').sort((a,b)=>a.x-b.x),k=region(app,'move').w/112;
  assert.equal(rs.length,6);
  for(let i=0;i<rs.length;i++){
   const r=rs[i];assert.ok(r.x>=0&&r.x+r.w<=width&&r.y>=(padding.top||0)&&r.y+r.h<=height-(padding.bottom||0));
   close(r.w/k,44,'reserve width remains unchanged');if(i)close((r.x-rs[i-1].x-rs[i-1].w)/k,8,'reserve gap remains unchanged');
  }
 }
});
