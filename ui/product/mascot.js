'use strict';
// Read-only Canvas rig for the exact approved PNG. No game-state writes, clocks,
// subscriptions, reward calls or timers. advance() is driven only by the host.
const ASSET_KEY='character.reference';
const DURATIONS=Object.freeze({tap:.52,clear:.78,assist:.6,revive:.88,win:1.7,fail:.7});
const PRIORITIES=Object.freeze({idle:0,tap:1,clear:2,assist:3,revive:4,win:5,fail:5});
const CUES=Object.freeze({TAKE:'tap',CLEAR:'clear',WON:'win',LOST:'fail',MOVE_TO_BUFFER:'assist',UNDO:'assist',SHUFFLED:'assist',REVIVE_CANDIDATE_APPLIED:'revive'});
const TAU=Math.PI*2,clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const masks=new WeakMap();
function defaultCanvas(w,h){
 if(typeof globalThis.OffscreenCanvas==='function')return new globalThis.OffscreenCanvas(w,h);
 if(globalThis.document?.createElement){const c=globalThis.document.createElement('canvas');c.width=w;c.height=h;return c;}
 // Native host can inject its own factory. WeChat Canvas does not need an SVG decoder.
 if(typeof globalThis.wx?.createOffscreenCanvas==='function')return globalThis.wx.createOffscreenCanvas({type:'2d',width:w,height:h});
 return null;
}
function smooth(min,max,n){const t=clamp((n-min)/(max-min));return t*t*(3-2*t);}
function ellipse(ctx,x,y,rx,ry){
 const k=.5522847498307936;
 ctx.moveTo(x+rx,y);ctx.bezierCurveTo(x+rx,y+k*ry,x+k*rx,y+ry,x,y+ry);ctx.bezierCurveTo(x-k*rx,y+ry,x-rx,y+k*ry,x-rx,y);ctx.bezierCurveTo(x-rx,y-k*ry,x-k*rx,y-ry,x,y-ry);ctx.bezierCurveTo(x+k*rx,y-ry,x+rx,y-k*ry,x+rx,y);ctx.closePath();
}
function polygon(ctx,points,color){ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fillStyle=color;ctx.fill();}
function star(ctx,x,y,r,color){const points=[];for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2,s=i%2?.34:1;points.push([x+Math.cos(a)*r*s,y+Math.sin(a)*r*s]);}polygon(ctx,points,color);}
function makeMasks(asset,createCanvas){
 // Cache only successful masks, by source image and crop. At most four 512px
 // canvases for this one reference, reused across every mascot instance.
 const key=[asset.rect.x,asset.rect.y,asset.rect.w,asset.rect.h].join(',');
 const cached=masks.get(asset.image);if(cached?.key===key)return cached.layers;
 try{
  const factor=Math.min(1,512/Math.max(asset.width,asset.height)),w=Math.max(1,Math.round(asset.width*factor)),h=Math.max(1,Math.round(asset.height*factor));
  const source=createCanvas(w,h),c=source?.getContext?.('2d');
  if(!c||typeof c.getImageData!=='function'||typeof c.putImageData!=='function')return null;
  source.width=w;source.height=h;c.drawImage(asset.image,asset.rect.x,asset.rect.y,asset.rect.w,asset.rect.h,0,0,w,h);
  const input=c.getImageData(0,0,w,h),pixels=input.data,layers={};
  for(const name of ['body','leaves','sad']){
   const canvas=createCanvas(w,h),context=canvas?.getContext?.('2d');if(!context||typeof context.putImageData!=='function')return null;
   canvas.width=w;canvas.height=h;
   const data=context.createImageData?context.createImageData(w,h):context.getImageData(0,0,w,h);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,u=(x+.5)/w,v=(y+.5)/h;
    const green=smooth(.025,.09,(pixels[i+1]-Math.max(pixels[i],pixels[i+2]))/255)*(v<.425?1:0);
    data.data[i]=pixels[i];data.data[i+1]=pixels[i+1];data.data[i+2]=pixels[i+2];data.data[i+3]=Math.round(pixels[i+3]*(name==='leaves'?green:1-green));
    if(name==='sad'&&(((v>=.690&&v<=.95)&&(u>=.31&&u<=.68))||((v>=.674&&v<=.72)&&(u>=.31&&u<=.37)))){
     const mix=clamp((1-pixels[i]/255)*12+pixels[i+2]/255*12),sample=(Math.min(h-1,Math.floor(clamp(v,.53,.88)*h))*w+Math.floor(w*.255))*4;
     for(let channel=0;channel<3;channel++)data.data[i+channel]=Math.round(pixels[i+channel]*(1-mix)+pixels[sample+channel]*mix);
    }
   }
   context.putImageData(data,0,0);layers[name]=canvas;
  }
  masks.set(asset.image,{key,layers});return layers;
 }catch{return null;}
}
function image(ctx,asset,w,h){const r=asset.rect;ctx.drawImage(asset.image,r.x,r.y,r.w,r.h,0,0,w,h);}
// Portable clip fallback when a native host cannot create/read offscreen pixels.
// The curved joint follows the top of this approved orange body, not a new drawing.
function partClip(ctx,w,h,leaf){
 ctx.beginPath();
 if(leaf){ctx.moveTo(0,0);ctx.lineTo(w,0);ctx.lineTo(w,.425*h);ctx.lineTo(.72*w,.425*h);ctx.bezierCurveTo(.65*w,.394*h,.38*w,.385*h,.27*w,.425*h);ctx.lineTo(0,.425*h);}
 else{ctx.moveTo(0,h);ctx.lineTo(w,h);ctx.lineTo(w,.425*h);ctx.lineTo(.72*w,.425*h);ctx.bezierCurveTo(.65*w,.394*h,.38*w,.385*h,.27*w,.425*h);ctx.lineTo(0,.425*h);}
 ctx.closePath();ctx.clip();
}
function orangeStrip(ctx,asset,w,h,top,bottom){
 // Stretch one column of the original orange surface; preserve its vertical shading.
 const r=asset.rect,sampleTop=clamp(top,.53,.88),sampleBottom=clamp(bottom,.53,.88);
 ctx.drawImage(asset.image,r.x+r.w*.255,r.y+r.h*sampleTop,Math.max(1,r.w*.001),Math.max(1,r.h*(sampleBottom-sampleTop)),0,top*h,w,(bottom-top)*h);
}
function face(ctx,asset,w,h,p,masked){
 const sad=p.expression==='fail',closed=Math.max(p.blink,sad?.68:0);
 if(sad&&!masked){
  ctx.save();ctx.beginPath();ctx.moveTo(.329*w,.664*h);ctx.bezierCurveTo(.302*w,.662*h,.300*w,.730*h,.346*w,.735*h);ctx.bezierCurveTo(.345*w,.818*h,.380*w,.950*h,.522*w,.950*h);ctx.bezierCurveTo(.673*w,.952*h,.689*w,.869*h,.670*w,.780*h);ctx.bezierCurveTo(.645*w,.716*h,.616*w,.686*h,.554*w,.686*h);ctx.bezierCurveTo(.485*w,.674*h,.419*w,.700*h,.380*w,.686*h);ctx.lineTo(.349*w,.679*h);ctx.bezierCurveTo(.340*w,.675*h,.352*w,.664*h,.329*w,.664*h);ctx.closePath();ctx.clip();ctx.fillStyle='#fd6f00';ctx.fill();orangeStrip(ctx,asset,w,h,.664,.88);orangeStrip(ctx,asset,w,h,.88,.95);ctx.restore();
 }
 if(closed>.001){
  const bottom=.509+(.697-.509)*closed;
  ctx.save();ctx.beginPath();ellipse(ctx,.422*w,.596*h,.083*w,.092*h);ellipse(ctx,.578*w,.599*h,.080*w,.092*h);ctx.clip();
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(w,0);ctx.lineTo(w,bottom*h);ctx.lineTo(0,bottom*h);ctx.closePath();ctx.clip();orangeStrip(ctx,asset,w,h,.503,.697);ctx.restore();
 }
 if(p.blink>.8){
  ctx.save();ctx.globalAlpha*=smooth(.8,1,p.blink);ctx.strokeStyle='#262421';ctx.lineWidth=Math.max(1.2,h*.006);ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(.369*w,.608*h);ctx.lineTo(.473*w,.608*h);ctx.moveTo(.530*w,.608*h);ctx.lineTo(.628*w,.608*h);ctx.stroke();ctx.restore();
 }
 if(sad){ctx.beginPath();ctx.moveTo(.419*w,.820*h);ctx.quadraticCurveTo(.493*w,.801*h,.567*w,.820*h);ctx.strokeStyle='#292522';ctx.lineWidth=Math.max(1.5,h*.013);ctx.lineCap='round';ctx.stroke();}
}
function accessories(ctx,w,h,skin,role){
 if(skin==='cap'){
  ctx.beginPath();ctx.moveTo(.32*w,.49*h);ctx.bezierCurveTo(.32*w,.37*h,.68*w,.37*h,.68*w,.49*h);ctx.closePath();ctx.fillStyle='#e8b448';ctx.fill();
  ctx.strokeStyle='#577457';ctx.lineWidth=w*.026;ctx.beginPath();ctx.moveTo(.34*w,.482*h);ctx.lineTo(.66*w,.482*h);ctx.stroke();ctx.beginPath();ellipse(ctx,.5*w,.496*h,.235*w,.012*h);ctx.fillStyle='#f6c95e';ctx.fill();
 }else if(skin==='scarf'){
  polygon(ctx,[[.26*w,.913*h],[.36*w,.973*h],[.67*w,.973*h],[.74*w,.913*h],[.67*w,.943*h],[.35*w,.943*h]],'#4b7760');
  polygon(ctx,[[.62*w,.938*h],[.68*w,.948*h],[.72*w,1.058*h],[.64*w,1.033*h]],'#37624b');
 }
 if(['first','king','fast'].includes(role)){
  const x=.76*w,y=.76*h;ctx.beginPath();ellipse(ctx,x,y,.1*w,.1*w);ctx.fillStyle='#f6c95e';ctx.fill();
  if(role==='first')star(ctx,x,y,.064*w,'#fffbed');
  else if(role==='king')polygon(ctx,[[x-.065*w,y+.035*h],[x-.07*w,y-.04*h],[x-.022*w,y-.012*h],[x,y-.06*h],[x+.025*w,y-.012*h],[x+.065*w,y-.04*h],[x+.06*w,y+.035*h]],'#577457');
  else{ctx.beginPath();ctx.moveTo(x+.018*w,y-.062*h);ctx.lineTo(x-.025*w,y+.008*h);ctx.lineTo(x+.025*w,y+.005*h);ctx.lineTo(x-.015*w,y+.065*h);ctx.strokeStyle='#577457';ctx.lineWidth=Math.max(2,w*.025);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
 }
}
function createMascot({artAssets=null,reducedMotion=false,createCanvas=defaultCanvas}={}){
 let clock=0,elapsed=0,cue='idle',expression='idle',visible=true,skin='plain',role='home',prepared=null,preparedAsset=null;
 const seen=new Map();
 function pose(){
  const p={bodyScale:{x:1,y:1},offset:{x:0,y:0},rotation:0,leafRotation:0,blink:0,particles:0,expression,cue,active:elapsed<(DURATIONS[cue]||0)};
  if(reducedMotion)return p;
  const breath=Math.sin(clock*TAU/3.6);p.bodyScale={x:1-breath*.008,y:1+breath*.012};p.leafRotation=Math.sin(clock*TAU/2.8)*.025;
  const blinkTime=clock%4.9;if(blinkTime>=3&&blinkTime<3.22)p.blink=Math.sin((blinkTime-3)/.22*Math.PI);
  if(p.active){const t=elapsed/DURATIONS[cue];
   if(cue==='tap'||cue==='assist'){const squash=t<.28?Math.sin(Math.min(t/.28,1)*Math.PI)*.11:0;p.bodyScale={x:1+squash,y:1-squash};p.offset.y=-Math.sin(clamp((t-.18)/.82)*Math.PI)*.028;}
   else if(['clear','revive','win'].includes(cue)){p.offset.y=-Math.abs(Math.sin(t*Math.PI*(cue==='win'?2:1)))*(cue==='revive'?.075:.045)*(1-t*.35);p.rotation=Math.sin(t*TAU*2)*.035*(1-t);p.bodyScale={x:1+Math.sin(t*TAU)*.035,y:1-Math.sin(t*TAU)*.035};p.leafRotation+=Math.sin(t*TAU*2)*.05*(1-t);p.particles=Math.sin(t*Math.PI);}
   else if(cue==='fail'){p.rotation=Math.sin(t*Math.PI)*-.065;p.bodyScale={x:1+Math.sin(t*Math.PI)*.045,y:1-Math.sin(t*Math.PI)*.06};p.leafRotation-=Math.sin(t*Math.PI)*.08;}
  }
  return p;
 }
 function advance(delta){if(!visible||reducedMotion||!Number.isFinite(delta)||delta<0)return;clock+=delta;elapsed+=delta;}
 function setVisible(value){visible=!!value;}
 function setReducedMotion(value){reducedMotion=!!value;if(reducedMotion)elapsed=DURATIONS[cue]||0;}
 function setAppearance(nextSkin,nextRole='home'){skin=['plain','cap','scarf'].includes(nextSkin)?nextSkin:'plain';role=nextRole;}
 function play(next){if(!Object.prototype.hasOwnProperty.call(DURATIONS,next))return false;if(elapsed<(DURATIONS[cue]||0)&&PRIORITIES[next]<PRIORITIES[cue])return false;cue=next;elapsed=reducedMotion?DURATIONS[cue]:0;expression=cue==='fail'?'fail':cue==='win'?'win':'idle';return true;}
 function cancelAndSnap(next='idle'){cue='idle';elapsed=0;clock=0;expression=next==='win'||next==='fail'?next:'idle';}
 function consumeCommitted(state,events){
  const id=state?.roundId,revision=state?.revision;
  if(typeof id!=='string'||!id||!Number.isInteger(revision)||revision<0||revision<=(seen.get(id)??-1))return null;
  seen.set(id,revision);if(seen.size>8)seen.delete(seen.keys().next().value);
  let chosen='idle';for(const event of Array.isArray(events)?events:[]){const next=CUES[event?.type]||'idle';if(PRIORITIES[next]>PRIORITIES[chosen])chosen=next;}
  if(chosen==='idle')return null;if(chosen==='revive')cancelAndSnap();return play(chosen)?chosen:null;
 }
 function draw(ctx,x,y,w,h,appearance={}){
  if(!visible||![x,y,w,h].every(Number.isFinite)||w<=0||h<=0||!ctx)return false;
  const asset=artAssets?.get?.(ASSET_KEY);
  if(!asset?.image||!asset.rect||![asset.width,asset.height].every(n=>Number.isFinite(n)&&n>0))return false;
  const needed=['save','restore','translate','rotate','scale','drawImage','beginPath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','closePath','clip','fill','stroke'];
  if(needed.some(method=>typeof ctx[method]!=='function'))return false;
  if(preparedAsset!==asset){prepared=makeMasks(asset,createCanvas);preparedAsset=asset;}
  const p=pose(),s=Math.min(w/asset.width,h/asset.height),dw=asset.width*s,dh=asset.height*s,dx=x+(w-dw)/2,dy=y+(h-dh)/2,drawSkin=appearance.skin??skin,drawRole=appearance.role??role;
  let saved=false;
  try{
   ctx.save();saved=true;
   ctx.beginPath();ellipse(ctx,dx+dw*.5,dy+dh*.975,dw*.22,dw*.0352);ctx.fillStyle='rgba(51,82,46,.12)';ctx.fill();
   if(p.particles>0&&!['first','king','fast'].includes(drawRole))for(let i=0;i<6;i++){const a=TAU*i/6-Math.PI/2,r=dw*(.32+.08*p.particles);star(ctx,dx+dw/2+Math.cos(a)*r,dy+dh/2+Math.sin(a)*r,Math.max(1.2,w*.018)*p.particles,'#f6c95e');}
   ctx.translate(dx+dw*.5,dy+dh*.96+p.offset.y*h);ctx.rotate(p.rotation);ctx.scale(p.bodyScale.x,p.bodyScale.y);ctx.translate(-dw*.5,-dh*.96);
   // Crown rotates around the stem within the shared body transform.
   ctx.save();try{ctx.translate(dw*.5,dh*.415);ctx.rotate(p.leafRotation);ctx.translate(-dw*.5,-dh*.415);
    if(prepared)ctx.drawImage(prepared.leaves,0,0,dw,dh);else{partClip(ctx,dw,dh,true);image(ctx,asset,dw,dh);}
   }finally{ctx.restore();}
   ctx.save();try{if(prepared)ctx.drawImage(p.expression==='fail'?prepared.sad:prepared.body,0,0,dw,dh);else{partClip(ctx,dw,dh,false);image(ctx,asset,dw,dh);}face(ctx,asset,dw,dh,p,!!prepared);}finally{ctx.restore();}
   accessories(ctx,dw,dh,drawSkin,drawRole);return true;
  }catch{return false;}finally{if(saved)ctx.restore();}
 }
 return {advance,setVisible,setReducedMotion,setAppearance,play,cancelAndSnap,consumeCommitted,pose,draw};
}
module.exports={createMascot,ASSET_KEY,DURATIONS};
