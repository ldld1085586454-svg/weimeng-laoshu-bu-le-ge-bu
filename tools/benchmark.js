'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {performance}=require('node:perf_hooks');const assert=require('node:assert/strict');const E=require('../src');
const out=path.resolve(process.env.SHEEP_REPORT_DIR||path.join(__dirname,'../reports'));fs.mkdirSync(out,{recursive:true});
const total=Number(process.argv[2]||1000);
if(!Number.isSafeInteger(total)||total<3||total>10000)throw new RangeError('benchmark cases must be 3..10000');
const rows=[],seen=new Set(),runtimeRows=[];
function q(n) {const o={};for(let i=0;i<15;i++)o[`T${String(i).padStart(2,'0')}`]=n/15;return o;}
function quantile(a,p){const b=a.slice().sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor((b.length-1)*p))];}
function stats(a){return {p50:quantile(a,.5),p95:quantile(a,.95),max:Math.max(...a),mean:a.reduce((s,v)=>s+v,0)/a.length};}
const started=performance.now();
for(let i=0;i<total;i++) {
 const n=[270,540,720][i%3],seed=E.seedFromText(`stress-v08-fixed-${i}`),layout=E.makeFixtureLayout(n);
 const t0=performance.now(),g=E.generateDeal({layout,quotas:q(n),seed,targetOccupancy:i%7}),t1=performance.now();
 const v=E.replay(g.deal,g.receipt.witness),t2=performance.now();assert(v.ok);assert.equal(v.cleared,n);
 assert.equal(E.hashJSON(g.deal),g.receipt.dealHash);assert(!seen.has(g.deal.dealId));seen.add(g.deal.dealId);
 if(i%20===0) {
   let s=E.createRound(g.deal);for(const id of g.receipt.witness){const r=E.pick(s,id);assert(r.ok);s=r.state;}
   assert.equal(s.status,'WON');assert.equal(s.cleared,n);runtimeRows.push({case:i,tiles:n,cleared:s.cleared});
 }
 rows.push({case:i,tiles:n,seed,dealId:g.deal.dealId,hash:g.receipt.dealHash,
  generationMs:t1-t0,independentReplayMs:t2-t1,peakStable:v.peakStable,verified:v.ok});
 if((i+1)%100===0)console.log(`generated and independently verified ${i+1}/${total}`);
}
const generationEnd=performance.now();
const policyRows=[];
for(let i=0;i<30;i++) {
 // Held-out seed family: never used to select generation parameters.
 const n=[270,540,720][i%3],seed=E.seedFromText(`heldout-v08-fixed-${i}`);
 const g=E.generateDeal({layout:E.makeFixtureLayout(n),quotas:q(n),seed,targetOccupancy:i%7});
 const a=E.analyzeDeal(g.deal,{seed:E.seedFromText(`independent-evaluation-${i}`),trials:4});
 policyRows.push({case:i,tiles:n,dealId:g.deal.dealId,targetOccupancy:i%7,...a});
}
const mutationRows=[];
for(let i=0;i<20;i++) {
 const n=270,seed=E.seedFromText(`mutation-v08-fixed-${i}`);
 const g=E.generateDeal({layout:E.makeFixtureLayout(n),quotas:q(n),seed,mutationAttempts:30});
 assert(E.replay(g.deal,g.receipt.witness).ok);mutationRows.push({case:i,dealId:g.deal.dealId,...g.receipt.mutation});
}
const bySize={};for(const n of [270,540,720]) {
 const r=rows.filter(x=>x.tiles===n);bySize[n]={cases:r.length,generationMs:stats(r.map(x=>x.generationMs)),
   independentReplayMs:stats(r.map(x=>x.independentReplayMs))};
}
const policySummary={};for(const name of ['random','triple','pair']) {
 const runs=policyRows.flatMap(a=>a.policies[name].runs);policySummary[name]={runs:runs.length,wins:runs.filter(r=>r.status==='WON').length,
   meanClearFraction:runs.reduce((s,r)=>s+r.clearFraction,0)/runs.length,
   minClearFraction:Math.min(...runs.map(r=>r.clearFraction)),maxClearFraction:Math.max(...runs.map(r=>r.clearFraction))};
}
const report={version:'0.8.0',environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model},
 dataset:'SYNTHETIC_NOT_HISTORICAL',totalCases:total,verified:rows.filter(r=>r.verified).length,
 totalTiles:rows.reduce((s,r)=>s+r.tiles,0),uniqueDeals:seen.size,runtimeFullReplays:runtimeRows.length,
 generationAndReplayBatchMs:generationEnd-started,totalBenchmarkMs:performance.now()-started,bySize,policySummary,
 policyCaveat:'Conservative top-only bots. Not human win rates or historical difficulty calibration.',
 mutation:{cases:mutationRows.length,attempts:mutationRows.reduce((s,r)=>s+r.attempted,0),accepted:mutationRows.reduce((s,r)=>s+r.accepted,0)},
 rows,runtimeRows,policyRows,mutationRows};
fs.writeFileSync(path.join(out,'benchmark.json'),JSON.stringify(report,null,2));
const {rows:omit,policyRows:omit2,runtimeRows:omit3,mutationRows:omit4,...summary}=report;
fs.writeFileSync(path.join(out,'benchmark-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
