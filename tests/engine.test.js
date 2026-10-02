'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src');
const seed = '01'.repeat(32);
function api(name) { assert.equal(typeof E[name], 'function', `${name} must be implemented`); return E[name]; }
function openDeal(types) {
  return {schema: 'astra-deal-1', dealId: 'test', layoutId: 'open', origin: 'SYNTHETIC_NOT_HISTORICAL', slotCapacity: 7,
    cells: types.map((type, i) => ({id: `p${i}`, zone: 'board', z: 0, rect: {x:i*100,y:0,w:90,h:90}, type}))};
}
function quotas(n, k=15) {
 const q = {}; for (let i=0;i<k;i++) q[`T${String(i).padStart(2,'0')}`] = 3*(Math.floor(n/3/k)+(i<n/3%k?1:0)); return q;
}
function gen(n=270, options={}) {
  return api('generateDeal')({layout: api('makeFixtureLayout')(n), quotas: quotas(n), seed, ...options});
}

test('HMAC stream is deterministic and isolated by name', () => {
 const a=api('createRandom')(seed,'route'), b=E.createRandom(seed,'route'), c=E.createRandom(seed,'pattern');
 const x=Array.from({length:30},()=>a.u32());
 assert.deepEqual(x,Array.from({length:30},()=>b.u32()));
 assert.notDeepEqual(x,Array.from({length:30},()=>c.u32()));
});
test('range sampling and shuffle preserve identities', () => {
 const r=api('createRandom')(seed,'range');
 for(let n=1;n<100;n++) for(let i=0;i<20;i++) {const j=r.int(n); assert(j>=0 && j<n && Number.isInteger(j));}
 const a=Array.from({length:100},(_,i)=>i); assert.deepEqual(r.shuffle(a).sort((a,b)=>a-b),a);
 assert.throws(()=>r.int(0)); assert.throws(()=>r.int(1.1)); assert.throws(()=>E.createRandom('invalid','route'));
});
test('layout validation rejects duplicate IDs and invalid geometry', () => {
 const l=api('makeFixtureLayout')(270); assert.doesNotThrow(()=>api('validateLayout')(l));
 const bad=structuredClone(l); bad.cells[1].id=bad.cells[0].id; assert.throws(()=>E.validateLayout(bad));
 bad.cells[1].id='new'; bad.cells[0].rect.w=0; assert.throws(()=>E.validateLayout(bad));
});
test('layout validation rejects ambiguous same-layer overlap', () => {
 const l={id:'bad',origin:'SYNTHETIC_NOT_HISTORICAL',cells:openDeal(['A','A','A']).cells.map(({type,...c})=>c)};
 l.cells[1].rect.x=10; const validate=api('validateLayout'); assert.throws(()=>validate(l));
});
test('layout validation rejects stack gaps and mixed-zone intersections', () => {
 const l=api('makeFixtureLayout')(270), s=l.cells.find(c=>c.zone==='side');
 s.position=100; assert.throws(()=>api('validateLayout')(l));
 const b=E.makeFixtureLayout(270); const t=b.cells.find(c=>c.zone==='side'); t.rect={...b.cells[0].rect}; assert.throws(()=>E.validateLayout(b));
});
test('generation rejects quotas not matching physical slots', () => {
 api('generateDeal'); api('makeFixtureLayout'); assert.throws(()=>gen(270,{quotas:{A:267}})); assert.throws(()=>gen(270,{quotas:{A:269,B:1}}));
});
test('270-tile generated witness clears under independent replay', () => {
 const g=gen(); const r=api('replay')(g.deal,g.receipt.witness);
 assert.equal(r.ok,true); assert.equal(r.cleared,270); assert(r.peakStable<=6); assert.equal(r.finalRack.length,0);
});
test('540 and 720 tile fixtures are generated and verified', () => {
 for(const n of [540,720]) { const g=gen(n); assert.equal(api('replay')(g.deal,g.receipt.witness).ok,true); assert.equal(g.receipt.witness.length,n); }
});
test('same seed produces identical snapshot and receipt, input stays unchanged', () => {
 const l=api('makeFixtureLayout')(270), before=JSON.stringify(l);
 const a=gen(270,{layout:l}),b=gen(270,{layout:l}); assert.deepEqual(a,b); assert.equal(JSON.stringify(l),before);
 const c=gen(270,{seed:'02'.repeat(32)}); assert.notEqual(a.deal.dealId,c.deal.dealId);
 assert(!('seed' in a.deal)); assert(!('witness' in a.deal));
});
test('nonuniform quotas and small fixture are supported', () => {
 const l=api('makeFixtureLayout')(24),g=api('generateDeal')({layout:l,quotas:{A:3,B:6,C:15},seed});
 assert.equal(api('replay')(g.deal,g.receipt.witness).ok,true);
 assert.equal(g.deal.cells.filter(c=>c.type==='C').length,15);
});
test('independent replay rejects duplicate, missing and illegal actions', () => {
 const g=gen(); const dup=g.receipt.witness.slice(); dup[1]=dup[0];
 assert.equal(api('replay')(g.deal,dup).ok,false);
 assert.equal(E.replay(g.deal,g.receipt.witness.slice(1)).ok,false);
 const reverse=g.receipt.witness.slice().reverse(); assert.equal(E.replay(g.deal,reverse).ok,false);
});
test('independent replay rejects count tampering and corrupt identity', () => {
 const g=gen(), bad=structuredClone(g.deal); bad.cells[0].type='UNPAIRED';
 assert.equal(api('replay')(bad,g.receipt.witness).ok,false);
 bad.cells[0].id=bad.cells[1].id; assert.equal(E.replay(bad,g.receipt.witness).ok,false);
});
test('seventh matching tile clears before failure is checked', () => {
 const d=openDeal(['A','A','B','C','D','E','A','B','B','C','C','D','D','E','E']);
 let s=api('createRound')(d); for(let i=0;i<7;i++) {const r=api('pick')(s,`p${i}`); assert.equal(r.ok,true); s=r.state;}
 assert.equal(s.status,'PLAYING'); assert.equal(s.rack.length,4); assert.equal(s.cleared,3);
});
test('seventh nonmatching tile fails and later clicks have no effect', () => {
 // Balanced 21-tile fixture; the FIRST seven picks still all differ.
 const d=openDeal(['A','B','C','D','E','F','G','A','A','B','B','C','C','D','D','E','E','F','F','G','G']); let s=api('createRound')(d);
 for(let i=0;i<7;i++) s=api('pick')(s,`p${i}`).state;
 assert.equal(s.status,'LOST'); const r=E.pick(s,'p0'); assert.equal(r.ok,false); assert.equal(r.state,s);
});
test('blocked and duplicate clicks never mutate input state', () => {
 const g=gen(),s=api('createRound')(g.deal),legal=api('legalMoves')(s);
 const blocked=g.deal.cells.find(c=>!legal.includes(c.id)); const before=JSON.stringify(s);
 assert.equal(api('pick')(s,blocked.id).ok,false); assert.equal(JSON.stringify(s),before);
 const a=E.pick(s,legal[0]); assert.equal(a.ok,true); assert.equal(JSON.stringify(s),before);
 assert.equal(E.pick(a.state,legal[0]).ok,false);
});
test('side stack must be drawn in explicit top-to-bottom order', () => {
 const g=gen(),s=api('createRound')(g.deal),side=g.deal.cells.filter(c=>c.zone==='side'&&c.stackId==='left');
 assert.equal(api('pick')(s,side[1].id).ok,false); const next=E.pick(s,side[0].id).state;
 assert(api('legalMoves')(next).includes(side[1].id));
});
test('runtime and independent witness replay agree on full completion', () => {
 const g=gen(); let s=api('createRound')(g.deal);
 for(const id of g.receipt.witness) {const r=api('pick')(s,id); assert(r.ok); s=r.state;}
 assert.equal(s.status,'WON'); assert.equal(s.rack.length,0); assert.equal(s.cleared,270);
});
test('shuffle preserves rack, removed tiles, geometry and type multiset', () => {
 const g=gen(); let s=api('createRound')(g.deal); for(const id of g.receipt.witness.slice(0,9)) s=api('pick')(s,id).state;
 const before=JSON.stringify(s),r=api('shuffleRemaining')(s,api('createRandom')(seed,'shuffle'));
 assert.equal(JSON.stringify(s),before); assert.deepEqual(r.rack,s.rack); assert.deepEqual(r.taken,s.taken);
 const remaining=state=>state.deal.cells.filter((c,i)=>!state.taken[i]).map(c=>c.type).sort(); assert.deepEqual(remaining(r),remaining(s));
 for(let i=0;i<s.deal.cells.length;i++) {assert.deepEqual(r.deal.cells[i].rect,s.deal.cells[i].rect); if(s.taken[i]) assert.equal(r.deal.cells[i].type,s.deal.cells[i].type);}
});
test('observation and selected action do not depend on unobserved types', () => {
 const g=gen(),a=api('createRound')(g.deal),hidden=g.deal.cells.filter(c=>!api('legalMoves')(a).includes(c.id));
 const bdeal=structuredClone(g.deal),h1=bdeal.cells.find(c=>c.id===hidden[0].id),h2=bdeal.cells.find(c=>c.id===hidden[1].id);
 [h1.type,h2.type]=[h2.type,h1.type]; bdeal.snapshotHash=E.hashSnapshot(bdeal); const b=E.createRound(bdeal);
 const oa=api('observe')(a),ob=E.observe(b); assert.deepEqual(oa,ob);
 assert.equal(api('chooseAction')(oa,'pair',api('createRandom')(seed,'bot')), E.chooseAction(ob,'pair',E.createRandom(seed,'bot')));
 assert(!('deal' in oa)); assert(!('seed' in oa)); assert(!JSON.stringify(oa).includes('witness'));
});
test('visible matching policy clears an all-visible board', () => {
 const d=openDeal(['A','B','C','A','B','C','A','B','C']);
 const r=api('playPolicy')(d,'pair',seed); assert.equal(r.status,'WON'); assert.equal(r.cleared,9);
});
test('solver finds and independently verifies a path', () => {
 const d=openDeal(['A','B','C','A','B','C','A','B','C']); const r=api('solve')(d,{maxNodes:10000,capacity:3});
 assert.equal(r.status,'SOLVED'); assert.equal(api('replay')(d,r.witness,{capacity:3}).ok,true);
});
test('solver reports exhausted unsolvable versus budget unknown', () => {
 const d=openDeal(['A','B','C','A','B','C','A','B','C']);
 d.cells=d.cells.map((c,i)=>({...c,zone:'side',stackId:'only',position:i,rect:{x:0,y:0,w:90,h:90}}));
 assert.equal(api('solve')(d,{maxNodes:10000,capacity:3}).status,'UNSOLVABLE');
 assert.equal(E.solve(d,{maxNodes:0,capacity:7}).status,'UNKNOWN');
});
test('accepted mutations retain an independently validated witness', () => {
 const g=gen(270,{mutationAttempts:30}); assert.equal(api('replay')(g.deal,g.receipt.witness).ok,true);
 assert.equal(g.receipt.mutation.attempted,30); assert(g.receipt.mutation.accepted>=0);
});
test('candidate selector reports unattainable band without fallback', () => {
 const r=api('selectCandidate')({layout:api('makeFixtureLayout')(30),quotas:{A:6,B:6,C:6,D:6,E:6},seed,maxCandidates:2,trials:1,band:[0.99,1],minPeakStable:100});
 assert.equal(r.status,'TARGET_UNMET'); assert.equal(r.selected,null); assert.equal(r.reports.length,2);
});
