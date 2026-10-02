'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {verifyRelease}=require('../src/release');
const deal=JSON.parse(fs.readFileSync(path.join(root,'examples/deal-270.json'),'utf8'));
const receipt=JSON.parse(fs.readFileSync(path.join(root,'examples/deal-270.receipt.json'),'utf8'));
const verification=verifyRelease(deal,receipt);
if(!verification.ok)throw new Error('INVALID_PLAY_DEAL:'+verification.code);
const files=['src/content-hash.js','src/schema.js','src/layout.js','src/runtime.js',
 'src/play/profile.js','src/play/board.js','src/play/session.js','src/play/shuffle.js','ui/play-app.js'];
const sources=Object.fromEntries(files.map(file=>[file.slice(0,-3),fs.readFileSync(path.join(root,file),'utf8')]));
const definitions=Object.entries(sources).map(([id,source])=>JSON.stringify(id)+':function(module,exports,require){\n'+source+'\n}').join(',\n');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>道具与对局联调 v0.9</title><style>
html,body{margin:0;width:100%;height:100%;background:#dce4d8;font-family:sans-serif}body{display:flex;justify-content:center;align-items:center}canvas{display:block;width:min(100vw,460px);height:min(100dvh,940px);touch-action:none;box-shadow:0 0 60px #263e361f}
</style></head><body><canvas id="game" aria-label="道具与对局开发联调"></canvas><script>
const definitions={${definitions}},cache={};
function load(id){if(cache[id])return cache[id].exports;const mod={exports:{}};cache[id]=mod;if(!definitions[id])throw Error('MODULE_NOT_BUNDLED:'+id);definitions[id](mod,mod.exports,k=>{if(!k.startsWith('.'))throw Error('NO_EXTERNAL_DEPENDENCY:'+k);const parts=id.split('/');parts.pop();for(const part of k.replace(/\\.js$/,'').split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}return load(parts.join('/'));});return mod.exports;}
const deal=${JSON.stringify(deal)};
const canvas=document.getElementById('game');let bounds=canvas.getBoundingClientRect();
window.game=load('ui/play-app').createPlayApp(canvas,deal,bounds.width,bounds.height,window.devicePixelRatio||1);
canvas.addEventListener('pointerdown',e=>{if(e.isPrimary===false)return;const b=canvas.getBoundingClientRect();game.tap(e.clientX-b.left,e.clientY-b.top);});
window.addEventListener('resize',()=>{const b=canvas.getBoundingClientRect();game.resize(b.width,b.height,window.devicePixelRatio||1);});
document.addEventListener('visibilitychange',()=>game.setVisible(!document.hidden));
// Diagnostic export is intentionally a QA API, not an original-game gameplay button.
window.exportPlayDiagnostic=()=>{const t=game.exportDiagnostic();if(!t)return;const url=URL.createObjectURL(new Blob([t],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='play-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
</script></body></html>`;
const wxdir=path.join(root,'wechat_game');fs.mkdirSync(wxdir,{recursive:true});
for(const file of files){const to=path.join(wxdir,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
fs.mkdirSync(path.join(wxdir,'data'),{recursive:true});fs.writeFileSync(path.join(wxdir,'data/deal.js'),'module.exports='+JSON.stringify(deal)+';\n');
fs.writeFileSync(path.join(root,'道具与对局联调_双击打开.html'),html);
console.log('Built v0.9 development play UI + WeChat code. No witness, real ad or social service bundled.');
