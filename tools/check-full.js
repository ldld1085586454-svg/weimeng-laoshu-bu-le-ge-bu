'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function frozen(file){const map=require(path.join(root,file));for(const [name,expected] of Object.entries(map)){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');if(actual!==expected)throw Error('FROZEN_SOURCE_CHANGED:'+name);}return Object.keys(map).length;}
try{
 if(Number(process.versions.node.split('.')[0])<22)throw Error('NODE_22_REQUIRED');
 const algorithmFiles=frozen('docs/v0.8_algorithm_frozen.json'),previousSources=frozen('docs/product/frozen-v011.json');
 for(const n of [270,540,720]){const r=require('../src/release').verifyRelease(require('../examples/deal-'+n+'.json'),require('../examples/deal-'+n+'.receipt.json'));if(!r.ok)throw Error('DEAL_VERIFICATION_FAILED:'+n);}
 const build=spawnSync(process.execPath,['tools/build-full.js'],{cwd:root,stdio:'inherit'});if(build.status!==0)throw Error('BUILD_FAILED');
 const tests=spawnSync(process.execPath,['tools/run-tests.js'],{cwd:root,stdio:'inherit'});if(tests.status!==0)throw Error('TESTS_FAILED');
 console.log(JSON.stringify({ok:true,algorithmFiles,previousSources,approvedDealSizes:[270,540,720],realWeChatTested:false,production:false},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
