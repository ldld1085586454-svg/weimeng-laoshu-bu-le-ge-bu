'use strict';
// Re-runs write to local_reports; shipped reports remain an immutable evidence snapshot.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..'),out=path.join(base,'local_reports');
fs.mkdirSync(out,{recursive:true});
const full=process.argv.includes('--full');
const steps=[['tests',['tools/run-tests.js']]];
for(const n of [270,540,720])steps.push([`release-${n}`,['tools/verify.js',`examples/deal-${n}.json`,`examples/deal-${n}.receipt.json`]]);
if(full)steps.push(['benchmark',['tools/benchmark.js','1000']],['review-stress',['tools/review-stress.js']],['play-stress',['tools/play-stress.js','500']]);
const results=[];
for(const [name,args] of steps) {
 console.log(`RUN ${name}`);
 const result=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8',maxBuffer:16*1024*1024,
   env:{...process.env,SHEEP_REPORT_DIR:out}});
 fs.writeFileSync(path.join(out,name+'.log'),(result.stdout||'')+(result.stderr||'')+(result.error?result.error.message:''));
 const ok=result.status===0;results.push({step:name,ok,exitCode:result.status,log:name+'.log'});
 console.log(`${ok?'PASS':'FAIL'} ${name}`);
 if(!ok)break;
}
const ok=results.length===steps.length&&results.every(r=>r.ok);
const summary={version:require('../package.json').version,node:process.version,platform:process.platform,full,ok,results,
  scope:'Algorithm, candidate assists, local-session and commercial simulation tests; fixture publication checks. No production SDK/backend, WeChat DevTools, real ads or phone certification.'};
fs.writeFileSync(path.join(out,'check-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));process.exitCode=ok?0:1;
