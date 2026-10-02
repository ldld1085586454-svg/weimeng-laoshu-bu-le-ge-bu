'use strict';
const fs=require('node:fs');const {verifyRelease}=require('../src');
try {
 const deal=JSON.parse(fs.readFileSync(process.argv[2]||'examples/deal-270.json','utf8'));
 const receipt=JSON.parse(fs.readFileSync(process.argv[3]||'examples/deal-270.receipt.json','utf8'));
 const r=verifyRelease(deal,receipt);console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
} catch(e){console.error(e.message);process.exitCode=1;}
