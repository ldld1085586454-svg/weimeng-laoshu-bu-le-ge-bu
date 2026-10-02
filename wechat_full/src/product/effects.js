'use strict';
const B=require('./board');
const {PROFILE}=require('../play/profile');
const REVIVE_CANDIDATE='research-revive-append-three-v011';
function eligible(board,assist){
  if(assist!=='revive')return B.canAssist(board,assist,PROFILE);
  if(board.status!=='LOST')return 'REVIVE_REQUIRES_LOST';
  if(board.rack.length!==7||board.buffer.length>3)return 'REVIVE_SHAPE_UNSUPPORTED';
  return null;
}
function apply(board,assist,permutation){
  const reason=eligible(board,assist);if(reason)return {ok:false,code:reason,state:board,events:[]};
  if(assist!=='revive')return B.applyAssist(board,assist,PROFILE,permutation);
  // Research fallback only: keep every old reserve tile and append rack's first three.
  // Not an assertion about the September 2022 client. Production is separately gated.
  const ids=board.rack.slice(0,3),state={...board,rack:board.rack.slice(3),buffer:[...board.buffer,...ids],
    undo:null,status:'PLAYING',revision:board.revision+1,reviveCandidate:REVIVE_CANDIDATE,revivalApplied:true};
  B.checkRound(state);
  return {ok:true,code:'REVIVED_CANDIDATE',state,events:[{type:'REVIVE_CANDIDATE_APPLIED',ids,candidate:REVIVE_CANDIDATE}]};
}
module.exports={eligible,apply,REVIVE_CANDIDATE};
