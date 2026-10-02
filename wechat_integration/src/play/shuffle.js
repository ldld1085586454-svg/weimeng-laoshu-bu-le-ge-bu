'use strict';
// Development-only client permutation. Actual output is logged for deterministic replay.
// The production random source/channel must be bound explicitly during platform integration.
function permute(items,nextU32=()=>Math.floor(Math.random()*4294967296)) {
  if(!Array.isArray(items)||items.length>3000)throw new TypeError('INVALID_SHUFFLE_INPUT');
  function int(n){const limit=Math.floor(4294967296/n)*n;for(let attempt=0;attempt<1024;attempt++){
    const x=nextU32();if(!Number.isInteger(x)||x<0||x>=4294967296)throw new Error('INVALID_RANDOM_VALUE');
    if(x<limit)return x%n;
  }throw new Error('RANDOM_REJECTION_LIMIT');}
  const output=items.slice();for(let i=output.length-1;i>0;i--){const j=int(i+1);[output[i],output[j]]=[output[j],output[i]];}
  return output;
}
module.exports={permute};
