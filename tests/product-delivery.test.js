'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('delivery: launch and check entrypoints exist for Windows',()=>{for(const f of ['启动全模块预览.cmd','验收全模块.cmd','tools/start-full.js','tools/check-full.js'])assert.ok(fs.existsSync(path.join(root,f)),f);});
test('delivery: production gate has no silent true defaults',()=>{const f=path.join(root,'config/full-release-gates.json');assert.ok(fs.existsSync(f));const cfg=JSON.parse(fs.readFileSync(f));assert.equal(cfg.mode,'development');assert.equal(cfg.publicReleaseAllowed,false);assert.ok(cfg.required.every(x=>x.status==='UNVERIFIED'));});
