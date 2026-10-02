'use strict';
// Explicit filenames avoid shell glob differences between Windows and Linux.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..');
if(Number(process.versions.node.split('.')[0])<22) {console.error('Node.js 22 or newer is required.');process.exit(1);}
const files=fs.readdirSync(path.join(base,'tests')).filter(n=>n.endsWith('.test.js')).sort().map(n=>path.join('tests',n));
if(!files.length) {console.error('No tests found.');process.exit(1);}
const result=spawnSync(process.execPath,['--test',...files],{cwd:base,stdio:'inherit'});
if(result.error) console.error(result.error.message);
process.exitCode=result.status===0?0:1;
