'use strict';
// Explicit development profile. These boundary choices are NOT verified original rules.
const PROFILE=Object.freeze({
  id:'community-working-v03',
  bufferReturn:'any',                 // R13 / xlegex candidate
  undoSources:Object.freeze(['board']), // R17 side/buffer remain unbound
  clearUndoAfterAssist:true,          // R18 conservative development boundary
  reviveEffect:null,                  // R23 has conflicting historical evidence
});
const LIMITS=Object.freeze({move:1,undo:1,shuffle:1,revive:1});
module.exports={PROFILE,LIMITS};
