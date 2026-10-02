'use strict';
const fs=require('node:fs');const path=require('node:path');const E=require('../src');
// Usage: node tools/generate.js [tiles=270] [seedText=demo-2022] [outputDir=examples]
const n=Number(process.argv[2]||270),seedText=process.argv[3]||'demo-2022',dir=path.resolve(process.argv[4]||'examples');
try {
 const layout=E.makeFixtureLayout(n),groups=n/3,k=Math.min(15,groups),quotas={};
 for(let i=0;i<k;i++)quotas[`T${String(i).padStart(2,'0')}`]=3*(Math.floor(groups/k)+(i<groups%k?1:0));
 const g=E.generateDeal({layout,quotas,seed:E.seedFromText(seedText),targetOccupancy:5});
 fs.mkdirSync(dir,{recursive:true});
 const base=`deal-${n}`;
 fs.writeFileSync(path.join(dir,`${base}.json`),JSON.stringify(g.deal,null,2));
 fs.writeFileSync(path.join(dir,`${base}.receipt.json`),JSON.stringify(g.receipt,null,2));
 console.log(JSON.stringify({deal:path.join(dir,`${base}.json`),receipt:path.join(dir,`${base}.receipt.json`),
  tiles:n,verification:g.receipt.verification,provenance:'SYNTHETIC_NOT_HISTORICAL'},null,2));
} catch(error) {console.error(error.message);process.exitCode=1;}
