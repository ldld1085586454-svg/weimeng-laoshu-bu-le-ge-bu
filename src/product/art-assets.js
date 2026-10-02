'use strict';

// Optional shared artwork. Every unavailable entry leaves the existing Canvas drawing available.
const KEYS=new Set([
 'background.home','background.board','character.plain','character.cap','character.scarf','character.grave','character.home','character.win',
 'honor.first','honor.king','honor.fast','decoration.laurel','decoration.progress','button.primary','tile.frame',
 ...Array.from({length:15},(_,i)=>'tile.T'+String(i).padStart(2,'0')),
 ...['move','undo','shuffle','revive','rank','friends','topic','wardrobe','profile','club','settings','bullet','locate','back','close'].map(id=>'icon.'+id),
]);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const positive=value=>Number.isFinite(value)&&value>0;
const rectValid=rect=>object(rect)&&Number.isFinite(rect.x)&&rect.x>=0&&Number.isFinite(rect.y)&&rect.y>=0&&positive(rect.w)&&positive(rect.h);
function browserImage(){return new globalThis.Image();}
function dimensions(image){try{
 const width=positive(image.naturalWidth)?image.naturalWidth:image.width;
 const height=positive(image.naturalHeight)?image.naturalHeight:image.height;
 return positive(width)&&positive(height)?{width,height}:null;
}catch{return null;}}

function createArtAssets(manifest={schema:1,assets:{}},{createImage=browserImage,timeoutMs=10000}={}){
 let disposed=false;
 const entries=new Map(),sources=new Map(),cache=new Map();
 const timeout=Number.isFinite(timeoutMs)&&timeoutMs>=0?Math.min(timeoutMs,2147483647):10000;
 const failed=(key,reason)=>entries.set(key,{key,status:'failed',reason});
 if(!object(manifest)||manifest.schema!==1||!object(manifest.assets))failed('$manifest','INVALID_MANIFEST');
 else for(const [key,asset] of Object.entries(manifest.assets)){
  if(!KEYS.has(key)){failed(key,'UNKNOWN_KEY');continue;}
  if(!object(asset)){failed(key,'INVALID_ASSET');continue;}
  if(typeof asset.src!=='string'||!asset.src.trim()){failed(key,'INVALID_SOURCE');continue;}
  if(asset.rect!==undefined&&!rectValid(asset.rect)){failed(key,'INVALID_RECT');continue;}
  const entry={key,status:'pending',rect:asset.rect===undefined?null:{x:asset.rect.x,y:asset.rect.y,w:asset.rect.w,h:asset.rect.h}};
  entries.set(key,entry);
  if(!sources.has(asset.src))sources.set(asset.src,{src:asset.src,entries:[],status:'pending',image:null,timer:null,finish:null,promise:null});
  sources.get(asset.src).entries.push(entry);
 }

 function load(source){
  let resolve;
  source.promise=new Promise(done=>{resolve=done;});
  source.finish=reason=>{
   if(source.status!=='pending')return;
   source.status='finished';
   if(source.timer!==null)clearTimeout(source.timer);
   if(source.image){try{source.image.onload=null;}catch{}try{source.image.onerror=null;}catch{}}
   if(disposed)reason='DISPOSED';
   const size=reason?null:dimensions(source.image);
   if(!reason&&!size)reason='INVALID_IMAGE_SIZE';
   for(const entry of source.entries){
    const rect=entry.rect||size&&{x:0,y:0,w:size.width,h:size.height};
    const entryReason=reason||(rect.x+rect.w>size.width||rect.y+rect.h>size.height?'RECT_OUT_OF_BOUNDS':null);
    if(entryReason){entry.status='failed';entry.reason=entryReason;}
    else{
     const frozenRect=Object.freeze(rect);
     cache.set(entry.key,Object.freeze({image:source.image,rect:frozenRect,width:frozenRect.w,height:frozenRect.h}));
     entry.status='loaded';
    }
   }
   resolve();
  };
  try{
   source.image=createImage();
   if(!source.image||(typeof source.image!=='object'&&typeof source.image!=='function'))throw Error('INVALID_IMAGE');
   source.image.onload=()=>source.finish(null);
   source.image.onerror=()=>source.finish('IMAGE_ERROR');
  }catch{source.finish('CREATE_IMAGE_FAILED');return source.promise;}
  source.timer=setTimeout(()=>source.finish('TIMEOUT'),timeout);
  try{source.image.src=source.src;}catch{source.finish('SOURCE_ASSIGN_FAILED');}
  return source.promise;
 }
 // Register all keys before starting any image: a source assignment may synchronously call onload.
 const ready=Promise.all([...sources.values()].map(load)).then(()=>{
  const loaded=[],failures=[];
  for(const entry of entries.values())if(entry.status==='loaded')loaded.push(entry.key);else failures.push({key:entry.key,reason:entry.reason});
  return {loaded,failed:failures};
 });
 function get(key){return disposed?null:cache.get(key)||null;}
 function draw(ctx,key,x,y,w,h,{fit='contain',alpha=1}={}){
  const asset=get(key);
  if(!asset||!ctx||typeof ctx.save!=='function'||typeof ctx.restore!=='function'||typeof ctx.drawImage!=='function')return false;
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0||!['contain','cover','stretch'].includes(fit)||!Number.isFinite(alpha)||alpha<0||alpha>1)return false;
  let sx=asset.rect.x,sy=asset.rect.y,sw=asset.rect.w,sh=asset.rect.h,dx=x,dy=y,dw=w,dh=h;
  if(fit==='contain'){
   const scale=Math.min(w/sw,h/sh);dw=sw*scale;dh=sh*scale;dx=x+(w-dw)/2;dy=y+(h-dh)/2;
  }else if(fit==='cover'){
   const scale=Math.max(w/sw,h/sh),cropWidth=w/scale,cropHeight=h/scale;
   sx+=(sw-cropWidth)/2;sy+=(sh-cropHeight)/2;sw=cropWidth;sh=cropHeight;
  }
  if(![sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite))return false;
  let saved=false,drawn=false;
  try{
   ctx.save();saved=true;
   ctx.globalAlpha=(Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1)*alpha;
   ctx.drawImage(asset.image,sx,sy,sw,sh,dx,dy,dw,dh);drawn=true;
  }catch{}finally{if(saved)try{ctx.restore();}catch{drawn=false;}}
  return drawn;
 }
 function dispose(){
  if(disposed)return;disposed=true;cache.clear();
  for(const source of sources.values())if(source.status==='pending')source.finish('DISPOSED');
  sources.clear();
 }
 return {ready,get,draw,dispose};
}

module.exports={createArtAssets};
