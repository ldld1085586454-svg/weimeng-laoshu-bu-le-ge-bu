'use strict';
// Offline publication gate for this algorithm subpackage, NOT whole-game release approval.
const {createRound}=require('./runtime');
const {replay}=require('./replay');
const {hashJSON}=require('./random');
function verifyRelease(deal,receipt) {
  try {
    const round=createRound(deal);
    if(!receipt||typeof receipt!=='object'||!Array.isArray(receipt.witness)||
      typeof receipt.dealHash!=='string'||!/^[0-9a-f]{64}$/.test(receipt.dealHash))
      return {ok:false,code:'INVALID_GENERATION_RECEIPT'};
    if(hashJSON(deal)!==receipt.dealHash) return {ok:false,code:'DEAL_HASH_MISMATCH'};
    const verification=replay(deal,receipt.witness);
    if(!verification.ok) return {ok:false,code:verification.code,verification};
    return {ok:true,code:'READY_FOR_ALGORITHM_RUNTIME',snapshotHash:round.deal.snapshotHash,verification};
  } catch(error) {
    return {ok:false,code:error.code||error.message.split(':')[0],message:error.message};
  }
}
module.exports={verifyRelease};
