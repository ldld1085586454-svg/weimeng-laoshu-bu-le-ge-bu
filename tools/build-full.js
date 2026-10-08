'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['src/content-hash.js','src/schema.js','src/layout.js','src/runtime.js','src/play/profile.js','src/play/shuffle.js',
 'src/product/board.js','src/product/effects.js','src/product/round.js','src/product/controller.js','src/product/clock.js',
 'src/product/catalog.js','src/product/social.js','src/product/client.js','src/product/online-client.js','src/product/progress.js','src/product/wechat.js','src/integration/wechat-provider.js',
 'src/product/art-assets.js','ui/product/input.js','ui/product/mascot.js','ui/product/icons.js','ui/product/theme.js','ui/product/art.js','ui/product/app.js'];
const deals=[270,540,720].map(n=>{const d=require('../examples/deal-'+n+'.json'),r=require('../examples/deal-'+n+'.receipt.json');if(!require('../src/release').verifyRelease(d,r).ok)throw Error('INVALID_DEAL_'+n);return d;});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function within(dir,file){const relative=path.relative(dir,file);return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);}
function imageMime(src,bytes){
 const extension=path.extname(src).toLowerCase();
 if(extension==='.png'&&bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0)return 'image/png';
 if(extension==='.webp'&&bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)===bytes.length-8&&['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16)))return 'image/webp';
 if(['.jpg','.jpeg'].includes(extension)&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 throw Error('INVALID_THEME_IMAGE:'+src);
}
function fontMime(src,bytes){
 const extension=path.extname(src).toLowerCase();
 if(extension==='.ttf'&&bytes.length>=12&&[0x00010000,0x74727565].includes(bytes.readUInt32BE(0))&&bytes.readUInt16BE(4)>0&&bytes.length>=12+16*bytes.readUInt16BE(4))return 'font/ttf';
 if(extension==='.woff2'&&bytes.length>=48&&bytes.toString('ascii',0,4)==='wOF2'&&bytes.readUInt32BE(8)===bytes.length&&bytes.readUInt16BE(12)>0&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<=bytes.length-48)return 'font/woff2';
 throw Error('INVALID_THEME_FONT_HEADER:'+src);
}
function themeAssets(){
 const manifestPath=path.join(root,'assets/theme/manifest.json');
 if(!fs.existsSync(manifestPath))return {native:{schema:1,assets:{}},browser:{schema:1,assets:{}},sourceData:{},files:[]};
 const realRoot=fs.realpathSync(root),themeRoot=fs.realpathSync(path.dirname(manifestPath));
 if(themeRoot!==path.join(realRoot,'assets/theme')||!within(themeRoot,fs.realpathSync(manifestPath)))throw Error('THEME_PATH_ESCAPE');
 let manifest;try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}catch(e){throw Error('INVALID_THEME_MANIFEST');}
 if(!object(manifest)||manifest.schema!==1||!object(manifest.assets))throw Error('INVALID_THEME_MANIFEST');
 const images=new Map(),fontFiles=[],licenses=[];let heading=null,browserFonts=manifest.fonts;
 if(manifest.fonts!==undefined){
  if(!object(manifest.fonts)||Object.keys(manifest.fonts).some(key=>key!=='heading'))throw Error('INVALID_THEME_FONTS');
  if(manifest.fonts.heading!==undefined){
   const font=manifest.fonts.heading,src=font?.src,family=font?.family;
   if(!object(font)||typeof src!=='string'||!src.startsWith('assets/theme/')||!/\.(ttf|woff2)$/i.test(src)||src.includes('\\')||src.includes('\0')||src.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('INVALID_THEME_FONT_SOURCE');
   if(typeof family!=='string'||family!==family.trim()||!/^[\p{L}\p{N} _.-]{1,100}$/u.test(family))throw Error('INVALID_THEME_FONT_FAMILY');
   const file=fs.realpathSync(path.join(root,src));if(!within(themeRoot,file))throw Error('THEME_PATH_ESCAPE');
   if(!fs.statSync(file).isFile())throw Error('INVALID_THEME_FONT_HEADER');
   const bytes=fs.readFileSync(file),mime=fontMime(src,bytes),data='data:'+mime+';base64,'+bytes.toString('base64');
   heading={src,family,mime,data};fontFiles.push({src,bytes});browserFonts={heading:{...font,src:data}};
   const licenseSrc=path.posix.join(path.posix.dirname(src),'OFL.txt'),licensePath=path.join(root,licenseSrc);
   if(fs.existsSync(licensePath)){
    const realLicense=fs.realpathSync(licensePath);if(!within(themeRoot,realLicense))throw Error('THEME_PATH_ESCAPE');
    const licenseBytes=fs.readFileSync(realLicense);fontFiles.push({src:licenseSrc,bytes:licenseBytes});licenses.push({src:licenseSrc,text:licenseBytes.toString('utf8')});
   }
  }
 }
 for(const [key,asset] of Object.entries(manifest.assets)){
  if(!object(asset))throw Error('INVALID_THEME_ASSET:'+key);
  const src=asset.src;
  if(typeof src!=='string'||!src.startsWith('assets/theme/')||!/^assets\/theme\/.+\.(png|webp|jpe?g)$/i.test(src)||src.includes('\\')||src.includes('\0')||src.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('INVALID_THEME_SOURCE:'+key);
  if(!images.has(src)){
   const file=fs.realpathSync(path.join(root,src));
   if(!within(themeRoot,file))throw Error('THEME_PATH_ESCAPE:'+key);
   if(!fs.statSync(file).isFile())throw Error('INVALID_THEME_IMAGE:'+src);
   const bytes=fs.readFileSync(file),mime=imageMime(src,bytes);
   images.set(src,{src,bytes,mime});
  }
 }
 const sourceData=Object.fromEntries([...images.values()].map(image=>[image.src,'data:'+image.mime+';base64,'+image.bytes.toString('base64')]));
 return {native:manifest,browser:{...manifest,...(browserFonts===undefined?{}:{fonts:browserFonts})},sourceData,files:[...images.values(),...fontFiles],heading,licenses};
}
// Validate every referenced source before replacing any last-built player artifact.
const artwork=themeAssets();
const inlineJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c');
function wave(notes,duration,gain=.22){const rate=22050,len=Math.floor(duration*rate),buf=Buffer.alloc(44+len*2);buf.write('RIFF',0);buf.writeUInt32LE(36+len*2,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(len*2,40);
 for(let i=0;i<len;i++){const t=i/rate,step=duration/notes.length,j=Math.min(notes.length-1,Math.floor(t/step)),local=t-j*step,f=notes[j],env=Math.min(1,local/.01)*Math.pow(Math.max(0,1-local/step),1.8),sample=(Math.sin(2*Math.PI*f*local)+.15*Math.sin(4*Math.PI*f*local))*env*gain;buf.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(sample*32767))),44+i*2);}return buf;}
const audio={click:wave([740],.065),clear:wave([523,659,784],.24),win:wave([523,659,784,1047],.5),fail:wave([330,277,220],.33),music:wave([261.63,329.63,392,329.63,293.66,349.23,440,349.23,261.63,392,329.63,261.63,293.66,349.23,293.66,196],6.4,.12)};
const definitions=files.map(f=>JSON.stringify(f.slice(0,-3))+':function(module,exports,require){\n'+fs.readFileSync(path.join(root,f),'utf8')+'\n}').join(',\n');
const sounds=Object.fromEntries(Object.entries(audio).map(([k,v])=>[k,'data:audio/wav;base64,'+v.toString('base64')]));
const fontStyles=artwork.heading?'@font-face{font-family:'+JSON.stringify(artwork.heading.family)+';src:url('+JSON.stringify(artwork.heading.data)+') format("'+(artwork.heading.mime==='font/ttf'?'truetype':'woff2')+'");font-style:normal;font-weight:400;font-display:swap}':'';
const fontLicense=artwork.licenses?.length?'<script type="application/json" id="font-license">'+inlineJSON(artwork.licenses)+'</script>':'';
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f2f6e9"><title>卜了个卜 · 每日三消</title><style>
${fontStyles}
:root{--grass:#f2f6e9;--outside:#e6ecdc;--frame:#f5f7eb}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--outside)}body{display:flex;justify-content:center;align-items:center;font-family:system-ui,sans-serif;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}canvas{display:block;width:min(100vw,460px);height:100%;max-height:1040px;background:var(--grass);touch-action:none;outline:none;box-shadow:0 0 0 1px #ced8bb,0 10px 32px #677b4220}#fatal{position:fixed;background:var(--frame);padding:24px;border-radius:12px;max-width:360px;color:#233a27;display:none;white-space:pre-wrap}
</style>${fontLicense}</head><body data-build-mode="development"><canvas id="game" tabindex="0" aria-label="每日三消游戏">浏览器需要支持 Canvas。</canvas><div id="loading" style="position:fixed;color:#66765a;font:14px system-ui">正在加载…</div><div id="fatal"></div><script>
'use strict';
const definitions={${definitions}},cache={};
function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;if(!definitions[id])throw Error('MODULE_MISSING:'+id);definitions[id](m,m.exports,k=>{const a=id.split('/');a.pop();for(const p of k.replace(/\\.js$/,'').split('/')){if(p==='..')a.pop();else if(p!=='.')a.push(p);}return load(a.join('/'));});return m.exports;}
const sounds=${JSON.stringify(sounds)},deals=${JSON.stringify(deals)};
const artSourceData=${inlineJSON(artwork.sourceData)};
const artManifest=${inlineJSON(artwork.browser)};
for(const asset of Object.values(artManifest.assets))asset.src=artSourceData[asset.src];
const artAssets=load('src/product/art-assets').createArtAssets(artManifest);
let bgm=null,storage=null;
const playing=new Set();const audio={play(n){const a=new Audio(sounds[n]);a.volume=.4;playing.add(a);a.onended=()=>playing.delete(a);a.play().catch(()=>playing.delete(a));},music(on){if(!bgm){bgm=new Audio(sounds.music);bgm.loop=true;bgm.volume=.2;}if(on)bgm.play().catch(()=>{});else bgm.pause();},destroy(){if(bgm)bgm.pause();for(const a of playing)a.pause();}};
try{localStorage.setItem('sheep-full-check','1');localStorage.removeItem('sheep-full-check');storage={get:k=>localStorage.getItem('sheep-full-012:'+k),set:(k,v)=>localStorage.setItem('sheep-full-012:'+k,v)};}catch(e){}
const cv=document.getElementById('game'),bounds=cv.getBoundingClientRect();
let device=storage?.get('device');if(!device){device='browser-'+Math.random().toString(36).slice(2);storage?.set('device',device);}
let client=null;
if(location.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)){
 const send=async(route,body,token)=>{const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);try{const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:ac.signal});return await r.json();}finally{clearTimeout(timer);}};
 client=load('src/product/client').httpClient(send,device,location.origin);
}
function startGame(headingFont){try{
 window.game=load('ui/product/app').createFullApp(cv,deals,bounds.width,bounds.height,devicePixelRatio||1,{storage,client:client||undefined,audio,artAssets,headingFont,motion:!matchMedia('(prefers-reduced-motion: reduce)').matches});
 document.getElementById('loading')?.remove?.();
 const pointerIDs=new Set(),point=e=>{const b=cv.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};};
 function releasePointer(id){try{if(cv.hasPointerCapture?.(id))cv.releasePointerCapture(id);}catch(e){}}
 function cancelPointers(){const ids=[...pointerIDs];pointerIDs.clear();game.pointerCancel();for(const id of ids)releasePointer(id);}
 cv.addEventListener('pointerdown',e=>{
  if(e.button!==undefined&&e.button!==0)return;
  pointerIDs.add(e.pointerId);
  if(e.isPrimary===false||pointerIDs.size!==1){game.pointerCancel();return;}
  try{cv.setPointerCapture?.(e.pointerId);}catch(e){}
  const p=point(e);game.pointerDown(p.x,p.y,e.pointerId);
 });
 cv.addEventListener('pointermove',e=>{
  if(!pointerIDs.has(e.pointerId))return;
  if(e.isPrimary===false||pointerIDs.size!==1){game.pointerCancel();return;}
  const p=point(e);game.pointerMove(p.x,p.y,e.pointerId);
 });
 cv.addEventListener('pointerup',e=>{
  if(!pointerIDs.has(e.pointerId))return;
  const single=e.isPrimary!==false&&pointerIDs.size===1;pointerIDs.delete(e.pointerId);
  if(single){const p=point(e);game.pointerUp(p.x,p.y,e.pointerId);}else game.pointerCancel();
  releasePointer(e.pointerId);
 });
 cv.addEventListener('pointercancel',e=>{if(pointerIDs.delete(e.pointerId))game.pointerCancel(e.pointerId);releasePointer(e.pointerId);});
 cv.addEventListener('lostpointercapture',e=>{if(pointerIDs.delete(e.pointerId))game.pointerCancel(e.pointerId);});
 window.addEventListener('blur',cancelPointers);
 window.addEventListener('resize',()=>{cancelPointers();const b=cv.getBoundingClientRect();game.resize(b.width,b.height,devicePixelRatio||1);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPointers();game.setVisible(!document.hidden);});
 cv.addEventListener('keydown',e=>{if(e.key==='Escape'){const r=game.getHitRegions().find(r=>r.id==='close');if(r)game.tap(r.x+r.w/2,r.y+r.h/2);}});
 let frame=0;function render(t){if(t-frame>30){game.frame();frame=t;}requestAnimationFrame(render);}requestAnimationFrame(render);
 window.exportPlayDiagnostic=()=>{const v=game.exportDiagnostic();if(!v)return;const url=URL.createObjectURL(new Blob([v],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='sheep-round-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}catch(e){document.getElementById('loading')?.remove?.();const n=document.getElementById('fatal');n.style.display='block';n.textContent='启动失败：'+e.message+'\\n请使用包内本地启动脚本，或查看验收说明。';}}
function begin(){
 const family=artManifest.fonts?.heading?.family;
 if(!family||typeof document.fonts?.load!=='function'){startGame(null);return;}
 let finished=false,timer;
 const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);startGame(value);};
 timer=setTimeout(()=>finish(null),3000);
 try{Promise.resolve(document.fonts.load('20px '+JSON.stringify(family))).then(faces=>finish(faces?.length?family:null),()=>finish(null));}catch(e){finish(null);}
}
begin();
</script></body></html>`;
fs.writeFileSync(path.join(root,'全模块游戏_双击打开.html'),html);
const wxdir=path.join(root,'wechat_full');fs.mkdirSync(wxdir,{recursive:true});
for(const f of files){const to=path.join(wxdir,f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,f),to);}
const templateDir=path.join(root,'templates/wechat-full'),projectPath=path.join(wxdir,'project.config.json');
const projectDefaults=JSON.parse(fs.readFileSync(path.join(templateDir,'project.config.json'),'utf8'));
const developerProject=fs.existsSync(projectPath)?JSON.parse(fs.readFileSync(projectPath,'utf8')):{};
const project={...projectDefaults,...developerProject,
 setting:{...projectDefaults.setting,...developerProject.setting},
 compileType:projectDefaults.compileType,miniprogramRoot:projectDefaults.miniprogramRoot};
fs.cpSync(templateDir,wxdir,{recursive:true,force:true,filter:(src,dest)=>{
 const relative=path.relative(wxdir,dest);
 return relative!=='project.config.json'&&(relative!=='preview-config.js'||!fs.existsSync(dest));
}});
fs.writeFileSync(projectPath,JSON.stringify(project,null,2)+'\n');
fs.mkdirSync(path.join(wxdir,'data'),{recursive:true});fs.writeFileSync(path.join(wxdir,'data/deals.js'),'module.exports='+JSON.stringify(deals)+';\n');
fs.writeFileSync(path.join(wxdir,'data/art-manifest.js'),'module.exports='+JSON.stringify(artwork.native)+';\n');
const themeOutput=path.join(wxdir,'assets/theme');fs.rmSync(themeOutput,{recursive:true,force:true});
for(const image of artwork.files){const dest=path.join(wxdir,image.src);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,image.bytes);}
fs.mkdirSync(path.join(wxdir,'audio'),{recursive:true});for(const [name,bytes] of Object.entries(audio))fs.writeFileSync(path.join(wxdir,'audio',name+'.wav'),bytes);
fs.writeFileSync(path.join(root,'docs/product/asset-manifest.json'),JSON.stringify({art:{path:Object.keys(artwork.native.assets).length?'assets/theme/manifest.json':'ui/product/art.js',origin:Object.keys(artwork.native.assets).length?'configured theme images with vector fallback':'new development vector drawing',fallback:'ui/product/art.js',originalGameAssets:false},audio:Object.entries(audio).map(([name,buf])=>({file:'audio/'+name+'.wav',bytes:buf.length,origin:'newly synthesized development tones',originalGameAudio:false})),fonts:artwork.heading?{body:'system fonts',heading:{family:artwork.heading.family,src:artwork.heading.src},licenses:artwork.licenses.map(x=>x.src)}:'system fonts only; no font files distributed',maps:deals.map(d=>({dealId:d.dealId,tiles:d.cells.length,origin:d.origin})),date:'2026-10-02'},null,2));
console.log(JSON.stringify({htmlBytes:Buffer.byteLength(html),sharedModules:files.length,dealSizes:deals.map(d=>d.cells.length),wechatRoot:'wechat_full',originalAssets:false}));
