'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const E=require('../src');
function independentSolve(deal,cap) {
  // Reference: plain lists, no masks, transposition cache or production graph.
  function visit(left,rack) {
    if(!left.length)return rack.length===0;
    for(const c of left) {
      let blocked=false;
      for(const b of left) {
        if(c.id===b.id) continue;
        if(c.zone==='side'&&b.zone==='side'&&c.stackId===b.stackId&&b.position<c.position) blocked=true;
        if(c.zone==='board'&&b.zone==='board'&&b.z>c.z) {
          const a=c.rect,r=b.rect;
          if(a.x<r.x+r.w&&a.x+a.w>r.x&&a.y<r.y+r.h&&a.y+a.h>r.y) blocked=true;
        }
      }
      if(blocked||rack.length>=cap)continue;
      let next=rack.concat(c.type);if(next.filter(t=>t===c.type).length===3)next=next.filter(t=>t!==c.type);
      if(next.length>=cap)continue;
      if(visit(left.filter(b=>b.id!==c.id),next))return true;
    }
    return false;
  }
  return visit(deal.cells,[]);
}
function randomSmall(k) {
  const r=E.createRandom(E.seedFromText(`cross:${k}`),'fixture'),labels=r.shuffle(['A','A','A','B','B','B','C','C','C']);
  const cells=labels.map((type,i)=>({id:`p${i}`,type,zone:'board',z:i,rect:{x:r.int(4)*50,y:r.int(3)*50,w:80,h:80}}));
  return {schema:'astra-deal-1',dealId:`cross-${k}`,layoutId:'small',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,cells};
}

test('search agrees with independent exhaustive reference on 100 layouts x 5 capacities',()=>{
 for(let k=0;k<100;k++)for(const cap of [3,4,5,6,7]) {
   const deal=randomSmall(k),expected=independentSolve(deal,cap),result=E.solve(deal,{capacity:cap,maxNodes:100000});
   assert.notEqual(result.status,'UNKNOWN');assert.equal(result.status==='SOLVED',expected,`fixture ${k} capacity ${cap}`);
 }
});
test('shuffle primitive matches direct HMAC counter specification',()=>{
 const seed='01'.repeat(32),r=E.createRandom(seed,'golden');
 const expected=crypto.createHmac('sha256',Buffer.from(seed,'hex')).update('ASTRA_DEAL_V1|golden|').update(Buffer.alloc(8)).digest();
 for(let i=0;i<8;i++)assert.equal(r.u32(),expected.readUInt32BE(i*4));
});
test('all higher layers block, including a gap in intermediate layers',()=>{
 const d={schema:'astra-deal-1',dealId:'gap',layoutId:'gap',slotCapacity:7,cells:[
 {id:'bottom',zone:'board',z:0,type:'A',rect:{x:0,y:0,w:100,h:100}},
 {id:'middle-away',zone:'board',z:1,type:'A',rect:{x:300,y:0,w:100,h:100}},
 {id:'top',zone:'board',z:2,type:'A',rect:{x:0,y:0,w:100,h:100}}]};
 const s=E.createRound(d);assert(!E.legalMoves(s).includes('bottom'));
 const a=E.pick(s,'top').state;assert(E.legalMoves(a).includes('bottom'));
 assert.equal(E.replay(d,['bottom','middle-away','top']).ok,false);
});
test('edge contact does not count as blocking',()=>{
 const d={schema:'astra-deal-1',dealId:'edge',layoutId:'edge',slotCapacity:7,cells:[0,1,2].map(i=>({
 id:`p${i}`,zone:'board',z:i,type:'A',rect:{x:i*100,y:0,w:100,h:100}}))};
 assert.equal(E.legalMoves(E.createRound(d)).length,3);assert(E.replay(d,['p0','p1','p2']).ok);
});
test('input schema errors cannot be mistaken for solved or exhausted states',()=>{
 const d=randomSmall(0);d.cells[0].type='BROKEN';assert.throws(()=>E.solve(d));
 const g=E.makeFixtureLayout(270);assert.throws(()=>E.generateDeal({layout:g,quotas:{A:270},seed:'bad'}));
});
test('shuffle cannot be used as revival after failure',()=>{
 const d=randomSmall(2);let s=E.createRound(d);
 // Construct an explicit lost stable state, keeping effect precondition under test.
 s={...s,status:'LOST'};assert.throws(()=>E.shuffleRemaining(s,E.createRandom('01'.repeat(32),'s')));
});
test('hidden-type permutation noninterference uses actually distinct labels',()=>{
 const g=E.generateDeal({layout:E.makeFixtureLayout(270),quotas:{A:90,B:90,C:90},seed:'03'.repeat(32)});
 const a=E.createRound(g.deal),known=new Set(E.legalMoves(a)),hidden=g.deal.cells.filter(c=>!known.has(c.id));
 const x=hidden[0],y=hidden.find(c=>c.type!==x.type);assert(y);
 const d=JSON.parse(JSON.stringify(g.deal)); const u=d.cells.find(c=>c.id===x.id),v=d.cells.find(c=>c.id===y.id);
 [u.type,v.type]=[v.type,u.type];assert.notEqual(u.type,x.type);
 // This is a newly synthesized, balanced test world, not a stale signed-off snapshot.
 d.snapshotHash=E.hashSnapshot(d);
 const obs1=E.observe(a),obs2=E.observe(E.createRound(d));assert.deepEqual(obs1,obs2);
 for(const p of ['random','triple','pair'])assert.equal(E.chooseAction(obs1,p,E.createRandom('01'.repeat(32),p)),E.chooseAction(obs2,p,E.createRandom('01'.repeat(32),p)));
});
test('all supported fixture sizes validate including the upper bound',()=>{
 for(const n of [3,6,18,24,270,540,720,1800,3000])assert.doesNotThrow(()=>E.validateLayout(E.makeFixtureLayout(n)));
});
