'use strict';
// Independent list/geometry oracle for B-module effects, not a copy of its blocker graph.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../src'),B=require('../src/play/board'),S=require('../src/play/session'),{PROFILE}=require('../src/play/profile');
const out=path.resolve(process.env.SHEEP_REPORT_DIR||path.join(__dirname,'../reports'));fs.mkdirSync(out,{recursive:true});
const count=Number(process.argv[2]||500);if(!Number.isInteger(count)||count<1||count>5000)throw Error('INVALID_CASE_COUNT');
const metrics={version:'0.9.0',node:process.version,platform:process.platform,dataset:'Synthetic, not original-game maps',
  mixedCases:count,acceptedCommands:0,picks:0,assists:{move:0,undo:0,shuffle:0},ungranted:0,duplicateAcknowledgements:0,
  diagnosticReplays:0,oracleComparisons:0,noAssistCrosscheck:{rounds:0,steps:0},mismatches:0};
function oracle(deal){const cells=deal.cells.map(c=>({...c,rect:{...c.rect}}));return {cells,byId:Object.fromEntries(cells.map(c=>[c.id,c])),left:deal.cells.map(c=>c.id),rack:[],buffer:[],cleared:0,last:null};}
function cell(o,id){return o.byId[id];}
function available(o){return o.left.filter(id=>{const c=cell(o,id);return !o.left.some(other=>{if(other===id)return false;const b=cell(o,other);
 return c.zone==='side'&&b.zone==='side'&&c.stackId===b.stackId&&b.position<c.position||
 c.zone==='board'&&b.zone==='board'&&b.z>c.z&&Math.max(c.rect.x,b.rect.x)<Math.min(c.rect.x+c.rect.w,b.rect.x+b.rect.w)&&Math.max(c.rect.y,b.rect.y)<Math.min(c.rect.y+c.rect.h,b.rect.y+b.rect.h);});}).concat(o.buffer);}
function oPick(o,id){assert.ok(available(o).includes(id));const from=o.buffer.includes(id)?'buffer':cell(o,id).zone;
 if(from==='buffer')o.buffer=o.buffer.filter(x=>x!==id);else o.left=o.left.filter(x=>x!==id);
 const type=cell(o,id).type;let i=-1;o.rack.forEach((x,j)=>{if(cell(o,x).type===type)i=j;});o.rack.splice(i<0?o.rack.length:i+1,0,id);
 if(o.rack.filter(x=>cell(o,x).type===type).length===3){o.rack=o.rack.filter(x=>cell(o,x).type!==type);o.cleared+=3;o.last=null;}else o.last={id,source:from};}
function oAssist(o,kind,permutation){if(kind==='move'){assert.ok(o.rack.length>=3&&!o.buffer.length);o.buffer=o.rack.splice(0,3);o.last=null;}
 else if(kind==='undo'){assert.ok(o.last&&o.last.source==='board');o.left.push(o.last.id);o.rack=o.rack.filter(x=>x!==o.last.id);o.last=null;}
 else{let i=0;for(const c of o.cells)if(o.left.includes(c.id))c.type=permutation[i++];o.last=null;}}
function compare(s,o){const b=s.board;B.checkRound(b);
 assert.deepEqual(b.deal.cells.filter((c,i)=>!b.taken[i]).map(c=>c.id).sort(),o.left.slice().sort());
 assert.deepEqual(b.rack,o.rack);assert.deepEqual(b.buffer,o.buffer);assert.equal(b.cleared,o.cleared);assert.deepEqual(b.undo,o.last);
 assert.deepEqual(b.deal.cells.map(c=>c.type),o.cells.map(c=>c.type));
 const status=o.rack.length>=7?'LOST':o.left.length===0&&o.rack.length===0&&o.buffer.length===0?'WON':'PLAYING';assert.equal(b.status,status);
 if(status==='PLAYING')assert.deepEqual(B.legalTiles(b).sort(),available(o).sort());metrics.oracleComparisons++;}
for(let k=0;k<count;k++){
 const n=[54,90,270][k%3],quotas=Object.fromEntries(Array.from({length:6},(_,i)=>['T'+i,n/6]));
 const g=E.generateDeal({layout:E.makeFixtureLayout(n),quotas,seed:E.seedFromText('v09-props-'+k),targetOccupancy:k%7});
 const rng=E.createRandom(E.seedFromText('v09-input-'+k),'actions');let s=S.createSession(g.deal,{roundId:'stress-'+k,rewardMode:'development_mock'}),o=oracle(g.deal);
 function dispatch(type,rest={}){const c={id:'k'+s.revision,roundId:s.roundId,expectedRevision:s.revision,type,...rest},r=S.dispatch(s,c);assert.ok(r.ok,r.code);s=r.session;metrics.acceptedCommands++;
   if(rng.int(4)===0){const d=S.dispatch(s,c);assert.ok(d.ok&&d.replayed);assert.equal(d.session,s);assert.deepEqual(d.events,[]);metrics.duplicateAcknowledgements++;}return c;}
 for(let t=0;t<n+40&&s.board.status==='PLAYING';t++){
   const candidates=['move','undo','shuffle'].filter(a=>s.used[a]===0&&!B.canAssist(s.board,a,PROFILE));
   if(candidates.length&&rng.int(100)<35){const kind=candidates[rng.int(candidates.length)];dispatch('REQUEST_ASSIST',{assist:kind});compare(s,o);
     const result=rng.int(5)===0?['cancelled','failed','share_returned'][rng.int(3)]:'completed',extra={token:s.pending.token,result};
     if(result==='completed'&&kind==='shuffle')extra.permutation=rng.shuffle(s.board.deal.cells.filter((c,i)=>!s.board.taken[i]).map(c=>c.type));
     dispatch('REWARD_RESULT',extra);if(result==='completed'){oAssist(o,kind,extra.permutation);metrics.assists[kind]++;}else metrics.ungranted++;
   }else{const legal=available(o),id=legal[rng.int(legal.length)];dispatch('PICK',{tileId:id});oPick(o,id);metrics.picks++;}
   compare(s,o);
 }
 const restored=S.restoreSession(S.exportSession(s));assert.ok(restored.ok,restored.code);assert.equal(S.fingerprint(restored.session),S.fingerprint(s));metrics.diagnosticReplays++;
 if((k+1)%100===0)console.log('Mixed sequences + independent oracle:',k+1);
}
// Exercise all witness steps through BOTH immutable baseline runtime and new play layer.
for(let k=0;k<100;k++){
 const n=[270,540,720][k%3],quotas=Object.fromEntries(Array.from({length:15},(_,j)=>['T'+j,n/15]));
 const g=E.generateDeal({layout:E.makeFixtureLayout(n),quotas,seed:E.seedFromText('v09-baseline-compare-'+k),targetOccupancy:k%7});
 let old=E.createRound(g.deal),next=B.createPlayRound(g.deal,'cross-'+k);
 for(const id of g.receipt.witness){const a=E.pick(old,id),b=B.pickTile(next,id);assert.ok(a.ok&&b.ok);old=a.state;next=b.state;
   for(const field of ['taken','blockers','rack','cleared','status','revision'])assert.deepEqual(next[field],old[field]);metrics.noAssistCrosscheck.steps++;}
 assert.equal(next.status,'WON');metrics.noAssistCrosscheck.rounds++;
}
fs.writeFileSync(path.join(out,'play-stress.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics,null,2));
