'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../src');
function flat(types=['A','A','A']) {return {schema:'astra-deal-1',dealId:'legacy-flat',layoutId:'flat',slotCapacity:7,
 cells:types.map((type,i)=>({id:`p${i}`,type,zone:'board',z:0,rect:{x:i*100,y:0,w:90,h:90}}))};}
function shuffled(state,seed='same') {return E.shuffleRemaining(state,E.createRandom(E.seedFromText(seed),'test-shuffle'));}
const invalidCases=[
 ['missing schema',d=>delete d.schema],
 ['unknown schema',d=>{d.schema='anything';}],
 ['missing deal ID',d=>delete d.dealId],
 ['blank layout ID',d=>{d.layoutId=' ';}],
 ['six-slot public deal',d=>{d.slotCapacity=6;}],
 ['coordinate outside limit',d=>{d.cells[0].rect.x=1000001;}],
 ['blank stack ID',d=>{d.cells=d.cells.map((c,i)=>({...c,zone:'side',stackId:'',position:i}));}],
 ['invalid layer',d=>{d.cells[0].z=NaN;}],
 ['unbalanced labels',d=>{d.cells[0].type='B';}],
 ['empty cells',d=>{d.cells=[];}],
 ['duplicate ID',d=>{d.cells[1].id=d.cells[0].id;}],
 ['same-layer overlap',d=>{d.cells[1].rect.x=10;}],
 ['side-stack gap',d=>{d.cells=d.cells.map((c,i)=>({...c,zone:'side',stackId:'x',position:i+1}));}],
 ['bad hash encoding',d=>{d.snapshotHash='not-sha256';}],
];
for(const [name,damage] of invalidCases) test(`all public entrypoints reject ${name}`,()=>{
 const d=flat();damage(d);
 assert.throws(()=>E.createRound(d),name+' runtime');
 assert.equal(E.replay(d,['p0','p1','p2']).ok,false,name+' replay');
 assert.throws(()=>E.solve(d),name+' solver');
 assert.equal(typeof E.verifyRelease,'function');
 const r=E.verifyRelease(d,{dealHash:E.hashJSON(d),witness:['p0','p1','p2']});assert.equal(r.ok,false,name+' release');
});
test('oversized deals are rejected by runtime and independent replay before work starts',()=>{
 const d=flat(new Array(3003).fill('A'));assert.throws(()=>E.createRound(d));
 assert.equal(E.replay(d,d.cells.map(c=>c.id)).ok,false);
});
test('portable SHA-256 matches Node on padding, Unicode, and deterministic varied vectors',()=>{
 assert.equal(typeof E.sha256Hex,'function');
 const vectors=['','abc','中文羊了个羊🐏','\ud800','\udfff','a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'a'.repeat(65),'a'.repeat(100000)];
 const rng=E.createRandom(E.seedFromText('hash-crosscheck'),'vectors');
 for(let k=0;k<100;k++)vectors.push(Array.from({length:k*7},()=>String.fromCharCode(rng.int(65536))).join(''));
 for(const s of vectors)assert.equal(E.sha256Hex(s),crypto.createHash('sha256').update(s,'utf8').digest('hex'));
});
test('content hash ignores key insertion order and deal ID but binds every gameplay field',()=>{
 assert.equal(typeof E.hashSnapshot,'function');
 const a=flat(),b={cells:a.cells.map(c=>({rect:{h:c.rect.h,w:c.rect.w,y:c.rect.y,x:c.rect.x},z:c.z,zone:c.zone,type:c.type,id:c.id})),slotCapacity:7,layoutId:'flat',dealId:'other',schema:'astra-deal-1'};
 assert.equal(E.hashSnapshot(a),E.hashSnapshot(b));
 const hash=E.hashSnapshot(a);
 for(const alter of [d=>{d.layoutId='other';},d=>{d.cells[0].rect.x++;},d=>{d.cells[0].z++;},d=>{d.cells[0].type='B';},d=>{d.cells[0].id='new';},d=>d.cells.reverse()]) {
  const d=structuredClone(a);alter(d);assert.notEqual(E.hashSnapshot(d),hash);
 }
});
test('legacy snapshots load without mutating input and obtain a verified content hash',()=>{
 const d=flat(),before=JSON.stringify(d),s=E.createRound(d,{roundId:'session-1'});
 assert.equal(JSON.stringify(d),before);assert.equal(s.originalDealId,d.dealId);assert.equal(s.roundId,'session-1');
 assert.match(s.deal.snapshotHash,/^[0-9a-f]{64}$/);assert.equal(s.deal.snapshotHash,E.hashSnapshot(d));
 assert(Object.isFrozen(s.deal));assert(Object.isFrozen(s.deal.cells[0].rect));
});
test('a stale hash is rejected even when a changed snapshot still has balanced types',()=>{
 const d=structuredClone(E.createRound(flat()).deal);d.cells[0].rect.x=-100;
 assert.throws(()=>E.createRound(d),/HASH/);assert.equal(E.replay(d,['p0','p1','p2']).ok,false);
});
test('shuffle identity tracks root deal, round, ordinal and actual label mapping',()=>{
 const s=E.createRound(flat(['A','A','A','B','B','B','C','C','C']),{roundId:'session-x'});
 const a=shuffled(s),b=shuffled(s),c=shuffled(s,'different'),next=shuffled(a,'next');
 assert.deepEqual(a,b);assert.notEqual(a.deal.snapshotHash,c.deal.snapshotHash);
 assert.equal(a.originalDealId,'legacy-flat');assert.equal(a.roundId,'session-x');
 assert.equal(a.shuffleOrdinal,1);assert.equal(next.shuffleOrdinal,2);assert.equal(next.originalDealId,'legacy-flat');
 assert.equal(a.deal.snapshotHash,E.hashSnapshot(a.deal));
 assert.notEqual(a.deal.dealId,c.deal.dealId);assert.equal(a.revision,s.revision+1);
 const restored=JSON.parse(JSON.stringify(a));assert.equal(E.hashSnapshot(restored.deal),a.deal.snapshotHash);
});
test('no-op shuffle preserves content hash but advances action identity without forcing a redraw',()=>{
 const s=E.createRound(flat(),{roundId:'one-type'}),a=E.shuffleRemaining(s,{shuffle:items=>items.slice()});
 assert.equal(a.deal.snapshotHash,s.deal.snapshotHash);assert.equal(a.shuffleOrdinal,1);assert.equal(a.revision,1);
 assert.notEqual(a.deal.dealId,s.deal.dealId);
});
test('pick does not pretend the immutable deal hash is a complete mutable round-state hash',()=>{
 const s=E.createRound(flat(),{roundId:'round'}),p=E.pick(s,'p0').state;
 assert.equal(p.deal.snapshotHash,s.deal.snapshotHash);assert.equal(p.revision,1);assert.equal(p.roundId,s.roundId);
});
test('shuffle rejects injected, missing, and non-array RNG results atomically',()=>{
 const s=E.createRound(flat(['A','A','A','B','B','B'])),before=JSON.stringify(s);
 for(const corrupt of [()=>null,a=>a.slice(1),a=>a.map(()=> 'Z'),()=>['A','A','A','A','A','A']]) {
  assert.throws(()=>E.shuffleRemaining(s,{shuffle:corrupt}));assert.equal(JSON.stringify(s),before);
 }
});
test('shuffle cannot reassign a taken tile, and its full type pool stays balanced after triples',()=>{
 const s0=E.createRound(flat(['A','A','A','B','B','B','C','C','C']));
 let s=s0;for(const id of ['p0','p1','p2','p3'])s=E.pick(s,id).state;
 const a=shuffled(s);assert.equal(a.cleared,3);assert.deepEqual(a.rack,['p3']);
 for(let i=0;i<4;i++)assert.equal(a.deal.cells[i].type,s.deal.cells[i].type);
 assert.doesNotThrow(()=>E.createRound(a.deal));assert.equal(a.deal.snapshotHash,E.hashSnapshot(a.deal));
});
test('publication gate accepts legacy and new receipts and refuses content/path tampering',()=>{
 assert.equal(typeof E.verifyRelease,'function');
 const d=flat(),receipt={dealHash:E.hashJSON(d),witness:['p0','p1','p2']};
 assert.equal(E.verifyRelease(d,receipt).ok,true);
 assert.equal(E.verifyRelease(d,{...receipt,dealHash:'0'.repeat(64)}).ok,false);
 assert.equal(E.verifyRelease(d,{...receipt,witness:['p0','p0','p2']}).ok,false);
 assert.equal(E.verifyRelease(d,null).ok,false);
 const g=E.generateDeal({layout:E.makeFixtureLayout(18),quotas:{A:9,B:9},seed:'01'.repeat(32)});
 assert.equal(E.verifyRelease(g.deal,g.receipt).ok,true);
 assert.equal(g.deal.snapshotHash,E.hashSnapshot(g.deal));
});
test('independent replay has no imports of runtime, graph, generator or solver',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../src/replay.js'),'utf8');
 assert(!/require\(['"]\.\/(runtime|layout|generator|solver)['"]\)/.test(text));
});
