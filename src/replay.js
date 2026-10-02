'use strict';
/* Deliberately does NOT import runtime, layout, graph or generator.
 * Uses direct geometry checks and list-based triples, not generation counters.
 */
const {validateSnapshotFields}=require('./schema');
function replay(deal,witness,options={}) {
  const fail=(code,step=-1,tileId=null)=>({ok:false,code,step,tileId});
  if(!Array.isArray(witness)) return fail('INVALID_INPUT');
  try {validateSnapshotFields(deal);} catch(error) {return fail(error.code || 'INVALID_SNAPSHOT');}
  const capacity=options.capacity===undefined?deal.slotCapacity:options.capacity;
  if(!Number.isSafeInteger(capacity)||capacity<1) return fail('INVALID_CAPACITY');
  const cells=deal.cells,n=cells.length,index=new Map(),counts=new Map(),stacks=new Map();
  if(n===0) return fail('EMPTY_DEAL');
  for(let i=0;i<n;i++) {
    const c=cells[i];
    if(!c||typeof c.id!=='string'||!c.id||index.has(c.id)||typeof c.type!=='string'||!c.type) return fail('INVALID_ID_OR_TYPE');
    if(!c.rect||!['x','y','w','h'].every(k=>Number.isSafeInteger(c.rect[k]))||c.rect.w<=0||c.rect.h<=0)
      return fail('INVALID_RECT');
    if(c.zone==='board') {if(!Number.isSafeInteger(c.z)) return fail('INVALID_LAYER');}
    else if(c.zone==='side') {
      if(typeof c.stackId!=='string'||!Number.isSafeInteger(c.position)||c.position<0) return fail('INVALID_STACK');
      const p=stacks.get(c.stackId)||[]; p.push(c.position); stacks.set(c.stackId,p);
    } else return fail('INVALID_ZONE');
    index.set(c.id,i); counts.set(c.type,(counts.get(c.type)||0)+1);
  }
  for(const p of stacks.values()) {p.sort((a,b)=>a-b); if(p.some((v,i)=>v!==i)) return fail('STACK_GAP');}
  for(const v of counts.values()) if(v%3!==0) return fail('UNBALANCED_TYPES');
  // Independent ambiguity validation; no shared overlap predicate.
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) {
    const a=cells[i],b=cells[j],x=a.rect,y=b.rect;
    const intersection=!(x.x+x.w<=y.x||y.x+y.w<=x.x||x.y+x.h<=y.y||y.y+y.h<=x.y);
    if(intersection && (a.zone!==b.zone || (a.zone==='board'&&a.z===b.z) ||
      (a.zone==='side'&&a.stackId!==b.stackId))) return fail('AMBIGUOUS_LAYOUT');
  }
  if(witness.length!==n) return fail('WRONG_PATH_LENGTH');
  const taken=new Array(n).fill(false); let rack=[],cleared=0,peakStable=0,peakTransient=0;
  const trace=options.trace?[]:undefined;
  for(let step=0;step<witness.length;step++) {
    const id=witness[step],i=index.get(id); if(i===undefined) return fail('UNKNOWN_ID',step,id);
    if(taken[i]) return fail('DUPLICATE_PICK',step,id);
    const c=cells[i];
    for(let j=0;j<n;j++) {
      if(taken[j]||j===i) continue; const b=cells[j];
      if(c.zone==='side'&&b.zone==='side'&&c.stackId===b.stackId&&b.position<c.position)
        return fail('SIDE_BLOCKED',step,id);
      if(c.zone==='board'&&b.zone==='board'&&b.z>c.z) {
        const a=c.rect,r=b.rect;
        if(!(a.x+a.w<=r.x||r.x+r.w<=a.x||a.y+a.h<=r.y||r.y+r.h<=a.y)) return fail('BOARD_BLOCKED',step,id);
      }
    }
    if(rack.length>=capacity) return fail('ALREADY_FULL',step,id);
    taken[i]=true; rack.push(c); peakTransient=Math.max(peakTransient,rack.length);
    const same=rack.filter(v=>v.type===c.type);
    if(same.length===3) {rack=rack.filter(v=>v.type!==c.type); cleared+=3;}
    peakStable=Math.max(peakStable,rack.length);
    if(rack.length>=capacity) return fail('FULL_AFTER_SETTLEMENT',step,id);
    if(trace) trace.push({step,id,rack: rack.map(v=>v.type),cleared});
  }
  if(rack.length||cleared!==n) return fail('NOT_FULLY_CLEARED');
  return {ok:true,code:'VERIFIED',cleared,peakStable,peakTransient,finalRack:[],...(trace?{trace}:{})};
}
module.exports={replay};
