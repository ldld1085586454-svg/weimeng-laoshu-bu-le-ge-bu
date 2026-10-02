'use strict';
const gate=require('../config/full-release-gates.json');
const blockers=gate.required.filter(x=>x.status!=='VERIFIED').map(x=>x.id);
console.log(JSON.stringify({ok:gate.publicReleaseAllowed===true&&blockers.length===0,mode:gate.mode,blockers,note:'Changing flags is not verification. This delivery is not a production release.'},null,2));
process.exitCode=gate.publicReleaseAllowed===true&&blockers.length===0?0:2;
