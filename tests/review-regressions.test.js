'use strict';
// Original R1/R2/R3 reproductions; imports now point at the working engine.
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../src');
function flat(types){return {schema:'astra-deal-1',dealId:'audit-flat',layoutId:'audit-flat',slotCapacity:7,
 cells:types.map((type,i)=>({id:`p${i}`,type,zone:'board',z:0,rect:{x:100*i,y:0,w:90,h:90}}))};}
test('R1: reject unbalanced imported initial snapshots before creating a round',()=>{
 assert.throws(()=>E.createRound(flat(['A','A','B'])));
});
test('R2: release verification rejects a snapshot the runtime cannot load',()=>{
 const deal=flat(['A','A','A']);delete deal.layoutId;
 assert.throws(()=>E.createRound(deal));
 assert.equal(E.replay(deal,['p0','p1','p2']).ok,false);
});
test('R3: different shuffled snapshots have different content identifiers',()=>{
 const deal=flat(['A','A','A','B','B','B','C','C','C']);const s=E.createRound(deal);
 const a=E.shuffleRemaining(s,E.createRandom(E.seedFromText('first-shuffle'),'s'));
 const b=E.shuffleRemaining(s,E.createRandom(E.seedFromText('second-shuffle'),'s'));
 assert.notDeepEqual(a.deal.cells,b.deal.cells);
 assert.notEqual(a.deal.snapshotHash??a.deal.dealId,b.deal.snapshotHash??b.deal.dealId);
});
