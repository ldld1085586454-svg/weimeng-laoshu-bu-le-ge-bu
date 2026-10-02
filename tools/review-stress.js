'use strict';
// Additional review runs, with seeds absent from the original benchmark.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');const E=require('../src');
const out=path.resolve(process.env.SHEEP_REPORT_DIR||path.join(__dirname,'../reports'));fs.mkdirSync(out,{recursive:true});
const report={node:process.version,platform:process.platform,limitations:'Synthetic layouts; no WeChat runtime, human testing, prop solver or original-game fidelity test.'};
const rows=[];let runtimeReplays=0;
for(let i=0;i<1000;i++){
 const n=[270,540,720][i%3],quotas=Object.fromEntries(Array.from({length:15},(_,j)=>[`T${j.toString().padStart(2,'0')}`,n/15]));
 const start=performance.now(),g=E.generateDeal({layout:E.makeFixtureLayout(n),quotas,seed:E.seedFromText(`fix-v08-new-family-20260918-${i}`),targetOccupancy:i%7});
 const replay=E.replay(g.deal,g.receipt.witness);assert(replay.ok);
 if(i%20===0){let s=E.createRound(g.deal);for(const id of g.receipt.witness){const p=E.pick(s,id);assert(p.ok);s=p.state;}assert.equal(s.status,'WON');runtimeReplays++;}
 rows.push({index:i,tiles:n,dealId:g.deal.dealId,verified:replay.ok,elapsedMs:performance.now()-start});
}
report.newSeedBatch={cases:rows.length,verified:rows.filter(x=>x.verified).length,totalTiles:rows.reduce((n,r)=>n+r.tiles,0),runtimeReplays,rows};
console.log(`new-seed batch verified: ${rows.length}, full runtime: ${runtimeReplays}`);
// Independent direct-list exhaustive search, no production graph or verifier.
function oracle(deal,cap){
 const dead=new Set();let visits=0;
 function walk(left,rack){
  visits++;if(!left.length)return rack.length===0;
  const key=left.map(c=>c.id).sort().join(',')+'|'+rack.slice().sort().join(',');if(dead.has(key))return false;
  for(const c of left){
   const blocked=left.some(b=>b.id!==c.id&&(
    c.zone==='side'&&b.zone==='side'&&c.stackId===b.stackId&&b.position<c.position ||
    c.zone==='board'&&b.zone==='board'&&b.z>c.z&&
    Math.min(c.rect.x+c.rect.w,b.rect.x+b.rect.w)>Math.max(c.rect.x,b.rect.x)&&
    Math.min(c.rect.y+c.rect.h,b.rect.y+b.rect.h)>Math.max(c.rect.y,b.rect.y)));
   if(blocked||rack.length>=cap)continue;
   let next=[...rack,c.type];if(next.filter(t=>t===c.type).length===3)next=next.filter(t=>t!==c.type);
   if(next.length>=cap)continue;
   if(walk(left.filter(b=>b.id!==c.id),next))return true;
  }
  dead.add(key);return false;
 }
 return {solvable:walk(deal.cells,[]),visits};
}
const cross=[];
for(let k=0;k<120;k++){
 const n=[9,12,15][k%3],rng=E.createRandom(E.seedFromText(`fix-v08-mixed-${k}`),'layout');
 const labels=rng.shuffle(Array.from({length:n},(_,i)=>'T'+Math.floor(i/3))),sideCount=4,cells=[];
 for(let i=0;i<n-sideCount;i++)cells.push({id:`b${i}`,type:labels[i],zone:'board',z:i,rect:{x:rng.int(3)*40,y:rng.int(3)*40,w:75,h:75}});
 for(let s=0;s<2;s++)for(let pos=0;pos<2;pos++){const i=n-sideCount+s*2+pos;cells.push({id:`s${s}p${pos}`,type:labels[i],zone:'side',stackId:'s'+s,position:pos,rect:{x:s*150+pos*4,y:500,w:75,h:75}});}
 const deal={schema:'astra-deal-1',dealId:`mix${k}`,layoutId:`mix${k}`,slotCapacity:7,cells};
 for(const capacity of [3,4,5,6,7]){
  const expected=oracle(deal,capacity),got=E.solve(deal,{capacity,maxNodes:1000000});
  assert.notEqual(got.status,'UNKNOWN');assert.equal(got.status==='SOLVED',expected.solvable,`mixed-${k} capacity-${capacity}`);
  cross.push({case:k,n,capacity,oracleSolvable:expected.solvable,oracleVisits:expected.visits,status:got.status});
 }
}
report.mixedBoardAndSideCrosscheck={layouts:120,comparisons:cross.length,mismatches:0,unknown:0,rows:cross};
console.log(`mixed-zone solver cross-check: ${cross.length}, mismatches: 0`);
fs.writeFileSync(path.join(out,'additional-stress.json'),JSON.stringify(report,null,2));
console.log('report saved');
