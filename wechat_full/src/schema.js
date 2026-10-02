'use strict';
// Shared structural contract only. Replay still computes geometry and triples independently.
const {hashSnapshot}=require('./content-hash');
const MAX_CELLS=3000,MAX_COORDINATE=1000000;
function fail(code) {const error=new TypeError(code);error.code=code;throw error;}
function nonempty(value) {return typeof value==='string' && value.trim().length>0;}
function validateLayoutFields(layout) {
  if(!layout || !nonempty(layout.id) || !Array.isArray(layout.cells) || !layout.cells.length) fail('INVALID_LAYOUT');
  if(layout.cells.length>MAX_CELLS) fail('LAYOUT_LIMIT');
  const ids=new Set(),stacks=new Map();
  for(const c of layout.cells) {
    if(!c || !nonempty(c.id) || ids.has(c.id)) fail('DUPLICATE_OR_INVALID_ID');
    ids.add(c.id);
    if(!c.rect || !['x','y','w','h'].every(k=>Number.isSafeInteger(c.rect[k])) || c.rect.w<=0 || c.rect.h<=0) fail('INVALID_RECT');
    if(['x','y','w','h'].some(k=>Math.abs(c.rect[k])>MAX_COORDINATE)) fail('COORDINATE_LIMIT');
    if(c.zone==='board') {
      if(!Number.isSafeInteger(c.z)) fail('INVALID_LAYER');
    } else if(c.zone==='side') {
      if(!nonempty(c.stackId) || !Number.isSafeInteger(c.position) || c.position<0) fail('INVALID_STACK');
      const positions=stacks.get(c.stackId)||[];positions.push(c.position);stacks.set(c.stackId,positions);
    } else fail('INVALID_ZONE');
  }
  for(const positions of stacks.values()) {
    positions.sort((a,b)=>a-b);
    if(positions.some((p,i)=>p!==i)) fail('STACK_GAP_OR_DUPLICATE_POSITION');
  }
  return true;
}
function validateSnapshotFields(deal) {
  if(!deal || deal.schema!=='astra-deal-1') fail('INVALID_SNAPSHOT_SCHEMA');
  if(!nonempty(deal.dealId)) fail('INVALID_DEAL_ID');
  if(deal.slotCapacity!==7) fail('RUNTIME_REQUIRES_SEVEN_SLOTS');
  if(deal.origin!==undefined && !nonempty(deal.origin)) fail('INVALID_ORIGIN');
  validateLayoutFields({id:deal.layoutId,cells:deal.cells});
  const counts=new Map();
  for(const c of deal.cells) {
    if(!nonempty(c.type)) fail('INVALID_TYPE');
    counts.set(c.type,(counts.get(c.type)||0)+1);
  }
  if([...counts.values()].some(n=>n%3!==0)) fail('UNBALANCED_TYPES');
  if(deal.snapshotHash!==undefined) {
    if(typeof deal.snapshotHash!=='string' || !/^[0-9a-f]{64}$/.test(deal.snapshotHash)) fail('INVALID_SNAPSHOT_HASH');
    if(hashSnapshot(deal)!==deal.snapshotHash) fail('SNAPSHOT_HASH_MISMATCH');
  }
  return true;
}
module.exports={validateLayoutFields,validateSnapshotFields,MAX_CELLS,MAX_COORDINATE};
