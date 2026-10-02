'use strict';
// Verify the delivered bundle before editing. Re-run outputs belong in local_reports.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.resolve(__dirname,'..');
try {
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.sha256.json'),'utf8'));
 const errors=[];
 for(const f of manifest.files) {
  const absolute=path.resolve(base,f.path);
  if(!absolute.startsWith(base+path.sep)) {errors.push('UNSAFE_PATH:'+f.path);continue;}
  if(!fs.existsSync(absolute)||!fs.lstatSync(absolute).isFile()) {errors.push('MISSING_FILE:'+f.path);continue;}
  const bytes=fs.readFileSync(absolute),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==f.bytes||hash!==f.sha256)errors.push('MODIFIED_FILE:'+f.path);
 }
 console.log(JSON.stringify({ok:errors.length===0,files:manifest.files.length,errors,
   note:'Content integrity only, not a digital signature or independent third-party review.'},null,2));
 process.exitCode=errors.length?1:0;
} catch(error) {console.error(error.message);process.exitCode=1;}
