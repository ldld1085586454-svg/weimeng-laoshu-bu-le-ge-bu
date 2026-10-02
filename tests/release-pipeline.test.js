'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const E=require('../src');
const base=path.resolve(__dirname,'..');
function fixtureBuild(callback) {
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sheep-build-'));
 try {
  for(const d of ['tools','examples','wechat_probe'])fs.mkdirSync(path.join(tmp,d),{recursive:true});
  fs.cpSync(path.join(base,'src'),path.join(tmp,'src'),{recursive:true});
  for(const f of ['tools/build-probe.js','tools/verify.js','wechat_probe/app.js','examples/deal-270.json','examples/deal-270.receipt.json'])
   fs.copyFileSync(path.join(base,f),path.join(tmp,f));
  callback(tmp);
 } finally {fs.rmSync(tmp,{recursive:true,force:true});}
}
test('probe build rejects mismatching proof before replacing a last-known-good bundle',()=>{
 fixtureBuild(tmp=>{
  const run=()=>spawnSync(process.execPath,['tools/build-probe.js'],{cwd:tmp,encoding:'utf8'});
  assert.equal(run().status,0);
  const htmlPath=path.join(tmp,'算法联调_双击打开.html'),old=fs.readFileSync(htmlPath);
  const rp=path.join(tmp,'examples/deal-270.receipt.json'),r=JSON.parse(fs.readFileSync(rp,'utf8'));
  r.witness[1]=r.witness[0];fs.writeFileSync(rp,JSON.stringify(r));
  const result=run();assert.notEqual(result.status,0);
  assert.match(result.stderr,/INVALID_PROBE_DEAL/);assert.deepEqual(fs.readFileSync(htmlPath),old);
 });
});
test('CLI verifier rejects missing identity even with an updated receipt byte hash',()=>{
 fixtureBuild(tmp=>{
  const dp=path.join(tmp,'examples/deal-270.json'),rp=path.join(tmp,'examples/deal-270.receipt.json');
  const d=JSON.parse(fs.readFileSync(dp,'utf8')),r=JSON.parse(fs.readFileSync(rp,'utf8'));
  delete d.layoutId;delete d.snapshotHash;r.dealHash=E.hashJSON(d);
  fs.writeFileSync(dp,JSON.stringify(d));fs.writeFileSync(rp,JSON.stringify(r));
  const p=spawnSync(process.execPath,['tools/verify.js'],{cwd:tmp,encoding:'utf8'});
  assert.notEqual(p.status,0);assert.equal(JSON.parse(p.stdout).ok,false);
 });
});
test('fixture generation is unchanged apart from optional v0.8 content fingerprint',()=>{
 for(const n of [270,540,720]) {
  const dir=path.join(base,'history/v0.7_examples');
  const old=JSON.parse(fs.readFileSync(path.join(dir,`deal-${n}.json`),'utf8'));
  const r=JSON.parse(fs.readFileSync(path.join(dir,`deal-${n}.receipt.json`),'utf8'));
  const g=E.generateDeal({layout:E.makeFixtureLayout(n),quotas:r.quotas,seed:r.seed,targetOccupancy:r.targetOccupancy,candidateId:r.candidateId,mutationAttempts:r.mutation.attempted});
  assert.deepEqual(g.deal.cells,old.cells);assert.equal(g.deal.dealId,old.dealId);
  assert.deepEqual(g.receipt.witness,r.witness);assert.equal(E.verifyRelease(old,r).ok,true);
 }
});
