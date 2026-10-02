'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['src/content-hash.js','src/schema.js','src/layout.js','src/runtime.js','src/play/profile.js','src/play/shuffle.js',
 'src/product/board.js','src/product/effects.js','src/product/round.js','src/product/controller.js','src/product/clock.js',
 'src/product/catalog.js','src/product/social.js','src/product/client.js','src/product/wechat.js','src/integration/wechat-provider.js',
 'ui/product/art.js','ui/product/app.js'];
const deals=[270,540,720].map(n=>{const d=require('../examples/deal-'+n+'.json'),r=require('../examples/deal-'+n+'.receipt.json');if(!require('../src/release').verifyRelease(d,r).ok)throw Error('INVALID_DEAL_'+n);return d;});
function wave(notes,duration,gain=.22){const rate=22050,len=Math.floor(duration*rate),buf=Buffer.alloc(44+len*2);buf.write('RIFF',0);buf.writeUInt32LE(36+len*2,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(len*2,40);
 for(let i=0;i<len;i++){const t=i/rate,step=duration/notes.length,j=Math.min(notes.length-1,Math.floor(t/step)),local=t-j*step,f=notes[j],env=Math.min(1,local/.01)*Math.pow(Math.max(0,1-local/step),1.8),sample=(Math.sin(2*Math.PI*f*local)+.15*Math.sin(4*Math.PI*f*local))*env*gain;buf.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(sample*32767))),44+i*2);}return buf;}
const audio={click:wave([740],.065),clear:wave([523,659,784],.24),win:wave([523,659,784,1047],.5),fail:wave([330,277,220],.33),music:wave([261.63,329.63,392,329.63,293.66,349.23,440,349.23,261.63,392,329.63,261.63,293.66,349.23,293.66,196],6.4,.12)};
const definitions=files.map(f=>JSON.stringify(f.slice(0,-3))+':function(module,exports,require){\n'+fs.readFileSync(path.join(root,f),'utf8')+'\n}').join(',\n');
const sounds=Object.fromEntries(Object.entries(audio).map(([k,v])=>[k,'data:audio/wav;base64,'+v.toString('base64')]));
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#bbec80"><title>羊了个羊 · 全模块开发复现 v0.12</title><style>
:root{--grass:#bbec80;--outside:#283d2e;--frame:#f5f7eb}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--outside)}body{display:flex;justify-content:center;align-items:center;font-family:system-ui,sans-serif;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}canvas{display:block;width:min(100vw,460px);height:100%;max-height:1040px;background:var(--grass);touch-action:none;outline:none;box-shadow:0 0 70px #10201888}#fatal{position:fixed;background:var(--frame);padding:24px;border-radius:12px;max-width:360px;color:#233a27;display:none;white-space:pre-wrap}
</style></head><body><canvas id="game" tabindex="0" aria-label="每日三消游戏，2022玩法开发复现">浏览器需要支持 Canvas。</canvas><div id="fatal"></div><script>
'use strict';
const definitions={${definitions}},cache={};
function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;if(!definitions[id])throw Error('MODULE_MISSING:'+id);definitions[id](m,m.exports,k=>{const a=id.split('/');a.pop();for(const p of k.replace(/\\.js$/,'').split('/')){if(p==='..')a.pop();else if(p!=='.')a.push(p);}return load(a.join('/'));});return m.exports;}
const sounds=${JSON.stringify(sounds)},deals=${JSON.stringify(deals)};
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
try{
 window.game=load('ui/product/app').createFullApp(cv,deals,bounds.width,bounds.height,devicePixelRatio||1,{storage,client:client||undefined,audio,motion:!matchMedia('(prefers-reduced-motion: reduce)').matches});
 cv.addEventListener('pointerdown',e=>{if(e.isPrimary===false)return;const b=cv.getBoundingClientRect();game.tap(e.clientX-b.left,e.clientY-b.top);});
 window.addEventListener('resize',()=>{const b=cv.getBoundingClientRect();game.resize(b.width,b.height,devicePixelRatio||1);});
 document.addEventListener('visibilitychange',()=>game.setVisible(!document.hidden));
 cv.addEventListener('keydown',e=>{if(e.key==='Escape'){const r=game.getHitRegions().find(r=>r.id==='close');if(r)game.tap(r.x+r.w/2,r.y+r.h/2);}});
 let frame=0;function render(t){if(t-frame>30){game.frame();frame=t;}requestAnimationFrame(render);}requestAnimationFrame(render);
 window.exportPlayDiagnostic=()=>{const v=game.exportDiagnostic();if(!v)return;const url=URL.createObjectURL(new Blob([v],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='sheep-round-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}catch(e){const n=document.getElementById('fatal');n.style.display='block';n.textContent='启动失败：'+e.message+'\\n请使用包内本地启动脚本，或查看验收说明。';}
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
fs.mkdirSync(path.join(wxdir,'audio'),{recursive:true});for(const [name,bytes] of Object.entries(audio))fs.writeFileSync(path.join(wxdir,'audio',name+'.wav'),bytes);
fs.writeFileSync(path.join(root,'docs/product/asset-manifest.json'),JSON.stringify({art:{path:'ui/product/art.js',origin:'new development vector drawing',originalGameAssets:false},audio:Object.entries(audio).map(([name,buf])=>({file:'audio/'+name+'.wav',bytes:buf.length,origin:'newly synthesized development tones',originalGameAudio:false})),fonts:'system fonts only; no font files distributed',maps:deals.map(d=>({dealId:d.dealId,tiles:d.cells.length,origin:d.origin})),date:'2026-09-18'},null,2));
console.log(JSON.stringify({htmlBytes:Buffer.byteLength(html),sharedModules:files.length,dealSizes:deals.map(d=>d.cells.length),wechatRoot:'wechat_full',originalAssets:false}));
