'use strict';
const {createRound,legalMoves,pick}=require('./runtime');
const {createRandom}=require('./random');
/** Conservative TOP_ONLY_V1 view. Partially covered labels are not assumed readable.
 * The policy never receives the true deal, seed, witness, or hidden labels.
 */
function observe(s) {
  return {model:'TOP_ONLY_V1',rack:s.rack.map(id=>s.deal.cells[s.byId[id]].type),
    moves:legalMoves(s).map(id=>{const c=s.deal.cells[s.byId[id]];return {id,type:c.type};})};
}
function chooseAction(observation,policy,rng) {
  const m=observation.moves;if(!m.length) return null;
  if(!['random','triple','pair'].includes(policy)) throw new RangeError('UNKNOWN_POLICY');
  if(policy==='random') return m[rng.int(m.length)].id;
  const rack=new Map(),visible=new Map();
  for(const t of observation.rack) rack.set(t,(rack.get(t)||0)+1);
  for(const c of m) visible.set(c.type,(visible.get(c.type)||0)+1);
  let best=-Infinity,ids=[];
  for(const c of m) {
    const q=rack.get(c.type)||0,v=visible.get(c.type)||0;
    let score=q===2?1000:0;
    if(policy==='pair'&&q!==2) {
      if(q===1&&v>=2) score=90;
      else if(q===0&&v>=3) score=80;
      else if(q===1) score=40;
      else if(v>=2) score=25;
    }
    if(score>best) {best=score;ids=[c.id];} else if(score===best) ids.push(c.id);
  }
  ids.sort();return ids[rng.int(ids.length)];
}
function playPolicy(deal,policy,seed,trial=0) {
  const rng=createRandom(seed,`bot:${policy}:${trial}`);let s=createRound(deal),steps=0,choices=0;
  while(s.status==='PLAYING'&&steps<deal.cells.length) {
    const obs=observe(s);if(!obs.moves.length) throw new Error('NO_LEGAL_MOVE_IN_VALID_LAYOUT');
    if(obs.moves.length>1) choices++;
    const id=chooseAction(obs,policy,rng),r=pick(s,id);if(!r.ok) throw new Error(`BOT_ILLEGAL_MOVE:${r.code}`);
    s=r.state;steps++;
  }
  return {policy,observationModel:'TOP_ONLY_V1',status:s.status,steps,choiceSteps:choices,
    cleared:s.cleared,clearFraction:s.cleared/deal.cells.length};
}
module.exports={observe,chooseAction,playPolicy};
