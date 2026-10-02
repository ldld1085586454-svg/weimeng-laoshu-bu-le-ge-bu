'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
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
// Independent Node crypto checks the fixed baselines captured from retained approved
// fixtures. Original history/v0.7_examples files are unavailable; this is no claim
// of a fresh comparison against that omitted historical archive.
const baseline=require('./fixtures/legacy-v07.json');
const digest=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
function fixtureDigests(deal,receipt){
 const cells=deal.cells.map(c=>[c.id,c.type,c.zone,c.rect.x,c.rect.y,c.rect.w,c.rect.h,
  c.zone==='board'?c.z:null,c.zone==='side'?c.stackId:null,c.zone==='side'?c.position:null]);
 return {canonicalCells:digest(JSON.stringify(cells)),dealId:digest(deal.dealId),witness:digest(JSON.stringify(receipt.witness))};
}
for(const fixture of baseline.fixtures){
 const n=fixture.tiles;
 test(`retained ${n}-tile fixture and regenerated algorithm output match fixed SHA-256 baselines`,()=>{
  const deal=require(`../examples/deal-${n}.json`),receipt=require(`../examples/deal-${n}.receipt.json`);
  assert.deepEqual(fixtureDigests(deal,receipt),fixture.sha256,'retained fixture changed');
  const generated=E.generateDeal({layout:E.makeFixtureLayout(n),...fixture.generation});
  assert.deepEqual(fixtureDigests(generated.deal,generated.receipt),fixture.sha256,'algorithm output changed');
  assert.equal(E.verifyRelease(generated.deal,generated.receipt).ok,true);
 });
 test(`legacy ${n}-tile snapshot without snapshotHash still verifies with a matching receipt`,()=>{
  const legacy=structuredClone(require(`../examples/deal-${n}.json`));
  const receipt=structuredClone(require(`../examples/deal-${n}.receipt.json`));
  const snapshotHash=legacy.snapshotHash;
  delete legacy.snapshotHash;
  assert.equal(Object.hasOwn(legacy,'snapshotHash'),false);
  assert.equal(E.verifyRelease(legacy,receipt).code,'DEAL_HASH_MISMATCH','unadjusted modern receipt must be rejected');
  receipt.dealHash=E.hashJSON(legacy);
  const verification=E.verifyRelease(legacy,receipt);
  assert.equal(verification.ok,true,verification.code);
  assert.equal(verification.snapshotHash,snapshotHash);
  assert.deepEqual(fixtureDigests(legacy,receipt),fixture.sha256);
 });
}
