'use strict';
// Offline only. The gameplay runtime never imports this Node crypto module.
const {createHmac,createHash}=require('node:crypto');
const VERSION='HMAC_SHA256_COUNTER_BE_V1';
function hashJSON(value) {return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function seedFromText(text) {return createHash('sha256').update(String(text),'utf8').digest('hex');}
function createRandom(seedHex,streamName) {
  if(typeof seedHex!=='string'||!/^[0-9a-f]{64}$/i.test(seedHex)) throw new TypeError('SEED_MUST_BE_32_BYTES_HEX');
  if(typeof streamName!=='string'||!streamName) throw new TypeError('STREAM_NAME_REQUIRED');
  const key=Buffer.from(seedHex,'hex'),prefix=Buffer.from(`ASTRA_DEAL_V1|${streamName}|`,'utf8');
  let counter=0n,block=Buffer.alloc(0),offset=32;
  function u32() {
    if(offset===32) {
      const c=Buffer.alloc(8); c.writeBigUInt64BE(counter++);
      block=createHmac('sha256',key).update(prefix).update(c).digest(); offset=0;
    }
    const v=block.readUInt32BE(offset); offset+=4; return v;
  }
  function int(n) {
    if(!Number.isSafeInteger(n)||n<1||n>=4294967296) throw new RangeError('RANDOM_RANGE');
    const limit=Math.floor(4294967296/n)*n;
    for(let i=0;i<1024;i++) {const x=u32(); if(x<limit) return x%n;}
    throw new Error('RNG_FAILURE');
  }
  function shuffle(items) {
    const a=items.slice(); for(let i=a.length-1;i>0;i--) {const j=int(i+1); [a[i],a[j]]=[a[j],a[i]];} return a;
  }
  function weighted(items,weights) {
    if(items.length!==weights.length||!items.length||weights.some(w=>!Number.isSafeInteger(w)||w<=0))
      throw new TypeError('POSITIVE_INTEGER_WEIGHTS_REQUIRED');
    let x=int(weights.reduce((a,b)=>a+b,0));
    for(let i=0;i<items.length;i++) {x-=weights[i]; if(x<0) return items[i];}
    throw new Error('WEIGHTED_SELECTION_INVARIANT');
  }
  return {u32,int,shuffle,weighted,version:VERSION};
}
module.exports={createRandom,hashJSON,seedFromText,VERSION};
