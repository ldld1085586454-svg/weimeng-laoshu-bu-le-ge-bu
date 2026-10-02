'use strict';
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..'),probe=path.join(base,'wechat_probe');
const {verifyRelease}=require('../src/release');
const deal=JSON.parse(fs.readFileSync(path.join(base,'examples/deal-270.json'),'utf8'));
const receipt=JSON.parse(fs.readFileSync(path.join(base,'examples/deal-270.receipt.json'),'utf8'));
const verification=verifyRelease(deal,receipt);
if(!verification.ok) throw new Error(`INVALID_PROBE_DEAL:${verification.code}`);
// Do not replace the last known-good bundles until input and proof have passed.
fs.mkdirSync(path.join(probe,'engine'),{recursive:true});fs.mkdirSync(path.join(probe,'data'),{recursive:true});
for(const file of ['content-hash.js','schema.js','layout.js','runtime.js'])fs.copyFileSync(path.join(base,'src',file),path.join(probe,'engine',file));
const data={deal,witness:receipt.witness};
fs.writeFileSync(path.join(probe,'data/sample.js'),'module.exports='+JSON.stringify(data)+';\n');
const sources={};
for(const name of ['content-hash','schema','layout','runtime']) sources[name]=fs.readFileSync(path.join(base,'src',name+'.js'),'utf8');
const wrapped=Object.entries(sources).map(([name,source])=>`modules[${JSON.stringify(name)}]=(function(){const module={exports:{}};${source}\nreturn module.exports;})();`).join('\n');
const appSource=fs.readFileSync(path.join(probe,'app.js'),'utf8');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>算法联调样例</title>
<style>html,body{margin:0;height:100%;background:#dce5db;font-family:sans-serif}body{display:flex;align-items:center;justify-content:center}canvas{width:min(100vw,420px);height:min(100vh,860px);touch-action:none;box-shadow:0 10px 50px #0002}</style><canvas id="c"></canvas>
<script>
const modules={};function require(k){const name=k.replace('./engine/','').replace('./','');if(modules[name])return modules[name];throw Error(k);}
${wrapped}
const appFactory=(function(){const module={exports:{}};${appSource}\nreturn module.exports;})();
const data=${JSON.stringify(data)};const canvas=document.getElementById('c');const r=canvas.getBoundingClientRect();
window.probe=appFactory.createProbe(canvas,data.deal,data.witness,r.width,r.height,devicePixelRatio||1);
canvas.addEventListener('pointerdown',e=>{const p=canvas.getBoundingClientRect();window.probe.tap(e.clientX-p.left,e.clientY-p.top);});
window.addEventListener('resize',()=>{const p=canvas.getBoundingClientRect();window.probe.resize(p.width,p.height,devicePixelRatio||1);});
</script></html>`;
fs.writeFileSync(path.join(base,'算法联调_双击打开.html'),html);
console.log('Built development probes. Witness is intentionally bundled only for QA; do not ship this probe as the public game.');
